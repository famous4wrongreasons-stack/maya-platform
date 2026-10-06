import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { stableActionJson } from '../action-engine/action-engine.identity';

/** Handwritten contract from the official 2026-10-05 snapshot. Not a generic HTTP tool. */
export const SERVICE_PRICE_CAPABILITY = 'crm.service.fixed-price.update.v1';
export const SERVICE_PRICE_TOOL = 'catalog.service.price.update';
export const SERVICE_PRICE_REQUIRED_FIELDS = [
  'title',
  'category_id',
  'price_min',
  'price_max',
  'duration',
  'booking_title',
  'is_multi',
  'tax_variant',
  'vat_id',
  'is_need_limit_date',
  'seance_search_start',
  'seance_search_finish',
  'step',
  'seance_search_step',
] as const;
const numericFields = [
  'category_id',
  'duration',
  'tax_variant',
  'vat_id',
  'seance_search_start',
  'seance_search_finish',
  'step',
  'seance_search_step',
  'discount',
  'weight',
  'service_type',
  'api_service_id',
  'online_invoicing_status',
  'price_prepaid_percent',
  'price_prepaid_amount',
  'abonement_restriction_value',
  'is_abonement_autopayment_enabled',
  'autopayment_before_visit_time',
] as const;
const textFields = [
  'title',
  'booking_title',
  'comment',
  'date_from',
  'date_to',
] as const;

export class ServicePricePreDispatchError extends ConflictException {
  constructor(code: string) {
    super({
      message:
        'Изменение цены YCLIENTS недоступно: требуется точное исходное состояние и права CRM.',
      error: { code },
    });
  }
}
export function priceUnavailable(code: string): never {
  throw new ServicePricePreDispatchError(code);
}

export function ycObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    priceUnavailable('service_price_invalid_provider_data');
  return value as Record<string, unknown>;
}

export function ycId(value: unknown): string {
  const text = String(value);
  if (!/^[1-9]\d{0,14}$/.test(text))
    priceUnavailable('service_price_invalid_id');
  return text;
}

/** Exact hundredths only: never round a provider value or an owner's proposal. */
export function priceMinor(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string')
    priceUnavailable('service_price_invalid_amount');
  const text = String(value);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text))
    priceUnavailable('service_price_invalid_amount');
  const [whole, fraction = ''] = text.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > 100_000_000_000)
    priceUnavailable('service_price_invalid_amount');
  return amount;
}

function number(value: unknown): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^\d+(\.\d+)?$/.test(String(value)) ||
    !Number.isFinite(Number(value))
  )
    priceUnavailable('service_price_incomplete_snapshot');
  const result = Number(value);
  const exact = String(value)
    .replace(/^0+(?=\d)/, '')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  if (
    String(result) !== exact ||
    (Number.isInteger(result) && !Number.isSafeInteger(result))
  )
    priceUnavailable('service_price_inexact_provider_number');
  return result;
}
function boolean(value: unknown): boolean {
  if (value === true || value === 'true' || value === 1 || value === '1')
    return true;
  if (value === false || value === 'false' || value === 0 || value === '0')
    return false;
  return priceUnavailable('service_price_incomplete_snapshot');
}
export function servicePriceHash(value: unknown): string {
  return createHash('sha256').update(stableActionJson(value)).digest('hex');
}

export interface ServicePriceSnapshot {
  companyId: string;
  serviceId: string;
  name: string;
  currency: string;
  priceMinor: number;
  revision: string;
  nonPriceHash: string;
  /** Server-only source data, never accepted from chat and never sent to a model. */
  patchBody: Record<string, unknown>;
}

