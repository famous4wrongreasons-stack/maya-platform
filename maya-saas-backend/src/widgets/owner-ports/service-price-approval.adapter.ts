import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Inject,
} from '@nestjs/common';
import { PRINCIPAL_RESOLVER } from '../di-tokens';
import type { PrincipalResolver } from '../authority/principal-view';
import { EntitlementsService } from '../../entitlements/entitlements.service';
import { AiToolRuntimeService } from '../../ai-tools/ai-tool-runtime.service';
import type { AuthenticatedUser } from '../../common/authenticated-user.interface';
import { UserRole } from '../../common/domain.enums';
import { PrismaService } from '../../prisma/prisma.service';
import { SERVICE_PRICE_CAPABILITY } from '../../crm/yclients-service-price.contract';
import { openWidgetNounHandle } from '../emission/seal.service';
import { TimelineStore } from '../stores/timeline.store';
import type {
  NounActor,
  NounResolverInput,
} from '../noun-resolution/noun-resolution';
import type { NounReadResult } from '../noun-resolution/noun-resolution.ports';
import {
  parseServicePriceApprovalRef,
  SERVICE_PRICE_APPROVAL_NOUN_OWNER,
  type ServicePriceApprovalOwnerPort,
} from '../pricing/service-price-approval.port';
import type {
  ActuatingRoutingInput,
  EffectRouteOutcome,
} from '../routing/effect-router.ports';

const refused = (): EffectRouteOutcome => ({
  receiptOutcome: 'REFUSED',
  refusalCode: 'insufficient_authority',
  actionReceiptRef: null,
  nextEnvelope: null,
  resolvedWidget: null,
  ownerDecision: null,
  gate14RefusalReason: null,
});
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/** Typed outer AI approval owner. It never calls an AE approval API or a provider. */
@Injectable()
export class ServicePriceApprovalAdapter implements ServicePriceApprovalOwnerPort {
  constructor(
    private readonly runtime: AiToolRuntimeService,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(PRINCIPAL_RESOLVER) private readonly principals: PrincipalResolver,
  ) {}

  private async actor(input: NounActor): Promise<AuthenticatedUser> {
    if (!input.tenantId) throw new ForbiddenException('Tenant owner required');
    const principal = await this.prisma.$transaction((tx) =>
      this.principals.resolve(tx),
    );
    if (
      !principal ||
      principal.authority.kind !== 'USER' ||
      principal.authority.userId !== input.userId ||
      principal.authority.tenantId !== input.tenantId ||
      ![UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER].includes(
        principal.role as UserRole,
      )
    )
      throw new ForbiddenException('Active tenant owner required');
    return {
      userId: input.userId,
      tenantId: input.tenantId,
      role: principal.role as UserRole,
      sessionId: '',
      email: '',
      branchId: null,
      membershipId: principal.authority.membershipId,
      membershipStatus: 'active',
    };
  }

  async sameServiceApproval(
    actor: NounActor,
    previousApprovalId: string,
    currentApprovalId: string,
  ): Promise<boolean> {
    try {
      return await this.runtime.sameServicePriceApproval(
        await this.actor(actor),
        previousApprovalId,
        currentApprovalId,
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500)
        return false;
      throw error;
    }
  }

  async read(
    actor: NounActor,
    ref: string,
    principalProofHash: string,
    revalidate: boolean,
  ) {
    const parsed = parseServicePriceApprovalRef(ref);
    if (!parsed)
      throw new ConflictException('service_price_approval_handle_invalid');
    const source = await this.runtime.readServicePriceWidgetApproval(
      await this.actor(actor),
      parsed.id,
      parsed.hash,
      revalidate,
    );
    if (source.origin.principalProofHash !== principalProofHash)
      throw new ForbiddenException('Service price chat principal changed');
    const turn = await TimelineStore.readActiveUserTurnIdentity(
      this.prisma,
      {
        id: source.origin.userTurnId,
        tenantId: actor.tenantId!,
        conversationId: source.origin.conversationId,
        principalProofHash,
      },
      new Date(),
    );
    if (!turn)
      throw new ConflictException('service_price_chat_origin_unavailable');
    return source;
  }

