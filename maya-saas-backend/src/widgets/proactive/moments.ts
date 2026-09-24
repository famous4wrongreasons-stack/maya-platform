// K13 — the twelve canonical moments, and the three catalogues that make one emittable.
//
// The contract asserts a CARDINALITY and never enumerates the set: "MOMENT_REGISTRY carries exactly
// twelve rows". Twelve plausible names typed into this file would have looked identical to twelve
// derived ones and would have been worth nothing — the wave-2 enum ruling is explicit that members
// are not invented to fit a count. So the twelve keys below are DERIVED, by
// `docs/rebuild/evidence/maya-chat-first-ux/derive-canonical-moments.mjs`, from three sources:
//
//   1. `Package2InboxType` — a normative union whose exact domain is fixed by the total
//      `Record<Package2InboxType, string>` that keys PACKAGE2_CAPABILITY_BY_TYPE (21 members)
//   2. the certified surface inventory's 52 notification surfaces — a moment is something a
//      scheduler emits
//   3. `ProactiveProvenance.artefact_kind` — the six-member closed union. A type with no canonical
//      artefact row cannot carry a provenance and is therefore not a moment, whatever it is called
//
// The derivation yields twelve, and the cardinality was checked AFTERWARDS rather than aimed at.
// It also independently reproduces the three moments §triage-135 names by hand. The spec re-runs
// the derivation and compares it to this file, so the two cannot drift.

import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import type { Cell, Measure } from '../../widget-contract/envelope';
import type { WidgetKind } from '../../widget-contract/kinds';
import type {
  Moment,
  MomentTemplate,
  NotifyPref,
} from '../../widget-contract/lifecycle';

export class RegistryLoadFailure extends Error {}

/** The derived twelve, in the derivation's own order (sorted), so the file is diffable. */
export const CANONICAL_MOMENT_KEYS = [
  'appointment_reminder',
  'birthday_alert',
  'daily_report',
  'growth_plan',
  'hanging_lead',
  'morning_brief',
  'native_feedback_invitation',
  'owner_alert',
  'review_alert',
  'shift_reminder',
  'wanted_slot_available',
  'weekly_expense_reminder',
] as const;

export type MomentKey = (typeof CANONICAL_MOMENT_KEYS)[number];

export type MomentCompositionLeafType = 'Cell' | 'Measure';

export interface MomentCompositionInputSchema {
  readonly moment_template_key: `${string}@${number}`;
  readonly source_owner: Readonly<{ space: 'C9'; key: string }>;
  readonly fields: Readonly<Record<`/${string}`, MomentCompositionLeafType>>;
}

export interface MomentCompositionInput {
  readonly contract: 'maya.moment-composition-input/1';
  readonly moment_key: MomentKey;
  readonly moment_template_key: `${string}@${number}`;
  readonly producer: 'canonical_owner';
  readonly source_owner: Readonly<{ space: 'C9'; key: string }>;
  readonly artefact_ref: string;
  readonly artefact_kind:
    | 'opportunity'
    | 'approval'
    | 'closed_report'
    | 'appointment'
    | 'shift'
    | 'consent_record';
  readonly artefact_created_at: string;
  readonly facts: Readonly<Record<string, Cell<unknown> | Measure>>;
}

/**
 * The notification-consent keys.
 *
 * `consent_class` is `'communication'` on every row and the type admits no other value — "a
 * delivery permission is always a communication consent, never another class". The rows are split
 * by who is being spoken to, because a client's reminder consent and an owner's briefing consent
 * are different permissions that a single key would silently merge.
 */
export const NOTIFICATION_CONSENT_REGISTRY: Readonly<
  Record<string, NotifyPref>
