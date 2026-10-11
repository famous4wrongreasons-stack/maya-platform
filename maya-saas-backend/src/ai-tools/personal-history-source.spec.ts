import { UserRole } from '../common/domain.enums';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { personalHistoryReply } from './personal-history-presentation';

describe('own history source setting and private projection', () => {
  it.each([true, false, undefined, 'true'])(
    'publishes history only for the existing strict enabled setting (%p)',
    async (enabled) => {
      const ownHistoryEnabled = jest.fn().mockResolvedValue(enabled);
      const listClientAppointments = jest.fn().mockResolvedValue([
        {
          id: 'own-past',
          status: 'completed',
          attendance: 'arrived',
          is_upcoming: false,
          start_at: new Date('2020-01-01T12:00:00Z'),
          branch: null,
          timezone: 'UTC',
          timezone_source: 'tenant_default',
          notes: 'PRIVATE_NOTE',
          client_phone: '+12025550123',
        },
        { id: 'own-future', start_at: '2099-01-01T12:00:00.000Z' },
      ]);
      const handler = Object.create(
        AiToolHandlerService.prototype,
      ) as AiToolHandlerService;
      Object.defineProperties(handler, {
        appointmentsService: { value: { listClientAppointments } },
        governedSettings: { value: { ownHistoryEnabled } },
      });
      const answer = (await handler.execute(
        'appointments.own.list',
        {
          tenantId: 'tenant-one',
          userId: 'account-one',
          role: UserRole.CLIENT,
          surface: 'native',
        },
        {},
        'synthetic-history',
      )) as {
        history_scope: unknown;
        appointments: Array<{ id: string; attendance: string | null }>;
      };
      expect(listClientAppointments).toHaveBeenCalledWith(
        'tenant-one',
        'account-one',
      );
      expect(ownHistoryEnabled).toHaveBeenCalledWith('tenant-one');
      expect(answer.history_scope).toEqual({
        source: 'maya_canonical',
        enabled: enabled === true,
        coverage: 'last_synchronized',
      });
      expect(answer.appointments.map((row) => row.id)).toEqual(
        enabled === true ? ['own-past', 'own-future'] : ['own-future'],
      );
      expect(JSON.stringify(answer)).not.toMatch(/PRIVATE_NOTE|12025550123/);
      if (enabled === true) {
        expect(answer.appointments[0].attendance).toBe('arrived');
        const presentation = personalHistoryReply(
          { ...answer, appointments: [answer.appointments[0]] },
          false,
          'last_visit',
        );
        expect(presentation.status).toBe('verified');
        expect(presentation.reply).toContain('01.01.2020');
      } else
        expect(personalHistoryReply(answer, false, 'past').status).toBe(
          'blocked',
        );
    },
  );
});
