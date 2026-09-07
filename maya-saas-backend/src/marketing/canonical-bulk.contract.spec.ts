import { ActionCapabilityRegistry } from '../action-engine';
import { canonicalProductionPolicyDefinitions } from '../action-engine/action-engine.policy-registry';
import {
  BULK_ROOT_CAPABILITY,
  BULK_SLOT_CAPABILITY,
  bulkCanonical,
  bulkContent,
  bulkSlots,
  normalizeBulkAdmission,
  normalizeBulkSlotAdmission,
  type BulkRoute,
} from './canonical-bulk.contract';

describe('B35 immutable bulk contracts', () => {
  const hash = 'a'.repeat(64);
  it('normalizes content once and freezes the existing bounded device preview', () => {
    const value = bulkContent('  e\u0301\r\n' + 'x'.repeat(190) + '  ');
    expect(value.body.startsWith('é\n')).toBe(true);
    expect(value.deviceBody).toBe(value.body.slice(0, 180));
    expect(bulkContent(value.body)).toEqual(value);
  });
  it.each(['', 'x'.repeat(4001), 'unsafe\u0000text'])(
    'rejects unsupported content before admission',
    (text) => expect(() => bulkContent(text)).toThrow(),
  );
  it('keeps content-significant text in canonical intent', () =>
    expect(bulkCanonical(bulkContent('Offer A'))).not.toBe(
      bulkCanonical(bulkContent('Offer B')),
    ));
  it('does not accept caller authority or a new audience on confirmation', () => {
    expect(() =>
      normalizeBulkAdmission({
        campaignId: 'campaign',
        intentHash: hash,
        approved: true,
      }),
    ).toThrow();
    expect(() =>
      normalizeBulkAdmission({
        campaignId: 'campaign',
        intentHash: hash,
        clientIds: ['client'],
      }),
    ).toThrow();
    expect(() =>
      normalizeBulkSlotAdmission({
        campaignId: 'campaign',
        recipientId: 'child',
        slotKey: 'primary',
        intentHash: hash,
        contentHash: hash,
        telegramChatId: '10001',
      }),
    ).toThrow();
  });
  it('extends the existing bulk action class with owner-only admission capabilities', () => {
    const registry = new ActionCapabilityRegistry(),
      policies = canonicalProductionPolicyDefinitions(registry);
    for (const key of [BULK_ROOT_CAPABILITY, BULK_SLOT_CAPABILITY]) {
      expect(registry.get(key).actionClass).toBe('deliver_bulk_campaign');
      expect(registry.get(key).allowedSourceTypes).toEqual([
        'authenticated_request',
      ]);
      expect(
        policies.find((p) => p.capability === key)?.allowedActorRoles,
      ).toEqual(['tenant_owner', 'business_owner']);
    }
    expect(registry.get(BULK_ROOT_CAPABILITY).approvalRequirement).toBe(
      'REQUIRED',
    );
  });
  it('fixes planned primary and device slots; five devices remain one slot', () => {
    const route: BulkRoute = {
      contract: 'maya.bulk-client-route/1',
      primary: 'inbox',
      userId: 'account',
      link: {
        id: 'link',
        provider: 'maya_user',
        subjectHash: hash,
        verificationEvidenceHash: hash,
      },
      webPushEndpoints: [1, 2, 3, 4, 5].map((n) => ({
        id: 'ep' + n,
        materialHash: hash,
        clientChannelLinkId: 'link',
      })),
      apnsDevices: [{ id: 'ios', tokenHash: hash }],
      policyVersion: 1,
    };
    expect(bulkSlots(route)).toEqual([
      { key: 'primary', channel: 'inbox' },
      { key: 'web_push', channel: 'web_push' },
      { key: 'apns:ios', channel: 'apns' },
    ]);
    expect(
      bulkSlots({
        ...route,
        primary: 'none',
        userId: null,
        link: null,
        webPushEndpoints: [],
        apnsDevices: [],
      }),
    ).toEqual([]);
  });
});
