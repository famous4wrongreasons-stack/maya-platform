import { ConflictException } from '@nestjs/common';

import { ActionEngineKernel } from '../action-engine';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Package5Wave1CanonicalCutoverService } from './package5-wave1-canonical-cutover.service';
import {
  Package5Wave1ExecutableService,
  Package5Wave1ShadowService,
} from './package5-wave1.service';

describe('Package5Wave1CanonicalCutoverService', () => {
  function setup(input?: {
    existing?: { id: string; actorUserId: string } | null;
    normalized?: Record<string, unknown>;
  }) {
    const readAppointmentNotificationSetting = jest.fn();
    const buildAppointmentNotifications = jest.fn();
    const prisma = {
      actionExecution: {
        findFirst: jest.fn().mockResolvedValue(input?.existing ?? null),
      },
      dashboardPreference: {
        findUnique: jest.fn().mockResolvedValue({
          configJson: {
            schema_version: 1,
            enabled_capabilities: ['business_analytics'],
          },
          updatedAt: new Date('2026-09-03T12:00:00.000Z'),
        }),
      },
      appointmentNotificationSetting: {
        findUnique: readAppointmentNotificationSetting,
      },
      inboxItem: { findFirst: jest.fn() },
      membership: { findMany: jest.fn() },
    } as unknown as PrismaService;
    const publishForTenant = jest.fn().mockResolvedValue({ stored: 1 });
    const inbox = {
      publishForTenant,
      projectOperationalWorkItemCompletion: jest.fn(),
    } as unknown as InboxService;
    const buildAssistant = jest
      .fn()
      .mockResolvedValue({ capability: 'assistant' });
    const planner = {
      buildAssistant,
      buildFinance: jest.fn(),
      buildAppointmentNotifications,
      buildTaskCreate: jest.fn().mockResolvedValue({ capability: 'task' }),
      buildTaskComplete: jest.fn(),
      buildAdministratorContact: jest.fn(),
    } as unknown as Package5Wave1ShadowService;
    const execute = jest.fn().mockResolvedValue({
      actionClass: 'update_assistant_preferences',
      targetRef: 'dashboard-preference:user-a:assistant',
    });
    const resume = jest.fn().mockResolvedValue({
      actionClass: 'update_assistant_preferences',
      targetRef: 'dashboard-preference:user-a:assistant',
    });
    const executor = {
      execute,
      resume,
    } as unknown as Package5Wave1ExecutableService;
    const kernel = {
      readTrustedNormalizedInput: jest
        .fn()
        .mockResolvedValue(input?.normalized ?? {}),
    } as unknown as ActionEngineKernel;
    const service = new Package5Wave1CanonicalCutoverService(
      prisma,
      new TenantContextService(),
      inbox,
      planner,
      executor,
      kernel,
    );
    return {
      service,
      prisma,
      inbox,
      planner,
      executor,
      kernel,
      buildAssistant,
      execute,
      resume,
      publishForTenant,
      readAppointmentNotificationSetting,
      buildAppointmentNotifications,
    };
  }

  it('routes a new setting mutation through planner and executable owner', async () => {
    const context = setup();

    const result = await context.service.updateAssistant(
      'tenant-a',
      'user-a',
      { enabledCapabilities: ['business_analytics'] },
      'request-a',
    );

    expect(context.buildAssistant).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      {
        sourceIntentRef: 'request-a',
        enabledCapabilities: ['business_analytics'],
      },
      'execute',
    );
    expect(context.execute).toHaveBeenCalledWith({
      capability: 'assistant',
    });
    expect(result).toMatchObject({
      tenant_id: 'tenant-a',
      user_id: 'user-a',
      section: 'assistant',
    });
  });

  it('resumes an exact retry and rejects reuse for a different intent', async () => {
    const context = setup({
      existing: { id: 'execution-a', actorUserId: 'user-a' },
      normalized: {
        configJson: {
          schema_version: 1,
          enabled_capabilities: ['business_analytics'],
        },
      },
    });

    await context.service.updateAssistant(
      'tenant-a',
      'user-a',
      { enabledCapabilities: ['business_analytics'] },
      'request-a',
    );
    expect(context.resume).toHaveBeenCalledWith('tenant-a', 'execution-a');
    expect(context.buildAssistant).not.toHaveBeenCalled();

    await expect(
      context.service.updateAssistant(
        'tenant-a',
        'user-a',
        { enabledCapabilities: ['staff_performance'] },
        'request-a',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('resumes exact appointment notification settings and rejects changed intent before another outcome', async () => {
    const context = setup({
      existing: { id: 'execution-notifications', actorUserId: 'user-a' },
      normalized: {
        configJson: {
          schema_version: 1,
          enabled: true,
          lead_times_minutes: [1440, 120],
        },
      },
    });
    await context.service.updateAppointmentNotifications(
      'tenant-a',
      'user-a',
      { enabled: true, leadTimesMinutes: [120, 1440, 120] },
      'notifications-intent',
    );
    expect(context.resume).toHaveBeenCalledWith(
      'tenant-a',
      'execution-notifications',
    );
    expect(context.execute).not.toHaveBeenCalled();
    expect(context.buildAppointmentNotifications).not.toHaveBeenCalled();

    for (const command of [
      { enabled: false, leadTimesMinutes: [1440, 120] },
      { enabled: true, leadTimesMinutes: [1440] },
    ]) {
      await expect(
        context.service.updateAppointmentNotifications(
          'tenant-a',
          'user-a',
          command,
          'notifications-intent',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    }
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.execute).not.toHaveBeenCalled();
    expect(context.readAppointmentNotificationSetting).toHaveBeenCalledTimes(1);
  });

  it('projects a task only after the canonical work item succeeds', async () => {
    const context = setup();
    context.execute.mockResolvedValue({
      actionClass: 'create_operational_task',
      actionExecutionId: 'execution-task',
      targetRef: 'work-item-a',
      targetGeneration: 1,
      noOp: false,
      settingMutations: 0,
      workItemMutations: 1,
      deliveryProjectionRequired: true,
      unknownApplicable: false,
      providerWrites: 0,
    });

    await context.service.createTask(
      'tenant-a',
      'owner-a',
      {
        assigneeUserId: 'staff-a',
        title: 'Поручение MAYA',
        bodyText: 'Проверить отмены',
        dueAt: null,
      },
      'task-a',
    );

    expect(context.execute).toHaveBeenCalled();
    expect(context.publishForTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({
        operationalWorkItemId: 'work-item-a',
        sourceEventId: 'maya-task:work-item-a',
        userIds: ['staff-a'],
      }),
    );
    expect(context.execute.mock.invocationCallOrder[0]).toBeLessThan(
      context.publishForTenant.mock.invocationCallOrder[0],
    );
  });

  it('R04 resumes an A23 intent whose settings config is null and rejects changed input', async () => {
    const context = setup({
      existing: { id: 'execution-task', actorUserId: 'user-a' },
      normalized: {
        configJson: null,
        assigneeUserId: 'user-b',
        title: 'Count stock',
        bodyText: 'Count sealed stock',
        dueAt: null,
      },
    });
    const command = {
      assigneeUserId: 'user-b',
      title: 'Count stock',
      bodyText: 'Count sealed stock',
    };
    await context.service.createTask(
      'tenant-a',
      'user-a',
      command,
      'task-intent',
    );
    expect(context.resume).toHaveBeenCalledWith('tenant-a', 'execution-task');
    expect(context.execute).not.toHaveBeenCalled();
    await expect(
      context.service.createTask(
        'tenant-a',
        'user-a',
        { ...command, title: 'Changed' },
        'task-intent',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  it('R04 preserves the committed task receipt when its projection fails', async () => {
    const context = setup();
    context.publishForTenant.mockRejectedValue(
      new Error('projection unavailable'),
    );
    const receipt = await context.service.createTask(
      'tenant-a',
      'user-a',
      {
        assigneeUserId: 'user-b',
        title: 'Count stock',
        bodyText: 'Count sealed stock',
      },
      'task-intent',
    );
    expect(receipt.projectionPending).toBe(true);
    expect(receipt.result).toMatchObject({
      targetRef: 'dashboard-preference:user-a:assistant',
    });
    expect(context.execute).toHaveBeenCalledTimes(1);
  });
});
