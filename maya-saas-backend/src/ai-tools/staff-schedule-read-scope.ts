import { ConflictException } from '@nestjs/common';
import type { StaffScheduleSource } from '../crm/crm.service';
import { isUsableTimezone } from '../tenants/salon-timezone';

/** Server-only current source witness. It cannot grant a role, select a tenant,
 * authorize a write or add branch arguments to the public tool contract. */
export type StaffScheduleReadScope = Readonly<{
  branchId: string;
  sourceRevision: string;
  /** Selects only the public company profile, never a staff or booking grant. */
  publicProjection?: 'company_profile';
  staffSource?: Readonly<StaffScheduleSource>;
}>;

const plain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 128 &&
  value.trim() === value &&
  [...value].every((character) => {
    const code = character.charCodeAt(0);
    return code > 31 && code !== 127;
  });
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const invalid = (): never => {
  throw new ConflictException({
    error: { code: 'staff_schedule_read_scope_invalid' },
  });
};

/** Copy the closed catalog/schedule/journal/service witness so caller mutation cannot change its hash. */
export function staffScheduleReadScope(
  name: string,
  args: Readonly<Record<string, unknown>>,
  value: unknown,
): StaffScheduleReadScope {
  if (!plain(value) || !id(value.branchId) || !hash(value.sourceRevision))
    return invalid();
  const keys = Object.keys(value);
  if (name === 'catalog.staff.read') {
    const publicProfile = value.publicProjection === 'company_profile';
    if (
      keys.length !== (publicProfile ? 3 : 2) ||
      keys.some(
        (key) =>
          ![
            'branchId',
            'sourceRevision',
            ...(publicProfile ? ['publicProjection'] : []),
          ].includes(key),
      )
    )
      return invalid();
    return Object.freeze({
      branchId: value.branchId,
      sourceRevision: value.sourceRevision,
      ...(publicProfile
        ? { publicProjection: 'company_profile' as const }
        : {}),
    });
  }
  if (
    ![
      'staff.schedule.read',
      'operations.journal.read',
      'catalog.services.read',
    ].includes(name) ||
    keys.length !== 3 ||
    keys.some(
      (key) => !['branchId', 'sourceRevision', 'staffSource'].includes(key),
    )
  )
    return invalid();
  const source = value.staffSource;
  if (
    !plain(source) ||
    Object.keys(source).length !== 6 ||
    typeof source.provider !== 'string' ||
    !['yclients', 'altegio'].includes(source.provider) ||
    !id(source.staffId) ||
    source.branchId !== value.branchId ||
    !id(source.externalStaffId) ||
    (name === 'catalog.services.read'
      ? Object.keys(args).length !== 0
      : args.staff_id !== source.externalStaffId) ||
    !isUsableTimezone(source.timezone) ||
    !hash(source.sourceHash) ||
    Object.keys(source).some(
      (key) =>
        ![
          'provider',
          'staffId',
          'branchId',
          'externalStaffId',
          'timezone',
          'sourceHash',
        ].includes(key),
    )
  )
    return invalid();
  return Object.freeze({
    branchId: value.branchId,
    sourceRevision: value.sourceRevision,
    staffSource: Object.freeze({
      provider: source.provider,
      staffId: source.staffId,
      branchId: value.branchId,
      externalStaffId: source.externalStaffId,
      timezone: source.timezone,
      sourceHash: source.sourceHash,
    }),
  });
}
