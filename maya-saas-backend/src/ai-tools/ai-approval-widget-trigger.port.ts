import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { AiReadWidgetResolution } from './ai-read-widget-trigger.port';

export const AI_APPROVAL_WIDGET_TRIGGER = 'AI_APPROVAL_WIDGET_TRIGGER';
export interface AiApprovalWidgetTriggerPort {
  afterPendingServicePriceApproval(input: {
    actor: Readonly<AuthenticatedUser>;
    approvalId: string;
    payloadHash: string;
    userTurn: { turnId: string; conversationId: string };
  }): Promise<AiReadWidgetResolution | null>;
}
export interface ServicePriceChatOrigin {
  contract: 'maya.service-price-chat-approval/1';
  approvalId: string;
  payloadHash: string;
  userTurnId: string;
  conversationId: string;
  principalProofHash: string;
}
export interface ServicePriceApprovalSnapshot {
  id: string;
  payloadHash: string;
  expiresAt: Date;
  createdAt: Date;
  summary: string;
  serviceId: string;
  serviceName: string;
  companyId: string;
  currentPrice: number;
  proposedPrice: number;
  origin: ServicePriceChatOrigin;
}
