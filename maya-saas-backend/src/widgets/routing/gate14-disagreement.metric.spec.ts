import { Gate14DisagreementMetric } from './gate14-disagreement.metric';

describe('AMB-G6-7 Gate 6/14 disagreement metric', () => {
  it('counts only the closed current-authority revocation vocabulary', () => {
    const metric = new Gate14DisagreementMetric();
    metric.increment('entitlement_denied');
    metric.increment('role_denied');
    metric.increment('invented_reason');
    expect(metric.value('entitlement_denied')).toBe(1);
    expect(metric.value('role_denied')).toBe(1);
    expect(metric.value()).toBe(2);
  });
});
