import { TenantContextService } from '../tenancy/tenant-context.service';
import { InboxService } from './inbox.service';
import type { IngestInboxItemDto } from './dto/inbox.dto';

describe('R06 Inbox canonical producer boundary', () => {
  const fixture = () => {
    const context = new TenantContextService(),
      prisma = {
        inboxItem: {
          upsert: jest.fn(),
          updateMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
        operationalWorkItem: { findFirst: jest.fn() },
      },
      projections = {
        work: jest
          .fn()
          .mockResolvedValue({ stored: 1, user_ids: ['assignee'] }),
        appointmentExecution: jest
          .fn()
          .mockResolvedValue({ stored: 1, user_ids: ['staff'] }),
      };
    const service = new InboxService(
      prisma as never,
      context,
      undefined as never,
      undefined,
      undefined,
      projections as never,
    );
    const run = <T>(fn: () => T) => context.runAsSystemTenant('tenant', fn);
    return { context, prisma, projections, service, run };
  };
  const input = {
    type: 'new_appointment' as const,
    sourceEventId: 'untrusted',
    title: 'untrusted',
    bodyText: 'untrusted',
  };
  it.each([
    'new_appointment',
    'appointment_cancelled',
    'shift_reminder',
    'daily_report',
    'morning_brief',
    'owner_alert',
    'marketing_campaign',
    'maya_task',
    'client_support_request',
  ])(
    'generic %s without its canonical owner cannot create a delivery',
    async (type) => {
      const f = fixture();
      await expect(
        f.run(() =>
          f.service.publishForTenant('tenant', {
            ...input,
            type: type as IngestInboxItemDto['type'],
          }),
        ),
      ).rejects.toThrow();
      expect(f.projections.work).not.toHaveBeenCalled();
      expect(f.projections.appointmentExecution).not.toHaveBeenCalled();
      expect(f.prisma.inboxItem.upsert).not.toHaveBeenCalled();
    },
  );
  it('legacy ingest refuses before resolving any claimed tenant or raw recipient', async () => {
    const f = fixture();
    await expect(
      f.service.ingest({
        type: 'new_appointment',
        tenant_slug: 'claimed',
        source_event_id: 'raw',
        title: 'raw',
        body_text: 'raw',
      }),
    ).rejects.toThrow('CANONICAL_PRODUCER');
  });
  it('only exact canonical A23 identity is passed to its projection; caller content and recipients are discarded', async () => {
    const f = fixture();
    await f.run(() =>
      f.service.publishForTenant('tenant', {
        ...input,
        type: 'maya_task',
        operationalWorkItemId: 'work',
        userIds: ['forged'],
      }),
    );
    expect(f.projections.work).toHaveBeenCalledWith('tenant', 'work');
    expect(f.prisma.inboxItem.upsert).not.toHaveBeenCalled();
  });
  it.each([
    'new_appointment',
    'appointment_cancelled',
    'appointment_rescheduled',
  ] as const)(
    '%s requires a confirmed internal Appointment receipt',
    async (type) => {
      const f = fixture();
      await f.run(() =>
        f.service.publishForTenant('tenant', {
          ...input,
          type,
          payload: { appointment_id: 'appointment' },
        }),
      );
      expect(f.projections.appointmentExecution).toHaveBeenCalledWith(
        'tenant',
        'appointment',
        type === 'new_appointment'
          ? 'create_appointment'
          : type === 'appointment_cancelled'
            ? 'cancel_appointment'
            : 'reschedule_appointment',
      );
    },
  );
  it('raw Telegram and cross-tenant claims never reach a projection', async () => {
    const f = fixture();
    await expect(
      f.run(() =>
        f.service.publishForTenant('tenant', {
          ...input,
          telegramChatIds: ['1'],
          payload: { appointment_id: 'appointment' },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      f.run(() =>
        f.service.publishForTenant('foreign', {
          ...input,
          payload: { appointment_id: 'appointment' },
        }),
      ),
    ).rejects.toThrow();
    expect(f.projections.appointmentExecution).not.toHaveBeenCalled();
  });
  it('does not soften canonical owner failure into direct Inbox/APNS writes', async () => {
    const f = fixture();
    f.projections.work.mockRejectedValue(Error('unconfirmed'));
    await expect(
      f.run(() =>
        f.service.publishForTenant('tenant', {
          ...input,
          type: 'maya_task',
          operationalWorkItemId: 'work',
        }),
      ),
    ).rejects.toThrow('unconfirmed');
    expect(f.prisma.inboxItem.upsert).not.toHaveBeenCalled();
  });
  it('a projected task can only close after its exact confirmed A23 completion', async () => {
    const f = fixture();
    await expect(
      f.run(() =>
        f.service.projectOperationalWorkItemCompletion(
          'tenant',
          'assignee',
          'work',
        ),
      ),
    ).rejects.toThrow('COMPLETED_A23');
    expect(f.prisma.inboxItem.findMany).not.toHaveBeenCalled();
    f.prisma.operationalWorkItem.findFirst.mockResolvedValue({
      completeExecution: { state: 'SUCCEEDED', dryRun: false },
    });
    (f.prisma as Record<string, unknown>).$transaction = jest
      .fn()
      .mockResolvedValue([]);
    await f.run(() =>
      f.service.projectOperationalWorkItemCompletion(
        'tenant',
        'assignee',
        'work',
      ),
    );
    expect(f.prisma.inboxItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant',
          userId: 'assignee',
          operationalWorkItemId: 'work',
        }) as unknown,
      }),
    );
  });
});