  async readNoun(
    input: NounResolverInput,
    actor: NounActor,
  ): Promise<NounReadResult> {
    const handle = input.frozenNouns.get('approval');
    const opened = handle ? openWidgetNounHandle(handle) : null;
    if (
      !(
        (input.capability?.space === 'AE' &&
          input.capability.key === SERVICE_PRICE_CAPABILITY) ||
        (input.capability?.space === 'C9' &&
          input.capability.key === 'catalog.service.price.update') ||
        input.capability === null
      ) ||
      input.frozenNouns.size !== 1 ||
      !opened ||
      opened.noun !== 'approval' ||
      opened.ownerKind !== SERVICE_PRICE_APPROVAL_NOUN_OWNER ||
      opened.tenantId !== input.tenantId ||
      actor.tenantId !== input.tenantId ||
      input.producedByIntentTokenHash !== null
    )
      return { kind: 'gone', reason: 'not_found' };
    const parsed = parseServicePriceApprovalRef(opened.ownerRef);
    if (
      !parsed ||
      (input.capability?.space === 'AE'
        ? input.confirmationOfRef?.kind !== 'approval' ||
          input.confirmationOfRef.ref !== parsed.id
        : input.confirmationOfRef !== null)
    )
      return { kind: 'gone', reason: 'not_found' };
    try {
      await this.read(actor, opened.ownerRef, input.principalProofHash, true);
      return {
        kind: 'resolved',
        values: new Map([['approval', opened.ownerRef]]),
      };
    } catch (error) {
      if (error instanceof ForbiddenException)
        return { kind: 'policy_deferred' };
      if (error instanceof HttpException && error.getStatus() < 500)
        return { kind: 'gone', reason: 'not_found' };
      throw error;
    }
  }

  async decide(input: ActuatingRoutingInput): Promise<EffectRouteOutcome> {
    const r = input.routing.record;
    const ref = input.resolvedNouns.values.get('approval');
    const parsed = ref ? parseServicePriceApprovalRef(ref) : null;
    if (
      r.widgetKind !== 'APPROVAL' ||
      r.capabilitySpace !== 'AE' ||
      r.capabilityKey !== SERVICE_PRICE_CAPABILITY ||
      r.confirmationOfKind !== 'approval' ||
      !parsed ||
      r.confirmationOfRef !== parsed.id ||
      r.producedByIntentTokenHash !== null ||
      r.approvalOfIntentRef !== null ||
      (r.approvalDecision !== 'approve' && r.approvalDecision !== 'reject')
    )
      return refused();
    const actorInput = {
      tenantId: input.routing.tenantId,
      userId: input.actorUserId,
    };
    let submitted = false;
    try {
      const source = await this.read(
        actorInput,
        ref!,
        input.principal.proofHash,
        false,
      );
      const actor = await this.actor(actorInput);
      submitted = true;
      const value = record(
        r.approvalDecision === 'approve'
          ? await this.runtime.approve(
              actor,
              parsed.id,
              { payloadHash: parsed.hash },
              {
                admissionGuard: (tx) =>
                  this.entitlements.assertWidgetRuntimeAdmission(
                    input.routing.tenantId,
                    tx,
                  ),
              },
            )
          : await this.runtime.reject(actor, parsed.id, {
              payloadHash: parsed.hash,
            }),
      );
      const result = record(value.result);
      const confirmed =
        r.approvalDecision === 'approve' &&
        value.status === 'completed' &&
        result.verified === true &&
        result.source === 'yclients' &&
        result.currency === 'RUB' &&
        String(result.service_id) === source.serviceId &&
        result.price_rubles === source.proposedPrice &&
        typeof result.action_execution_id === 'string';
      return {
        receiptOutcome: 'ACCEPTED',
        refusalCode: null,
        actionReceiptRef:
          confirmed && typeof result.action_execution_id === 'string'
            ? result.action_execution_id
            : null,
        nextEnvelope: null,
        resolvedWidget: null,
        gate14RefusalReason: null,
        ownerDecision: {
          decision: r.approvalDecision === 'approve' ? 'APPROVED' : 'REJECTED',
          status: value.status,
          state: confirmed
            ? 'SUCCEEDED'
            : r.approvalDecision === 'reject' && value.status === 'rejected'
              ? 'REJECTED'
              : 'UNKNOWN',
          ...(confirmed ? { outcome: result } : {}),
        },
      };
    } catch (error) {
      const response =
        error instanceof HttpException ? record(error.getResponse()) : {};
      if (
        submitted ||
        record(response.error).code === 'ai_tool_outcome_unknown'
      )
        return {
          receiptOutcome: 'ACCEPTED',
          refusalCode: null,
          actionReceiptRef: null,
          nextEnvelope: null,
          resolvedWidget: null,
          ownerDecision: {
            decision: null,
            requested_decision: r.approvalDecision,
            state: 'UNKNOWN',
            status: 'UNKNOWN',
            reconciliation: 'required',
          },
          gate14RefusalReason: null,
        };
      return refused();
    }
  }
}
