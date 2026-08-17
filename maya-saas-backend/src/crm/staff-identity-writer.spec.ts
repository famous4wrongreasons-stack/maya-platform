import { CalendarSource } from '../common/domain.enums';
import type { EncryptionService } from '../encryption/encryption.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { ClientIdentityService } from './client-identity.service';
import type { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmService } from './crm.service';
import type { InternalCalendarService } from './../internal-calendar/internal-calendar.service';

/**
 * 🔴 P7.1 — писатель идентичности мастера у визита.
 *
 * Колонка `Appointment.staffId` появилась в фазе A и была залита разово, а
 * писателя у неё не завелось: каждая новая запись получала `NULL`, и мастера у
 * визита снова определял внешний id. Проверка «визитов без staffId — 0» была
 * верна ровно в момент backfill.
 *
 * Здесь проверяется РЕАЛЬНЫЙ резолвер, а не заглушка: два пространства дают
 * один ответ, и ни в одном случае внешний id не подставляется как внутренний.
 */

/**
 * Аккуратная сборка: подменяются только те зависимости, что реально нужны.
 * Контекст арендатора настоящий — резолвер обязан его требовать, и проверка
 * этого требования входит в ценность теста.
 */
const buildService = (prisma: {
  tenant?: unknown;
  crmIntegration?: unknown;
  staffProviderLink?: unknown;
  staff?: unknown;
}) => {
  const tenantContext = new TenantContextService();
  const service = new CrmService(
    prisma as unknown as PrismaService,
    {} as EncryptionService,
    {} as CrmAdapterFactory,
    tenantContext,
    {} as InternalCalendarService,
    {} as ClientIdentityService,
  );
  const resolve = (staffRef: string | null) =>
    tenantContext.runAsSystemTenant('tenant-1', () =>
      service.resolveStaffIdForBooking('tenant-1', staffRef),
    );
  return { service, resolve };
};

/** Явно типизированный запрос: без этого `mock.calls` становится `any`. */
type Query = { where: Record<string, unknown> };
type LinkFinder = jest.MockedFunction<
  (args: Query) => Promise<{ staffId: string } | null>
>;
type StaffFinder = jest.MockedFunction<
  (args: Query) => Promise<{ id: string } | null>
>;

const tenantOn = (source: CalendarSource) => ({
  findUnique: jest.fn().mockResolvedValue({
    calendarSource:
      source === CalendarSource.INTERNAL ? 'internal' : 'external',
  }),
});

describe('идентичность мастера при записи визита', () => {
  it('внешняя CRM: пара (провайдер, внешний id) разрешается в Staff.id', async () => {
    const staffProviderLinkFindFirst: LinkFinder = jest
      .fn()
      .mockResolvedValue({ staffId: 'staff-maya-1' });
    const { resolve } = buildService({
      tenant: tenantOn(CalendarSource.EXTERNAL),
      crmIntegration: {
        findUnique: jest.fn().mockResolvedValue({ provider: 'yclients' }),
      },
      staffProviderLink: { findFirst: staffProviderLinkFindFirst },
    });

    const resolved = await resolve('1461615');

    expect(resolved).toBe('staff-maya-1');
    // Разрешение идёт по паре, а не по голой строке, и отвязанные связи не в счёт.
    expect(staffProviderLinkFindFirst.mock.calls[0][0].where).toEqual({
      tenantId: 'tenant-1',
      provider: 'yclients',
      externalId: '1461615',
      unlinkedAt: null,
    });
  });

  it('внешняя CRM без связи: null, а НЕ внешний id', async () => {
    const { resolve } = buildService({
      tenant: tenantOn(CalendarSource.EXTERNAL),
      crmIntegration: {
        findUnique: jest.fn().mockResolvedValue({ provider: 'yclients' }),
      },
      staffProviderLink: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    // 🔴 Подстановка внешнего id вернула бы чужое пространство в собственную
    // колонку — и внешний ключ на Staff всё равно отверг бы такую запись.
    await expect(resolve('999999')).resolves.toBeNull();
  });

  it('внутренний календарь: идентификатор мастера УЖЕ является Staff.id', async () => {
    const staffFindFirst: StaffFinder = jest
      .fn()
      .mockResolvedValue({ id: 'staff-maya-2' });
    const { resolve } = buildService({
      tenant: tenantOn(CalendarSource.INTERNAL),
      staff: { findFirst: staffFindFirst },
    });

    const resolved = await resolve('staff-maya-2');

    expect(resolved).toBe('staff-maya-2');
    // Связь не спрашивается: во внутреннем пространстве её и не должно быть.
    expect(staffFindFirst.mock.calls[0][0].where).toEqual({
      id: 'staff-maya-2',
      tenantId: 'tenant-1',
    });
  });

  it('внутренний календарь без строки Staff: null, иначе внешний ключ уронит бронь', async () => {
    const { resolve } = buildService({
      tenant: tenantOn(CalendarSource.INTERNAL),
      staff: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await expect(resolve('provider-without-staff')).resolves.toBeNull();
  });

  it('пустая ссылка на мастера не ходит в базу вовсе', async () => {
    const staffFindFirst: StaffFinder = jest.fn();
    const { resolve } = buildService({
      tenant: tenantOn(CalendarSource.INTERNAL),
      staff: { findFirst: staffFindFirst },
    });

    await expect(resolve('   ')).resolves.toBeNull();
    expect(staffFindFirst).not.toHaveBeenCalled();
  });
});
