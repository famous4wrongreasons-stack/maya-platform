import { STAFF_CREATE_CAPABILITY } from '../../crm/yclients-staff-create.contract';
import type { IntentProposal } from '../../widget-contract/derived-shapes';
import type { WidgetKind } from '../../widget-contract/kinds';
import { carrierAdmits } from '../carriers/channel-profile';
import {
  IntentTemplateRefusal,
  type IntentTemplateRow,
} from '../emission/intent-template.registry';

export const STAFF_CREATE_APPROVE_TEMPLATE = 'commit.staff-create.approve@1';
export const STAFF_CREATE_REJECT_TEMPLATE = 'commit.staff-create.reject@1';
export const STAFF_CREATE_DETAIL_TEMPLATE = 'navigate.staff-create.detail@1';

const row = (
  key: string,
  role: 'primary' | 'destructive' | 'secondary',
  label: string,
  decision: boolean,
): IntentTemplateRow =>
  Object.freeze({
    key,
    version: 1,
    effect: decision ? 'COMMIT' : 'NAVIGATE',
    kinds: Object.freeze(['APPROVAL'] as const),
    roles: Object.freeze([role]),
    subject: decision
      ? Object.freeze({ space: 'AE' as const, key: STAFF_CREATE_CAPABILITY })
      : null,
    target: decision
      ? null
      : Object.freeze({ class: 'detail' as const, ref: 'fs.catalogue' }),
    inputSchema: null,
    selectionDomain: Object.freeze({}),
    selectionDomainLabels: Object.freeze({}),
    priority: 1,
    singleUse: decision,
    ttlSeconds: 86400,
    label,
    utteranceTemplate: label,
    speechAliases: Object.freeze([label]),
    allowedArgumentHandles: Object.freeze(['approval']),
    sourceSubject: false,
  });

/** Two fixed decisions and their read-only detail. This registry is never a generic write door. */
export const STAFF_CREATE_INTENT_TEMPLATE_REGISTRY: Readonly<
  Record<string, IntentTemplateRow>
> = Object.freeze({
  [STAFF_CREATE_APPROVE_TEMPLATE]: row(
    STAFF_CREATE_APPROVE_TEMPLATE,
    'primary',
    'Создать сотрудника',
    true,
  ),
  [STAFF_CREATE_REJECT_TEMPLATE]: row(
    STAFF_CREATE_REJECT_TEMPLATE,
    'destructive',
    'Не создавать',
    true,
  ),
  [STAFF_CREATE_DETAIL_TEMPLATE]: row(
    STAFF_CREATE_DETAIL_TEMPLATE,
    'secondary',
    'Подробности изменения',
    false,
  ),
});

export const staffCreateDecision = (
  key: string,
): 'approve' | 'reject' | null =>
  key === STAFF_CREATE_APPROVE_TEMPLATE
    ? 'approve'
    : key === STAFF_CREATE_REJECT_TEMPLATE
      ? 'reject'
      : null;

export const isStaffCreateTemplate = (key: string): boolean =>
  Object.prototype.hasOwnProperty.call(
    STAFF_CREATE_INTENT_TEMPLATE_REGISTRY,
    key,
  );

export const resolveStaffCreateTemplate = (args: {
  proposal: IntentProposal;
  widgetKind: WidgetKind;
  deliveryChannel: string;
}): IntentTemplateRow => {
  if (
    (Object.getPrototypeOf(args.proposal) !== Object.prototype &&
      Object.getPrototypeOf(args.proposal) !== null) ||
    Object.keys(args.proposal).some(
      (key) =>
        ![
          'intent_template_key',
          'role',
          'capability',
          'argument_handles',
        ].includes(key),
    )
  )
    throw new IntentTemplateRefusal('proposal_not_closed');
  if (!isStaffCreateTemplate(args.proposal.intent_template_key))
    throw new IntentTemplateRefusal('unknown_or_version_incompatible');
  const candidate =
    STAFF_CREATE_INTENT_TEMPLATE_REGISTRY[args.proposal.intent_template_key];
  if (!candidate)
    throw new IntentTemplateRefusal('unknown_or_version_incompatible');
  if (args.widgetKind !== 'APPROVAL')
    throw new IntentTemplateRefusal('kind_mismatch');
  if (!candidate.roles.includes(args.proposal.role))
    throw new IntentTemplateRefusal('role_mismatch');
  if (
    args.proposal.capability?.space !== candidate.subject?.space ||
    args.proposal.capability?.key !== candidate.subject?.key
  )
    throw new IntentTemplateRefusal('capability_mismatch');
  const handles = args.proposal.argument_handles ?? {};
  if (
    Object.keys(handles).length !== 1 ||
    typeof handles.approval !== 'string' ||
    !handles.approval
  )
    throw new IntentTemplateRefusal('undeclared_argument_handle');
  if (
    !carrierAdmits(
      args.deliveryChannel,
      candidate.effect,
      candidate.subject,
      candidate.priority,
    )
  )
    throw new IntentTemplateRefusal('carrier_inadmissible');
  return candidate;
};
