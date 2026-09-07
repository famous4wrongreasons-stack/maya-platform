import { ActionIdentityService } from '../action-engine/action-engine.identity';
import {
  normalizeOwnerReportPlan,
  ownerReportFingerprint,
  ownerReportLogicalIdentity,
  OWNER_REPORT_ACTION,
  OWNER_REPORT_CONTRACT,
  OWNER_REPORT_ORDER,
  type OwnerReportPlan,
} from './owner-report.contract';

const identity = new ActionIdentityService(
  'b36-unit-contract-secret-not-production',
  'b36-unit-contract-secret-not-production',
);
const fixture = (): OwnerReportPlan => ({
  contract: OWNER_REPORT_CONTRACT,
  tenantId: 'tenant',
  reportType: 'daily_report',
  periodLocalDate: '2026-09-07',
  reportVersion: 1,
  timezone: 'Europe/Moscow',
  periodStart: '2026-09-06T21:00:00.000Z',
  periodEnd: '2026-09-07T21:00:00.000Z',
  expiresAt: '2026-09-14T21:00:00.000Z',
  classification: 'operational_single',
  channelOrder: OWNER_REPORT_ORDER,
  policy: {
    action: OWNER_REPORT_ACTION,
    key: 'production.deliver_report_briefing.proven-cutover',
    version: 1,
    preference: 'daily_brief',
  },
  content: {
    title: 'Report',
    bodyText: 'Canonical facts',
    payload: { unavailable: false, count: 1 },
    deepLink: '/app/?panel=chat',
  },
  recipients: [
    {
      userId: 'user',
      membershipId: 'membership',
      role: 'tenant_owner',
      slots: [
        {
          key: 'd'.repeat(64),
          channel: 'apns',
          routeId: 'device-b',
          destination: 'b'.repeat(64),
          routeHash: 'b'.repeat(64),
        },
        {
          key: 'a'.repeat(64),
          channel: 'telegram',
          routeId: 'verified',
          destination: '1000',
          routeHash: 'c'.repeat(64),
        },
        {
          key: 'f'.repeat(64),
          channel: 'inbox',
          routeId: 'membership',
          destination: 'user',
          routeHash: 'd'.repeat(64),
        },
        {
          key: 'c'.repeat(64),
          channel: 'apns',
          routeId: 'device-a',
          destination: 'a'.repeat(64),
          routeHash: 'e'.repeat(64),
        },
      ],
    },
  ],
});
describe('B36 immutable owner report contract', () => {
  it('normalizes channel rank first, then immutable slot key; input array/object order is not identity', () => {
    const plan = fixture(),
      reversed = structuredClone(plan);
    reversed.recipients[0].slots.reverse();
    reversed.content.payload = { count: 1, unavailable: false };
    const canonical = normalizeOwnerReportPlan(plan);
    expect(canonical.recipients[0].slots.map((s) => s.channel)).toEqual([
      'inbox',
      'telegram',
      'apns',
      'apns',
    ]);
    expect(canonical.recipients[0].slots.map((s) => s.key[0])).toEqual([
      'f',
      'a',
      'c',
      'd',
    ]);
    expect(ownerReportFingerprint(identity, canonical)).toEqual(
      ownerReportFingerprint(identity, normalizeOwnerReportPlan(reversed)),
    );
  });
  it.each([
    'content',
    'route',
    'principal',
    'expiry',
    'order',
    'version',
  ] as const)('rejects or conflicts on changed %s', (field) => {
    const original = normalizeOwnerReportPlan(fixture()),
      changed = structuredClone(original);
    if (field === 'content') changed.content.bodyText += ' changed';
    if (field === 'route')
      changed.recipients[0].slots[1].routeHash = '0'.repeat(64);
    if (field === 'principal') changed.recipients[0].role = 'administrator';
    if (field === 'expiry') changed.expiresAt = '2026-09-15T21:00:00.000Z';
    if (field === 'order')
      Object.assign(changed, { channelOrder: ['telegram', 'inbox', 'apns'] });
    if (field === 'version') Object.assign(changed, { reportVersion: 2 });
    if (['expiry', 'order', 'version'].includes(field))
      expect(() => normalizeOwnerReportPlan(changed)).toThrow();
    else {
      expect(ownerReportLogicalIdentity(identity, changed)).toEqual(
        ownerReportLogicalIdentity(identity, original),
      );
      expect(
        ownerReportFingerprint(identity, normalizeOwnerReportPlan(changed)),
      ).not.toEqual(ownerReportFingerprint(identity, original));
    }
  });
  it('requires exact tenant period bounds and one Inbox per recipient', () => {
    const badTime = fixture();
    badTime.periodStart = '2026-09-07T00:00:00.000Z';
    expect(() => normalizeOwnerReportPlan(badTime)).toThrow();
    const noInbox = fixture();
    noInbox.recipients[0].slots = noInbox.recipients[0].slots.filter(
      (s) => s.channel !== 'inbox',
    );
    expect(() => normalizeOwnerReportPlan(noInbox)).toThrow();
  });
  it('rejects extra transport metadata and duplicate principals/slots', () => {
    expect(() =>
      normalizeOwnerReportPlan(Object.assign(fixture(), { retry: 2 })),
    ).toThrow();
    const duplicate = fixture();
    duplicate.recipients.push(structuredClone(duplicate.recipients[0]));
    expect(() => normalizeOwnerReportPlan(duplicate)).toThrow();
    const slot = fixture();
    slot.recipients[0].slots.push(structuredClone(slot.recipients[0].slots[0]));
    expect(() => normalizeOwnerReportPlan(slot)).toThrow();
  });
});
