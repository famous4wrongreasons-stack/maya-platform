import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type NativeFeedbackRequest } from '@prisma/client';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  CanonicalActionIngressService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { attachExistingInvocationReceipt } from '../action-engine/action-invocation-receipt.context';
import { isPostgresSerializationConflict } from '../common/postgres-transaction-conflict';
import { ClientChannelRuntimeService } from '../crm/client-channel-runtime.service';
import type { ConsentChannelBinding } from '../crm/client-consent-authority';
import { EncryptionService } from '../encryption/encryption.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  FEEDBACK_ACTIONS,
  FEEDBACK_CONTRACT,
  feedbackHash,
  feedbackId,
  feedbackKey,
  feedbackObject,
  feedbackPlanHash,
  feedbackResponse,
  normalizeFeedbackPlan,
  type FeedbackOperation,
  type FeedbackPlan,
} from './native-feedback.contract';
import { NativeFeedbackPolicyService } from './native-feedback-policy.service';

type Tx = Prisma.TransactionClient;
/** Native feedback business executor. All accepted owner rows and receipts
 * commit together through the existing Action Engine; there are no effects here. */
@Injectable()
export class NativeFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelRuntimeService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly encryption: EncryptionService,
    private readonly policy: NativeFeedbackPolicyService,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {}
  private async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await canonicalUtcTransaction(this.prisma, work);
      } catch (error) {
        if (
          (isPostgresSerializationConflict(error) ||
            (error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002')) &&
          attempt < 4
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException('Feedback transaction could not serialize');
  }
  private async identity(tx: Tx, proof: string) {
    const identity = await this.channels.resolve(proof, tx);
    this.context.assertTenantId(identity.tenantId);
    await this.policy.client(tx, identity.tenantId, identity.clientId);
    const link = await tx.clientChannelLink.findUniqueOrThrow({
      where: {
        id_tenantId: { id: identity.linkId, tenantId: identity.tenantId },
      },
    });
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Client" WHERE id=${identity.clientId} AND "tenantId"=${identity.tenantId} FOR UPDATE`,
    );
    return {
      ...identity,
      binding: {
        linkId: link.id,
        provider: link.provider,
        providerSubjectHash: link.providerSubjectHash,
        verificationEvidenceHash: link.verificationEvidenceHash,
      } as ConsentChannelBinding,
    };
  }
  private async prior(
    tx: Tx,
    tenantId: string,
    operation: FeedbackOperation,
    sourceRef: string,
    commandHash: string,
  ) {
    const prior = await tx.actionExecution.findFirst({
      where: { tenantId, capability: FEEDBACK_ACTIONS[operation], sourceRef },
    });
    if (!prior) return null;
    await attachExistingInvocationReceipt(prior);
    const result = prior.safeResultSummaryJson;
    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      result.commandHash !== commandHash
    )
      throw new ConflictException('IDEMPOTENCY_CONFLICT');
    if (prior.state !== 'SUCCEEDED')
      throw new ConflictException(
        'Existing feedback execution requires canonical resolution',
      );
    return result;
  }
  private async lock(tx: Tx, tenantId: string, subject: string) {
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r08/${tenantId}/${subject}`},0))::text`,
    );
  }
  private plan(
    material: Omit<FeedbackPlan, 'contract' | 'contentHash' | 'slots'>,
  ): FeedbackPlan {
    return {
      ...material,
      contract: FEEDBACK_CONTRACT,
      contentHash: feedbackHash('content', {
        title: material.title,
        bodyText: material.bodyText,
      }),
      slots: [],
    };
  }
  private async admit(
    tx: Tx,
    tenantId: string,
    operation: FeedbackOperation,
    sourceRef: string,
    commandHash: string,
    intentHash: string,
    plan: FeedbackPlan,
    binding: ConsentChannelBinding | null,
    userId?: string,
  ) {
    const input = {
      contract: FEEDBACK_CONTRACT,
      operation,
      tenantId,
      clientId: plan.clientId,
      targetRef: operation === 'request' ? plan.requestId : plan.clientId,
      commandHash,
      intentHash,
      planHash: feedbackPlanHash(plan),
      plan: normalizeFeedbackPlan(plan),
      consentChannel: binding,
    };
    const request: TrustedActionExecutionRequestV1 = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId,
      capability: FEEDBACK_ACTIONS[operation],
      source: {
        type: 'authenticated_request',
        sourceRef,
        occurrenceScope: sourceRef,
        ...(userId ? { actorUserId: userId } : {}),
      },
      targetRef: input.targetRef,
      input,
      evidenceRefs: [`native-feedback-intent:${intentHash}`],
      callerIdempotency: {
        scope: `native-feedback.${operation}`,
        key: sourceRef,
      },
    };
    if ((await this.ingress.preview(request)).policyDecision !== 'ALLOW')
      throw new ForbiddenException('Native feedback canonical policy denied');
    const execution = await this.ingress.createExecution(request, tx);
    const claim = await this.kernel.claimExecution(
      {
        tenantId,
        executionId: execution.id,
        workerId: 'native-feedback.local',
      },
      tx,
    );
    return { execution, claim, input };
  }
  private async finish(
    tx: Tx,
    admitted: Awaited<ReturnType<NativeFeedbackService['admit']>>,
    result: Prisma.JsonObject,
  ) {
    const { execution, claim, input } = admitted;
    const last = await tx.actionTargetMutation.findFirst({
      where: {
        tenantId: execution.tenantId,
        targetKind: execution.targetKind,
        targetRef: input.targetRef,
      },
      orderBy: { targetGeneration: 'desc' },
    });
    await tx.actionTargetMutation.create({
      data: {
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
        mutationKey: `feedback:${input.plan.requestId}:${input.plan.version}`,
        targetKind: execution.targetKind,
        targetRef: input.targetRef,
        targetGeneration: (last?.targetGeneration ?? -1) + 1,
        mutationKind: execution.actionClass,
        beforeStateHash: last?.afterStateHash ?? null,
        afterStateHash: input.intentHash,
      },
    });
    await this.kernel.finalizeSuccess(
      {
        tenantId: execution.tenantId,
        executionId: execution.id,
        attemptId: claim.attempt.id,
        leaseToken: claim.leaseToken,
        outcomeCode: 'native_feedback_committed',
        safeResult: result,
      },
      tx,
    );
    return result;
  }
  async request(
    tenantId: string,
    userId: string,
    value: unknown,
    key: unknown,
  ) {
    this.context.assertTenantId(tenantId);
    const command = feedbackObject(value, ['appointmentId']);
    const appointmentId = feedbackId(command.appointmentId),
      callerKey = feedbackKey(key);
    const commandHash = feedbackHash('request-command', {
      contractVersion: 1,
      tenantId,
      actorUserId: userId,
      appointmentId,
      purpose: 'native_feedback',
      policyVersion: 1,
    });
    const sourceRef = `native-feedback:${feedbackHash('request-identity', { tenantId, userId, callerKey })}`;
    return this.transaction(async (tx) => {
      await this.policy.management(tx, tenantId, userId);
      await this.lock(tx, tenantId, sourceRef);
      const prior = await this.prior(
        tx,
        tenantId,
        'request',
        sourceRef,
        commandHash,
      );
      if (prior) return prior;
      await this.lock(tx, tenantId, appointmentId);
      const appointment = await tx.appointment.findUnique({
        where: { id_tenantId: { id: appointmentId, tenantId } },
      });
      if (!appointment?.mayaClientId || !appointment.branchId)
        throw new ForbiddenException(
          'Exact canonical Client/Appointment/branch required',
        );
      await this.policy.management(tx, tenantId, userId, appointment.branchId);
      await this.policy.client(tx, tenantId, appointment.mayaClientId);
      const existing = await tx.nativeFeedbackRequest.findFirst({
        where: { tenantId, appointmentId, clientId: appointment.mayaClientId },
      });
      if (existing) {
        const execution = await tx.actionExecution.findUniqueOrThrow({
          where: { id: existing.requestExecutionId },
        });
        if (execution.state !== 'SUCCEEDED')
          throw new ConflictException(
            'Feedback request owner receipt unresolved',
          );
        await attachExistingInvocationReceipt(execution);
        return {
          contract: FEEDBACK_CONTRACT,
          actionExecutionId: execution.id,
          requestId: existing.id,
          version: existing.latestResponseVersion,
          outcome: 'existing_request',
          businessMutations: 0,
          providerWrites: 0,
        };
      }
      const now = this.clock();
      if (
        appointment.attendance !== 'arrived' ||
        appointment.status === 'canceled' ||
        appointment.endAt > now
      )
        throw new ForbiddenException(
          'Feedback requires proven arrived and ended Appointment',
        );
      const eligibleAt = new Date(appointment.endAt.getTime() + 3 * 3600000);
      const expiresAt = new Date(
        Math.max(now.getTime(), eligibleAt.getTime()) + 7 * 86400000,
      );
      const intentHash = feedbackHash('request-intent', {
        contractVersion: 1,
        tenantId,
        actorUserId: userId,
        clientId: appointment.mayaClientId,
        appointmentId,
        purpose: 'native_feedback',
        policyVersion: 1,
      });
      const plan = this.plan({
        tenantId,
        clientId: appointment.mayaClientId,
        requestId: randomUUID(),
        revisionId: null,
        appointmentId,
        branchId: appointment.branchId,
        phase: 'request',
        version: 0,
        eligibleAt: eligibleAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        title: 'Как прошёл визит?',
        bodyText:
          'Поделитесь впечатлениями о визите в личном кабинете MAYA. Ответ доступен только вашей команде.',
        eligibilityHash: feedbackHash('attendance', {
          appointmentId,
          clientId: appointment.mayaClientId,
          branchId: appointment.branchId,
          attendance: appointment.attendance,
          status: appointment.status,
          endAt: appointment.endAt.toISOString(),
        }),
      });
      plan.slots = await this.policy.invitationSlots(tx, plan);
      const admitted = await this.admit(
        tx,
        tenantId,
        'request',
        sourceRef,
        commandHash,
        intentHash,
        plan,
        null,
        userId,
      );
      await tx.nativeFeedbackRequest.create({
        data: {
          id: plan.requestId,
          tenantId,
          clientId: plan.clientId,
          appointmentId,
          requestedByUserId: userId,
          requestExecutionId: admitted.execution.id,
          requestIdentityHash: feedbackHash('appointment-request', {
            tenantId,
            appointmentId,
            clientId: plan.clientId,
          }),
          intentHash,
          contractVersion: 1,
          eligibleAt,
          expiresAt,
          contentHash: plan.contentHash,
          contentEncrypted: this.encryption.encrypt(
            JSON.stringify({ title: plan.title, bodyText: plan.bodyText }),
          ),
          planHash: feedbackPlanHash(plan),
          planEncrypted: this.encryption.encrypt(JSON.stringify(plan)),
          state: 'OPEN',
          revision: 0,
          latestResponseVersion: 0,
          createdAt: now,
          retentionUntil: new Date(now.getTime() + 365 * 86400000),
        },
      });
      return this.finish(tx, admitted, {
        contract: FEEDBACK_CONTRACT,
        actionExecutionId: admitted.execution.id,
        requestId: plan.requestId,
        version: 0,
        outcome: 'requested',
        commandHash,
        intentHash,
        businessMutations: 1,
        providerWrites: 0,
      });
    });
  }
  async respond(
    proof: string,
    operation: 'response' | 'withdraw',
    value: unknown,
    key: unknown,
  ) {
    const command = feedbackResponse(operation, value),
      callerKey = feedbackKey(key);
    return this.transaction(async (tx) => {
      const identity = await this.identity(tx, proof),
        { tenantId, clientId } = identity;
      const intent = { contractVersion: 1, tenantId, clientId, ...command };
      const commandHash = feedbackHash('response-command', intent),
        intentHash = feedbackHash('response-intent', intent);
      const sourceRef = `native-feedback:${feedbackHash('response-identity', { tenantId, clientId, operation, callerKey })}`;
      const prior = await this.prior(
        tx,
        tenantId,
        operation,
        sourceRef,
        commandHash,
      );
      if (prior) return prior;
      const root = await tx.nativeFeedbackRequest.findUnique({
        where: { id_tenantId: { id: command.requestId, tenantId } },
      });
      if (!root || root.clientId !== clientId)
        throw new ForbiddenException('Exact owned feedback request required');
      const now = this.clock();
      if (root.latestResponseVersion !== command.expectedAcceptedVersion)
        throw new ConflictException('STALE_FEEDBACK_REVISION');
      if (operation === 'response' && now >= root.expiresAt)
        throw new ConflictException('FEEDBACK_RESPONSE_WINDOW_CLOSED');
      if (operation === 'withdraw' && root.state !== 'RESPONDED')
        throw new ConflictException(
          'Visible accepted response required for withdrawal',
        );
      const appointment = await tx.appointment.findUnique({
        where: { id_tenantId: { id: root.appointmentId, tenantId } },
      });
      if (!appointment?.branchId || appointment.mayaClientId !== clientId)
        throw new ForbiddenException(
          'Original feedback Appointment ownership changed',
        );
      const requestPlan = root.planEncrypted
        ? this.readPlan(root)
        : operation === 'withdraw'
          ? { branchId: appointment.branchId }
          : (() => {
              throw new ConflictException(
                'Feedback payload retention horizon reached',
              );
            })();
      const plan = this.plan({
        tenantId,
        clientId,
        requestId: root.id,
        revisionId: randomUUID(),
        appointmentId: root.appointmentId,
        branchId: requestPlan.branchId,
        phase: operation,
        version: root.latestResponseVersion + 1,
        eligibleAt: now.toISOString(),
        expiresAt: root.retentionUntil.toISOString(),
        createdAt: now.toISOString(),
        title: operation === 'withdraw' ? 'Ответ отозван' : 'Отзыв о визите',
        bodyText:
          operation === 'withdraw'
            ? 'Клиент отозвал свой ответ.'
            : `Оценка: ${command.rating}/5${command.comment ? `\n${command.comment}` : ''}`,
        eligibilityHash: feedbackHash('verified-response', {
          requestId: root.id,
          clientId,
          binding: identity.binding,
          expectedAcceptedVersion: command.expectedAcceptedVersion,
        }),
      });
      if (operation === 'response')
        plan.slots = await this.policy.responseSlots(tx, plan);
      const admitted = await this.admit(
        tx,
        tenantId,
        operation,
        sourceRef,
        commandHash,
        intentHash,
        plan,
        identity.binding,
      );
      await tx.nativeFeedbackRevision.create({
        data: {
          id: plan.revisionId!,
          tenantId,
          requestId: root.id,
          clientId,
          executionId: admitted.execution.id,
          identityHash: feedbackHash('revision-identity', {
            clientId,
            operation,
            callerKey,
          }),
          intentHash,
          version: plan.version,
          kind: operation,
          rating: command.rating,
          commentEncrypted:
            command.comment === null
              ? null
              : this.encryption.encrypt(command.comment),
          contentHash: plan.contentHash,
          planHash: feedbackPlanHash(plan),
          planEncrypted: this.encryption.encrypt(JSON.stringify(plan)),
          createdAt: now,
        },
      });
      await tx.nativeFeedbackRequest.update({
        where: { id: root.id },
        data: {
          state: operation === 'withdraw' ? 'WITHDRAWN' : 'RESPONDED',
          revision: plan.version,
          latestResponseVersion: plan.version,
          closedAt: operation === 'withdraw' ? now : null,
        },
      });
      return this.finish(tx, admitted, {
        contract: FEEDBACK_CONTRACT,
        actionExecutionId: admitted.execution.id,
        requestId: root.id,
        revisionId: plan.revisionId,
        version: plan.version,
        outcome: operation === 'withdraw' ? 'withdrawn' : 'responded',
        commandHash,
        intentHash,
        businessMutations: 1,
        providerWrites: 0,
      });
    });
  }
  readPlan(
    root: Pick<NativeFeedbackRequest, 'planEncrypted' | 'planHash'>,
  ): FeedbackPlan {
    if (!root.planEncrypted)
      throw new ConflictException('Feedback payload retention horizon reached');
    const plan = normalizeFeedbackPlan(
      JSON.parse(this.encryption.decrypt(root.planEncrypted)),
    );
    if (feedbackPlanHash(plan) !== root.planHash)
      throw new ForbiddenException('Immutable feedback manifest is invalid');
    return plan;
  }
  private async projection(tx: Tx, root: NativeFeedbackRequest) {
    const expired = root.retentionUntil <= this.clock(),
      visible = !expired && root.state === 'RESPONDED';
    const revision = visible
      ? await tx.nativeFeedbackRevision.findFirst({
          where: {
            tenantId: root.tenantId,
            requestId: root.id,
            version: root.latestResponseVersion,
          },
        })
      : null;
    return {
      requestId: root.id,
      appointmentId: root.appointmentId,
      state: expired ? 'EXPIRED' : root.state,
      version: root.latestResponseVersion,
      expiresAt: root.expiresAt.toISOString(),
      mayRespond: !expired && this.clock() < root.expiresAt,
      mayWithdraw: root.state === 'RESPONDED',
      rating: revision?.rating ?? null,
      comment: revision?.commentEncrypted
        ? this.encryption.decrypt(revision.commentEncrypted)
        : null,
      externalReviewInvitation: null,
      readOnly: true,
    };
  }
  async readOwn(proof: string) {
    return this.transaction(async (tx) => {
      const identity = await this.identity(tx, proof);
      const rows = await tx.nativeFeedbackRequest.findMany({
        where: { tenantId: identity.tenantId, clientId: identity.clientId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      return {
        tenantId: identity.tenantId,
        clientId: identity.clientId,
        requests: await Promise.all(
          rows.map((row) => this.projection(tx, row)),
        ),
      };
    });
  }
  async readManagement(tenantId: string, userId: string, requestId: string) {
    this.context.assertTenantId(tenantId);
    feedbackId(requestId);
    return canonicalUtcTransaction(
      this.prisma,
      async (tx) => {
        const root = await tx.nativeFeedbackRequest.findUnique({
          where: { id_tenantId: { id: requestId, tenantId } },
        });
        if (!root) throw new NotFoundException('Feedback request unavailable');
        const appointment = await tx.appointment.findUniqueOrThrow({
          where: { id_tenantId: { id: root.appointmentId, tenantId } },
        });
        await this.policy.management(
          tx,
          tenantId,
          userId,
          appointment.branchId ?? undefined,
        );
        return this.projection(tx, root);
      },
      { readOnly: true },
    );
  }
  async managementPage(tenantId: string, userId: string, cursor?: string) {
    this.context.assertTenantId(tenantId);
    if (cursor) feedbackId(cursor);
    return canonicalUtcTransaction(
      this.prisma,
      async (tx) => {
        const member = await this.policy.management(tx, tenantId, userId);
        const appointments = await tx.appointment.findMany({
          where: {
            tenantId,
            attendance: 'arrived',
            status: { not: 'canceled' },
            endAt: { lte: this.clock() },
            mayaClientId: { not: null },
            branchId: member.branchId ?? { not: null },
          },
          orderBy: [{ endAt: 'desc' }, { id: 'desc' }],
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: {
            id: true,
            mayaClientId: true,
            branchId: true,
            startAt: true,
            endAt: true,
          },
        });
        const roots = await tx.nativeFeedbackRequest.findMany({
          where: {
            tenantId,
            appointmentId: { in: appointments.map((a) => a.id) },
          },
        });
        return {
          tenantId,
          userId,
          nextCursor:
            appointments.length === 100 ? appointments.at(-1)!.id : null,
          appointments: await Promise.all(
            appointments.map(async (appointment) => {
              const root = roots.find(
                (r) => r.appointmentId === appointment.id,
              );
              return {
                appointmentId: appointment.id,
                clientId: appointment.mayaClientId,
                branchId: appointment.branchId,
                startAt: appointment.startAt.toISOString(),
                endAt: appointment.endAt.toISOString(),
                feedback: root ? await this.projection(tx, root) : null,
              };
            }),
          ),
        };
      },
      { readOnly: true },
    );
  }
}
