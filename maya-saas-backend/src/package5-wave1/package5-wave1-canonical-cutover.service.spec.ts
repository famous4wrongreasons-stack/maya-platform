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
      appointmentNotificationSetting: { findUnique: jest.fn() },
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
      buildAppointmentNotifications: jest.fn(),
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
});
