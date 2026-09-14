import { DEFAULT_ASSISTANT_CAPABILITIES } from '../dashboard-preferences/assistant-capabilities.constants';
import { createHash } from 'node:crypto';
import { stableActionJson } from './action-engine.identity';
import type { ActionExecution, Prisma } from '@prisma/client';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { EncryptionService } from '../encryption/encryption.service';
import {
  normalizeCanonicalOwnerReportPlan,
  ownerReportFingerprint,
  ownerReportRequest,
  type CanonicalOwnerReportPlan,
} from '../owner-reports/owner-report.contract';
import {
  alertFingerprint,
  alertRequest,
  normalizeAlert,
} from '../operational-alerts/operational-alert.contract';
import {
  FEEDBACK_ACTIONS,
  FEEDBACK_DELIVERY,
  feedbackPlanHash,
  normalizeFeedbackPlan,
} from '../native-feedback/native-feedback.contract';
import { COMMUNITY_ACTIONS } from '../public-community/public-community.contract';
import {
  TEAM_ACTIONS,
  TEAM_DELIVERY,
  normalizeTeamPlan,
  teamHash,
} from '../team-communications/team-communications.contract';
import {
  EXPENSE_REMINDER_CONTRACT,
  expenseHash,
  normalizeExpenseReminder,
} from '../expense-intake/expense-reminder.contract';
import { CASH_CAPABILITIES } from './cash-declaration.contract';
import type { ActionIdentityService } from './action-engine.identity';
import type { TrustedActionExecutionRequestV1 } from './action-engine.contract';

export const DURABLE_CLAIM_POLICY_CONTRACT = 'maya.rc-durable-claim-policy/1';
export const DURABLE_CLAIM_POLICY_AUDIT = 'action.rc_claim_policy';
export interface ActionClaimEvidenceServices {
  audit: Pick<AuditLogService, 'log'>;
  encryption: Pick<EncryptionService, 'decrypt'>;
}

/** Explicit Option A scope, not a general approval-free policy extension. */
export const RC_DURABLE_COMMANDS: ReadonlySet<string> = new Set([
  ...Object.values(FEEDBACK_ACTIONS),
  ...Object.values(COMMUNITY_ACTIONS),
  ...Object.values(TEAM_ACTIONS),
  ...Object.values(CASH_CAPABILITIES),
  'package5.settings.tenant-business.execute.v1',
  'package5.settings.staff-notifications.execute.v1',
]);
const SLOT_CAPABILITIES = new Set([
  'communication.reports-briefings.execute.v1',
  'communication.appointment-reminders.execute.v1',
  'communication.business-alerts.execute.v1',
  ...Object.values(FEEDBACK_DELIVERY),
  TEAM_DELIVERY,
]);
export function rcPolicyResumeCandidate(e: ActionExecution): boolean {
  return (
    e.capabilityVersion === 1 &&
    e.approvalRequirement === 'NONE' &&
    e.approvalDecision === 'NOT_REQUIRED' &&
    e.policyDecision === 'ALLOW' &&
    !e.dryRun &&
    (RC_DURABLE_COMMANDS.has(e.capability) ||
      SLOT_CAPABILITIES.has(e.capability) ||
      e.capability === 'package5.settings.assistant.execute.v1' ||
      e.actionClass === 'create_expense')
  );
}
function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function expenseReminderPreferenceTransition(
  before: unknown,
  after: unknown,
): boolean {
  const prior = record(before).enabled_capabilities,
    next = record(after).enabled_capabilities;
  if (!Array.isArray(prior) || !Array.isArray(next)) return false;
  const remaining = (values: unknown[]) =>
    values
      .filter((key) => key !== 'weekly_expense_reminders')
      .sort()
      .join('\0');
  return (
    remaining(prior) === remaining(next) &&
    prior.includes('weekly_expense_reminders') !==
      next.includes('weekly_expense_reminders')
  );
}