> = Object.freeze({
  'notify.client.appointments': {
    notify_pref_key: 'notify.client.appointments',
    consent_class: 'communication',
    owner: {
      space: 'AE',
      key: 'communication.appointment-reminders.execute.v1',
    } as never,
    quiet_hours_window: 'Europe/Moscow 22:00-09:00',
  },
  'notify.client.offers': {
    notify_pref_key: 'notify.client.offers',
    consent_class: 'communication',
    owner: {
      space: 'AE',
      key: 'communication.business-alerts.execute.v1',
    } as never,
    quiet_hours_window: 'Europe/Moscow 21:00-10:00',
  },
  'notify.client.feedback': {
    notify_pref_key: 'notify.client.feedback',
    consent_class: 'communication',
    owner: {
      space: 'AE',
      key: 'communication.native-feedback.invitation.execute.v1',
    } as never,
    quiet_hours_window: 'Europe/Moscow 22:00-09:00',
  },
  'notify.staff.shifts': {
    notify_pref_key: 'notify.staff.shifts',
    consent_class: 'communication',
    owner: {
      space: 'AE',
      key: 'communication.appointment-reminders.execute.v1',
    } as never,
    quiet_hours_window: 'Europe/Moscow 23:00-06:00',
  },
  'notify.owner.briefings': {
    notify_pref_key: 'notify.owner.briefings',
    consent_class: 'communication',
    owner: {
      space: 'AE',
      key: 'communication.reports-briefings.execute.v1',
    } as never,
    quiet_hours_window: 'Europe/Moscow 23:00-06:00',
  },
  'notify.owner.alerts': {
    notify_pref_key: 'notify.owner.alerts',
    consent_class: 'communication',
    owner: {
      space: 'AE',
      key: 'communication.business-alerts.execute.v1',
    } as never,
    quiet_hours_window: 'Europe/Moscow 23:00-06:00',
  },
});

const t = (
  moment_template_id: string,
  narrative_template_id: string,
  required_cells: string[],
): MomentTemplate => ({
  moment_template_id,
  version: 1,
  narrative_template_id,
  narrative_template_version: 1,
  required_cells,
});

/**
 * `MOMENT_TEMPLATES`, keyed `` `${id}@${version}` ``.
 *
 * The version is part of the key rather than decoration: §4.2 replays frozen receipts whose
 * template version may be older than the current one, and an id alone cannot resolve a catalogue
 * that has moved on. FR8 makes a replay resolve the version the receipt carries.
 */
export const MOMENT_TEMPLATES: Readonly<
  Record<`${string}@${number}`, MomentTemplate>
> = Object.freeze({
  'mt.appointment_reminder@1': t(
    'mt.appointment_reminder',
    'nt.appointment_reminder',
    ['/when', '/service'],
  ),
  'mt.birthday_alert@1': t('mt.birthday_alert', 'nt.birthday_alert', [
    '/client_label',
  ]),
  'mt.daily_report@1': t('mt.daily_report', 'nt.daily_report', [
    '/period',
    '/revenue',
  ]),
  'mt.growth_plan@1': t('mt.growth_plan', 'nt.growth_plan', [
    '/period',
    '/headline',
  ]),
  'mt.hanging_lead@1': t('mt.hanging_lead', 'nt.hanging_lead', [
    '/client_label',
    '/waiting_since',
  ]),
  'mt.morning_brief@1': t('mt.morning_brief', 'nt.morning_brief', [
    '/period',
    '/appointments',
  ]),
  'mt.native_feedback_invitation@1': t(
    'mt.native_feedback_invitation',
    'nt.feedback_invite',
    ['/visit_at'],
  ),
  'mt.owner_alert@1': t('mt.owner_alert', 'nt.owner_alert', ['/headline']),
  'mt.review_alert@1': t('mt.review_alert', 'nt.review_alert', ['/rating']),
  'mt.shift_reminder@1': t('mt.shift_reminder', 'nt.shift_reminder', [
    '/starts_at',
  ]),
  'mt.wanted_slot_available@1': t(
    'mt.wanted_slot_available',
    'nt.wanted_slot',
    ['/when', '/service'],
  ),
  'mt.weekly_expense_reminder@1': t(
    'mt.weekly_expense_reminder',
    'nt.expense_reminder',
    ['/period'],
  ),
});

const compositionSchema = (
  momentTemplateKey: `${string}@${number}`,
  sourceOwnerKey: string,
  fields: Readonly<Record<`/${string}`, MomentCompositionLeafType>>,
): MomentCompositionInputSchema =>
  Object.freeze({
    moment_template_key: momentTemplateKey,
    source_owner: Object.freeze({ space: 'C9' as const, key: sourceOwnerKey }),
    fields: Object.freeze({ ...fields }),
  });

/**
 * Decision Sheet 09 Option A — closed server-owned inputs used before body projection.
 *
 * These are source facts, not hidden widget-body members. The client, an LLM and the renderer never
 * author this object; the named canonical READ/owner does. The final body remains governed by its
 * existing strict WidgetKind schema.
 */
export const MOMENT_COMPOSITION_INPUT_REGISTRY: Readonly<
  Record<`${string}@${number}`, MomentCompositionInputSchema>
