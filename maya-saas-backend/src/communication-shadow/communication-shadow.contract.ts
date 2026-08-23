import type { ActionSourceType } from '../action-engine/action-engine.contract';

export type CommunicationShadowTaxonomy =
  'transactional_single' | 'operational_single' | 'bulk_campaign';

export type CommunicationShadowChannel =
  'inbox' | 'apns' | 'telegram' | 'sms' | 'email';

export interface CommunicationShadowRecipientInput {
  recipientRef: string;
  recipientKind: string;
  internalUserId?: string;
  consentEvidenceId?: string;
  eligibility: {
    basis: string;
    decision: 'ALLOW' | 'SKIP' | 'DENY';
    policyVersion: number;
    evidenceRef: string;
    evidenceIdentityParts: readonly string[];
    reasonCode?: string;
  };
}

export interface CommunicationShadowPlanInput {
  tenantId: string;
  sourceType: Extract<
    ActionSourceType,
    'authenticated_request' | 'scheduler' | 'webhook' | 'legacy_bridge'
  >;
  producerRef: string;
  logicalRef: string;
  taxonomy: CommunicationShadowTaxonomy;
  channel: CommunicationShadowChannel;
  templateRef: string;
  contentIdentityParts: readonly string[];
  recipients: CommunicationShadowRecipientInput[];
  eligibilityPolicyRef: string;
  legacyApprovalRequirement: 'NONE' | 'OWNER_CONFIRMED' | 'SYSTEM_POLICY';
  expiresAt: Date;
  actorUserId?: string;
  audienceId?: string;
  audienceSnapshotHash?: string;
  confirmedByUserId?: string;
}

export interface CommunicationShadowPlanResult {
  actionExecutionId: string;
  campaignId: string;
  recipientIds: string[];
  duplicateDeliveriesCollapsed: number;
  externalMessagesSent: 0;
}
