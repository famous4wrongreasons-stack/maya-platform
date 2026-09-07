import { ConfigService } from '@nestjs/config';
import type { OwnerReportRun } from '@prisma/client';
import type { BusinessStateService } from '../business-state/business-state.service';
import type { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { CommunicationDeliveryService } from '../communication-delivery/communication-delivery.service';
import type { ActionEngineRuntimeService } from '../action-engine';
import { InboxService } from '../inbox/inbox.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  OWNER_REPORT_ACTION,
  OWNER_REPORT_CONTRACT,
  OWNER_REPORT_ORDER,
  type OwnerReportPlan,
} from './owner-report.contract';
import type { OwnerReportStore } from './owner-report.store';
import { OwnerReportsService } from './owner-reports.service';

function fixture(telegram: 'SUCCEEDED' | 'UNKNOWN' | 'FAILED' = 'SUCCEEDED') {
  const now = new Date(),
    context = new TenantContextService();
  const plan: OwnerReportPlan = {
    contract: OWNER_REPORT_CONTRACT,
    tenantId: 'tenant',
    reportType: 'daily_report',
    periodLocalDate: '2026-09-07',
    reportVersion: 1,
    timezone: 'UTC',
    periodStart: '',
    periodEnd: '',
    expiresAt: '',
    classification: 'operational_single',
    channelOrder: OWNER_REPORT_ORDER,
    policy: {
      action: OWNER_REPORT_ACTION,
      key: 'production.deliver_report_briefing.proven-cutover',
      version: 1,
      preference: 'daily_brief',
    },
    content: {
      title: 'Frozen report',
      bodyText: 'Frozen facts',
      payload: {},
      deepLink: '/app/?panel=chat',
    },
    recipients: ['first', 'other'].map((userId) => ({
      userId,
      membershipId: userId + '-member',
      role: 'tenant_owner',
      slots: ['inbox', 'telegram', 'apns', 'apns'].map((channel, i) => ({
        key: userId + '-' + i,
        channel: channel as 'inbox' | 'telegram' | 'apns',
        routeId: userId + '-' + i,
        routeHash: 'a'.repeat(64),
        destination: userId + '-' + i,
      })),
    })),
  };
  const run = {
    id: 'run',
    tenantId: 'tenant',
    intentEncrypted: 'fixture',
    intentHash: 'a'.repeat(64),
    expiresAt: new Date(now.getTime() + 86400000),
    payloadRetentionUntil: new Date(now.getTime() + 86400000),
  } as OwnerReportRun;
  const executions = plan.recipients.flatMap((r) =>
    r.slots.map((slot) => ({
      id: slot.key,
      ownerReportSlotKey: slot.key,
      state: 'READY',
    })),
  );
  const store = {
    find: jest.fn().mockResolvedValue(run),
    readPlan: jest.fn().mockReturnValue(plan),
    executions: jest.fn().mockImplementation(() => Promise.resolve(executions)),
    admit: jest.fn(),
  };
  const calls: string[] = [];
  const delivery = {
    deliverOwnerReportSlot: jest.fn((_tenant, _run, key: string) => {
      calls.push(key);
      const e = executions.find((x) => x.id === key)!;
      e.state = key === 'first-1' ? telegram : 'SUCCEEDED';
      if (e.state !== 'SUCCEEDED')
        return Promise.reject(new Error('synthetic unresolved'));
      return Promise.resolve({});
    }),
  };
  const prisma = {
    actionExecution: {
      findUniqueOrThrow: jest.fn(
        ({ where }: { where: { id_tenantId: { id: string } } }) =>
          Promise.resolve(
            executions.find((e) => e.id === where.id_tenantId.id),
          ),
      ),
    },
    authIdentity: { findMany: jest.fn() },
    devicePushToken: { findMany: jest.fn() },
    membership: { findMany: jest.fn() },
  };
  const business = { business: jest.fn() };
  const make = () =>
    new OwnerReportsService(
      prisma as unknown as PrismaService,
      business as unknown as BusinessStateService,
      {} as InboxService,
      context,
      new ConfigService(),
      {} as DashboardPreferencesService,
      store as unknown as OwnerReportStore,
      delivery as unknown as CommunicationDeliveryService,
    );
  const tenant = {
    id: 'tenant',
    slug: 'synthetic',
    name: 'Synthetic',
    defaultTimezone: 'UTC',
  };
  return {
    service: make(),
    make,
    tenant,
    run,
    store,
    plan,
    calls,
    executions,
    prisma,
    business,
  };
}
describe('B36 durable daily report orchestration', () => {
  it('executes Inbox before Telegram before sorted admitted APNS, then skips confirmed deliveries', async () => {
    const f = fixture();
    expect(await f.service.runDailyReport(f.tenant)).toBe('sent');
    expect(f.calls.filter((k) => k.startsWith('first'))).toEqual([
      'first-0',
      'first-1',
      'first-2',
      'first-3',
    ]);
    expect(f.calls.filter((k) => k.startsWith('other'))).toEqual([
      'other-0',
      'other-1',
      'other-2',
      'other-3',
    ]);
    await f.make().runDailyReport(f.tenant);
    expect(f.calls).toHaveLength(8);
    expect(f.business.business).not.toHaveBeenCalled();
    expect(f.store.admit).not.toHaveBeenCalled();
  });
  it.each(['UNKNOWN', 'FAILED'] as const)(
    'Telegram %s blocks its APNS while the other recipient completes',
    async (outcome) => {
      const f = fixture(outcome);
      expect(await f.service.runDailyReport(f.tenant)).toBe('skipped');
      expect(f.calls.filter((k) => k.startsWith('first'))).toEqual([
        'first-0',
        'first-1',
      ]);
      expect(f.calls.filter((k) => k.startsWith('other'))).toHaveLength(4);
      expect(f.executions.find((e) => e.id === 'first-0')!.state).toBe(
        'SUCCEEDED',
      );
      expect(f.executions.find((e) => e.id === 'first-2')!.state).toBe('READY');
    },
  );
  it('restart continues the same slots without reading new devices/recipients or recomposing', async () => {
    const f = fixture();
    f.executions.find((e) => e.id === 'first-0')!.state = 'SUCCEEDED';
    await f.make().runDailyReport(f.tenant);
    expect(f.calls.filter((k) => k.startsWith('first'))).toEqual([
      'first-1',
      'first-2',
      'first-3',
    ]);
    expect(f.prisma.devicePushToken.findMany).not.toHaveBeenCalled();
    expect(f.prisma.membership.findMany).not.toHaveBeenCalled();
    expect(f.business.business).not.toHaveBeenCalled();
  });
  it.each(['expiry', 'payload'] as const)(
    'does not deliver or recompute after %s expiry',
    async (kind) => {
      const f = fixture();
      if (kind === 'expiry') f.run.expiresAt = new Date(0);
      else f.run.payloadRetentionUntil = new Date(0);
      expect(await f.service.runDailyReport(f.tenant)).toBe('skipped');
      expect(f.calls).toHaveLength(0);
      expect(f.store.readPlan).not.toHaveBeenCalled();
      expect(f.business.business).not.toHaveBeenCalled();
    },
  );
  it('generic Inbox, Telegram and APNS paths reject daily reports before ingress/effect', async () => {
    const engine = { executeWithReceipt: jest.fn() };
    const delivery = new CommunicationDeliveryService(
      {} as PrismaService,
      engine as unknown as ActionEngineRuntimeService,
      new ConfigService({
        CRM_ENCRYPTION_KEY: 'b36-test-secret-for-unbound-transport',
      }),
    );
    const input = {
      tenantId: 'tenant',
      userId: 'user',
      sourceEventId: 'fake',
      title: 'Report',
      bodyText: 'Body',
      messageType: 'daily_report' as const,
      sourceType: 'scheduler' as const,
    };
    expect(() => delivery.deliverPackage2Inbox(input)).toThrow(
      'B36_OWNER_REPORT_RUN_REQUIRED',
    );
    expect(() =>
      delivery.deliverPackage2Apns({ ...input, deviceToken: 'device' }),
    ).toThrow('B36_OWNER_REPORT_RUN_REQUIRED');
    await expect(
      delivery.deliverPackage2Telegram({ ...input, telegramChatId: '1000' }),
    ).rejects.toThrow('B36_OWNER_REPORT_RUN_REQUIRED');
    await expect(
      delivery.deliverOwnerReportSlot('tenant', 'fake', 'fake'),
    ).rejects.toThrow('B36_OWNER_REPORT_FOUNDATION_REQUIRED');
    expect(engine.executeWithReceipt).not.toHaveBeenCalled();
  });
});
