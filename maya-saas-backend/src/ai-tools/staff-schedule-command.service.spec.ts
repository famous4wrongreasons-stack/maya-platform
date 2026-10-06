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

  it.each(['native', 'web'] as const)(
    'prepares a day closure on %s for the named master',
    async (surface) => {
      const mocks = createService();
      const result = await mocks.service.tryHandle(
        user,
        chat(surface, 'Закрой Антону завтра'),
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
          surface,
          arguments: objectContaining({
            staff_id: '7',
            date: '2026-08-06',
            operation: 'close_day',
            slots: [],
          }),
        }),
      );
    },
  );

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

  // 🔴 Читающие ветки убраны намеренно. Раньше здесь лежали 18 тестов,
  // закреплявших ответы-заготовки на ВОПРОСЫ про график и журнал записей:
  // перехватчик отвечал сам, не вызывая модель, и только на телефоне — тот же
  // вопрос в браузере шёл обычным путём и получал осмысленный ответ.
  // Теперь контракт один для обеих площадок: вопрос — не команда, перехватчик
  // его не трогает и возвращает null.
  it.each([
    'Какое расписание у Стаса Мосина завтра?',
    'Стас завтра работает?',
    'Кто сегодня работает?',
    'Сколько записей у Стаса завтра?',
    'Какая загрузка у Стаса завтра?',
    'Сколько отмен у Стаса завтра?',
  ])(
    'вопрос про график и записи идёт к модели, а не в заготовку: %s',
    async (question) => {
      const mocks = createService();

      await expect(
        mocks.service.tryHandle(user, chat('native', question)),
      ).resolves.toBeNull();
      expect(mocks.runtime.execute).not.toHaveBeenCalled();
    },
  );

  // Деловой вопрос со словом «сократить» — это не команда правки графика.
  it.each(['Как сократить расходы?', 'Как сократить отмены?'])(
    'не принимает деловой вопрос за команду графика: %s',
    async (question) => {
      const mocks = createService();

      await expect(
        mocks.service.tryHandle(user, chat('native', question)),
      ).resolves.toBeNull();
    },
  );

  it.each(['web', 'native'] as const)(
    'carries only a contiguous material clarification on %s',
    async (surface) => {
      const mocks = createService();
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: 'Поставь перерыв' },
      ];
      const turn = () =>
        mocks.service.tryHandle(user, {
          surface,
          requestId: 'clarification-123456',
          messages,
        });
      expect((await turn())?.reply).toBe('На какую дату изменить график?');
      messages.push(
        { role: 'assistant', content: 'На какую дату изменить график?' },
        { role: 'user', content: 'Завтра' },
      );
      expect((await turn())?.reply).toBe('Какому мастеру изменить график?');
      messages.push(
        { role: 'assistant', content: 'Какому мастеру изменить график?' },
        { role: 'user', content: 'Антону' },
      );
      expect((await turn())?.reply).toContain('Укажите время перерыва');
      expect(mocks.runtime.execute).not.toHaveBeenCalled();
      messages.push(
        {
          role: 'assistant',
          content: 'Укажите время перерыва, например 14:00–15:00.',
        },
        { role: 'user', content: 'С 14 до 15' },
      );
      expect((await turn())?.action?.status).toBe('approval_required');
      expect(mocks.runtime.execute).toHaveBeenCalledTimes(1);
      expect(mocks.runtime.execute.mock.calls[0][2].arguments).toMatchObject({
        staff_id: '7',
        date: '2026-08-06',
        slots: [
          { from: '10:00', to: '14:00' },
          { from: '15:00', to: '20:00' },
        ],
      });
    },
  );

  it.each([
    'Сделай Антону завтра выходной',
    'Можно поставить Антону завтра перерыв с 14 до 15?',
    'Антон завтра работает с 10 до 18',
  ])('previews a free formulation: %s', async (content) => {
    const mocks = createService();
    expect(
      (await mocks.service.tryHandle(user, chat('web', content)))?.action
        ?.status,
    ).toBe('approval_required');
  });

  it.each([
    'Когда у Антона завтра перерыв?',
    'Антон завтра работает до 18?',
    'Какой перерыв у Антона?',
  ])('leaves questions on the ordinary path: %s', async (content) => {
    const mocks = createService();
    expect(
      await mocks.service.tryHandle(user, chat('web', content)),
    ).toBeNull();
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it('does not reuse a finished draft or cancellation as material', async () => {
    const mocks = createService();
    for (const [reply, answer] of [
      ['Подтвердите изменение.', 'До 18'],
      ['На какую дату изменить график?', 'Отмена'],
    ]) {
      expect(
        await mocks.service.tryHandle(user, {
          surface: 'web',
          requestId: 'cancel-draft-1234',
          messages: [
            { role: 'user', content: 'Закрой Антону завтра' },
            { role: 'assistant', content: reply },
            { role: 'user', content: answer },
          ],
        }),
      ).toBeNull();
    }
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
  });

  it.each([UserRole.CLIENT, UserRole.STAFF, UserRole.CUSTOMER])(
    'denies %s before CRM reads',
    async (role) => {
      const mocks = createService();
      expect(
        (
          await mocks.service.tryHandle(
            { ...user, role },
            chat('web', 'Закрой Антону завтра'),
          )
        )?.action,
      ).toBeNull();
      expect(mocks.crm.getStaff).not.toHaveBeenCalled();
      expect(mocks.runtime.execute).not.toHaveBeenCalled();
    },
  );

  it('never invents an absent staff identity', async () => {
    const mocks = createService();
    expect(
      (await mocks.service.tryHandle(user, chat('web', 'Закрой завтра')))
        ?.reply,
    ).toBe('Какому мастеру изменить график?');
    expect(mocks.crm.getStaffScheduleDay).not.toHaveBeenCalled();
    expect(mocks.runtime.execute).not.toHaveBeenCalled();
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
