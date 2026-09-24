import { Injectable } from '@nestjs/common';

import { CanonicalBulkService } from '../../marketing/canonical-bulk.service';
import type {
  ActuatingRoutingInput,
  ApprovalRequestOwnerPort,
  EffectRouteOutcome,
} from '../routing/effect-router.ports';

const refused = (reason?: string): EffectRouteOutcome => ({
  receiptOutcome: 'REFUSED',
  refusalCode: 'insufficient_authority',
  actionReceiptRef: null,
  nextEnvelope: null,
  resolvedWidget: null,
  ownerDecision: null,
  gate14RefusalReason: reason ?? null,
});

const accepted = (
  executionId: string,
  ownerDecision: unknown,
): EffectRouteOutcome => ({
  receiptOutcome: 'ACCEPTED',
  refusalCode: null,
  actionReceiptRef: executionId,
  nextEnvelope: null,
  resolvedWidget: null,
  ownerDecision,
  gate14RefusalReason: null,
});

/** U13c's only approval owner: the existing B35 immutable bulk owner. */
@Injectable()
export class ApprovalRequestAdapter implements ApprovalRequestOwnerPort {
  constructor(private readonly owner: CanonicalBulkService) {}

  async request(input: ActuatingRoutingInput): Promise<EffectRouteOutcome> {
    const subject = input.routing.record.capabilityKey;
    if (
      input.routing.record.capabilitySpace !== 'AE' ||
      subject !== 'communication.bulk-campaign.admit.v2'
    )
      return refused();
    const campaignId = input.resolvedNouns.values.get('campaign');
    const intentHash = input.resolvedNouns.values.get('intent');
    if (!campaignId || !intentHash) return refused();
    try {
      const execution = await this.owner.requestWidgetApproval({
        tenantId: input.routing.tenantId,
        userId: input.actorUserId,
        campaignId,
        intentHash,
      });
      return accepted(execution.id, { state: execution.state });
    } catch (error) {
      return refused(gate14Reason(error));
    }
  }

  async decide(input: ActuatingRoutingInput): Promise<EffectRouteOutcome> {
    const record = input.routing.record;
    if (
      record.widgetKind !== 'APPROVAL' ||
      record.capabilitySpace !== 'AE' ||
      record.capabilityKey !== 'communication.bulk-campaign.admit.v2' ||
      record.confirmationOfKind !== 'approval' ||
      !record.confirmationOfRef ||
      (record.approvalDecision !== 'approve' &&
        record.approvalDecision !== 'reject')
    )
      return refused();
    try {
      const execution = await this.owner.decideWidgetApproval({
        tenantId: input.routing.tenantId,
        userId: input.actorUserId,
        executionId: record.confirmationOfRef,
        decision:
          record.approvalDecision === 'approve' ? 'APPROVED' : 'REJECTED',
      });
      return accepted(execution.id, {
        decision: execution.approvalDecision,
        state: execution.state,
      });
    } catch (error) {
      return refused(gate14Reason(error));
    }
  }
}

const gate14Reason = (error: unknown): string | undefined => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('entitlement')) return 'entitlement_denied';
  if (message.includes('inactive') && message.includes('user'))
    return 'user_inactive';
  if (message.includes('inactive')) return 'membership_inactive';
  if (message.includes('membership') || message.includes('active account'))
    return 'membership_missing';
  if (message.includes('actor') || message.includes('authenticated'))
    return 'actor_required';
  if (message.includes('role') || message.includes('authority'))
    return 'role_denied';
  return undefined;
};