export function servicePriceSnapshot(
  raw: unknown,
  companyId: string,
  serviceId: string,
  currency: string,
): ServicePriceSnapshot {
  const source = ycObject(raw);
  if (
    ycId(source.id) !== ycId(serviceId) ||
    (source.company_id !== undefined &&
      ycId(source.company_id) !== ycId(companyId))
  )
    priceUnavailable('service_price_provider_identity_mismatch');
  if (currency !== 'RUB')
    priceUnavailable('service_price_currency_not_supported');
  for (const key of SERVICE_PRICE_REQUIRED_FIELDS)
    if (source[key] === undefined || source[key] === null)
      priceUnavailable('service_price_incomplete_snapshot');
  // Chain authority is not inferred from a missing flag or a local price.
  if (
    source.is_chain === undefined ||
    source.is_price_managed_only_in_chain === undefined
  )
    priceUnavailable('service_price_chain_policy_unknown');
  if (
    boolean(source.is_chain) ||
    boolean(source.is_price_managed_only_in_chain)
  )
    priceUnavailable('service_price_chain_managed');
  if (boolean(source.is_multi))
    priceUnavailable('service_price_group_service_not_supported');
  const amount = priceMinor(source.price_min);
  if (amount !== priceMinor(source.price_max))
    priceUnavailable('service_price_range_not_supported');
  const body: Record<string, unknown> = {
    price_min: amount / 100,
    price_max: amount / 100,
  };
  for (const key of numericFields)
    if (source[key] !== undefined) body[key] = number(source[key]);
  for (const key of textFields)
    if (source[key] !== undefined) {
      if (typeof source[key] !== 'string' || source[key].length > 8000)
        priceUnavailable('service_price_incomplete_snapshot');
      body[key] = source[key];
    }
  if (
    !(body.title as string).trim() ||
    (body.title as string).length > 240 ||
    !(body.booking_title as string).trim()
  )
    priceUnavailable('service_price_incomplete_snapshot');
  body.is_multi = false;
  body.is_need_limit_date = boolean(source.is_need_limit_date);
  // The API explicitly defaults omitted technical breaks to null.
  if (source.technical_break_duration === undefined)
    priceUnavailable('service_price_technical_break_unknown');
  const technicalBreak =
    source.technical_break_duration === null
      ? null
      : number(source.technical_break_duration);
  if (
    technicalBreak !== null &&
    (technicalBreak > 3600 || technicalBreak % 300 !== 0)
  )
    priceUnavailable('service_price_invalid_technical_break');
  body.technical_break_duration = technicalBreak;
  if (
    body.is_need_limit_date &&
    (source.date_from === undefined ||
      source.date_to === undefined ||
      source.dates === undefined)
  )
    priceUnavailable('service_price_date_limits_unknown');
  if (source.dates !== undefined) {
    if (
      !Array.isArray(source.dates) ||
      source.dates.length > 366 ||
      source.dates.some(
        (date) => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date),
      )
    )
      priceUnavailable('service_price_invalid_dates');
    body.dates = [...(source.dates as string[])];
  }
  // Never strip technology/resource/employee-price settings from a staff link.
  if (!Array.isArray(source.staff) || source.staff.length > 200)
    priceUnavailable('service_price_staff_links_unknown');
  body.staff = source.staff.map((rawStaff) => {
    const staff = ycObject(rawStaff);
    if (
      Object.keys(staff).some((key) => !['id', 'seance_length'].includes(key))
    )
      priceUnavailable('service_price_staff_settings_not_supported');
    const duration = number(staff.seance_length);
    if (!Number.isInteger(duration) || duration <= 0 || duration % 900 !== 0)
      priceUnavailable('service_price_staff_settings_not_supported');
    return { id: Number(ycId(staff.id)), seance_length: duration };
  });
  const { price_min: ignoredMin, price_max: ignoredMax, ...nonPrice } = body;
  void ignoredMin;
  void ignoredMax;
  // Response-only catalog flags are observed, not rewritten as request fields.
  const {
    price_min: sourceMin,
    price_max: sourceMax,
    ...observedNonPrice
  } = source;
  void sourceMin;
  void sourceMax;
  const preserved = {
    ...observedNonPrice,
    ...nonPrice,
    id: ycId(serviceId),
    company_id: ycId(companyId),
    active: source.active,
    is_chain: false,
    is_price_managed_only_in_chain: false,
  };
  return {
    companyId: ycId(companyId),
    serviceId: ycId(serviceId),
    name: body.title as string,
    currency,
    priceMinor: amount,
    patchBody: body,
    revision: servicePriceHash({
      companyId: ycId(companyId),
      serviceId: ycId(serviceId),
      amount,
      preserved,
    }),
    nonPriceHash: servicePriceHash(preserved),
  };
}
