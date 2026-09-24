/**
 * Owner-approved retained query scalar for `operations.journal.read` only.
 *
 * This is deliberately not a generic scalar codec.  A local business date is
 * parsed and round-tripped on the server before it can be retained.  Timezone
 * interpretation remains with the journal owner when the read is executed.
 */
export const LOCAL_BUSINESS_DATE_TYPE = 'local_business_date' as const;
export const LOCAL_BUSINESS_DATE_PROVENANCE = 'server_validated' as const;

export interface RetainedLocalBusinessDate {
  readonly type: typeof LOCAL_BUSINESS_DATE_TYPE;
  readonly value: string;
  readonly provenance: typeof LOCAL_BUSINESS_DATE_PROVENANCE;
}

const CANONICAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class LocalBusinessDateRefusal extends Error {
  constructor(readonly code: 'local_business_date_invalid') {
    super(code);
    this.name = 'LocalBusinessDateRefusal';
  }
}

/** Strict canonical validation: no locale parsing and no silent rollover. */
export const validateLocalBusinessDate = (value: unknown): string => {
  if (typeof value !== 'string')
    throw new LocalBusinessDateRefusal('local_business_date_invalid');
  const match = CANONICAL_DATE.exec(value);
  if (match === null)
    throw new LocalBusinessDateRefusal('local_business_date_invalid');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new LocalBusinessDateRefusal('local_business_date_invalid');
  return value;
};

export const validateRetainedLocalBusinessDate = (
  value: RetainedLocalBusinessDate,
): string => {
  if (
    value.type !== LOCAL_BUSINESS_DATE_TYPE ||
    value.provenance !== LOCAL_BUSINESS_DATE_PROVENANCE
  )
    throw new LocalBusinessDateRefusal('local_business_date_invalid');
  return validateLocalBusinessDate(value.value);
};
