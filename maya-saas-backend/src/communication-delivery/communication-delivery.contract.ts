import type {
  ActionExecution,
  MarketingCampaign,
  MarketingCampaignRecipient,
  MarketingDeliveryAttempt,
} from '@prisma/client';

export const COMMUNICATION_ENVELOPE_CONTRACT =
  'maya.communication-envelope/1' as const;

export type CommunicationEligibilityDecision = 'ALLOW' | 'SKIP' | 'DENY';

export interface CommunicationRecipientV1 {
  /** Trusted opaque source reference. It is HMACed before persistence. */
  recipientRef: string;
  recipientKind: string;
  internalUserId?: string;
  consentEvidenceId?: string;
  eligibility: {
    basis: string;
    decision: CommunicationEligibilityDecision;
    policyVersion: number;
    evidenceRef: string;
    evidenceHash: string;
    checkedAt: Date;
    reasonCode?: string;
  };
}

export interface CreateCommunicationEnvelopeV1 {
  contract: typeof COMMUNICATION_ENVELOPE_CONTRACT;
  /** Trusted tenant context, never accepted from model output. */
  tenantId: string;
  actionExecutionId: string;
  scope: 'SINGLE' | 'BULK';
  channel: string;
  capabilityKey: string;
  /** Stable caller key; discovery time and worker ids are forbidden. */
  campaignIdempotencyKey: string;
  /** Opaque content pointer plus a precomputed canonical content hash. */
  contentRef: string;
  contentIdentityHash: string;
  expiresAt: Date;
  recipients: CommunicationRecipientV1[];
  audienceId?: string;
  audienceSnapshotHash?: string;
  createdByUserId?: string;
  confirmedByUserId?: string;
}

export interface CommunicationDeliveryClaimV1 {
  campaign: MarketingCampaign;
  recipient: MarketingCampaignRecipient;
  attempt: MarketingDeliveryAttempt;
  /** Returned once. Only the HMAC is persisted. */
  leaseToken: string;
}

export interface CommunicationReconciliationClaimV1 extends CommunicationDeliveryClaimV1 {
  attempt: MarketingDeliveryAttempt & { kind: 'RECONCILIATION' };
}

export interface OwnedCommunicationAttemptV1 {
  tenantId: string;
  campaignId: string;
  recipientId: string;
  attemptId: string;
  leaseToken: string;
  /** Compare-and-set guard against stale workers reusing an old lease context. */
  recipientRevision: number;
}

export interface CommunicationDispatchBoundaryV1 {
  recipient: MarketingCampaignRecipient;
  attempt: MarketingDeliveryAttempt;
}

export type CommunicationReconciliationOutcome =
  | 'PROVEN_ACCEPTED'
  | 'PROVEN_DELIVERED'
  | 'PROVEN_FAILED'
  | 'PROVEN_NOT_SENT'
  | 'STILL_UNKNOWN';

export interface CommunicationProviderCapabilitiesV1 {
  key: string;
  version: number;
  channel: string;
  testOnly: boolean;
  externalDispatchEnabled: false;
  providerIdempotencySupported: boolean;
  providerReferenceReturned: boolean;
  reconciliationSupported: boolean;
  proofOfNonDeliverySupported: boolean;
  acceptedIsTerminal: boolean;
  retry: {
    key: string;
    version: number;
    maxExecutionAttempts: number;
    retryablePreDispatchErrors: ReadonlySet<string>;
    backoffMs: readonly number[];
  };
  reconciliation: {
    key: string;
    version: number;
    maxInconclusiveAttempts: number;
  };
  payloadRetentionMs: number;
  auditRetentionMs: number;
}

export interface CommunicationDeliveryAuditV1 {
  campaign: MarketingCampaign;
  recipients: Array<
    MarketingCampaignRecipient & {
      deliveryAttempts: MarketingDeliveryAttempt[];
    }
  >;
  actionExecutionState: ActionExecution['state'] | null;
}

export interface CommunicationDeliveryMetricsV1 {
  campaigns: number;
  recipients: number;
  notSent: number;
  accepted: number;
  delivered: number;
  failed: number;
  unknown: number;
  skipped: number;
  attempts: number;
  duplicateDeliveriesCollapsed: number;
  externalMessagesSent: 0;
}