> = Object.freeze({
  'mt.appointment_reminder@1': compositionSchema(
    'mt.appointment_reminder@1',
    'operations.journal.read',
    { '/when': 'Measure', '/service': 'Cell' },
  ),
  'mt.birthday_alert@1': compositionSchema(
    'mt.birthday_alert@1',
    'clients.dossier.read',
    { '/client_label': 'Cell' },
  ),
  'mt.daily_report@1': compositionSchema(
    'mt.daily_report@1',
    'owner_report.status',
    { '/period': 'Cell', '/revenue': 'Measure' },
  ),
  'mt.growth_plan@1': compositionSchema('mt.growth_plan@1', 'c8.result.read', {
    '/period': 'Cell',
    '/headline': 'Cell',
  }),
  'mt.hanging_lead@1': compositionSchema(
    'mt.hanging_lead@1',
    'clients.retention.scan',
    { '/client_label': 'Cell', '/waiting_since': 'Measure' },
  ),
  'mt.morning_brief@1': compositionSchema(
    'mt.morning_brief@1',
    'owner_report.status',
    { '/period': 'Cell', '/appointments': 'Measure' },
  ),
  'mt.native_feedback_invitation@1': compositionSchema(
    'mt.native_feedback_invitation@1',
    'operations.journal.read',
    { '/visit_at': 'Measure' },
  ),
  'mt.owner_alert@1': compositionSchema(
    'mt.owner_alert@1',
    'analytics.business.query',
    { '/headline': 'Cell' },
  ),
  'mt.review_alert@1': compositionSchema(
    'mt.review_alert@1',
    'reviews.list.read',
    { '/rating': 'Measure' },
  ),
  'mt.shift_reminder@1': compositionSchema(
    'mt.shift_reminder@1',
    'staff.schedule.read',
    { '/starts_at': 'Measure' },
  ),
  'mt.wanted_slot_available@1': compositionSchema(
    'mt.wanted_slot_available@1',
    'booking.availability.read',
    { '/when': 'Measure', '/service': 'Cell' },
  ),
  'mt.weekly_expense_reminder@1': compositionSchema(
    'mt.weekly_expense_reminder@1',
    'expenses.read',
    { '/period': 'Cell' },
  ),
});

const m = (
  moment_key: MomentKey,
  kind: WidgetKind,
  notify_pref_key: string,
  once_per: string,
): Moment => ({
  moment_key,
  kind,
  moment_template_id: `mt.${moment_key}`,
  moment_template_version: 1,
  notify_pref_key,
  once_per,
  // One policy name, not a window: the window itself is read from the consent row AT DELIVERY,
  // per PR3c. A window frozen here would be a mint-time value, which is exactly what PR3c forbids.
  quiet_hours_policy: 'respect_notify_pref_window',
});

/** The closed catalogue. A moment absent from here cannot be emitted — that is the whole rule. */
export const MOMENT_REGISTRY: Readonly<Record<string, Moment>> = Object.freeze({
  appointment_reminder: m(
    'appointment_reminder',
    'LIMITATION',
    'notify.client.appointments',
    'appointment',
  ),
  wanted_slot_available: m(
    'wanted_slot_available',
    'TIME_SLOT_SELECTOR',
    'notify.client.offers',
    'slot',
  ),
  native_feedback_invitation: m(
    'native_feedback_invitation',
    'CHOICE',
    'notify.client.feedback',
    'visit',
  ),
  birthday_alert: m('birthday_alert', 'CHOICE', 'notify.client.offers', 'year'),
  shift_reminder: m(
    'shift_reminder',
    'SCHEDULE',
    'notify.staff.shifts',
    'shift',
  ),
  daily_report: m('daily_report', 'REPORT', 'notify.owner.briefings', 'day'),
  morning_brief: m('morning_brief', 'REPORT', 'notify.owner.briefings', 'day'),
  growth_plan: m('growth_plan', 'REPORT', 'notify.owner.briefings', 'week'),
  weekly_expense_reminder: m(
    'weekly_expense_reminder',
    'METRIC',
    'notify.owner.briefings',
    'week',
  ),
  hanging_lead: m('hanging_lead', 'CLIENT_LIST', 'notify.owner.alerts', 'lead'),
  owner_alert: m('owner_alert', 'METRIC', 'notify.owner.alerts', 'day'),
  review_alert: m('review_alert', 'METRIC', 'notify.owner.alerts', 'review'),
});

/**
 * `appointment_reminder` composes a `LIMITATION`, and that is not a placeholder.
 *
 * `GAP-ATTENDANCE-CONFIRM` is open: no canonical owner records that a client acknowledged an
 * upcoming appointment. Until one exists the reminder carries a Limitation naming the gap and
 * intents of effect NONE, NAVIGATE or HANDOFF only. A «Приду» control that writes nothing is not
 * emitted, and «клиент подтвердил» is not a claim any surface may make.
 */
