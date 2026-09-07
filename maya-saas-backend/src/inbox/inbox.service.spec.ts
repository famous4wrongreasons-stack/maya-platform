import { TenantContextService } from '../tenancy/tenant-context.service';
import { InboxService } from './inbox.service';

describe('InboxService recipients', () => {
  const makeService = (opts: {
    identities?: Array<{ userId: string }>;
    owners?: Array<{ userId: string }>;
    staffAccess?: Array<{ userId: string; externalStaffId: string }>;
    communicationDelivery?: {
      deliverNewAppointmentInbox: jest.Mock;
      deliverPackage2Inbox?: jest.Mock;
      deliverPackage2Apns?: jest.Mock;
      deliverPackage2Telegram?: jest.Mock;
    };
    communicationShadow?: { plan: jest.Mock };
    deviceTokens?: Array<{ userId: string; platform?: string; token: string }>;
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
        findMany: jest.fn().mockResolvedValue(opts.deviceTokens ?? []),
      },
    };
    const service = new InboxService(
      prisma as never,
      new TenantContextService(),
      undefined as never,
      opts.communicationShadow as never,
      opts.communicationDelivery as never,
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

  it('routes Package 2 reminders through canonical inbox and APNs delivery', async () => {
    const deliverPackage2Inbox = jest.fn().mockResolvedValue({
      actionExecutionId: 'execution-inbox-shift',
      deliveryId: 'delivery-inbox-shift',
      status: 'delivered',
    });
    const deliverPackage2Apns = jest.fn().mockResolvedValue({
      actionExecutionId: 'execution-apns-shift',
      deliveryId: 'delivery-apns-shift',
      status: 'accepted',
    });
    const deliverPackage2Telegram = jest.fn().mockResolvedValue({
      actionExecutionId: 'execution-telegram-shift',
      deliveryId: 'delivery-telegram-shift',
      status: 'sent',
    });
    const { service, prisma, upsertMock } = makeService({
      identities: [{ userId: 'staff-1' }],
      owners: [{ userId: 'owner-1' }],
      communicationDelivery: {
        deliverNewAppointmentInbox: jest.fn(),
        deliverPackage2Inbox,
        deliverPackage2Apns,
        deliverPackage2Telegram,
      },
      deviceTokens: [{ userId: 'staff-1', platform: 'ios', token: 'device-1' }],
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
    expect(deliverPackage2Inbox).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'staff-1',
        messageType: 'shift_reminder',
        sourceType: 'scheduler',
        sourceEventId: 'shift:test-1',
      }),
    );
    expect(deliverPackage2Apns).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'staff-1',
        messageType: 'shift_reminder',
        deviceToken: 'device-1',
      }),
    );
    expect(deliverPackage2Telegram).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        telegramChatId: '111',
        messageType: 'shift_reminder',
        sourceEventId: 'shift:test-1',
      }),
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('routes Package 2 alerts to resolved owners through Action Engine', async () => {
    const deliverPackage2Inbox = jest.fn().mockResolvedValue({
      actionExecutionId: 'execution-inbox-lead',
      deliveryId: 'delivery-inbox-lead',
      status: 'delivered',
    });
    const deliverPackage2Telegram = jest.fn().mockResolvedValue({
      actionExecutionId: 'execution-telegram-lead',
      deliveryId: 'delivery-telegram-lead',
      status: 'sent',
    });
    const { service, upsertMock } = makeService({
      identities: [],
      owners: [{ userId: 'owner-1' }],
      communicationDelivery: {
        deliverNewAppointmentInbox: jest.fn(),
        deliverPackage2Inbox,
        deliverPackage2Apns: jest.fn(),
        deliverPackage2Telegram,
      },
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
    expect(deliverPackage2Inbox).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'owner-1',
        messageType: 'hanging_lead',
        sourceEventId: 'hanging:test-1',
      }),
    );
    expect(deliverPackage2Telegram).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        telegramChatId: '999',
        messageType: 'hanging_lead',
        sourceEventId: 'hanging:test-1',
      }),
    );
    expect(upsertMock).not.toHaveBeenCalled();
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

  it('routes proven legacy new appointments only through Communication Delivery', async () => {
    const deliverNewAppointmentInbox = jest.fn().mockResolvedValue({
      actionExecutionId: 'execution-1',
      deliveryId: 'delivery-1',
      status: 'delivered',
    });
    const { service, upsertMock } = makeService({
      owners: [{ userId: 'owner-1' }],
      communicationDelivery: { deliverNewAppointmentInbox },
    });

    const result = await service.publishForTenant('tenant-1', {
      type: 'new_appointment',
      sourceEventId: 'new_appointment:cutover-1',
      title: 'New appointment',
      bodyText: 'Appointment body',
      fanoutOwners: true,
      shadowSourceType: 'legacy_bridge',
      payload: { record_id: 101 },
    });

    expect(result).toEqual({
      stored: 1,
      user_ids: ['owner-1'],
      telegram_delivered: 0,
    });
    expect(deliverNewAppointmentInbox).toHaveBeenCalledTimes(1);
    expect(deliverNewAppointmentInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'owner-1',
        sourceEventId: 'new_appointment:cutover-1',
      }),
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('fails closed when the migrated delivery owner is unavailable', async () => {
    const { service, upsertMock } = makeService({
      owners: [{ userId: 'owner-1' }],
    });

    await expect(
      service.publishForTenant('tenant-1', {
        type: 'new_appointment',
        sourceEventId: 'new_appointment:fail-closed',
        title: 'New appointment',
        bodyText: 'Appointment body',
        fanoutOwners: true,
        shadowSourceType: 'legacy_bridge',
      }),
    ).rejects.toThrow('communication_delivery_unavailable');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('keeps unproven new appointment producers on the existing path', async () => {
    const deliverNewAppointmentInbox = jest.fn();
    const { service, upsertMock } = makeService({
      owners: [{ userId: 'owner-1' }],
      communicationDelivery: { deliverNewAppointmentInbox },
    });

    await service.publishForTenant('tenant-1', {
      type: 'new_appointment',
      sourceEventId: 'new_appointment:not-proven',
      title: 'New appointment',
      bodyText: 'Appointment body',
      fanoutOwners: true,
      shadowSourceType: 'scheduler',
    });

    expect(deliverNewAppointmentInbox).not.toHaveBeenCalled();
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the Package 2 delivery owner is unavailable', async () => {
    const { service, upsertMock } = makeService({
      owners: [{ userId: 'owner-1' }],
    });

    await expect(
      service.publishForTenant('tenant-1', {
        type: 'daily_report',
        sourceEventId: 'daily:delivery-unavailable',
        title: 'Daily report',
        bodyText: 'Report body',
        fanoutOwners: true,
        shadowSourceType: 'scheduler',
      }),
    ).rejects.toThrow('communication_delivery_unavailable');

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('does not fall back when canonical Package 2 delivery fails', async () => {
    const deliverPackage2Inbox = jest
      .fn()
      .mockRejectedValue(new Error('canonical_delivery_unknown'));
    const { service, upsertMock } = makeService({
      owners: [{ userId: 'owner-1' }],
      communicationDelivery: {
        deliverNewAppointmentInbox: jest.fn(),
        deliverPackage2Inbox,
        deliverPackage2Apns: jest.fn(),
      },
    });

    await expect(
      service.publishForTenant('tenant-1', {
        type: 'daily_report',
        sourceEventId: 'daily:canonical-unknown',
        title: 'Daily report',
        bodyText: 'Report body',
        fanoutOwners: true,
        shadowSourceType: 'scheduler',
      }),
    ).rejects.toThrow('canonical_delivery_unknown');

    expect(upsertMock).not.toHaveBeenCalled();
  });
});
