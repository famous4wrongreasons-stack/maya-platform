import type { IntentProposal } from '../../widget-contract/derived-shapes';
import type { IntentTemplateRow } from './intent-template.registry';
import { IntentTemplateRefusal } from './intent-template.registry';
import { carrierAdmits } from '../carriers/channel-profile';

export const SCHEDULE_AE =
  'package5.wave3.update-staff-schedule-day.execute.v1';
export const SCHEDULE_TEMPLATE = 'commit.schedule.day@1';
/** Exact A15 recipe. No caller-selected operation, target, payload or effect. */
export const SCHEDULE_INTENT_TEMPLATE: IntentTemplateRow = Object.freeze({
  key: SCHEDULE_TEMPLATE,
  version: 1,
  effect: 'COMMIT',
  kinds: ['SETTINGS_DRAFT'],
  roles: ['primary'],
  subject: { space: 'AE', key: SCHEDULE_AE },
  target: null,
  inputSchema: null,
  selectionDomain: {},
  selectionDomainLabels: {},
  priority: 1,
  singleUse: true,
  ttlSeconds: 600,
  label: 'Подтвердить изменение графика',
  utteranceTemplate: 'Подтвердить изменение графика',
  speechAliases: ['подтверждаю изменение графика'],
  allowedArgumentHandles: ['approval', 'payload'],
  sourceSubject: false,
} as IntentTemplateRow);

export function scheduleTemplate(
  proposal: IntentProposal,
  kind: string,
  channel: string,
): IntentTemplateRow {
  if (
    proposal.intent_template_key !== SCHEDULE_TEMPLATE ||
    kind !== 'SETTINGS_DRAFT' ||
    proposal.role !== 'primary' ||
    proposal.capability?.space !== 'AE' ||
    proposal.capability.key !== SCHEDULE_AE ||
    proposal.handoff_capability_ref != null ||
    Object.keys(proposal.argument_handles ?? {})
      .sort()
      .join(',') !== 'approval,payload' ||
    !carrierAdmits(channel, 'COMMIT', SCHEDULE_INTENT_TEMPLATE.subject, 1)
  )
    throw new IntentTemplateRefusal('schedule_template_mismatch');
  return SCHEDULE_INTENT_TEMPLATE;
}
