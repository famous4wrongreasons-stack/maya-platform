import { CrmProvider } from '../../common/domain.enums';
import { MockCRMAdapter } from './mock-crm.adapter';

describe('MockCRMAdapter', () => {
  it('returns slots for an ISO datetime query without throwing', async () => {
    const adapter = new MockCRMAdapter({
      provider: CrmProvider.MOCK,
      apiToken: 'mock-token',
    });

    const slots = await adapter.getAvailableSlots({
      tenantId: 'tenant-1',
      date: '2026-07-05T00:00:00.000Z',
    });

    expect(slots).toHaveLength(10);
    expect(slots[0]?.start).toBe('2026-07-05T09:00:00.000Z');
    expect(slots[0]?.end).toBe('2026-07-05T10:00:00.000Z');
  });
});
