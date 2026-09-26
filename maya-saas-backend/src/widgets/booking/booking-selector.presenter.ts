import type { Cell, Measure, Phrase } from '../../widget-contract/envelope';
import type {
  ServiceSelectorBody,
  StaffSelectorBody,
  TimeSlotSelectorBody,
  WidgetKind,
} from '../../widget-contract/kinds';
import type { OwnerNounIdentity } from '../noun-resolution/noun-handle.codec';
import {
  BOOKING_NOUN_OWNERS,
  encodeBookingSlotOwnerRef,
} from './booking-noun-identity';

type SelectorKind = Extract<
  WidgetKind,
  'SERVICE_SELECTOR' | 'STAFF_SELECTOR' | 'TIME_SLOT_SELECTOR'
>;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.map(record).filter((v): v is Record<string, unknown> => v !== null)
    : [];
const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const phrase = (value: string): Phrase => ({
  phrase_key: 'booking.selector',
  rendered: value,
});
const known = <T>(value: T, label = String(value)): Cell<T> => ({
  state: 'KNOWN',
  value,
  label,
  reason_code: null,
  fact_ref: 0,
  as_of: null,
  evidence_refs: [],
  next_intent_ref: null,
});
const unknownMeasure = (key: string, unit: Measure['unit']): Measure => ({
  ...known<null>(null, 'Not measured'),
  state: 'NOT_MEASURED',
  reason_code: 'NOT_COLLECTED',
  fact_ref: null,
  key,
  unit,
  basis_key: null,
  basis: 'Canonical booking owner',
  currency: null,
  formatted: 'Not measured',
  comparison: null,
});
const measure = (
  key: string,
  value: string | number,
  unit: Measure['unit'],
  formatted: string,
  currency: string | null = null,
): Measure => ({
  ...known(value, formatted),
  key,
  unit,
  basis_key: null,
  basis: 'Canonical booking owner',
  currency,
  formatted,
  comparison: null,
});

export type MintSelectorHandle = (identity: OwnerNounIdentity) => string;

export interface PresentedSelector {
  readonly kind: SelectorKind;
  readonly body: ServiceSelectorBody | StaffSelectorBody | TimeSlotSelectorBody;
}

export const presentBookingSelector = (input: {
  tenantId: string;
  kind: SelectorKind;
  source: unknown;
  mint: MintSelectorHandle;
  inherited?: Readonly<Record<string, string>>;
}): PresentedSelector | null => {
  if (input.kind === 'SERVICE_SELECTOR') return presentServices(input);
  if (input.kind === 'STAFF_SELECTOR') return presentStaff(input);
  return presentSlots(input);
};

const presentServices = (
  input: Parameters<typeof presentBookingSelector>[0],
): PresentedSelector | null => {
  const services = list(record(input.source)?.services);
  if (services.length === 0) return null;
  const options: ServiceSelectorBody['options'] = [];
  for (const service of services) {
    const id = str(service.id);
    const name = str(service.name);
    const duration = num(service.duration_minutes);
    const price = num(service.price);
    const currency = str(service.currency) ?? 'RUB';
    const category = str(service.category);
    if (!id || !name || duration === null || price === null) continue;
    const handle = input.mint({
      tenantId: input.tenantId,
      noun: 'service',
      ownerKind: BOOKING_NOUN_OWNERS.service,
      ownerRef: id,
    });
    options.push({
      option_id: handle,
      service_ref: handle,
      label: known(name),
      sublabel: category === null ? null : known(category),
      badges: [],
      measures: [],
      media: null,
      intent_ref: 'i1',
      enabled: known(true, name),
      duration: measure(
        'booking.duration',
        duration,
        'minutes',
        `${duration} min`,
      ),
      price: measure(
        'booking.price',
        price,
        'RUB',
        `${price} ${currency}`,
        currency,
      ),
      requires_consultation: known(false, 'No consultation required'),
      combinable_with: [],
    });
  }
  if (options.length === 0) return null;
  return {
    kind: 'SERVICE_SELECTOR',
    body: {
      prompt: phrase('Choose a service'),
      category_path: [],
      select: 'single',
      options,
      total_preview: null,
      shown_count: options.length,
      total_count: options.length,
      more_intent: null,
    },
  };
};

const presentStaff = (
  input: Parameters<typeof presentBookingSelector>[0],
): PresentedSelector | null => {
  const service = input.inherited?.service;
  if (!service) return null;
  const staff = list(record(input.source)?.staff);
  const options: StaffSelectorBody['options'] = [];
  for (const member of staff) {
    const id = str(member.id);
    const name = str(member.name);
    if (!id || !name) continue;
    const handle = input.mint({
      tenantId: input.tenantId,
      noun: 'staff',
      ownerKind: BOOKING_NOUN_OWNERS.staff,
      ownerRef: id,
    });
    const role =
      str(member.title) ?? str(member.specialization) ?? 'Specialist';
    options.push({
      option_id: handle,
      staff_ref: handle,
      label: known(name),
      sublabel: known(role),
      badges: [],
      measures: [],
      media: null,
      intent_ref: 'i1',
      enabled: known(true, name),
      role_label: known(role),
      nearest_availability: unknownMeasure(
        'booking.nearest_availability',
        'datetime',
      ),
      rating: null,
    });
  }
  if (options.length === 0) return null;
  return {
    kind: 'STAFF_SELECTOR',
    body: {
      prompt: phrase('Choose a specialist'),
      for_service_refs: [service],
      options,
      any_staff_option: null,
      shown_count: options.length,
      total_count: options.length,
      more_intent: null,
    },
  };
};

const presentSlots = (
  input: Parameters<typeof presentBookingSelector>[0],
): PresentedSelector | null => {
  const staff = input.inherited?.staff;
  if (!staff) return null;
  const slots = list(record(input.source)?.slots);
  const rendered: TimeSlotSelectorBody['groups'][number]['slots'] = [];
  for (const slot of slots) {
    const start = str(slot.start);
    const end = str(slot.end);
    if (
      !start ||
      !end ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end))
    )
      continue;
    const minutes = Math.max(
      1,
      Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
    );
    const slotOwnerRef = encodeBookingSlotOwnerRef(start);
    if (slotOwnerRef === null) continue;
    const handle = input.mint({
      tenantId: input.tenantId,
      noun: 'slot',
      ownerKind: BOOKING_NOUN_OWNERS.slot,
      ownerRef: slotOwnerRef,
    });
    rendered.push({
      slot_ref: handle,
      start: measure('booking.slot.start', start, 'datetime', start),
      duration: measure(
        'booking.slot.duration',
        minutes,
        'minutes',
        `${minutes} min`,
      ),
      staff_ref: staff,
      price: null,
      availability: known('FREE', 'Available'),
      intent_ref: 'i1',
    });
  }
  if (rendered.length === 0) return null;
  const starts = rendered.map((slot) => String(slot.start.value));
  return {
    kind: 'TIME_SLOT_SELECTOR',
    body: {
      prompt: phrase('Choose a time'),
      timezone: 'UTC',
      window: { from: starts[0], to: starts[starts.length - 1] },
      grouping: 'flat',
      groups: [
        {
          group_id: 'available',
          label: phrase('Available times'),
          slots: rendered,
        },
      ],
      shown_count: rendered.length,
      total_count: rendered.length,
      more_intent: null,
      widen_window_intent: null,
      none_fit_intent: 'i1',
    },
  };
};