/** Read only, under the exact original execution lock. Existing owner dispatch
 * guards still enforce current recipients, predecessors, consent and revisions.
 * This verifies the durable binding, never grants delivery authority itself. */
export async function verifyRCDurableBinding(
  tx: Prisma.TransactionClient,
  e: ActionExecution,
  input: Record<string, unknown>,
  identity: ActionIdentityService,
  services: ActionClaimEvidenceServices,
  now: Date,
  equivalent: (request: TrustedActionExecutionRequestV1) => boolean,
): Promise<boolean> {
  if (
    !rcPolicyResumeCandidate(e) ||
    !e.normalizedInputEncrypted ||
    !e.payloadRetentionUntil ||
    e.payloadRetentionUntil <= now ||
    (e.intentExpiresAt && e.intentExpiresAt <= now)
  )
    return false;
  // Normalization/hash and capability/version are independently verified by kernel.
  if (RC_DURABLE_COMMANDS.has(e.capability)) {
    if (e.sourceType !== 'authenticated_request') return false;
    if (Object.values(FEEDBACK_ACTIONS).some((c) => c === e.capability))
      return Date.parse(String(record(input.plan).expiresAt)) > now.getTime();
    const facts = record(input.facts);
    if (e.capability === TEAM_ACTIONS.send)
      return Date.parse(String(record(facts.plan).expiresAt)) > now.getTime();
    if (e.capability === TEAM_ACTIONS.reserve)
      return Date.parse(String(facts.uploadExpiresAt)) > now.getTime();
    if (e.capability === TEAM_ACTIONS.finalize) {
      const attachment = await tx.teamAttachment.findUnique({
        where: { id_tenantId: { id: e.targetRef, tenantId: e.tenantId } },
      });
      return (
        !!attachment &&
        attachment.ownerUserId === e.actorUserId &&
        attachment.uploadExpiresAt > now &&
        (!attachment.finalizeExecutionId ||
          attachment.finalizeExecutionId === e.id)
      );
    }
    return true;
  }
  const refs = Array.isArray(e.evidenceRefsJson) ? e.evidenceRefsJson : [];
  const scoped = (id: string) => ({
    id_tenantId: { id, tenantId: e.tenantId },
  });
  const validRoot = (
    root: {
      expiresAt: Date;
      payloadRetentionUntil: Date;
      intentEncrypted: string | null;
    } | null,
  ) =>
    !!root?.intentEncrypted &&
    root.expiresAt > now &&
    root.payloadRetentionUntil > now &&
    e.intentExpiresAt?.getTime() === root.expiresAt.getTime();
  if (
    e.ownerReportRunId &&
    e.ownerReportSlotKey &&
    e.capability === 'communication.reports-briefings.execute.v1'
  ) {
    const root = await tx.ownerReportRun.findUnique({
      where: scoped(e.ownerReportRunId),
    });
    if (!root || !validRoot(root)) return false;
    const plan = normalizeCanonicalOwnerReportPlan(
      JSON.parse(
        identity.decryptNormalizedPayload(root.intentEncrypted!),
      ) as CanonicalOwnerReportPlan,
    );
    const recipient = plan.recipients.find((r) =>
      r.slots.some((s) => s.key === e.ownerReportSlotKey),
    );
    const slot = recipient?.slots.find((s) => s.key === e.ownerReportSlotKey);
    return (
      plan.tenantId === e.tenantId &&
      plan.expiresAt === root.expiresAt.toISOString() &&
      ownerReportFingerprint(identity, plan) === root.intentHash &&
      !!recipient &&
      !!slot &&
      equivalent(ownerReportRequest(root.id, identity, plan, recipient, slot))
    );
  }
  if (
    e.operationalAlertRunId &&
    e.operationalAlertSlotKey &&
    [
      'communication.appointment-reminders.execute.v1',
      'communication.business-alerts.execute.v1',
    ].includes(e.capability)
  ) {
    const root = await tx.operationalAlertRun.findUnique({
      where: scoped(e.operationalAlertRunId),
    });
    if (!root || !validRoot(root)) return false;
    const plan = normalizeAlert(
      JSON.parse(identity.decryptNormalizedPayload(root.intentEncrypted!)),
    );
    const recipient = plan.recipients.find(
      (r) => r.slot.key === e.operationalAlertSlotKey,
    );
    return (
      plan.tenantId === e.tenantId &&
      alertFingerprint(identity, plan) === root.intentHash &&
      !!recipient &&
      equivalent(alertRequest(root.id, identity, plan, recipient))
    );
  }
  if (
    e.nativeFeedbackRequestId &&
    e.nativeFeedbackSlotKey &&
    Object.values(FEEDBACK_DELIVERY).some((c) => c === e.capability)
  ) {
    const root = await tx.nativeFeedbackRequest.findUnique({
      where: scoped(e.nativeFeedbackRequestId),
    });
    const revision = e.nativeFeedbackRevisionId
      ? await tx.nativeFeedbackRevision.findUnique({
          where: scoped(e.nativeFeedbackRevisionId),
        })
      : null;
    const row = revision ?? root,
      meta = record(input.nativeFeedback);
    if (
      !root ||
      !row?.planEncrypted ||
      root.retentionUntil <= now ||
      (e.nativeFeedbackRevisionId
        ? !revision ||
          revision.requestId !== root.id ||
          revision.clientId !== root.clientId ||
          root.state === 'WITHDRAWN'
        : root.state !== 'OPEN')
    )
      return false;
    const plan = normalizeFeedbackPlan(
      JSON.parse(services.encryption.decrypt(row.planEncrypted)),
    );
    const parentId = revision ? revision.executionId : root.requestExecutionId;
    const parent = await tx.actionExecution.findUnique({
      where: scoped(parentId),
    });
    return (
      parent?.state === 'SUCCEEDED' &&
      plan.tenantId === e.tenantId &&
      plan.requestId === root.id &&
      plan.clientId === root.clientId &&
      plan.revisionId === e.nativeFeedbackRevisionId &&
      Date.parse(plan.expiresAt) > now.getTime() &&
      Date.parse(plan.expiresAt) === e.intentExpiresAt?.getTime() &&
      feedbackPlanHash(plan) === row.planHash &&
      meta.planHash === row.planHash &&
      meta.requestId === root.id &&
      meta.revisionId === e.nativeFeedbackRevisionId &&
      meta.slotKey === e.nativeFeedbackSlotKey &&
      plan.slots.some((s) => s.slotKey === e.nativeFeedbackSlotKey) &&
      refs.includes(`native-feedback-plan:${row.planHash}`)
    );
  }
  if (
    e.teamMessageId &&
    e.teamMessageSlotKey &&
    e.capability === TEAM_DELIVERY
  ) {
    const root = await tx.teamMessage.findUnique({
        where: scoped(e.teamMessageId),
      }),
      meta = record(input.teamMessage);
    if (
      !root?.planEncrypted ||
      root.status !== 'SENT' ||
      root.expiresAt <= now ||
      e.intentExpiresAt?.getTime() !== root.expiresAt.getTime()
    )
      return false;
    const plan = normalizeTeamPlan(
      JSON.parse(services.encryption.decrypt(root.planEncrypted)),
    );
    const parent = await tx.actionExecution.findUnique({
      where: scoped(root.sendExecutionId),
    });
    return (
      parent?.state === 'SUCCEEDED' &&
      plan.tenantId === e.tenantId &&
      plan.messageId === root.id &&
      teamHash('plan', plan) === root.planHash &&
      meta.planHash === root.planHash &&
      meta.messageId === root.id &&
      meta.slotKey === e.teamMessageSlotKey &&
      plan.slots.some((s) => s.slotKey === e.teamMessageSlotKey) &&
      refs.includes(`team-plan:${root.planHash}`)
    );
  }
  if (
    e.expenseReminderRunId &&
    e.expenseReminderSlotKey &&
    e.capability === 'communication.business-alerts.execute.v1'
  ) {
    const root = await tx.expenseReminderRun.findUnique({
        where: scoped(e.expenseReminderRunId),
      }),
      meta = record(input.expenseReminder);
    if (!root || !validRoot(root)) return false;
    const plan = normalizeExpenseReminder(
      JSON.parse(services.encryption.decrypt(root.intentEncrypted!)),
    );
    return (
      plan.tenantId === e.tenantId &&
      expenseHash(EXPENSE_REMINDER_CONTRACT, plan) === root.intentHash &&
      meta.runId === root.id &&
      meta.slotKey === e.expenseReminderSlotKey &&
      meta.planHash === root.intentHash &&
      plan.slots.some(
        (s) =>
          s.slotKey === e.expenseReminderSlotKey &&
          s.executionRef === e.sourceRef,
      ) &&
      refs.includes(`expense-plan:${root.intentHash}`)
    );
  }
  if (e.capability === 'package5.settings.assistant.execute.v1') {
    if (
      !e.actorUserId ||
      e.targetRef !== `dashboard-preference:${e.actorUserId}:assistant`
    )
      return false;
    const row = await tx.dashboardPreference.findUnique({
      where: {
        userId_tenantId_section: {
          tenantId: e.tenantId,
          userId: e.actorUserId,
          section: 'assistant',
        },
      },
    });
    const before = row
        ? record(row.configJson)
        : {
            schema_version: 1,
            enabled_capabilities: [...DEFAULT_ASSISTANT_CAPABILITIES].sort(),
          },
      after = record(input.configJson);
    if (
      input.beforeStateHash !==
      createHash('sha256').update(stableActionJson(before)).digest('hex')
    )
      return false;
    return (
      !!e.requestIdempotencyKeyHash &&
      expenseReminderPreferenceTransition(before, after)
    );
  }
  if (
    e.actionClass === 'create_expense' &&
    e.sourceType === 'legacy_bridge' &&
    e.actorUserId &&
    e.sourceRef
  ) {
    const invocation = await tx.aiToolExecution.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: e.tenantId,
          idempotencyKey: e.sourceRef,
        },
      },
    });
    if (
      !invocation?.approvalRequestId ||
      invocation.actorUserId !== e.actorUserId ||
      invocation.toolName !== 'expenses.create' ||
      !invocation.encryptedResult
    )
      return false;
    const binding = await tx.expenseIntakeBinding.findUnique({
      where: {
        tenantId_approvalRequestId: {
          tenantId: e.tenantId,
          approvalRequestId: invocation.approvalRequestId,
        },
      },
    });
    const approval = await tx.aiApprovalRequest.findUnique({
      where: scoped(invocation.approvalRequestId),
    });
    const receipt = record(
      JSON.parse(services.encryption.decrypt(invocation.encryptedResult)),
    );
    return (
      !!binding &&
      binding.actorUserId === e.actorUserId &&
      !!approval &&
      approval.expiresAt > now &&
      approval.requestedByUserId === e.actorUserId &&
      !!approval.decidedAt &&
      approval.decidedByUserId === e.actorUserId &&
      ['approved', 'executing'].includes(approval.status) &&
      receipt.contract === 'maya.ai-canonical-receipt/1' &&
      receipt.inputHash === approval.payloadHash &&
      Array.isArray(receipt.bindings) &&
      receipt.bindings.some((v) => {
        const b = record(v);
        return (
          b.executionId === e.id &&
          b.capability === e.capability &&
          b.identityFingerprint === e.identityFingerprint &&
          b.normalizedInputHash === e.normalizedInputHash
        );
      })
    );
  }
  return false;
}
