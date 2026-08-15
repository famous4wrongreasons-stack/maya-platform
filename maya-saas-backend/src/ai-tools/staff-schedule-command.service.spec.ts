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
      conflict_times: ['18:30'] as string[],
    });

    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Закрой Антону завтра'),
    );

    expect(result?.reply).toContain('18:30');
    expect(result?.reply).toContain('ничего не меняла');
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it('reads the exact named-master schedule for tomorrow without the model', async () => {
    const mocks = createService();
    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Какое расписание у Стаса завтра?'),
    );

    expect(result).toMatchObject({
      action: null,
      toolUsage: {
        name: 'staff.schedule.read',
        status: 'completed',
        execution_id: 'execution-read',
      },
    });
    expect(result?.reply).toContain('Завтра, 6 августа');
    expect(result?.reply).toContain('Станислав Мосин — 10:00–20:00');
    expect(result?.reply).toContain('Источник: YClients');
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'staff.schedule.read',
      expect.objectContaining({
        surface: 'native',
        arguments: { date: '2026-08-06', staff_id: '8' },
      }),
    );
  });

  it.each([
    ['Какое расписание у Стаса Мосина завтра?', '8', 'Станислав Мосин'],
    ['Стас завтра работает?', '8', 'Станислав Мосин'],
    ['У Стаса завтра какая смена?', '8', 'Станислав Мосин'],
    ['Во сколько завтра выходит Стас?', '8', 'Станислав Мосин'],
    ['Когда завтра работает Илья?', '10', 'Илья Третьяков'],
  ])(
    'understands the natural schedule question: %s',
    async (question, staffId, staffName) => {
      const mocks = createService();
      const result = await mocks.service.tryHandle(
        user,
        chat('native', question),
      );

      expect(result?.reply).toContain(`${staffName} — 10:00–20:00`);
      expect(mocks.runtime.execute).toHaveBeenCalledWith(
        user,
        'staff.schedule.read',
        expect.objectContaining({
          arguments: { date: '2026-08-06', staff_id: staffId },
        }),
      );
    },
  );

  it('does not turn an unknown named employee into the whole-team schedule', async () => {
    const mocks = createService();
    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Какое расписание у Петра завтра?'),
    );

    expect(result?.reply).toContain('Не нашла такого активного сотрудника');
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it('reports an exact day off instead of substituting appointment analytics', async () => {
    const mocks = createService();
    mocks.runtime.execute.mockImplementationOnce(
      (_user, toolName, input: { arguments: Record<string, unknown> }) =>
        Promise.resolve({
          status: 'completed',
          execution_id: 'execution-off',
          result: {
            verified: true,
            source: 'crm',
            date: input.arguments.date,
            staff: [
              {
                id: '10',
                name: 'Илья Третьяков',
                title: 'Барбер',
                is_working: false,
                slots: [],
              },
            ],
          },
        }),
    );

    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'У Ильи завтра выходной?'),
    );

    expect(result?.reply).toContain('Илья Третьяков — выходной');
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'staff.schedule.read',
      expect.objectContaining({
        arguments: { date: '2026-08-06', staff_id: '10' },
      }),
    );
  });

  it('reads the active team schedule for a date', async () => {
    const mocks = createService();
    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Кто работает завтра?'),
    );

    expect(result?.reply).toContain('Работают:');
    expect(result?.reply).toContain('Станислав Мосин 10:00–20:00');
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'staff.schedule.read',
      expect.objectContaining({
        arguments: { date: '2026-08-06' },
      }),
    );
  });

  it('understands a natural whole-team shift question', async () => {
    const mocks = createService();
    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Кто завтра на смене?'),
    );

    expect(result?.reply).toContain('Работают:');
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'staff.schedule.read',
      expect.objectContaining({ arguments: { date: '2026-08-06' } }),
    );
  });

  it.each([
    'Сколько записей у Стаса завтра?',
    'Какие услуги у Стаса завтра?',
    'Какая загрузка у Стаса завтра?',
    'Сколько отмен у Стаса завтра?',
  ])('reads an exact YClients day journal for: %s', async (question) => {
    const mocks = createService();
    const result = await mocks.service.tryHandle(
      user,
      chat('native', question),
    );

    expect(result).toMatchObject({
      action: null,
      toolUsage: {
        name: 'operations.journal.read',
        status: 'completed',
        execution_id: 'execution-journal',
      },
    });
    expect(result?.reply).toContain('Станислав Мосин — 2 записи');
    expect(result?.reply).toContain('Мужская стрижка');
    expect(result?.reply).toContain('отмен: 1');
    expect(result?.reply).toContain('загрузка');
    expect(result?.reply).toContain('Источник: YClients');
    expect(result?.reply).not.toContain('Сводка салона');
    expect(result?.reply).not.toContain('этот месяц');
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'operations.journal.read',
      expect.objectContaining({
        arguments: { date: '2026-08-06', staff_id: '8' },
      }),
    );
  });

  it('reads the exact team journal instead of a monthly overview', async () => {
    const mocks = createService();
    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Кто загружен завтра и сколько отмен?'),
    );

    expect(result?.reply).toContain('По мастерам:');
    expect(result?.reply).toContain('Станислав Мосин');
    expect(result?.reply).toContain('Источник: YClients');
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'operations.journal.read',
      expect.objectContaining({ arguments: { date: '2026-08-06' } }),
    );
  });

  it('keeps the requested operation and date across a short follow-up', async () => {
    const mocks = createService();
    const result = await mocks.service.tryHandle(user, {
      surface: 'native',
      requestId: 'request_12345678',
      messages: [
        { role: 'user', content: 'Сколько записей завтра?' },
        { role: 'assistant', content: 'Уточните мастера.' },
        { role: 'user', content: 'А у Стаса?' },
      ],
    });

    expect(result?.reply).toContain('Станислав Мосин — 2 записи');
    expect(mocks.runtime.execute).toHaveBeenCalledWith(
      user,
      'operations.journal.read',
      expect.objectContaining({
        arguments: { date: '2026-08-06', staff_id: '8' },
      }),
    );
  });

  it('fails closed when the exact YClients journal cannot be read', async () => {
    const mocks = createService();
    mocks.runtime.execute.mockRejectedValueOnce(new Error('crm offline'));

    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Сколько записей у Стаса завтра?'),
    );

    expect(result?.reply).toContain('точный журнал записей из YClients');
    expect(result?.reply).toContain('Месячной сводкой его не заменяю');
    expect(result?.toolUsage).toBeNull();
  });

  it('fails closed when YClients schedule cannot be read', async () => {
    const mocks = createService();
    mocks.runtime.execute.mockRejectedValueOnce(new Error('crm offline'));

    const result = await mocks.service.tryHandle(
      user,
      chat('native', 'Какое расписание у Стаса завтра?'),
    );

    expect(result?.reply).toContain('точный график из YClients');
    expect(result?.reply).toContain('Общей аналитикой его не заменяю');
    expect(result?.toolUsage).toBeNull();
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
        { id: '10', name: 'Илья Третьяков', title: 'Барбер' },
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
            conflict_times: [] as string[],
          }),
      ),
    };
    const runtime = {
      listTools: jest.fn().mockResolvedValue({
        tools: [
          { name: 'staff.schedule.read' },
          { name: 'staff.schedule.update' },
          { name: 'operations.journal.read' },
        ],
      }),
      execute: jest.fn(
        (
          _user: AuthenticatedUser,
          toolName: string,
          input: { arguments: Record<string, unknown> },
        ) => {
          if (toolName === 'staff.schedule.read') {
            const selected = [
              { id: '7', name: 'Антон Соколов' },
              { id: '8', name: 'Станислав Мосин' },
              { id: '9', name: 'Максим Чурсинов' },
              { id: '10', name: 'Илья Третьяков', title: 'Барбер' },
            ].filter(
              (member) =>
                input.arguments.staff_id === undefined ||
                member.id === input.arguments.staff_id,
            );
            return Promise.resolve({
              status: 'completed',
              execution_id: 'execution-read',
              result: {
                verified: true,
                source: 'crm',
                date: input.arguments.date,
                staff: selected.map((member) => ({
                  ...member,
                  is_working: currentSlots.length > 0,
                  slots: currentSlots,
                })),
              },
            });
          }
          if (toolName === 'operations.journal.read') {
            const allStaff = [
              { id: '7', name: 'Антон Соколов' },
              { id: '8', name: 'Станислав Мосин' },
              { id: '9', name: 'Максим Чурсинов' },
              { id: '10', name: 'Илья Третьяков' },
            ];
            const selected = allStaff.filter(
              (member) =>
                input.arguments.staff_id === undefined ||
                member.id === input.arguments.staff_id,
            );
            const staffRows = selected.map((member) => ({
              name: member.name,
              is_working: true,
              working_hours: currentSlots,
              appointments: {
                total: member.id === '8' ? 2 : 1,
                active: 1,
                confirmed: 1,
                completed: 0,
                canceled: member.id === '8' ? 1 : 0,
                no_show: 0,
                other: 0,
              },
              booked_minutes: 60,
              working_minutes: 600,
              load_percent: 10,
            }));
            const appointments = selected.flatMap((member) => [
              {
                time: '10:00',
                end_time: '11:00',
                status: 'confirmed',
                staff_name: member.name,
                services: ['Мужская стрижка'],
              },
              ...(member.id === '8'
                ? [
                    {
                      time: '18:00',
                      end_time: '19:00',
                      status: 'canceled',
                      staff_name: member.name,
                      services: ['Моделирование бороды'],
                    },
                  ]
                : []),
            ]);
            const canceled = staffRows.reduce(
              (sum, member) => sum + member.appointments.canceled,
              0,
            );
            return Promise.resolve({
              status: 'completed',
              execution_id: 'execution-journal',
              result: {
                verified: true,
                source: 'yclients',
                date: input.arguments.date,
                timezone: 'Europe/Moscow',
                summary: {
                  total: appointments.length,
                  active: staffRows.length,
                  confirmed: staffRows.length,
                  completed: 0,
                  canceled,
                  no_show: 0,
                  other: 0,
                },
                staff: staffRows,
                appointments,
              },
            });
          }
          return Promise.resolve({
            status: 'approval_required',
            approval: { id: 'approval-a' },
          });
        },
      ),
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
