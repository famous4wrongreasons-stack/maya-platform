import { decodeSelectionDomain } from '../input-schema/codec';
import { openWidgetNounHandle } from '../emission/seal.service';
import {
  decodeBookingCatalogOwnerRef,
  isBookingNounIdentity,
  sameBookingScope,
} from './booking-noun-identity';

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** A single already-closed selection. No label, free text, client timestamp or profile participates. */
export function bookingClosedSelection(
  value: unknown,
  key: string,
  domain: string,
): string | null {
  const input = object(value);
  if (!input || Object.keys(input).length !== 1) return null;
  const values = input[key];
  if (
    !Array.isArray(values) ||
    values.length !== 1 ||
    typeof values[0] !== 'string'
  )
    return null;
  const decoded = decodeSelectionDomain(domain);
  return decoded.ok &&
    decoded.value.size === 1 &&
    decoded.value.get(key)?.has(values[0])
    ? values[0]
    : null;
}

export interface BookingPreferenceRecord {
  widgetKind: string;
  effect: string;
  capabilitySpace: string | null;
  capabilityKey: string | null;
  inputSchemaHash: string | null;
  singleUse: boolean;
  consumedAt: Date | null;
  frozenNounsJson: unknown;
  selectionDomain: string;
  receipts: {
    outcome: string;
    actionReceiptRef: string | null;
    submittedAt: Date;
    erasedAt: Date | null;
  }[];
  submissionAudits: { inputsClosedJson: unknown; erasedAt: Date | null }[];
}

/** NEW explicit chat preference recovery only. Caller owns current principal/conversation/TTL
 * filtering. Any uncertain adjudication, different retry input, erasure or overflow refuses. */
export function bookingSelectionPreferences(
  records: readonly BookingPreferenceRecord[],
  tenantId: string,
): {
  selectedAt: string;
  services: string[];
  employee?: string;
  branch?: string;
  sourceRevision?: string;
} | null {
  if (!records.length || records.length > 32) return null;
  const open = (handle: string, noun: 'service' | 'staff') => {
    const identity = openWidgetNounHandle(handle as never);
    return identity?.tenantId === tenantId &&
      isBookingNounIdentity(identity, noun)
      ? decodeBookingCatalogOwnerRef(identity.ownerRef)
      : null;
  };
  const accepted = (
    record: BookingPreferenceRecord,
    noun: 'service' | 'staff',
  ) => {
    if (
      record.widgetKind !==
        (noun === 'service' ? 'SERVICE_SELECTOR' : 'STAFF_SELECTOR') ||
      record.effect !== 'REFINE' ||
      record.capabilitySpace !== 'C9' ||
      record.capabilityKey !==
        (noun === 'service' ? 'catalog.services.read' : 'catalog.staff.read') ||
      !record.inputSchemaHash ||
      !record.singleUse ||
      !record.consumedAt ||
      record.receipts.length !== 1
    )
      return null;
    const receipt = record.receipts[0];
    if (
      receipt.outcome !== 'ACCEPTED' ||
      receipt.actionReceiptRef ||
      receipt.erasedAt ||
      !record.submissionAudits.length ||
      record.submissionAudits.length > 16
    )
      return null;
    const candidates = record.submissionAudits.map((a) =>
      a.erasedAt
        ? null
        : bookingClosedSelection(
            a.inputsClosedJson,
            `${noun}_ref`,
            record.selectionDomain,
          ),
    );
    if (candidates.some((c) => !c) || new Set(candidates).size !== 1)
      return null;
    const handle = candidates[0]!;
    const choice = open(handle, noun);
    return choice
      ? { handle, choice, selectedAt: receipt.submittedAt.toISOString() }
      : null;
  };
  const latest = records[0];
  if (latest.widgetKind === 'SERVICE_SELECTOR') {
    const selected = accepted(latest, 'service');
    return selected
      ? {
          selectedAt: selected.selectedAt,
          services: [selected.choice.id],
          ...(selected.choice.scope
            ? {
                branch: selected.choice.scope.branchId,
                sourceRevision: selected.choice.scope.sourceRevision,
              }
            : {}),
        }
      : null;
  }
  if (
    latest.widgetKind !== 'STAFF_SELECTOR' ||
    latest.effect !== 'REFINE' ||
    latest.capabilitySpace !== 'C9' ||
    latest.capabilityKey !== 'catalog.staff.read'
  )
    return null;
  const frozen = object(latest.frozenNounsJson);
  if (
    !frozen ||
    Object.keys(frozen).length !== 1 ||
    typeof frozen.service !== 'string'
  )
    return null;
  const service = open(frozen.service, 'service');
  if (!service) return null;
  const staff = accepted(latest, 'staff');
  if (latest.consumedAt && !staff) return null;
  if (staff && !sameBookingScope(service.scope, staff.choice.scope))
    return null;
  // An unconsumed successor only supplies service preference when a retained accepted
  // predecessor selected the exact same opaque noun. Never infer selection from a catalog row.
  let prior: ReturnType<typeof accepted> = null;
  if (!staff)
    for (const record of records.slice(1)) {
      if (
        record.widgetKind !== 'STAFF_SELECTOR' &&
        record.widgetKind !== 'SERVICE_SELECTOR'
      )
        return null;
      if (record.widgetKind === 'SERVICE_SELECTOR') {
        const selected = accepted(record, 'service');
        if (!selected || selected.handle !== frozen.service) return null;
        prior = selected;
        break;
      }
    }
  const selectedAt = staff?.selectedAt ?? prior?.selectedAt;
  if (!selectedAt) return null;
  return {
    selectedAt,
    services: [service.id],
    ...(staff ? { employee: staff.choice.id } : {}),
    ...(service.scope
      ? {
          branch: service.scope.branchId,
          sourceRevision: service.scope.sourceRevision,
        }
      : {}),
  };
}