export const GAP_BLOCKED_MOMENTS: Readonly<Record<string, string>> =
  Object.freeze({
    appointment_reminder: 'GAP-ATTENDANCE-CONFIRM',
  });

/** The composed catalogue key, spelled in one place so the two readers cannot disagree. */
const composedKey = (row: Moment): `${string}@${number}` =>
  `${row.moment_template_id}@${row.moment_template_version}`;

/**
 * `EP-REGISTRY-LOAD`, or the process does not start.
 *
 * Every clause the contract states, in its order, and each throwing separately so a failure says
 * which chain link broke rather than "registry invalid".
 *
 * The three catalogues are PARAMETERS with defaults, for the reason the mutation battery made
 * plain: run only against a valid registry, every clause can be deleted without a single test
 * turning red, because the thing they guard against is not present. Each clause is now fed a
 * catalogue that breaks exactly it.
 */
export const assertMomentRegistryLoads = (
  registry: Readonly<Record<string, Moment>> = MOMENT_REGISTRY,
  prefs: Readonly<Record<string, NotifyPref>> = NOTIFICATION_CONSENT_REGISTRY,
  templates: Readonly<
    Record<`${string}@${number}`, MomentTemplate>
  > = MOMENT_TEMPLATES,
  compositionInputs: Readonly<
    Record<`${string}@${number}`, MomentCompositionInputSchema>
  > = MOMENT_COMPOSITION_INPUT_REGISTRY,
): void => {
  const rows = Object.values(registry);

  if (rows.length !== 12)
    throw new RegistryLoadFailure(
      `MOMENT_REGISTRY carries ${rows.length} rows; the contract fixes it at exactly twelve`,
    );

  for (const [key, row] of Object.entries(registry))
    if (key !== row.moment_key)
      throw new RegistryLoadFailure(
        `MOMENT_REGISTRY key '${key}' does not match its row's moment_key '${row.moment_key}'`,
      );

  for (const row of rows) {
    if (!prefs[row.notify_pref_key])
      throw new RegistryLoadFailure(
        `${row.moment_key}: notify_pref_key '${row.notify_pref_key}' does not resolve`,
      );
    const composed = composedKey(row);
    const template: MomentTemplate | undefined = templates[composed];
    if (!template)
      throw new RegistryLoadFailure(
        `${row.moment_key}: '${composed}' does not resolve in MOMENT_TEMPLATES`,
      );
    if (!template.required_cells.length)
      throw new RegistryLoadFailure(
        `${composed}: required_cells is empty, so PR5b could never suppress and silence would never be chosen`,
      );
    const inputSchema = compositionInputs[composed];
    if (!inputSchema)
      throw new RegistryLoadFailure(
        `${composed}: server-owned composition input schema does not resolve`,
      );
    if (inputSchema.moment_template_key !== composed)
      throw new RegistryLoadFailure(
        `${composed}: composition input schema key does not match`,
      );
    const sourceOwner = C9_CAPABILITIES.find(
      (row) => row.capabilityKey === inputSchema.source_owner.key,
    );
    if (!sourceOwner || sourceOwner.mode !== 'READ')
      throw new RegistryLoadFailure(
        `${composed}: composition source owner is not a canonical READ`,
      );
    for (const p of template.required_cells) {
      if (!p.startsWith('/'))
        throw new RegistryLoadFailure(
          `${composed}: required_cells entry '${p}' is not a JSON Pointer`,
        );
      const leafType = inputSchema.fields[p as `/${string}`];
      if (leafType !== 'Cell' && leafType !== 'Measure')
        throw new RegistryLoadFailure(
          `${composed}: required composition input '${p}' has no declared Cell/Measure type`,
        );
    }
  }

  for (const pref of Object.values(prefs))
    if (pref.consent_class !== 'communication')
      throw new RegistryLoadFailure(
        `${pref.notify_pref_key}: a delivery permission is always a communication consent`,
      );
};

