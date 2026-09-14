import { evaluateTenantAccessState } from '../tenants/tenant-access-state';
import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ExternalDispatchState,
  Prisma,
  type ActionExecution,
} from '@prisma/client';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  CanonicalActionIngressService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  CLIENT_PREFERENCE_CAPABILITIES,
  CLIENT_PREFERENCE_KINDS,
  exactPreferenceKeys,
  notificationOverrides,
  preferenceObject,
  type ClientNotificationOverrides,
  type ClientPreferenceOperation,
} from '../action-engine/client-preferences.contract';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import {
  ClientChannelLinkService,
  lockClientChannelIdentity,
} from './client-channel-link.service';
import type { ConsentChannelBinding } from './client-consent-authority';
import { EncryptionService } from '../encryption/encryption.service';
import { clientChannelSubjectHash } from './client-channel-subject';

type Tx = Prisma.TransactionClient;
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const preferenceHash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
type Identity = {
  tenantId: string;
  clientId: string;
  userId: string | null;
  binding: ConsentChannelBinding;
};
type Command = {
  operation: ClientPreferenceOperation;
  idempotencyKey: string;
  expectedGeneration: number;
  patch?: ClientNotificationOverrides;
  provider?: string;
  recordId?: string;
  mood?: 'red' | 'blue';
};
type Receipt = {
  actionExecutionId: string | null;
  outcome: 'updated' | 'no_op';
  targetGeneration: number;
  businessMutations: 0 | 1;
  providerWrites: 0;
};

/** A18 B5/B6 V1. Only this canonical executor writes the three Client slots.
 * Preferences are extra Client restrictions/choices; legal consent and existing
 * tenant/category delivery authority remain separate. No provider is called.
 */
