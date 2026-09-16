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
    for (const p of template.required_cells)
      if (!p.startsWith('/'))
        throw new RegistryLoadFailure(
          `${composed}: required_cells entry '${p}' is not a JSON Pointer`,
        );
  }

  for (const pref of Object.values(prefs))
    if (pref.consent_class !== 'communication')
      throw new RegistryLoadFailure(
        `${pref.notify_pref_key}: a delivery permission is always a communication consent`,
      );
};

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
