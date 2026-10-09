import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import {
  employeeServiceReply,
  employeeServiceTask,
  readEmployeeServices,
} from './employee-service-read';
import type { StaffScheduleReadScope } from './staff-schedule-read-scope';

const actor = {
  tenantId: 'tenant-current',
  userId: 'owner',
  role: UserRole.TENANT_OWNER,
  sessionId: 'session',
  email: 'owner@example.test',
  branchId: null as string | null,
  membershipId: 'membership',
  membershipStatus: 'active',
};
const branch = {
  id: 'branch-current',
  name: 'Набережная',
  timezone: 'Europe/Moscow',
  sourceRevision: 'b'.repeat(64),
};
const source = {
  provider: 'yclients',
  staffId: 'local-staff',
  externalStaffId: '71',
  branchId: branch.id,
  timezone: branch.timezone,
  sourceHash: 'a'.repeat(64),
};
const row = () => ({
  id: '81',
  name: 'Стрижка',
  price: 2000 as number | null,
  price_min: 2000 as number | null,
  price_max: 2000 as number | null,
  duration_minutes: 30 as number | null,
  currency: 'RUB' as string | null,
  category: null,
  limitations: [] as string[],
});
function fixture(intent = 'services.list') {
  const ci = new ConversationIntelligenceService();
  const plan = ci.validatePlan(
    {
      dialogue_act: 'request',
      tasks: [
        {
          id: 'services',
          intent,
          entities: {
            employee: 'Артём',
            ...(intent === 'services.price' ? { service: 'Стрижка' } : {}),
          },
          confidence: 1,
        },
      ],
      context: {
        carried_slots: [],
        replaced_slots: [],
        unresolved_references: [],
      },
    },
    actor.role,
    ['catalog.staff.read', 'catalog.services.read'],
  )!;
  const task = employeeServiceTask(plan)!;
  const catalog = {
    status: 'completed',
    result: { staff: [{ id: '71', name: 'Артём' }] },
  };
  const services = {
    status: 'completed',
    result: {
      contract: 'maya.service-catalog.read/1',
      source: 'external_crm',
      scope: 'public_booking_catalog',
      as_of: '2026-10-09T12:00:00.000Z',
      catalog_exhaustive: false,
      services: [row()],
      read_scope: {
        contract: 'maya.staff-service-catalog.read/1',
        branch_id: branch.id,
        source_revision: branch.sourceRevision,
        source_hash: source.sourceHash,
        staff_id: '71',
      },
    },
  };
  const crm = {
    resolveConfiguredBookingBranch: jest.fn().mockResolvedValue(branch),
    resolveBookingBranchPreference: jest.fn().mockResolvedValue(branch),
    resolveStaffScheduleSource: jest.fn().mockResolvedValue(source),
  };
  const read = jest.fn<
    Promise<unknown>,
    [string, Record<string, unknown>, StaffScheduleReadScope]
  >((name) =>
    Promise.resolve(name === 'catalog.staff.read' ? catalog : services),
  );
  const nameReferences = new Map<string, string>();
  const run = () =>
    readEmployeeServices({
      actor,
      task,
      nameReferences,
      unresolvedReferences: plan.context.unresolved_references,
      crm,
      read,
    });
  return { plan, task, catalog, services, crm, read, nameReferences, run };
}
describe('employee service catalog [synthetic components, no provider]', () => {
  it.each(['services.list', 'services.price'])(
    'binds %s with two existing READs and no model ID argument',
    async (intent) => {
      const f = fixture(intent);
      expect(f.task).not.toBeNull();
      const reply = await f.run();
      expect(reply.status).toBe('verified');
      expect(reply.reply).toContain('Услуги мастера Артём');
      expect(reply.reply).toContain('Стрижка: 2000 RUB; 30 мин');
      expect(f.read.mock.calls.map(([name]) => name)).toEqual([
        'catalog.staff.read',
        'catalog.services.read',
      ]);
      expect(f.read).toHaveBeenLastCalledWith(
        'catalog.services.read',
        {},
        {
          branchId: branch.id,
          sourceRevision: branch.sourceRevision,
          staffSource: source,
        },
      );
    },
  );
  it('keeps ranges, unknown currency, amount and duration without a bookable filter', async () => {
    const f = fixture();
    Object.assign(f.services.result.services[0], {
      price: null,
      price_min: 1700,
      price_max: 2300,
      currency: null,
      duration_minutes: null,
      limitations: ['price_is_range', 'currency_not_configured'],
    });
    f.services.result.services.push({
      ...row(),
      id: '82',
      name: 'Уход',
      price: null,
      price_min: null,
      price_max: null,
    });
    const result = await f.run();
    expect(result.status).toBe('verified');
    expect(result.reply).toContain(
      '1700–2300 (валюта не указана); длительность не указана',
    );
    expect(result.reply).toContain('Уход: цена не указана');
    expect(result.reply).not.toContain('0 RUB');
  });
  it('labels an actual empty public catalog without claiming the employee has no services', async () => {
    const f = fixture();
    f.services.result.services = [];
    const reply = await f.run();
    expect(reply.status).toBe('verified');
    expect(reply.reply).toBe(
      'В прочитанном публичном каталоге CRM для мастера Артём услуги не возвращены. Полнота каталога не подтверждена.',
    );
  });
  it('bounds display at20 while preserving visible truncation and no exhaustive claim', async () => {
    const f = fixture();
    f.services.result.services = Array.from({ length: 21 }, (_, i) => ({
      ...row(),
      id: String(i + 1),
      name: `Услуга ${i + 1}`,
    }));
    const reply = await f.run();
    expect(reply.status).toBe('verified');
    expect(reply.reply).toContain('Показаны первые 20');
    expect(reply.reply).not.toContain('Услуга 21:');
  });
  it('resolves current request aliases and exact current service, not the first returned row', async () => {
    const f = fixture('services.price');
    f.task.entities.employee = '[name removed]@1';
    f.task.entities.branch = '[name removed]@2';
    f.task.entities.service = 'Уход';
    f.nameReferences.set('[name removed]@1', 'Артём');
    f.nameReferences.set('[name removed]@2', branch.name);
    f.services.result.services.push({
      ...row(),
      id: '82',
      name: 'Уход',
      price: 700,
      price_min: 700,
      price_max: 700,
    });
    const reply = await f.run();
    expect(reply.status).toBe('verified');
    expect(reply.reply).toContain('Уход: 700 RUB');
    expect(reply.reply).not.toContain('2000');
    expect(f.crm.resolveBookingBranchPreference).toHaveBeenCalledWith(
      actor.tenantId,
      branch.name,
    );
  });
  it.each(['unknown', 'duplicate'])(
    'does not expose prices for %s service',
    async (kind) => {
      const f = fixture('services.price');
      if (kind === 'unknown') f.task.entities.service = 'Неизвестная';
      else f.services.result.services.push({ ...row(), id: '82' });
      const reply = await f.run();
      expect(reply.status).toBe('blocked');
      expect(reply.reply).not.toContain('2000');
    },
  );
  it.each(['unknown', 'duplicate', 'stale', 'unavailable'])(
    'stops after staff catalog for %s employee',
    async (kind) => {
      const f = fixture();
      if (kind === 'unknown') f.task.entities.employee = 'Неизвестный';
      if (kind === 'duplicate')
        f.catalog.result.staff.push({ id: '72', name: 'Артём' });
      if (kind === 'stale') Object.assign(f.catalog, { stale: true });
      if (kind === 'unavailable') f.catalog.status = 'failed';
      expect((await f.run()).status).toBe('blocked');
      expect(f.read).toHaveBeenCalledTimes(1);
      expect(f.crm.resolveStaffScheduleSource).not.toHaveBeenCalled();
    },
  );
  it.each(['missing', 'unknown', 'foreign'])(
    'refuses %s branch before catalogs',
    async (kind) => {
      const f = fixture();
      if (kind === 'missing')
        f.crm.resolveConfiguredBookingBranch.mockResolvedValue(null);
      else {
        f.task.entities.branch = 'Другой';
        f.crm.resolveBookingBranchPreference.mockResolvedValue(
          kind === 'unknown' ? null : { ...branch, id: 'foreign' },
        );
      }
      expect((await f.run()).status).toBe('blocked');
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it('does not fill an unresolved branch or missing service from defaults', async () => {
    const f = fixture('services.price');
    f.task.requires_clarification = true;
    delete f.task.entities.service;
    expect((await f.run()).status).toBe('blocked');
    expect(f.read).not.toHaveBeenCalled();
    expect(f.crm.resolveConfiguredBookingBranch).not.toHaveBeenCalled();
  });
  it('keeps authority failure and branch restriction as Forbidden', async () => {
    const f = fixture();
    f.crm.resolveConfiguredBookingBranch.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(f.run()).rejects.toBeInstanceOf(ForbiddenException);
    const g = fixture();
    actor.branchId = 'foreign';
    try {
      await expect(g.run()).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      actor.branchId = null;
    }
    expect(g.read).not.toHaveBeenCalled();
  });
  it('rejects a selected provider link to another branch before service READ', async () => {
    const f = fixture();
    f.crm.resolveStaffScheduleSource.mockResolvedValue({
      ...source,
      branchId: 'foreign',
    });
    expect((await f.run()).status).toBe('blocked');
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it.each([
    'stale',
    'foreign',
    'hash',
    'unscoped',
    'incomplete',
    'duplicate_id',
    'bad_price',
    'bad_currency',
    'bad_date',
    'inconsistent_fixed',
    'too_large',
  ])(
    'withholds malformed/current-source-unproved services: %s',
    async (kind) => {
      const f = fixture();
      if (kind === 'stale') Object.assign(f.services, { stale: true });
      if (kind === 'foreign') f.services.result.read_scope.staff_id = '72';
      if (kind === 'hash')
        f.services.result.read_scope.source_hash = 'c'.repeat(64);
      if (kind === 'unscoped')
        Reflect.deleteProperty(f.services.result, 'read_scope');
      if (kind === 'incomplete')
        Object.assign(f.services.result, { incomplete: true });
      if (kind === 'duplicate_id') f.services.result.services.push(row());
      if (kind === 'bad_price')
        f.services.result.services[0].price = Number.NaN;
      if (kind === 'bad_currency')
        f.services.result.services[0].currency = 'RUB\n';
      if (kind === 'bad_date')
        f.services.result.as_of = '2026-02-30T12:00:00.000Z';
      if (kind === 'inconsistent_fixed')
        f.services.result.services[0].price = null;
      if (kind === 'too_large')
        f.services.result.services = Array.from({ length: 501 }, (_, i) => ({
          ...row(),
          id: String(i),
        }));
      const result = await f.run();
      expect(result.status).toBe('blocked');
      expect(result.reply).not.toContain('2000');
    },
  );
  it('marks a stored scoped result as replayed', () => {
    const f = fixture();
    Object.assign(f.services, { replayed: true });
    const reply = employeeServiceReply({
      execution: f.services,
      scope: {
        branchId: branch.id,
        sourceRevision: branch.sourceRevision,
        staffSource: source,
      },
      staff: { id: '71', name: 'Артём' },
    });
    expect(reply.status).toBe('verified');
    expect(reply.reply).toContain('Сохранённый результат проверки.');
  });
  it('does not intercept writes, own appointments, compound or denied tasks', () => {
    for (const intent of [
      'booking.list_own',
      'services.rename_preview',
      'schedule.get_team',
    ]) {
      const f = fixture();
      f.task.intent = intent;
      expect(employeeServiceTask(f.plan)).toBeNull();
    }
    const f = fixture();
    f.plan.tasks.push({ ...f.task, id: 'second' });
    expect(employeeServiceTask(f.plan)).toBeNull();
    const denied = fixture();
    denied.task.permission.status = 'denied';
    expect(employeeServiceTask(denied.plan)).toBeNull();
  });
});
