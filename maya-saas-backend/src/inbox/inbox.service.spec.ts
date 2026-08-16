import { TenantContextService } from '../tenancy/tenant-context.service';
import { InboxService } from './inbox.service';

describe('InboxService recipients', () => {
  const makeService = (opts: {
    identities?: Array<{ userId: string }>;
    owners?: Array<{ userId: string }>;
    staffAccess?: Array<{ userId: string; externalStaffId: string }>;
  }) => {
    const upsertMock = jest.fn().mockResolvedValue({ id: 'row-1' });
    const allStaff = opts.staffAccess ?? [];
    const staffAccessFindMany = jest.fn().mockImplementation(
      (args: {
        where?: {
          externalStaffId?: { in?: string[] };
          userId?: { in?: string[] };
        };
      }) => {
        let rows = allStaff.slice();
        const staffIn = args?.where?.externalStaffId?.in;
        if (staffIn) {
          const set = new Set(staffIn.map(String));
          rows = rows.filter((row) => set.has(String(row.externalStaffId)));
        }
        const userIn = args?.where?.userId?.in;
        if (userIn) {
          const set = new Set(userIn.map(String));
          rows = rows.filter((row) => set.has(String(row.userId)));
        }
        return Promise.resolve(rows);
      },
    );
    const prisma = {
      authIdentity: {
        findMany: jest.fn().mockResolvedValue(opts.identities ?? []),
      },
      membership: {
        findMany: jest.fn().mockResolvedValue(opts.owners ?? []),
      },
      crmStaffAccess: {
        findMany: staffAccessFindMany,
      },
      inboxItem: {
        upsert: upsertMock,
      },
      devicePushToken: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new InboxService(
      prisma as never,
      new TenantContextService(),
    );
    return { service, prisma, upsertMock, staffAccessFindMany };
  };

  it('adds pure owners additively when fanoutOwners is true and telegram matched', async () => {
    const { service, prisma, upsertMock } = makeService({
      identities: [{ userId: 'staff-1' }],
      owners: [{ userId: 'owner-1' }, { userId: 'admin-1' }],
      staffAccess: [],
    });

    const result = await service.publishForTenant('tenant-1', {
      type: 'new_appointment',
      sourceEventId: 'new_appointment:test-1',
      title: 'Новая запись',
      bodyText: 'Клиент: Тест',
      telegramChatIds: ['948205934'],
      fanoutOwners: true,
      payload: { staff_id: 1461615 },
    });

    expect(prisma.membership.findMany).toHaveBeenCalled();
    expect(result.user_ids.sort()).toEqual(
      ['admin-1', 'owner-1', 'staff-1'].sort(),
    );
    expect(upsertMock).toHaveBeenCalledTimes(3);
  });

  it('owner-master only receives appointments for own CRM staff id', async () => {
    const { service, upsertMock } = makeService({
      identities: [],
      owners: [{ userId: 'owner-master' }, { userId: 'pure-owner' }],
      staffAccess: [
        { userId: 'owner-master', externalStaffId: '1461615' },
        { userId: 'other-master', externalStaffId: '3278920' },
      ],
    });

    const mine = await service.publishForTenant('tenant-1', {
      type: 'new_appointment',
      sourceEventId: 'new_appointment:mine',
      title: 'Новая запись',
      bodyText: 'Ко мне',
      fanoutOwners: true,
      payload: { staff_id: 1461615, record_id: 1 },
    });
    expect(mine.user_ids.sort()).toEqual(['owner-master', 'pure-owner'].sort());

    const other = await service.publishForTenant('tenant-1', {
      type: 'new_appointment',
      sourceEventId: 'new_appointment:other',
      title: 'Новая запись',
      bodyText: 'К другому мастеру',
      fanoutOwners: true,
      payload: { staff_id: 3278920, record_id: 2 },
    });
    // owner-master linked to 1461615 must NOT get other chair; pure-owner still gets salon-wide
    expect(other.user_ids.sort()).toEqual(
      ['other-master', 'pure-owner'].sort(),
    );
    expect(upsertMock).toHaveBeenCalled();
  });

  it('skips owners when fanoutOwners is false', async () => {
    const { service, prisma, upsertMock } = makeService({
      identities: [{ userId: 'staff-1' }],
      owners: [{ userId: 'owner-1' }],
    });

    const result = await service.publishForTenant('tenant-1', {
      type: 'shift_reminder',
      sourceEventId: 'shift:test-1',
      title: 'Смена',
      bodyText: 'Через 30 минут',
      telegramChatIds: ['111'],
      fanoutOwners: false,
      payload: { staff_id: 1 },
    });

    expect(prisma.membership.findMany).not.toHaveBeenCalled();
    expect(result.user_ids).toEqual(['staff-1']);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('fans out to owners when no explicit recipients matched', async () => {
    const { service, upsertMock } = makeService({
      identities: [],
      owners: [{ userId: 'owner-1' }],
    });

    const result = await service.publishForTenant('tenant-1', {
      type: 'hanging_lead',
      sourceEventId: 'hanging:test-1',
      title: 'Зависшая заявка',
      bodyText: 'Клиент не дошёл',
      telegramChatIds: ['999'],
      fanoutOwners: true,
    });

    expect(result.user_ids).toEqual(['owner-1']);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes related new_appointment cards when cancel is published', async () => {
    const upsertMock = jest.fn().mockResolvedValue({ id: 'cancel-1' });
    const findManyMock = jest.fn().mockResolvedValue([
      {
        id: 'old-new-1',
        payloadJson: { record_id: 1893718680, staff_id: 1 },
      },
      {
        id: 'other-1',
        payloadJson: { record_id: 111 },
      },
    ]);
    const updateManyMock: jest.MockedFunction<
      (args: {
        where: { id: { in: string[] } };
        data: { deletedAt: Date };
      }) => Promise<{ count: number }>
    > = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      authIdentity: { findMany: jest.fn().mockResolvedValue([]) },
      membership: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'owner-1' }]),
      },
      crmStaffAccess: { findMany: jest.fn().mockResolvedValue([]) },
      inboxItem: {
        upsert: upsertMock,
        findMany: findManyMock,
        updateMany: updateManyMock,
      },
      devicePushToken: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new InboxService(
      prisma as never,
      new TenantContextService(),
    );

    await service.publishForTenant('tenant-1', {
      type: 'appointment_cancelled',
      sourceEventId: 'appointment_cancelled:test',
      title: 'Запись отменена',
      bodyText: 'Клиент: Тест',
      fanoutOwners: true,
      payload: { record_id: 1893718680, event: 'record.delete' },
    });

    expect(updateManyMock).toHaveBeenCalledTimes(1);
    const update = updateManyMock.mock.calls[0]?.[0];
    expect(update?.where).toEqual({ id: { in: ['old-new-1'] } });
    expect(update?.data.deletedAt).toBeInstanceOf(Date);
  });
});
