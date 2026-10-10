import { ConfigService } from '@nestjs/config';
import { NativeFeedbackScheduler } from '../native-feedback/native-feedback.scheduler';
import { TeamCommunicationsScheduler } from './team-communications.scheduler';

describe.each([
  [TeamCommunicationsScheduler, 'TEAM_COMMUNICATIONS_SCHEDULER_ENABLED'],
  [NativeFeedbackScheduler, 'NATIVE_FEEDBACK_SCHEDULER_ENABLED'],
] as const)('%s explicit scheduler opt-out', (Scheduler, setting) => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('starts no timers or work when explicitly disabled', () => {
    const scheduler = new Scheduler(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      new ConfigService({ [setting]: 'false' }),
    );
    const tick = jest.spyOn(scheduler, 'tick').mockResolvedValue(undefined);
    scheduler.onModuleInit();
    jest.advanceTimersByTime(180000);
    expect(jest.getTimerCount()).toBe(0);
    expect(tick).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });
  it.each([undefined, 'true'])(
    'preserves default timer registration (%s)',
    (value) => {
      const scheduler = new Scheduler(
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
        new ConfigService(value ? { [setting]: value } : {}),
      );
      scheduler.onModuleInit();
      expect(jest.getTimerCount()).toBe(2);
      scheduler.onModuleDestroy();
      expect(jest.getTimerCount()).toBe(0);
    },
  );
});
