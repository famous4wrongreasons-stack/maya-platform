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
      timezone: 'Europe/Moscow',
      date: '2026-07-05T00:00:00.000Z',
    });

    expect(slots).toHaveLength(10);
    expect(slots[0]?.start).toBe('2026-07-05T09:00:00.000Z');
    expect(slots[0]?.end).toBe('2026-07-05T10:00:00.000Z');
  });

  it('uses industry-specific mock terminology without forking the adapter', async () => {
    const adapter = new MockCRMAdapter({
      provider: CrmProvider.MOCK,
      apiToken: 'mock-token',
      settings: { industryPresetId: 'education' },
    });

    const [services, staff] = await Promise.all([
      adapter.getServices('tenant-education'),
      adapter.getStaff('tenant-education'),
    ]);

    expect(services[0]?.name).toBe('Пробное занятие');
    expect(staff[0]?.title).toBe('Преподаватель');
  });
});
