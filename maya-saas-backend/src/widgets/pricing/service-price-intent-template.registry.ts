import { SERVICE_PRICE_CAPABILITY } from '../../crm/yclients-service-price.contract';
import type { IntentProposal } from '../../widget-contract/derived-shapes';
import type { WidgetKind } from '../../widget-contract/kinds';
import { carrierAdmits } from '../carriers/channel-profile';
import {
  IntentTemplateRefusal,
  type IntentTemplateRow,
} from '../emission/intent-template.registry';

export const SERVICE_PRICE_APPROVE_TEMPLATE = 'commit.service-price.approve@1';
export const SERVICE_PRICE_REJECT_TEMPLATE = 'commit.service-price.reject@1';
export const SERVICE_PRICE_DETAIL_TEMPLATE = 'navigate.service-price.detail@1';

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
      ? Object.freeze({ space: 'AE' as const, key: SERVICE_PRICE_CAPABILITY })
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
export const SERVICE_PRICE_INTENT_TEMPLATE_REGISTRY: Readonly<
  Record<string, IntentTemplateRow>
> = Object.freeze({
  [SERVICE_PRICE_APPROVE_TEMPLATE]: row(
    SERVICE_PRICE_APPROVE_TEMPLATE,
    'primary',
    'Подтвердить цену',
    true,
  ),
  [SERVICE_PRICE_REJECT_TEMPLATE]: row(
    SERVICE_PRICE_REJECT_TEMPLATE,
    'destructive',
    'Отклонить изменение',
    true,
  ),
  [SERVICE_PRICE_DETAIL_TEMPLATE]: row(
    SERVICE_PRICE_DETAIL_TEMPLATE,
    'secondary',
    'Подробности изменения',
    false,
  ),
});

export const servicePriceDecision = (
  key: string,
): 'approve' | 'reject' | null =>
  key === SERVICE_PRICE_APPROVE_TEMPLATE
    ? 'approve'
    : key === SERVICE_PRICE_REJECT_TEMPLATE
      ? 'reject'
      : null;

export const isServicePriceTemplate = (key: string): boolean =>
  Object.prototype.hasOwnProperty.call(
    SERVICE_PRICE_INTENT_TEMPLATE_REGISTRY,
    key,
  );

export const resolveServicePriceTemplate = (args: {
  proposal: IntentProposal;
  widgetKind: WidgetKind;
  deliveryChannel: string;
}): IntentTemplateRow => {
  if (
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
  if (!isServicePriceTemplate(args.proposal.intent_template_key))
    throw new IntentTemplateRefusal('unknown_or_version_incompatible');
  const candidate =
    SERVICE_PRICE_INTENT_TEMPLATE_REGISTRY[args.proposal.intent_template_key];
  if (!candidate)
    throw new IntentTemplateRefusal('unknown_or_version_incompatible');
  if (args.widgetKind !== 'APPROVAL')
    throw new IntentTemplateRefusal('kind_mismatch');
  if (!candidate.roles.includes(args.proposal.role))
    throw new IntentTemplateRefusal('role_mismatch');
  if (
    args.proposal.handoff_capability_ref !== undefined ||
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
