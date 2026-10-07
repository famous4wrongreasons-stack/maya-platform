import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { AiReadWidgetResolution } from './ai-read-widget-trigger.port';
import type { Prisma } from '@prisma/client';

export const AI_APPROVAL_WIDGET_TRIGGER = 'AI_APPROVAL_WIDGET_TRIGGER';
export interface AiApprovalWidgetTriggerPort {
  /** Existing durable correlation proof only; never transcript or execution authority. */
  readServicePriceUserTurnBinding(
    input: {
      tenantId: string;
      userId: string;
      turnId: string;
      conversationId: string;
      principalProofHash?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{
    turnId: string;
    conversationId: string;
    principalProofHash: string;
  } | null>;
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

export const AI_GOODS_APPROVAL_WIDGET_TRIGGER =
  'AI_GOODS_APPROVAL_WIDGET_TRIGGER';
export interface AiGoodsApprovalWidgetTriggerPort {
  /** Existing durable correlation proof only; never transcript or execution authority. */
  readGoodsReceiptUserTurnBinding(
    input: {
      tenantId: string;
      userId: string;
      turnId: string;
      conversationId: string;
      principalProofHash?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{
    turnId: string;
    conversationId: string;
    principalProofHash: string;
  } | null>;
  afterPendingGoodsReceiptApproval(input: {
    actor: Readonly<AuthenticatedUser>;
    approvalId: string;
    payloadHash: string;
    userTurn: { turnId: string; conversationId: string };
  }): Promise<AiReadWidgetResolution | null>;
}

export interface GoodsReceiptChatOrigin {
  contract: 'maya.goods-receipt-chat-approval/1';
  approvalId: string;
  payloadHash: string;
  userTurnId: string;
  conversationId: string;
  principalProofHash: string;
}
export interface GoodsReceiptApprovalSnapshot {
  id: string;
  payloadHash: string;
  expiresAt: Date;
  createdAt: Date;
  summary: string;
  facts: Readonly<Record<string, unknown>>;
  origin: GoodsReceiptChatOrigin;
}
