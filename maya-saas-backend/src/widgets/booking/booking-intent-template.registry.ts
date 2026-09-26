import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { IntentProposal } from '../../widget-contract/derived-shapes';
import type { EffectClass, WidgetIntent } from '../../widget-contract/intent';
import type { WidgetKind } from '../../widget-contract/kinds';
import { carrierAdmits } from '../carriers/channel-profile';
import {
  IntentTemplateRefusal,
  type IntentTemplateRow,
} from '../emission/intent-template.registry';

export const BOOKING_TEMPLATE_REGISTRY_VERSION = 1 as const;

export type BookingIntentTemplateKey =
  | 'refine.booking.service@1'
  | 'refine.booking.staff@1'
  | 'draft.booking.selection@1'
  | 'draft.booking.create@1'
  | 'refine.booking.reschedule@1'
  | 'refine.booking.cancel@1'
  | 'commit.booking.create@1'
  | 'commit.booking.reschedule@1'
  | 'commit.booking.cancel@1';

export interface BookingIntentTemplateRow {
  readonly key: BookingIntentTemplateKey;
  readonly version: typeof BOOKING_TEMPLATE_REGISTRY_VERSION;
  readonly effect: Extract<EffectClass, 'DRAFT' | 'REFINE' | 'COMMIT'>;
  readonly kind: Extract<
    WidgetKind,
    | 'SERVICE_SELECTOR'
    | 'STAFF_SELECTOR'
    | 'TIME_SLOT_SELECTOR'
    | 'SCHEDULE'
    | 'BOOKING_CONFIRMATION'
  >;
  readonly subject: CapabilityRef;
  readonly role: WidgetIntent['role'];
  readonly allowedArgumentHandles: readonly string[];
  readonly label: string;
  readonly utteranceTemplate: string;
  readonly speechAliases: readonly string[];
  readonly ttlSeconds: number;
  readonly selectionField: 'service_ref' | 'staff_ref' | 'slot_ref' | null;
}

const row = (value: BookingIntentTemplateRow): BookingIntentTemplateRow =>
  Object.freeze({
    ...value,
    subject: Object.freeze({ ...value.subject }),
    allowedArgumentHandles: Object.freeze([...value.allowedArgumentHandles]),
    speechAliases: Object.freeze([...value.speechAliases]),
  });

export const BOOKING_INTENT_TEMPLATE_REGISTRY: Readonly<
  Record<BookingIntentTemplateKey, BookingIntentTemplateRow>
> = Object.freeze({
  'refine.booking.service@1': row({
    key: 'refine.booking.service@1',
    version: 1,
    effect: 'REFINE',
    kind: 'SERVICE_SELECTOR',
    subject: { space: 'C9', key: 'catalog.services.read' },
    role: 'primary',
    allowedArgumentHandles: [],
    label: 'Choose service',
    utteranceTemplate: 'Choose service',
    speechAliases: ['choose service'],
    ttlSeconds: 600,
    selectionField: 'service_ref',
  }),
  'refine.booking.staff@1': row({
    key: 'refine.booking.staff@1',
    version: 1,
    effect: 'REFINE',
    kind: 'STAFF_SELECTOR',
    subject: { space: 'C9', key: 'catalog.staff.read' },
    role: 'primary',
    allowedArgumentHandles: ['service'],
    label: 'Choose specialist',
    utteranceTemplate: 'Choose specialist',
    speechAliases: ['choose specialist'],
    ttlSeconds: 600,
    selectionField: 'staff_ref',
  }),
  'draft.booking.selection@1': row({
    key: 'draft.booking.selection@1',
    version: 1,
    effect: 'DRAFT',
    kind: 'TIME_SLOT_SELECTOR',
    subject: { space: 'C9', key: 'appointments.own.create' },
    role: 'primary',
    allowedArgumentHandles: ['service', 'staff'],
    label: 'Review booking',
    utteranceTemplate: 'Review booking',
    speechAliases: ['review booking'],
    ttlSeconds: 600,
    selectionField: 'slot_ref',
  }),
  'draft.booking.create@1': row({
    key: 'draft.booking.create@1',
    version: 1,
    effect: 'DRAFT',
    kind: 'SERVICE_SELECTOR',
    subject: { space: 'C9', key: 'appointments.own.create' },
    role: 'primary',
    allowedArgumentHandles: ['service', 'staff', 'slot'],
    label: 'Review booking',
    utteranceTemplate: 'Review booking',
    speechAliases: ['review booking'],
    ttlSeconds: 600,
    selectionField: null,
  }),
  'refine.booking.reschedule@1': row({
    key: 'refine.booking.reschedule@1',
    version: 1,
    effect: 'REFINE',
    kind: 'SCHEDULE',
    subject: { space: 'C9', key: 'appointments.own.reschedule' },
    role: 'primary',
    allowedArgumentHandles: ['appointment', 'service', 'staff', 'slot'],
    label: 'Review reschedule',
    utteranceTemplate: 'Review reschedule',
    speechAliases: ['review reschedule'],
    ttlSeconds: 600,
    selectionField: null,
  }),
  'refine.booking.cancel@1': row({
    key: 'refine.booking.cancel@1',
    version: 1,
    effect: 'REFINE',
    kind: 'SCHEDULE',
    subject: { space: 'C9', key: 'appointments.own.cancel' },
    role: 'primary',
    allowedArgumentHandles: ['appointment'],
    label: 'Review cancellation',
    utteranceTemplate: 'Review cancellation',
    speechAliases: ['review cancellation'],
    ttlSeconds: 600,
    selectionField: null,
  }),
  'commit.booking.create@1': row({
    key: 'commit.booking.create@1',
    version: 1,
    effect: 'COMMIT',
    kind: 'BOOKING_CONFIRMATION',
    subject: { space: 'AE', key: 'crm.appointment.create.v1' },
    role: 'primary',
    allowedArgumentHandles: ['service', 'staff', 'slot'],
    label: 'Confirm booking',
    utteranceTemplate: 'Confirm booking',
    speechAliases: ['confirm booking'],
    ttlSeconds: 600,
    selectionField: null,
  }),
  'commit.booking.reschedule@1': row({
    key: 'commit.booking.reschedule@1',
    version: 1,
    effect: 'COMMIT',
    kind: 'BOOKING_CONFIRMATION',
    subject: { space: 'AE', key: 'crm.appointment.reschedule.v1' },
    role: 'primary',
    allowedArgumentHandles: ['appointment', 'service', 'staff', 'slot'],
    label: 'Confirm reschedule',
    utteranceTemplate: 'Confirm reschedule',
    speechAliases: ['confirm reschedule'],
    ttlSeconds: 600,
    selectionField: null,
  }),
  'commit.booking.cancel@1': row({
    key: 'commit.booking.cancel@1',
    version: 1,
    effect: 'COMMIT',
    kind: 'BOOKING_CONFIRMATION',
    subject: { space: 'AE', key: 'crm.appointment.cancel.v1' },
    role: 'primary',
    allowedArgumentHandles: ['appointment'],
    label: 'Confirm cancellation',
    utteranceTemplate: 'Confirm cancellation',
    speechAliases: ['confirm cancellation'],
    ttlSeconds: 600,
    selectionField: null,
  }),
});