@Injectable()
export class ClientPreferencesService {
  private readonly links: ClientChannelLinkService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly encryption: EncryptionService,
  ) {
    this.links = new ClientChannelLinkService(prisma, context, {
      verifyLink: () =>
        Promise.reject(new ForbiddenException('ClientLinkChallenge required')),
      verifyRevocation: () =>
        Promise.reject(
          new ForbiddenException('Explicit verified rebind required'),
        ),
    });
  }

  /** Internal delivery/projection reader only. A recipient selector never
   * authorizes a mutation and cannot establish a new Client identity. */
  async deliveryRead(subject: string) {
    if (!/^[1-9][0-9]{0,19}$/.test(subject))
      throw new BadRequestException('Exact Telegram recipient required');
    const tenantId = this.context.requireTenantId();
    return this.serializable(async (tx) => {
      const links = await tx.clientChannelLink.findMany({
        where: {
          tenantId,
          provider: 'telegram',
          providerSubjectHash: clientChannelSubjectHash(
            this.encryption,
            'telegram',
            subject,
          ),
          revokedAt: null,
          verificationVersion: 1,
          subjectHashVersion: 1,
        },
        take: 2,
      });
      if (links.length !== 1)
        return {
          linked: false,
          prefs: {},
          quietNow: true,
          defaultVisitMood: null,
        };
      await this.links.assertClientEligible(tx, tenantId, links[0].clientId);
      const profile = await tx.customerProfile.findUnique({
        where: { tenantId_clientId: { tenantId, clientId: links[0].clientId } },
      });
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
      });
      if (
        !['active', 'trial_active', 'past_due_grace'].includes(
          evaluateTenantAccessState(tenant, new Date()).accessState,
        )
      )
        return {
          linked: false,
          prefs: {},
          quietNow: true,
          defaultVisitMood: null,
        };
      const prefs = this.overrides(profile?.notificationPreferencesJson);
      const hour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: tenant.defaultTimezone,
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(new Date()),
      );
      const from = prefs.quiet_from,
        to = prefs.quiet_to;
      const quietNow =
        typeof from === 'number' &&
        typeof to === 'number' &&
        from !== to &&
        (from < to ? hour >= from && hour < to : hour >= from || hour < to);
      return {
        linked: true,
        prefs,
        quietNow,
        defaultVisitMood: profile?.defaultVisitMood ?? null,
      };
    });
  }

  async visitProjection(provider: string, recordIds: string[]) {
    if (
      !['yclients', 'altegio', 'internal'].includes(provider) ||
      !Array.isArray(recordIds) ||
      recordIds.length > 200 ||
      recordIds.some(
        (id) => typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(id),
      )
    )
      throw new BadRequestException(
        'Bounded provider-qualified visit projection required',
      );
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.context.requireTenantId(),
        ...(provider === 'internal'
          ? { source: 'internal', id: { in: recordIds } }
          : { crmProvider: provider, crmExternalId: { in: recordIds } }),
      },
      select: { id: true, crmExternalId: true, clientVisitMood: true },
    });
    const moods: Record<string, string | null> = {};
    for (const row of rows) {
      const key = provider === 'internal' ? row.id : row.crmExternalId;
      if (key !== null) moods[key] = row.clientVisitMood;
    }
    return { moods };
  }

  async read(proof: string) {
    return this.serializable(async (tx) => {
      const identity = await this.identity(tx, proof);
      const profile = await this.profile(tx, identity);
      const reminders = await tx.appointmentNotificationSetting.findUnique({
        where: { tenantId: identity.tenantId },
        select: { enabled: true, leadTimesMinutes: true },
      });
      return {
        prefs: this.overrides(profile?.notificationPreferencesJson),
        expectedGeneration: await this.generation(
          tx,
          identity,
          'notifications',
        ),
        visitMoodGeneration: await this.generation(tx, identity, 'visit_mood'),
        defaultVisitMood: profile?.defaultVisitMood ?? null,
        inheritance: {
          source: 'approved-tenant-and-central-delivery-policy',
          reminder: reminders?.enabled ?? true,
          reminderLeadTimesMinutes: reminders?.leadTimesMinutes ?? [1440, 120],
          consentFromPreferences: false,
        },
      };
    });
  }

  async update(
    proof: string,
    operation: ClientPreferenceOperation,
    value: unknown,
  ) {
    let command: Command;
    try {
      const input = preferenceObject(value);
      exactPreferenceKeys(
        input,
        operation === 'visit_mood'
          ? [
              'idempotencyKey',
              'expectedGeneration',
              'provider',
              'recordId',
              'mood',
            ]
          : ['idempotencyKey', 'expectedGeneration', 'prefs'],
      );
      if (
        typeof input.idempotencyKey !== 'string' ||
        !/^[A-Za-z0-9._:-]{8,180}$/.test(input.idempotencyKey) ||
        !Number.isSafeInteger(input.expectedGeneration) ||
        Number(input.expectedGeneration) < 0
      )
        throw new BadRequestException(
          'Stable identity and expected generation required',
        );
      command = {
        operation,
        idempotencyKey: input.idempotencyKey,
        expectedGeneration: Number(input.expectedGeneration),
      };
      if (operation === 'visit_mood') {
        if (
          !['red', 'blue'].includes(String(input.mood)) ||
          typeof input.recordId !== 'string' ||
          !/^[A-Za-z0-9._:-]{1,160}$/.test(input.recordId) ||
          !['yclients', 'altegio', 'internal'].includes(String(input.provider))
        )
          throw new BadRequestException(
            'Exact provider-qualified visit and mood required',
          );
        Object.assign(command, {
          provider: input.provider,
          recordId: input.recordId,
          mood: input.mood,
        });
      } else {
        command.patch = notificationOverrides(input.prefs);
        if (
          command.patch.reminder === false &&
          'reminder_hours' in command.patch
        )
          throw new BadRequestException(
            'Disabled reminder cannot request reminder hours',
          );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid preference input',
      );
    }
    const prepared = await this.serializable(async (tx) => {
      const identity = await this.identity(tx, proof);
      await this.lock(tx, identity);
      const sourceRef = `client-preferences:${preferenceHash({ linkId: identity.binding.linkId, operation, key: command.idempotencyKey })}`;
      const materialHash = preferenceHash(command);
      const prior = await tx.actionExecution.findMany({
        where: {
          tenantId: identity.tenantId,
          capability: CLIENT_PREFERENCE_CAPABILITIES[operation],
          sourceRef,
        },
        take: 2,
      });
      if (prior.length > 1)
        throw new ConflictException('Ambiguous command identity');
      if (prior[0])
        return {
          identity,
          sourceRef,
          prior: prior[0],
          materialHash,
          snapshot: null,
        };
      const snapshot = await this.snapshot(tx, identity, command);
      if (snapshot.generation !== command.expectedGeneration)
        throw new ConflictException(
          'Preference generation changed; reload before a new command',
        );
      return { identity, sourceRef, prior: null, materialHash, snapshot };
    });
    const { identity, sourceRef, prior, materialHash, snapshot } = prepared;
    let input: Record<string, unknown>;
    if (prior) {
      input = await this.kernel.readTrustedNormalizedInput(
        identity.tenantId,
        prior.id,
      );
      if (
        input.requestMaterialHash !== materialHash ||
        preferenceHash(input.consentChannel) !==
          preferenceHash(identity.binding)
      )
        throw new ConflictException(
          'Command identity reused with changed material or authority',
        );
      if (prior.state === ActionExecutionState.SUCCEEDED)
        return this.restore(prior);
    } else {
      if (!snapshot) throw new ConflictException('Preference snapshot missing');
      if (snapshot.noOp)
        return {
          actionExecutionId: null,
          outcome: 'no_op',
          targetGeneration: snapshot.generation,
          businessMutations: 0,
          providerWrites: 0,
        } satisfies Receipt;
      input = {
        operation,
        targetKind: CLIENT_PREFERENCE_KINDS[operation],
        targetRef: identity.clientId,
        targetGeneration: snapshot.generation,
        beforeStateHash: preferenceHash(snapshot.before),
        afterStateHash: preferenceHash(snapshot.after),
        requestMaterialHash: materialHash,
        consentChannel: identity.binding,
        desired: snapshot.desired,
      };
    }
    const request: TrustedActionExecutionRequestV1 = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: identity.tenantId,
      capability: CLIENT_PREFERENCE_CAPABILITIES[operation],
      targetRef: identity.clientId,
      source: {
        type: 'authenticated_request',
        sourceRef,
        occurrenceScope: sourceRef,
        actorUserId: identity.userId ?? undefined,
      },
      input,
      evidenceRefs: [
        `client-link:${identity.binding.linkId}`,
        `preference-material:${materialHash}`,
      ],
      callerIdempotency: {
        scope: `client-preferences.${operation}.v1`,
        key: sourceRef,
      },
    };
    const admitted = await this.ingress.createExecution(request);
    const durable = await this.kernel.readTrustedNormalizedInput(
      identity.tenantId,
      admitted.id,
    );
    return this.serializable(async (tx) => {
      const currentIdentity = await this.identity(tx, proof);
      if (
        preferenceHash(currentIdentity.binding) !==
          preferenceHash(identity.binding) ||
        currentIdentity.clientId !== identity.clientId
      )
        throw new ForbiddenException('Verified Client identity changed');
      await this.lock(tx, identity);
      const execution = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: admitted.id, tenantId: identity.tenantId },
        },
      });
      if (execution.state === ActionExecutionState.SUCCEEDED)
        return this.restore(execution);
      if (
        execution.state !== ActionExecutionState.READY ||
        execution.dryRun ||
        execution.policyDecision !== ActionPolicyDecision.ALLOW ||
        execution.capability !== CLIENT_PREFERENCE_CAPABILITIES[operation]
      )
        throw new ConflictException('Canonical preference execution not ready');
      const fresh = await this.snapshot(tx, identity, command);
      if (
        fresh.generation !== command.expectedGeneration ||
        fresh.generation !== durable.targetGeneration ||
        preferenceHash(fresh.before) !== durable.beforeStateHash ||
        preferenceHash(fresh.after) !== durable.afterStateHash ||
        preferenceHash(fresh.desired) !== preferenceHash(durable.desired)
      )
        throw new ConflictException(
          'Preference target changed before execution',
        );
      const now = new Date();
      const attemptId = randomUUID();
      await tx.actionAttempt.create({
        data: {
          id: attemptId,
          tenantId: identity.tenantId,
          actionExecutionId: execution.id,
          attemptNumber: execution.executionAttemptCount + 1,
          kind: ActionAttemptKind.EXECUTION,
          state: ActionAttemptState.STARTED,
          executorKey: 'package5.client-preferences.local',
          executorVersion: 1,
          externalDispatchState: ExternalDispatchState.NOT_CROSSED,
          reconciliationRequired: false,
          startedAt: now,
        },
      });
      await tx.actionExecution.update({
        where: { id: execution.id },
        data: {
          state: ActionExecutionState.EXECUTING,
          executionAttemptCount: { increment: 1 },
          firstAttemptedAt: execution.firstAttemptedAt ?? now,
          leaseOwner: `client-preferences:${execution.id}`,
          leaseTokenHash: preferenceHash(execution.id),
          leaseExpiresAt: new Date(now.getTime() + 60000),
          revision: { increment: 1 },
        },
      });
      await this.apply(tx, identity, command, fresh.desired);
      await tx.actionTargetMutation.create({
        data: {
          id: randomUUID(),
          tenantId: identity.tenantId,
          actionExecutionId: execution.id,
          targetKind: CLIENT_PREFERENCE_KINDS[operation],
          targetRef: identity.clientId,
          mutationKind: operation,
          mutationKey: `g${fresh.generation}:${operation}`,
          targetGeneration: fresh.generation,
          beforeStateHash: String(durable.beforeStateHash),
          afterStateHash: String(durable.afterStateHash),
        },
      });
      const receipt: Receipt = {
        actionExecutionId: execution.id,
        outcome: 'updated',
        targetGeneration: fresh.generation + 1,
        businessMutations: 1,
        providerWrites: 0,
      };
      await tx.actionAttempt.update({
        where: { id: attemptId },
        data: {
          state: ActionAttemptState.SUCCEEDED,
          outcomeCode: 'local_transaction_committed',
          safeResultJson: receipt,
          finishedAt: now,
        },
      });
      await tx.actionExecution.update({
        where: { id: execution.id },
        data: {
          state: ActionExecutionState.SUCCEEDED,
          finalOutcomeCode: 'local_transaction_committed',
          safeResultSummaryJson: receipt,
          finalizedAt: now,
          reconciliationState: 'NOT_REQUIRED',
          leaseOwner: null,
          leaseTokenHash: null,
          leaseExpiresAt: null,
          revision: { increment: 1 },
        },
      });
      return receipt;
    });
  }

  private async identity(tx: Tx, proof: string): Promise<Identity> {
    const channel = await this.channels.authenticate(proof, tx);
    await lockClientChannelIdentity(
      tx,
      channel.tenantId,
      channel.provider,
      channel.providerSubjectHash,
    );
    const current = await this.channels.authenticate(proof, tx);
    if (
      current.provider !== channel.provider ||
      current.providerSubjectHash !== channel.providerSubjectHash ||
      current.tenantId !== channel.tenantId
    )
      throw new ForbiddenException('Channel changed');
    const tenant = await tx.tenant.findUnique({
      where: { id: channel.tenantId },
    });
    if (
      !tenant ||
      !['active', 'trial_active', 'past_due_grace'].includes(
        evaluateTenantAccessState(tenant, new Date()).accessState,
      )
    )
      throw new ForbiddenException('Tenant is not active');
    const links = await tx.clientChannelLink.findMany({
      where: {
        tenantId: channel.tenantId,
        provider: channel.provider,
        providerSubjectHash: channel.providerSubjectHash,
        revokedAt: null,
      },
      take: 2,
    });
    if (
      links.length !== 1 ||
      links[0].verificationVersion !== 1 ||
      links[0].subjectHashVersion !== 1
    )
      throw new ForbiddenException('client_link_required');
    const link = links[0];
    await this.links.assertClientEligible(tx, channel.tenantId, link.clientId);
    return {
      tenantId: channel.tenantId,
      clientId: link.clientId,
      userId: channel.userId,
      binding: {
        linkId: link.id,
        provider: channel.provider,
        providerSubjectHash: link.providerSubjectHash,
        verificationEvidenceHash: link.verificationEvidenceHash,
      },
    };
  }
  private async profile(tx: Tx, identity: Identity) {
    return tx.customerProfile.findUnique({
      where: {
        tenantId_clientId: {
          tenantId: identity.tenantId,
          clientId: identity.clientId,
        },
      },
    });
  }
  private overrides(value: unknown) {
    if (value === null || value === undefined) return {};
    const envelope = preferenceObject(value);
    exactPreferenceKeys(envelope, ['version', 'overrides']);
    if (envelope.version !== 1)
      throw new ConflictException(
        'Unsupported stored preference policy version',
      );
    return notificationOverrides(envelope.overrides);
  }
  private async generation(
    tx: Tx,
    identity: Identity,
    operation: ClientPreferenceOperation,
  ) {
    const latest = await tx.actionTargetMutation.findFirst({
      where: {
        tenantId: identity.tenantId,
        targetKind: CLIENT_PREFERENCE_KINDS[operation],
        targetRef: identity.clientId,
      },
      orderBy: { targetGeneration: 'desc' },
      select: { targetGeneration: true },
    });
    return (latest?.targetGeneration ?? -1) + 1;
  }
  private async snapshot(tx: Tx, identity: Identity, command: Command) {
    const profile = await this.profile(tx, identity);
    const generation = await this.generation(tx, identity, command.operation);
    if (command.operation === 'visit_mood') {
      const visits = await tx.appointment.findMany({
        where: {
          tenantId: identity.tenantId,
          ...(command.provider === 'internal'
            ? { id: command.recordId, source: 'internal' }
            : {
                crmProvider: command.provider,
                crmExternalId: command.recordId,
              }),
        },
        take: 2,
      });
      if (visits.length !== 1 || visits[0].mayaClientId !== identity.clientId)
        throw new ForbiddenException('Exact owned appointment required');
      const visit = visits[0];
      await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id = ${visit.id} AND "tenantId" = ${identity.tenantId} FOR UPDATE`;
      if (visit.startAt <= new Date() || visit.status !== 'confirmed')
        throw new ConflictException(
          'Only upcoming confirmed appointment preference may change',
        );
      const before = {
        appointmentId: visit.id,
        mood: visit.clientVisitMood,
        defaultMood: profile?.defaultVisitMood ?? null,
      };
      const after = {
        appointmentId: visit.id,
        mood: command.mood,
        defaultMood: command.mood,
      };
      return {
        generation,
        before,
        after,
        desired: { appointmentId: visit.id, mood: command.mood },
        noOp: preferenceHash(before) === preferenceHash(after),
      };
    }
    const before = this.overrides(profile?.notificationPreferencesJson);
    const after = { ...before, ...command.patch };
    // Neutral values remove Client restrictions; they never grant consent or
    // override the existing tenant/category delivery policy.
    for (const key of [
      'record_changes',
      'reminder',
      'marketing',
      'cycle',
      'birthday',
      'freed_slot',
    ])
      if (after[key] === true) delete after[key];
    const inherited = await tx.appointmentNotificationSetting.findUnique({
      where: { tenantId: identity.tenantId },
      select: { enabled: true, leadTimesMinutes: true },
    });
    if (inherited?.enabled === false && after.reminder === false)
      delete after.reminder;
    const times = inherited?.leadTimesMinutes ?? [1440, 120];
    if (
      Array.isArray(times) &&
      times.length === 1 &&
      typeof times[0] === 'number' &&
      after.reminder_hours === times[0] / 60
    )
      delete after.reminder_hours;
    if (after.quiet_from === null && after.quiet_to === null) {
      delete after.quiet_from;
      delete after.quiet_to;
    }
    notificationOverrides(after);
    return {
      generation,
      before,
      after,
      desired: after,
      noOp: preferenceHash(before) === preferenceHash(after),
    };
  }
  private async apply(
    tx: Tx,
    identity: Identity,
    command: Command,
    desired: Record<string, unknown>,
  ) {
    const profile = await this.profile(tx, identity);
    const data =
      command.operation === 'visit_mood'
        ? { defaultVisitMood: String(desired.mood) }
        : {
            notificationPreferencesJson: Object.keys(desired).length
              ? ({ version: 1, overrides: desired } as Prisma.InputJsonValue)
              : Prisma.DbNull,
          };
    if (profile)
      await tx.customerProfile.update({ where: { id: profile.id }, data });
    else
      await tx.customerProfile.create({
        data: {
          tenantId: identity.tenantId,
          clientId: identity.clientId,
          ...data,
        },
      });
    if (command.operation === 'visit_mood')
      await tx.appointment.update({
        where: { id: String(desired.appointmentId) },
        data: { clientVisitMood: String(desired.mood) },
      });
  }
  private restore(execution: ActionExecution): Receipt {
    const result = preferenceObject(execution.safeResultSummaryJson);
    if (
      result.actionExecutionId !== execution.id ||
      result.businessMutations !== 1
    )
      throw new ConflictException('Durable preference receipt missing');
    return result as Receipt;
  }
  private async lock(tx: Tx, identity: Identity) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${identity.tenantId}:client-preferences:${identity.clientId}`}, 0))`;
  }
  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt === 3
        )
          throw error;
      }
    }
    throw new ConflictException('Preference concurrency retry exhausted');
  }
}
