import { createHash } from 'node:crypto';
import type { OwnerReportRun } from '@prisma/client';
import type { MorningReportPlan } from './owner-report.contract';
import { OwnerReportStore } from './owner-report.store';
import { CommunicationDeliveryService } from '../communication-delivery/communication-delivery.service';
import { ConfigService } from '@nestjs/config';

import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { InboxService } from '../inbox/inbox.service';
import {
  buildStack,
  LOCAL_DATE,
  RANGE,
  TENANT,
  visit,
} from './brief-stack.spec-helper.spec';
import { OwnerReportsService } from './owner-reports.service';

describe('OwnerReportsService', () => {
  const tenant = TENANT;

  function createService(options?: { enabledUserIds?: string[] }) {
    // 🔴 Настоящая цепочка вместо подменённого обзора: числа в тексте обязаны
    // приезжать из канонического владельца, и спека это проверяет по-честному.
    const stack = buildStack({
      visits: [
        visit('a', 'crm-1', 2500),
        visit('b', 'crm-1', 2500, 'confirmed'),
        visit('c', 'crm-1', 2500, 'confirmed'),
        visit('d', 'crm-1', 2500, 'confirmed'),
        visit('e', 'crm-1', 2500, 'confirmed'),
        visit('f', 'crm-1', 2500, 'confirmed'),
        visit('g', 'crm-2', 3000, 'confirmed'),
        visit('h', 'crm-2', 3000, 'canceled'),
      ],
      masters: [{ userId: 'master-user', externalStaffId: 'crm-1' }],
    });
    const inbox = { hasSourceEvent: jest.fn(), publishForTenant: jest.fn() };
    const plans = new Map<string, MorningReportPlan>();
    const runs = new Map<string, OwnerReportRun>();
    const states = new Map<
      string,
      { id: string; ownerReportSlotKey: string; state: string }
    >();
    const reportStore = {
      find: jest.fn((_tenant: string, _date: string, kind: string) =>
        Promise.resolve(runs.get(kind) ?? null),
      ),
      canAdmitPeriod: () => true,
      staffBinding: jest.fn((_tenant: string, userId: string) =>
        Promise.resolve(
          userId === 'master-user'
            ? {
                staffId: 'canonical-master',
                externalRef: 'crm-1',
                evidenceHash: 'a'.repeat(64),
              }
            : null,
        ),
      ),
      slot: (
        _tenant: string,
        userId: string,
        channel: string,
        routeId: string,
        destination: string,
      ) => ({
        key: createHash('sha256')
          .update(userId + channel + routeId)
          .digest('hex'),
        routeHash: 'b'.repeat(64),
        channel,
        routeId,
        destination,
      }),
      admit: jest.fn((plan: MorningReportPlan) => {
        const run = {
          id: plan.reportType,
          tenantId: TENANT.id,
          reportType: plan.reportType,
          intentEncrypted: 'synthetic',
          expiresAt: new Date(plan.expiresAt),
          payloadRetentionUntil: new Date(plan.expiresAt),
        } as OwnerReportRun;
        plans.set(run.id, plan);
        runs.set(run.id, run);
        for (const recipient of plan.recipients)
          for (const slot of recipient.slots)
            states.set(run.id + slot.key, {
              id: run.id + slot.key,
              ownerReportSlotKey: slot.key,
              state: 'READY',
            });
        return Promise.resolve(run);
      }),
      readPlan: (run: OwnerReportRun) => plans.get(run.id),
      executions: (run: OwnerReportRun) =>
        Promise.resolve(
          [...states.values()].filter((e) => e.id.startsWith(run.id)),
        ),
    };
    const delivery = {
      deliverOwnerReportSlot: jest.fn(
        (_tenant: string, runId: string, slot: string) => {
          states.get(runId + slot)!.state = 'SUCCEEDED';
          return Promise.resolve({});
        },
      ),
    };
    Object.assign(stack.prisma, {
      actionExecution: {
        findUniqueOrThrow: jest.fn(
          (args: { where: { id_tenantId: { id: string } } }) =>
            Promise.resolve(states.get(args.where.id_tenantId.id)),
        ),
      },
    });
    const config = { get: jest.fn() };
    const dashboardPreferences = {
      filterUsersWithAssistantCapability: jest
        .fn()
        .mockImplementation((_tenantId: string, userIds: string[]) =>
          Promise.resolve(
            options?.enabledUserIds === undefined
              ? userIds
              : userIds.filter((userId) =>
                  options.enabledUserIds?.includes(userId),
                ),
          ),
        ),
    };
    const businessState = stack.businessState;
    const readState = jest.spyOn(businessState, 'business');
    const service = new OwnerReportsService(
      stack.prisma,
      businessState,
      inbox as unknown as InboxService,
      stack.tenantContext,
      config as unknown as ConfigService,
      dashboardPreferences as unknown as DashboardPreferencesService,
      reportStore as unknown as OwnerReportStore,
      delivery as unknown as CommunicationDeliveryService,
    );

    return { service, inbox, reportStore, delivery, plans, readState };
  }

  it('stores one owner brief and one private master brief for the local day', async () => {
    const { service, inbox, reportStore, plans, readState } = createService();

    const result = await service.runMorningBrief(
      tenant,
      new Date('2026-08-13T05:05:00.000Z'),
    );

    expect(result).toBe('sent');
    // Период дня арендатора остался тем же — миграция границ не двигала.
    expect(readState).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: tenant.id,
        period: RANGE,
        comparisonMode: 'none',
        // Утренний бриф денежный контур не читает: не читал и раньше.
        financeAllowed: false,
        retryOnFailure: false,
      }),
    );
    expect(inbox.publishForTenant).not.toHaveBeenCalled();
    expect(inbox.hasSourceEvent).not.toHaveBeenCalled();
    expect(reportStore.admit).toHaveBeenCalledTimes(2);
    expect(readState).toHaveBeenCalledTimes(1);

    const owner = plans.get('morning_owner')!;
    expect(owner.periodLocalDate).toBe(LOCAL_DATE);
    expect(owner.recipients.map((r) => r.userId)).toEqual(['owner-user']);
    const ownerMessage = owner.recipients[0].content;
    expect(ownerMessage.bodyText).toContain('всего 8 записей');
    const staff = plans.get('morning_staff')!;
    expect(staff.recipients.map((r) => r.userId)).toEqual(['master-user']);
    expect(staff.recipients[0].staffId).toBe('canonical-master');
    const masterMessage = staff.recipients[0].content;
    expect(masterMessage?.bodyText).toContain('Доброе утро, Илья');
    expect(masterMessage?.bodyText).toContain('Записей: 6');
    expect(masterMessage?.bodyText).toContain('Совет MAYA');
  });

  it('does not duplicate already delivered morning messages', async () => {
    const { service, inbox, readState, reportStore, delivery } =
      createService();
    await service.runMorningBrief(tenant, new Date('2026-08-13T05:05:00.000Z'));
    readState.mockClear();
    reportStore.admit.mockClear();
    delivery.deliverOwnerReportSlot.mockClear();

    const result = await service.runMorningBrief(
      tenant,
      new Date('2026-08-13T05:05:00.000Z'),
    );

    expect(result).toBe('skipped');
    expect(readState).not.toHaveBeenCalled();
    expect(inbox.publishForTenant).not.toHaveBeenCalled();
    expect(reportStore.admit).not.toHaveBeenCalled();
    expect(delivery.deliverOwnerReportSlot).not.toHaveBeenCalled();
  });

  it('does not deliver briefs to users who disabled daily brief', async () => {
    const { service, inbox, readState } = createService({ enabledUserIds: [] });

    const result = await service.runMorningBrief(
      tenant,
      new Date('2026-08-13T05:05:00.000Z'),
    );

    expect(result).toBe('skipped');
    expect(readState).not.toHaveBeenCalled();
    expect(inbox.publishForTenant).not.toHaveBeenCalled();
  });
});
