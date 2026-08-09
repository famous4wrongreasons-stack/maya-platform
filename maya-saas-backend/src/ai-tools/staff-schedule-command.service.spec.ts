import { ConfigService } from '@nestjs/config';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import type {
  StaffScheduleDay,
  StaffScheduleSlot,
} from '../crm/crm-adapter.interface';
import { CrmService } from '../crm/crm.service';
import { staffScheduleRevision } from '../crm/staff-schedule.utils';
import { PrismaService } from '../prisma/prisma.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { StaffScheduleCommandService } from './staff-schedule-command.service';

describe('StaffScheduleCommandService', () => {
  const objectContaining = (value: Record<string, unknown>): unknown =>
    expect.objectContaining(value) as unknown;

  const user: AuthenticatedUser = {
    userId: 'owner-user',
    sessionId: 'session-a',
    tenantId: 'tenant-a',
    role: UserRole.TENANT_OWNER,
    email: 'owner@example.test',
    branchId: null,
    membershipId: 'membership-a',
    membershipStatus: 'active',
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T09:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prepares a native-only day closure for the named master', async () => {
    const mocks = createService();
    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Закрой Антону завтра'),
    );

    expect(result?.reply).toContain('Антон Соколов, 06.08.2026');
    expect(result?.reply).toContain('день закрыт');
    expect(result?.action).toEqual({
      status: 'approval_required',
      approval: { id: 'approval-a' },
    });
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'staff.schedule.update',
      expect.objectContaining({
        surface: 'native',
        arguments: objectContaining({
          staff_id: '7',
          date: '2026-08-06',
          operation: 'close_day',
          slots: [],
        }),
      }),
    );
  });

  it('splits a shift around a requested break', async () => {
    const mocks = createService();
    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Поставь Стасу завтра перерыв с 14:00 до 15:00'),
    );

    expect(result?.reply).toContain('10:00–14:00, 15:00–20:00');
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'staff.schedule.update',
      expect.objectContaining({
        arguments: objectContaining({
          staff_id: '8',
          operation: 'set_break',
          slots: [
            { from: '10:00', to: '14:00' },
            { from: '15:00', to: '20:00' },
          ],
        }),
      }),
    );
  });

  it('shortens the end of a split shift without removing its break', async () => {
    const mocks = createService([
      { from: '10:00', to: '14:00' },
      { from: '15:00', to: '20:00' },
    ]);
    await mocks.service.tryHandle(
      user,
      chat('native', 'Максиму завтра только до 18:00'),
    );

    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'staff.schedule.update',
      expect.objectContaining({
        arguments: objectContaining({
          staff_id: '9',
          operation: 'set_hours',
          slots: [
            { from: '10:00', to: '14:00' },
            { from: '15:00', to: '18:00' },
          ],
        }),
      }),
    );
  });

  it('blocks a change when a live appointment would fall outside it', async () => {
    const mocks = createService();
    mocks.crm.previewStaffScheduleDayChange.mockResolvedValue({
      current: scheduleDay('7', '2026-08-06', [{ from: '10:00', to: '20:00' }]),
      proposed: scheduleDay('7', '2026-08-06', []),
      conflict_times: ['18:30'],
    });

    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Закрой Антону завтра'),
    );

    expect(result?.reply).toContain('18:30');
    expect(result?.reply).toContain('ничего не меняла');
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it('does not intercept the production web surface', async () => {
    const mocks = createService();
    await expect(
      mocks.service.tryHandle(user, chat('web', 'Закрой Антону завтра')),
    ).resolves.toBeNull();
    expect(mocks.crm.getStaff).not.toHaveBeenCalled();
  });

  function createService(
    currentSlots: StaffScheduleSlot[] = [{ from: '10:00', to: '20:00' }],
  ) {
    const crm = {
      getStaff: jest.fn().mockResolvedValue([
        { id: '7', name: 'Антон Соколов' },
        { id: '8', name: 'Станислав Мосин' },
        { id: '9', name: 'Максим Чурсинов' },
      ]),
      getStaffScheduleDay: jest.fn(
        (_tenantId: string, params: { staffId: string; date: string }) =>
          Promise.resolve(
            scheduleDay(params.staffId, params.date, currentSlots),
          ),
      ),
      previewStaffScheduleDayChange: jest.fn(
        (
          _tenantId: string,
          params: { staffId: string; date: string; slots: StaffScheduleSlot[] },
        ) =>
          Promise.resolve({
            current: scheduleDay(params.staffId, params.date, currentSlots),
            proposed: scheduleDay(params.staffId, params.date, params.slots),
            conflict_times: [],
          }),
      ),
    };
    const runtime = {
      listTools: jest.fn().mockResolvedValue({
        tools: [{ name: 'staff.schedule.update' }],
      }),
      execute: jest.fn().mockResolvedValue({
        status: 'approval_required',
        approval: { id: 'approval-a' },
      }),
    };
    const service = new StaffScheduleCommandService(
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      crm as unknown as CrmService,
      {
        tenant: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ defaultTimezone: 'Europe/Moscow' }),
        },
      } as unknown as PrismaService,
      runtime as unknown as AiToolRuntimeService,
    );
    return { crm, runtime, service };
  }

  function scheduleDay(
    staffId: string,
    date: string,
    slots: StaffScheduleSlot[],
  ): StaffScheduleDay {
    return {
      staff_id: staffId,
      date,
      is_working: slots.length > 0,
      slots,
      revision: staffScheduleRevision(staffId, date, slots),
    };
  }

  function chat(surface: 'native' | 'web', content: string) {
    return {
      surface,
      requestId: 'request_12345678',
      messages: [{ role: 'user' as const, content }],
    };
  }
});