const CELL_KEYS = [
  'state',
  'value',
  'label',
  'reason_code',
  'fact_ref',
  'as_of',
  'evidence_refs',
  'next_intent_ref',
] as const;
const MEASURE_KEYS = [
  ...CELL_KEYS,
  'key',
  'unit',
  'basis_key',
  'basis',
  'currency',
  'formatted',
  'comparison',
] as const;
const CELL_STATES = new Set([
  'KNOWN',
  'PARTIAL',
  'NOT_MEASURED',
  'UNAVAILABLE',
  'PENDING',
]);
const MEASURE_UNITS = new Set([
  'RUB',
  'minutes',
  'count',
  'percent',
  'ratio',
  'datetime',
  'none',
]);
const ARTEFACT_KINDS = new Set([
  'opportunity',
  'approval',
  'closed_report',
  'appointment',
  'shift',
  'consent_record',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
) => Object.keys(value).sort().join('|') === [...keys].sort().join('|');

const isCell = (value: unknown): boolean => {
  if (!isRecord(value) || !hasExactKeys(value, CELL_KEYS)) return false;
  if (!CELL_STATES.has(String(value.state))) return false;
  if (
    typeof value.label !== 'string' ||
    (value.reason_code !== null && typeof value.reason_code !== 'string') ||
    (value.fact_ref !== null && !Number.isInteger(value.fact_ref)) ||
    (value.as_of !== null && typeof value.as_of !== 'string') ||
    !Array.isArray(value.evidence_refs) ||
    value.evidence_refs.some((ref) => typeof ref !== 'string') ||
    (value.next_intent_ref !== null &&
      typeof value.next_intent_ref !== 'string')
  )
    return false;
  return value.state === 'KNOWN' ? value.value !== null : value.value === null;
};

const isMeasure = (value: unknown): boolean => {
  if (!isRecord(value) || !hasExactKeys(value, MEASURE_KEYS)) return false;
  const cellPart = Object.fromEntries(
    CELL_KEYS.map((key) => [key, value[key]]),
  );
  return (
    isCell(cellPart) &&
    typeof value.key === 'string' &&
    MEASURE_UNITS.has(String(value.unit)) &&
    (value.basis_key === null || typeof value.basis_key === 'string') &&
    typeof value.basis === 'string' &&
    (value.currency === null || typeof value.currency === 'string') &&
    typeof value.formatted === 'string' &&
    value.comparison === null
  );
};

/** Runtime half of Option A: only a closed canonical-owner input can reach suppression/projector. */
export function assertMomentCompositionInput(
  value: unknown,
): asserts value is MomentCompositionInput {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'contract',
      'moment_key',
      'moment_template_key',
      'producer',
      'source_owner',
      'artefact_ref',
      'artefact_kind',
      'artefact_created_at',
      'facts',
    ]) ||
    value.contract !== 'maya.moment-composition-input/1' ||
    value.producer !== 'canonical_owner' ||
    !CANONICAL_MOMENT_KEYS.includes(value.moment_key as MomentKey) ||
    !isRecord(value.source_owner) ||
    !hasExactKeys(value.source_owner, ['space', 'key']) ||
    value.source_owner.space !== 'C9' ||
    typeof value.source_owner.key !== 'string' ||
    typeof value.artefact_ref !== 'string' ||
    !ARTEFACT_KINDS.has(String(value.artefact_kind)) ||
    typeof value.artefact_created_at !== 'string' ||
    !isRecord(value.facts)
  )
    throw new RegistryLoadFailure('moment composition input is not closed');
  const row = MOMENT_REGISTRY[value.moment_key as MomentKey];
  const key =
    `${row.moment_template_id}@${row.moment_template_version}` as const;
  const schema = MOMENT_COMPOSITION_INPUT_REGISTRY[key];
  if (
    value.moment_template_key !== key ||
    value.source_owner.key !== schema.source_owner.key
  )
    throw new RegistryLoadFailure('moment composition source is not canonical');
  const expectedFields = Object.keys(schema.fields).map((pointer) =>
    pointer.slice(1),
  );
  if (!hasExactKeys(value.facts, expectedFields))
    throw new RegistryLoadFailure(
      'moment composition facts do not match schema',
    );
  for (const [pointer, leafType] of Object.entries(schema.fields)) {
    const leaf = value.facts[pointer.slice(1)];
    if (leafType === 'Cell' ? !isCell(leaf) : !isMeasure(leaf))
      throw new RegistryLoadFailure(
        `moment composition input '${pointer}' has the wrong type`,
      );
  }
}

export const momentTemplateFor = (key: string): MomentTemplate => {
  const row = MOMENT_REGISTRY[key];
  if (!row)
    throw new RegistryLoadFailure(
      `'${key}' is not in MOMENT_REGISTRY and therefore cannot be emitted`,
    );
  const template: MomentTemplate | undefined =
    MOMENT_TEMPLATES[composedKey(row)];
  if (!template)
    throw new RegistryLoadFailure(
      `'${composedKey(row)}' does not resolve in MOMENT_TEMPLATES`,
    );
  return template;
};
