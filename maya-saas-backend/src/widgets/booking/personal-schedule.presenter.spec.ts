import { presentPersonalSchedule } from './personal-schedule.presenter';
const source = {
  appointmentId: 'existing',
  start: '2035-10-08T09:00:00Z',
  end: '2035-10-08T09:30:00Z',
  serviceId: 's',
  staffId: 'p',
  title: 'Услуга',
  rescheduleStart: '2035-10-08T10:00:00Z',
  rescheduleEnd: '2035-10-08T10:30:00Z',
  canManageAsClient: false,
  revalidate: () => Promise.resolve(),
};
describe('personal schedule navigation presentation', () => {
  it('owner card exposes personal navigation and dismiss, never grants CLIENT mutation recipes', () => {
    const shown = presentPersonalSchedule('t', source, () => 'opaque');
    expect(shown.proposals.map((p) => p.intent_template_key)).toEqual([
      'navigate.personal-booking@1',
      'control.dismiss@1',
    ]);
    expect(shown.body.detail_intent).toBe('i1');
  });
  it('child is finite: no recursive personal opener and no mutation intent', () => {
    const shown = presentPersonalSchedule('t', source, () => 'opaque', true);
    expect(shown.proposals.map((p) => p.intent_template_key)).toEqual([
      'control.dismiss@1',
    ]);
    expect(shown.body.detail_intent).toBe('i1');
    expect(shown.body.entries[0].move_intent).toBeNull();
  });
});
