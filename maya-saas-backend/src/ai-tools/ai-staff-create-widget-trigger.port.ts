import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { AiReadWidgetResolution } from './ai-read-widget-trigger.port';
import type { Prisma } from '@prisma/client';

export const AI_STAFF_CREATE_WIDGET_TRIGGER = 'AI_STAFF_CREATE_WIDGET_TRIGGER';
export interface AiStaffCreateWidgetTriggerPort {
  /** Existing durable correlation proof only; never transcript or execution authority. */
  readStaffCreateUserTurnBinding(
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
  afterPendingStaffCreateApproval(input: {
    actor: Readonly<AuthenticatedUser>;
    approvalId: string;
    payloadHash: string;
    userTurn: { turnId: string; conversationId: string };
  }): Promise<AiReadWidgetResolution | null>;
}
export interface StaffCreateChatOrigin {
  contract: 'maya.staff-create-chat-approval/1';
  approvalId: string;
  payloadHash: string;
  userTurnId: string;
  conversationId: string;
  principalProofHash: string;
}
export interface StaffCreateApprovalSnapshot {
  id: string;
  payloadHash: string;
  expiresAt: Date;
  createdAt: Date;
  summary: string;
  name: string;
  specialization: string;
  companyId: string;
  origin: StaffCreateChatOrigin;
}
