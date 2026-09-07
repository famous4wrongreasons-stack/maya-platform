import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  ActionEngineKernel,
  PACKAGE5_WAVE1_REGISTRATIONS,
} from '../action-engine';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  Package5Wave1ExecutableService,
  Package5Wave1ShadowService,
  package5Wave1Hash,
  type AppointmentNotificationCommand,
  type AssistantPreferenceCommand,
  type CreateWorkItemCommand,
  type FinancePreferenceCommand,
  type Package5Wave1ExecutionValue,
} from './package5-wave1.service';

const ADMIN_ROLES = [
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
] as const;

@Injectable()
export class Package5Wave1CanonicalCutoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly inbox: InboxService,
    private readonly planner: Package5Wave1ShadowService,
    private readonly executor: Package5Wave1ExecutableService,
    private readonly kernel: ActionEngineKernel,
  ) {}

  async updateAssistant(
    tenantId: string,
    actorUserId: string,
    command: Omit<AssistantPreferenceCommand, 'sourceIntentRef'>,
    idempotencyKey?: string,
  ) {
    const sourceIntentRef = this.intentRef(idempotencyKey);
    await this.executeOrResume(
      tenantId,
      actorUserId,
      sourceIntentRef,
      'assistant_preferences',
      {
        enabledCapabilities: [...new Set(command.enabledCapabilities)].sort(),
      },
      () =>
        this.planner.buildAssistant(
          tenantId,
          actorUserId,
          { sourceIntentRef, ...command },
          'execute',
        ),
    );
    return this.readDashboardPreference(tenantId, actorUserId, 'assistant');
  }

  async updateFinance(
    tenantId: string,
    actorUserId: string,
    command: Omit<FinancePreferenceCommand, 'sourceIntentRef'>,
    idempotencyKey?: string,
  ) {
    const sourceIntentRef = this.intentRef(idempotencyKey);
    await this.executeOrResume(
      tenantId,
      actorUserId,
      sourceIntentRef,
      'finance_preferences',
      {
        enabledWidgets: [...new Set(command.enabledWidgets)].sort(),
        monthlyTargetRub: this.moneyTarget(command.monthlyTargetRub),
        staffTargetsRub: Object.fromEntries(
          Object.entries(command.staffTargetsRub)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => [key, this.moneyTarget(value)]),
        ),
      },
      () =>
        this.planner.buildFinance(
          tenantId,
          actorUserId,
          { sourceIntentRef, ...command },
          'execute',
        ),
    );
    return this.readDashboardPreference(tenantId, actorUserId, 'finance');
  }

  async updateAppointmentNotifications(
    tenantId: string,
    actorUserId: string,
    command: Omit<AppointmentNotificationCommand, 'sourceIntentRef'>,
    idempotencyKey?: string,
  ) {
    const sourceIntentRef = this.intentRef(idempotencyKey);
    await this.executeOrResume(
      tenantId,
      actorUserId,
      sourceIntentRef,
      'appointment_notifications',
      {
        enabled: command.enabled,
        leadTimesMinutes: [...new Set(command.leadTimesMinutes)].sort(
          (left, right) => right - left,
        ),
      },
      () =>
        this.planner.buildAppointmentNotifications(
          tenantId,
          actorUserId,
          { sourceIntentRef, ...command },
          'execute',
        ),
    );
    const row = await this.prisma.appointmentNotificationSetting.findUnique({
      where: { tenantId },
      select: { enabled: true, leadTimesMinutes: true },
    });
    return {
      enabled: row?.enabled ?? true,
      lead_times_minutes: this.numberArray(
        row?.leadTimesMinutes ?? [1440, 120],
      ),
      channel: 'maya_inbox_push' as const,
      transactional: true as const,
    };
  }

  async createTask(
    tenantId: string,
    actorUserId: string,
    command: Omit<CreateWorkItemCommand, 'sourceIntentRef'>,
    idempotencyKey: string,
  ) {
    const sourceIntentRef = this.intentRef(idempotencyKey);
    const result = await this.executeOrResume(
      tenantId,
      actorUserId,
      sourceIntentRef,
      'create_task',
      {
        assigneeUserId: command.assigneeUserId,
        title: command.title.trim(),
        bodyText: command.bodyText.trim(),
        dueAt: command.dueAt?.toISOString() ?? null,
      },
      () =>
        this.planner.buildTaskCreate(
          tenantId,
          actorUserId,
          { sourceIntentRef, ...command },
          'execute',
        ),
    );
    try {
      const projected = await this.inbox.publishForTenant(tenantId, {
        type: 'maya_task',
        sourceEventId: `maya-task:${result.targetRef}`,
        title: command.title,
        bodyText: command.bodyText,
        payload: {
          status: 'active',
          due_date: command.dueAt?.toISOString().slice(0, 10) ?? null,
          source: 'maya_chat',
          operational_work_item_id: result.targetRef,
        },
        deepLink: '/app/?panel=chat',
        userIds: [command.assigneeUserId],
        fanoutOwners: false,
        operationalWorkItemId: result.targetRef,
      });
      return {
        result,
        projected: projected.stored,
        projectionPending: false,
      };
    } catch {
      // A23 already committed. Projection failure cannot rewrite its outcome.
      return { result, projected: 0, projectionPending: true };
    }
  }

  async completeTask(
    tenantId: string,
    actorUserId: string,
    inboxItemId: string,
    idempotencyKey: string,
  ) {
    const projection = await this.prisma.inboxItem.findFirst({
      where: {
        id: inboxItemId,
        tenantId,
        userId: actorUserId,
        type: 'maya_task',
        deletedAt: null,
      },
      select: { operationalWorkItemId: true },
    });
    if (!projection?.operationalWorkItemId) {
      throw new NotFoundException(
        'Canonical task is not found or not assigned to the actor',
      );
    }
    const sourceIntentRef = this.intentRef(idempotencyKey);
    const result = await this.executeOrResume(
      tenantId,
      actorUserId,
      sourceIntentRef,
      'complete_task',
      { workItemId: projection.operationalWorkItemId },
      () =>
        this.planner.buildTaskComplete(
          tenantId,
          actorUserId,
          {
            sourceIntentRef,
            workItemId: projection.operationalWorkItemId!,
          },
          'execute',
        ),
    );
    try {
      await this.inbox.projectOperationalWorkItemCompletion(
        tenantId,
        actorUserId,
        result.targetRef,
      );
      return { ...result, projectionPending: false };
    } catch {
      // Completion is durable even when its presentation is temporarily stale.
      return { ...result, projectionPending: true };
    }
  }

  async requestAdministratorContact(
    tenantId: string,
    actorUserId: string,
    reason: string,
    idempotencyKey: string,
  ) {
    const sourceIntentRef = this.intentRef(idempotencyKey);
    const result = await this.executeOrResume(
      tenantId,
      actorUserId,
      sourceIntentRef,
      'request_admin_contact',
      { reason: reason.trim() },
      () =>
        this.planner.buildAdministratorContact(
          tenantId,
          actorUserId,
          { sourceIntentRef, reason },
          'execute',
        ),
    );
    const recipients = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: 'active',
        role: { in: [...ADMIN_ROLES] },
      },
      select: { userId: true },
    });
    const userIds = [...new Set(recipients.map((row) => row.userId))];
    if (userIds.length === 0) {
      throw new NotFoundException('Active administrator is not configured');
    }
    const projected = await this.inbox.publishForTenant(tenantId, {
      type: 'client_support_request',
      sourceEventId: `maya-contact:${result.targetRef}`,
      title: 'Клиент просит связаться',
      bodyText: reason,
      payload: {
        channel: 'maya_chat',
        operational_work_item_id: result.targetRef,
      },
      deepLink: '/clients',
      userIds,
      fanoutOwners: false,
      operationalWorkItemId: result.targetRef,
    });
    return { result, projected: projected.stored };
  }

  private async executeOrResume(
    tenantId: string,
    actorUserId: string,
    sourceIntentRef: string,
    operation: (typeof PACKAGE5_WAVE1_REGISTRATIONS)[number]['operation'],
    intendedInput: Record<string, unknown>,
    build: () => Promise<
      import('../action-engine').TrustedActionExecutionRequestV1
    >,
  ): Promise<Package5Wave1ExecutionValue> {
    const registration = PACKAGE5_WAVE1_REGISTRATIONS.find(
      (candidate) => candidate.operation === operation,
    );
    if (!registration)
      throw new BadRequestException('Wave 1 operation is not registered');
    const sourceRef = `p5w1:${package5Wave1Hash({ sourceIntentRef })}`;
    const existing = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId,
        sourceRef,
        capability: registration.executableCapability,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, actorUserId: true },
    });
    if (existing) {
      if (existing.actorUserId !== actorUserId) {
        throw new ForbiddenException(
          'The idempotency identity belongs to another actor',
        );
      }
      const normalized = await this.kernel.readTrustedNormalizedInput(
        tenantId,
        existing.id,
      );
      if (
        package5Wave1Hash(this.intentFromExecution(operation, normalized)) !==
        package5Wave1Hash(intendedInput)
      ) {
        throw new ConflictException(
          'Idempotency identity was already used for another Wave 1 intent',
        );
      }
      return this.executor.resume(tenantId, existing.id);
    }
    return this.executor.execute(await build());
  }

  private async readDashboardPreference(
    tenantId: string,
    userId: string,
    section: 'assistant' | 'finance',
  ) {
    const row = await this.prisma.dashboardPreference.findUnique({
      where: { userId_tenantId_section: { tenantId, userId, section } },
      select: { configJson: true, updatedAt: true },
    });
    if (!row)
      throw new NotFoundException('Canonical preference was not persisted');
    return {
      tenant_id: tenantId,
      user_id: userId,
      section,
      config: row.configJson as Prisma.JsonObject,
      updated_at: row.updatedAt,
    };
  }

  private intentRef(value?: string): string {
    const normalized =
      value?.trim() || this.tenantContext.get()?.requestId?.trim() || '';
    if (!normalized || normalized.length > 240) {
      throw new BadRequestException(
        'A bounded idempotency identity is required',
      );
    }
    return normalized;
  }

  private intentFromExecution(
    operation: (typeof PACKAGE5_WAVE1_REGISTRATIONS)[number]['operation'],
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    if (operation === 'assistant_preferences') {
      const config = this.record(input.configJson);
      return {
        enabledCapabilities: this.stringArray(config.enabled_capabilities),
      };
    }
    if (operation === 'finance_preferences') {
      const config = this.record(input.configJson);
      return {
        enabledWidgets: this.stringArray(config.enabled_widgets),
        monthlyTargetRub: config.monthly_target_rub ?? null,
        staffTargetsRub: this.record(config.staff_targets_rub),
      };
    }
    if (operation === 'appointment_notifications') {
      const config = this.record(input.configJson);
      return {
        enabled: config.enabled === true,
        leadTimesMinutes: this.numberArray(config.lead_times_minutes),
      };
    }
    if (operation === 'create_task') {
      return {
        assigneeUserId: this.text(input.assigneeUserId),
        title: this.text(input.title),
        bodyText: this.text(input.bodyText),
        dueAt: input.dueAt ?? null,
      };
    }
    if (operation === 'complete_task') {
      return { workItemId: this.text(input.workItemId) };
    }
    return { reason: this.text(input.bodyText) };
  }

  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Canonical Wave 1 object is invalid');
    }
    return value as Record<string, unknown>;
  }

  private stringArray(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string')
    ) {
      throw new BadRequestException('Canonical Wave 1 string list is invalid');
    }
    return value as string[];
  }

  private text(value: unknown): string {
    if (typeof value !== 'string' || !value) {
      throw new BadRequestException('Canonical Wave 1 text is invalid');
    }
    return value;
  }

  private moneyTarget(value: number | null): number | null {
    return value === null ? null : Math.round(value * 100) / 100;
  }

  private numberArray(value: unknown): number[] {
    if (
      !Array.isArray(value) ||
      value.some((item) => !Number.isInteger(item))
    ) {
      throw new BadRequestException('Stored lead-time policy is invalid');
    }
    return value as number[];
  }
}