const exactKeys = (value: object, allowed: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, i) => key === expected[i])
  );
};

/** G-SYNTH: closed server registry resolution. Runtime activation is owned by P-DISCHARGE. */
export const resolveBookingTemplateForSynthesis = (args: {
  readonly proposal: IntentProposal;
  readonly widgetKind: WidgetKind;
  readonly deliveryChannel: string;
}): BookingIntentTemplateRow => {
  const candidate = (
    BOOKING_INTENT_TEMPLATE_REGISTRY as Readonly<
      Record<string, BookingIntentTemplateRow | undefined>
    >
  )[args.proposal.intent_template_key];
  if (!candidate || candidate.version !== BOOKING_TEMPLATE_REGISTRY_VERSION)
    throw new IntentTemplateRefusal('unknown_or_version_incompatible');
  if (candidate.kind !== args.widgetKind)
    throw new IntentTemplateRefusal('kind_mismatch');
  if (candidate.role !== args.proposal.role)
    throw new IntentTemplateRefusal('role_mismatch');
  if (
    args.proposal.capability?.space !== candidate.subject.space ||
    args.proposal.capability.key !== candidate.subject.key ||
    args.proposal.handoff_capability_ref !== undefined
  )
    throw new IntentTemplateRefusal('capability_mismatch');
  if (
    !exactKeys(
      args.proposal.argument_handles ?? {},
      candidate.allowedArgumentHandles,
    )
  )
    throw new IntentTemplateRefusal('undeclared_argument_handle');
  if (
    !carrierAdmits(args.deliveryChannel, candidate.effect, candidate.subject, 1)
  )
    throw new IntentTemplateRefusal('carrier_inadmissible');
  return candidate;
};

/** Adapt a closed booking row to the common mint material without adding another minter. */
export const bookingTemplateAsIntentRow = (
  value: BookingIntentTemplateRow,
  selection?: Readonly<{
    ids: readonly string[];
    labels: Readonly<Record<string, string>>;
  }>,
): IntentTemplateRow =>
  Object.freeze({
    key: value.key as never,
    version: 1,
    effect: value.effect,
    kinds: Object.freeze([value.kind]),
    roles: Object.freeze([value.role]),
    subject: value.subject,
    target: null,
    inputSchema:
      value.selectionField === null
        ? null
        : Object.freeze({
            fields: [
              {
                name: value.selectionField,
                required: true,
                kind: 'ref' as const,
                domain_ref: value.selectionField,
                selection_min: 1,
                selection_max: 1,
              },
            ],
            max_total_bytes: 2048,
            free_input_justification: null,
          }),
    selectionDomain: Object.freeze(
      value.selectionField === null
        ? {}
        : {
            [value.selectionField]: Object.freeze([...(selection?.ids ?? [])]),
          },
    ),
    selectionDomainLabels: Object.freeze(
      value.selectionField === null
        ? {}
        : {
            [value.selectionField]: Object.freeze({
              ...(selection?.labels ?? {}),
            }),
          },
    ),
    priority: 1,
    singleUse: true,
    ttlSeconds: value.ttlSeconds,
    label: value.label,
    utteranceTemplate: value.utteranceTemplate,
    speechAliases: value.speechAliases,
    allowedArgumentHandles: value.allowedArgumentHandles,
    sourceSubject: false,
  });

export const assertBookingTemplateRegistry = (): void => {
  const rows = Object.values(BOOKING_INTENT_TEMPLATE_REGISTRY);
  if (
    rows.length !== 9 ||
    new Set(rows.map((entry) => entry.key)).size !== rows.length
  )
    throw new Error('booking intent registry is not closed');
  for (const entry of rows) {
    if (!entry.key.endsWith(`@${entry.version}`))
      throw new Error(`${entry.key}: version mismatch`);
    if (!['DRAFT', 'REFINE', 'COMMIT'].includes(entry.effect))
      throw new Error(`${entry.key}: effect mismatch`);
  }
};

assertBookingTemplateRegistry();
