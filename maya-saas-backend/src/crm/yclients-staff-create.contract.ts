import { BadRequestException, ConflictException } from '@nestjs/common';
import { servicePriceHash } from './yclients-service-price.contract';

export const STAFF_CREATE_TOOL = 'catalog.staff.create';
export const STAFF_CREATE_CAPABILITY = 'crm.staff.quick-create.v1';
export const STAFF_CREATE_ORIGIN = 'YC-ST1-CHAT-1';
export type StaffCreateProposal = { name: string; specialization: string };
export type StaffCreatePrepared = StaffCreateProposal & {
  company_id: string;
  integration_revision: string;
  permission_revision: string;
  origin: typeof STAFF_CREATE_ORIGIN;
};
export type StaffCreateReceipt = StaffCreateProposal & {
  staff_id: string;
  company_id: string;
  source: 'yclients';
  verified: true;
};
export class StaffCreatePreDispatchError extends ConflictException {
  constructor(code: string) {
    super({ error: { code } });
  }
}
export function staffCreateRefuse(code: string): never {
  throw new StaffCreatePreDispatchError(code);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('staff_create_invalid_input');
  return value as Record<string, unknown>;
}
function exactKeys(input: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((k) => !keys.includes(k))
  )
    throw new BadRequestException('staff_create_unexpected_field');
}
export function staffCreateId(value: unknown): string {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^[1-9]\d{0,14}$/.test(String(value))
  )
    throw new BadRequestException('staff_create_invalid_id');
  return String(value);
}
function label(value: unknown): string {
  // Application bounds, not an assertion about undocumented provider maxima.
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    !value ||
    value.length > 240 ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    throw new BadRequestException('staff_create_invalid_label');
  return value;
}
export function staffCreateProposal(value: unknown): StaffCreateProposal {
  const v = object(value);
  exactKeys(v, ['name', 'specialization']);
  return { name: label(v.name), specialization: label(v.specialization) };
}
export function staffCreatePrepared(value: unknown): StaffCreatePrepared {
  const v = object(value);
  exactKeys(v, [
    'name',
    'specialization',
    'company_id',
    'integration_revision',
    'permission_revision',
    'origin',
  ]);
  for (const key of ['integration_revision', 'permission_revision'])
    if (typeof v[key] !== 'string' || !/^[a-f0-9]{64}$/.test(v[key]))
      throw new BadRequestException('staff_create_invalid_revision');
  if (v.origin !== STAFF_CREATE_ORIGIN)
    throw new BadRequestException('staff_create_origin_required');
  return {
    ...staffCreateProposal({ name: v.name, specialization: v.specialization }),
    company_id: staffCreateId(v.company_id),
    integration_revision: v.integration_revision as string,
    permission_revision: v.permission_revision as string,
    origin: STAFF_CREATE_ORIGIN,
  };
}
export function staffCreatePermissions(value: unknown): string {
  const settings = object(object(value).settings);
  if (
    settings.settings_master_access !== true ||
    settings.master_create !== true
  )
    staffCreateRefuse('staff_create_provider_permission_denied');
  return servicePriceHash({
    settings_master_access: true,
    master_create: true,
  });
}
export function staffCreateReceipt(
  value: unknown,
  companyId: string,
  proposal: StaffCreateProposal,
): StaffCreateReceipt {
  const v = object(value);
  if (
    staffCreateId(v.company_id) !== companyId ||
    v.name !== proposal.name ||
    v.specialization !== proposal.specialization ||
    v.position !== null ||
    (v.user_id !== undefined && v.user_id !== null && v.user_id !== 0)
  )
    staffCreateRefuse('staff_create_receipt_mismatch');
  return {
    ...proposal,
    staff_id: staffCreateId(v.id),
    company_id: companyId,
    verified: true,
    source: 'yclients',
  };
}

/** The current persisted user turn authors both labels; model parameters never do. */
export function bindStaffCreateTurn(text: string): StaffCreateProposal | null {
  const match =
    /^Создай сотрудника «([^«»\n]+)» со специализацией «([^«»\n]+)»[.!]?$/iu.exec(
      text.trim(),
    );
  if (!match) return null;
  try {
    return staffCreateProposal({ name: match[1], specialization: match[2] });
  } catch {
    return null;
  }
}
