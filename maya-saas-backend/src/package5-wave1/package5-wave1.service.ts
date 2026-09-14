import { c8PolicyScope } from '../valuation/c8.policy';
import {
  RC_DURABLE_COMMANDS,
  expenseReminderPreferenceTransition,
} from '../action-engine/action-engine.durable-policy';
import { createHash, randomUUID } from 'node:crypto';
import { GovernedSettingsReadService } from './governed-settings.read';
import {
  GOVERNED_OWNER_ROLES,
  GOVERNED_STAFF_ROLES,
  governedConfigurationContent,
  governedHash,
  governedNamespace,
  validateGovernedNormalizedInput,
  type GovernedOperation,
} from './governed-settings.contract';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { isPostgresSerializationConflict } from '../common/postgres-transaction-conflict';
import { attachExistingInvocationReceipt } from '../action-engine/action-invocation-receipt.context';

import {
  BadRequestException,
  ConflictException,
  Optional,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ExternalDispatchState,
  Prisma,
  type ActionExecution,
  type PrismaClient,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
  PACKAGE5_WAVE1_POLICY_VERSION,
  PACKAGE5_WAVE1_REGISTRATIONS,
  type Package5Wave1ActionClass,
  type Package5Wave1Operation,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  ASSISTANT_CAPABILITIES,
  DEFAULT_ASSISTANT_CAPABILITIES,
  type AssistantCapability,
} from '../dashboard-preferences/assistant-capabilities.constants';
import {
  DEFAULT_FINANCE_DASHBOARD_WIDGETS,
  FINANCE_DASHBOARD_WIDGETS,
  type FinanceDashboardWidget,
} from '../dashboard-preferences/finance-dashboard.constants';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const SETTINGS_MANAGERS = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
]);
const BUSINESS_ROLES = new Set([
  ...SETTINGS_MANAGERS,
  'manager',
  'branch_manager',
  'accountant',
]);
const TEAM_ROLES = new Set([
  ...BUSINESS_ROLES,
  'provider',
  'employee',
  'staff',
]);
const CLIENT_ROLES = new Set(['client', 'customer']);
const SUPPORT_ROLE_PRIORITY = [
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
] as const;
const MIN_LEAD_MINUTES = 30;
const MAX_LEAD_MINUTES = 7 * 24 * 60;
const MAX_LEAD_TIMES = 4;

type Mode = 'shadow' | 'execute';
type Tx = Prisma.TransactionClient;

export interface Package5Wave1ShadowResult {
  actionClass: Package5Wave1ActionClass;
  actionExecutionId: string;
  outcome: 'planned';
  shadowDivergences: 0;
  settingMutations: 0;
  workItemMutations: 0;
  inboxMessages: 0;
  providerWrites: 0;
}

export interface Package5Wave1ExecutionValue {
  governedCommandHash?: string;
  actionClass: Package5Wave1ActionClass;
  actionExecutionId: string;
  targetRef: string;
  targetGeneration: number;
  noOp: boolean;
  settingMutations: 0 | 1;
  workItemMutations: 0 | 1;
  deliveryProjectionRequired: boolean;
  unknownApplicable: false;
  providerWrites: 0;
}

export interface AssistantPreferenceCommand {
  sourceIntentRef: string;
  enabledCapabilities: string[];
}

export interface FinancePreferenceCommand {
  sourceIntentRef: string;
  enabledWidgets: string[];
  monthlyTargetRub: number | null;
  staffTargetsRub: Record<string, number>;
}

export interface AppointmentNotificationCommand {
  sourceIntentRef: string;
  enabled: boolean;
  leadTimesMinutes: number[];
}

export interface CreateWorkItemCommand {
  sourceIntentRef: string;
  assigneeUserId: string;
  title: string;
  bodyText: string;
  dueAt?: Date | null;
}

export interface CompleteWorkItemCommand {
  sourceIntentRef: string;
  workItemId: string;
}

export interface AdministratorContactCommand {
  sourceIntentRef: string;
  reason: string;
}

export class Package5Wave1Error extends Error {}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalJson(nested)]),
    );
  }
  return value;
}

export function package5Wave1Hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalJson(value)))
    .digest('hex');
}

@Injectable()
export class Package5Wave1ShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly governed?: GovernedSettingsReadService,
  ) {}

  async buildGoverned(
    tenantId: string,
    actorUserId: string,
    operation: GovernedOperation,
    sourceIntentRef: string,
    callerId: string,
    semanticCommand: Record<string, unknown>,
    now = new Date(),
  ) {
    this.tenantContext.assertTenantId(tenantId);
    const governed = this.governed;
    if (!governed)
      throw new Package5Wave1Error('Governed A22 support unavailable');
    return canonicalUtcTransaction(
      this.prisma,
      async (tx) => {
        const actor = await governed.actor(tx, tenantId, actorUserId);
        let current: Record<string, unknown>,
          desired: Record<string, unknown>,
          targetRef: string,
          generation: number;
        if (operation === 'tenant_business_configuration') {
          if (!GOVERNED_OWNER_ROLES.has(actor.role))
            throw new ForbiddenException('Current tenant owner required');
          const namespace = governedNamespace(semanticCommand.namespace);
          current = await governed.configuration(tx, tenantId, namespace);
          if (
            current.revision !== semanticCommand.expectedRevision ||
            current.previousRevisionId !== semanticCommand.previousRevisionId
          )
            throw new ConflictException('STALE_CONFIGURATION_REVISION');
          const content = governedConfigurationContent(
            namespace,
            semanticCommand.content,
            { tenantId, actorUserId, callerId },
          );
          if (namespace === 'c8_valuation')
            await c8PolicyScope(tx, tenantId, content);
          if (namespace === 'business_rules') {
            const submitted = this.governedRules(semanticCommand.content);
            const previous = this.governedRules(current.content);
            if (
              submitted.some(
                (rule) =>
                  rule.id !== null &&
                  !previous.some((old) => old.id === rule.id),
              )
            )
              throw new BadRequestException(
                'Existing rule identity was not issued in the current tenant revision',
              );
          }
          if (namespace === 'staff_ai_provider')
            governed.providerAvailable(content.provider);
          desired = {
            namespace,
            revision: Number(current.revision) + 1,
            previousRevisionId: current.previousRevisionId,
            content,
          };
          targetRef = `tenant-config:${namespace}`;
          generation = Number(current.revision);
        } else {
          current = await governed.personal(tx, tenantId, actorUserId);
          targetRef = `staff-notifications:${actorUserId}`;
          const latest = await tx.actionTargetMutation.findFirst({
            where: { tenantId, targetKind: 'setting', targetRef },
            orderBy: { targetGeneration: 'desc' },
          });
          generation = (latest?.targetGeneration ?? -1) + 1;
          if (generation !== semanticCommand.expectedGeneration)
            throw new ConflictException('STALE_PREFERENCE_GENERATION');
          desired = {
            schema_version: 1,
            membershipId: actor.id,
            telegramMutedUntil:
              semanticCommand.durationMinutes === null
                ? null
                : new Date(
                    now.getTime() +
                      Number(semanticCommand.durationMinutes) * 60000,
                  ).toISOString(),
          };
        }
        return this.request(
          tenantId,
          actorUserId,
          actor,
          sourceIntentRef,
          operation,
          targetRef,
          generation,
          current,
          desired,
          {
            configJson: desired,
            semanticCommand,
            callerId,
            workItemId: null,
            workItemKind: null,
            assigneeUserId: null,
            createdByUserId: null,
            title: null,
            bodyText: null,
            dueAt: null,
            expectedStatus: null,
            deliveryProjectionRequired: false,
          },
          'execute',
        );
      },
      { readOnly: true },
    );
  }
  private governedRules(value: unknown): Array<{ id: unknown; text: unknown }> {
    return value &&
      typeof value === 'object' &&
      'rules' in value &&
      Array.isArray(value.rules)
      ? (value.rules as Array<{ id: unknown; text: unknown }>)
      : [];
  }

  async planAssistant(
    tenantId: string,
    actorUserId: string,
    command: AssistantPreferenceCommand,
  ) {
    return this.plan(
      await this.buildAssistant(tenantId, actorUserId, command, 'shadow'),
    );
  }

  async planFinance(
    tenantId: string,
    actorUserId: string,
    command: FinancePreferenceCommand,
  ) {
    return this.plan(
      await this.buildFinance(tenantId, actorUserId, command, 'shadow'),
    );
  }

  async planAppointmentNotifications(
    tenantId: string,
    actorUserId: string,
    command: AppointmentNotificationCommand,
  ) {
    return this.plan(
      await this.buildAppointmentNotifications(
        tenantId,
        actorUserId,
        command,
        'shadow',
      ),
    );
  }

  async planTaskCreate(
    tenantId: string,
    actorUserId: string,
    command: CreateWorkItemCommand,
  ) {
    return this.plan(
      await this.buildTaskCreate(tenantId, actorUserId, command, 'shadow'),
    );
  }

  async planTaskComplete(
    tenantId: string,
    actorUserId: string,
    command: CompleteWorkItemCommand,
  ) {
    return this.plan(
      await this.buildTaskComplete(tenantId, actorUserId, command, 'shadow'),
    );
  }

  async planAdministratorContact(
    tenantId: string,
    actorUserId: string,
    command: AdministratorContactCommand,
  ) {
    return this.plan(
      await this.buildAdministratorContact(
        tenantId,
        actorUserId,
        command,
        'shadow',
      ),
    );
  }

  async buildAssistant(
    tenantId: string,
    actorUserId: string,
    command: AssistantPreferenceCommand,
    mode: Mode,
  ) {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId, TEAM_ROLES);
    const enabled = [...new Set(command.enabledCapabilities)].sort();
    if (
      enabled.some(
        (value) =>
          !ASSISTANT_CAPABILITIES.includes(value as AssistantCapability),
      )
    ) {
      throw new BadRequestException('Assistant capability is not allowlisted');
    }
    const config = { schema_version: 1, enabled_capabilities: enabled };
    const current = await this.assistantState(scoped, actorUserId);
    return this.settingRequest(
      scoped,
      actorUserId,
      actor,
      command.sourceIntentRef,
      'assistant_preferences',
      `dashboard-preference:${actorUserId}:assistant`,
      current,
      config,
      mode,
    );
  }

  async buildFinance(
    tenantId: string,
    actorUserId: string,
    command: FinancePreferenceCommand,
    mode: Mode,
  ) {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId, BUSINESS_ROLES);
    const widgets = [...new Set(command.enabledWidgets)].sort();
    if (
      widgets.some(
        (value) =>
          !FINANCE_DASHBOARD_WIDGETS.includes(value as FinanceDashboardWidget),
      )
    ) {
      throw new BadRequestException('Finance widget is not allowlisted');
    }
    const monthly = this.moneyTarget(command.monthlyTargetRub);
    const staffTargets: Record<string, number> = {};
    for (const [staffId, target] of Object.entries(
      command.staffTargetsRub,
    ).sort()) {
      if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(staffId)) {
        throw new BadRequestException(
          'Finance target staff identity is invalid',
        );
      }
      staffTargets[staffId] = this.moneyTarget(target) as number;
    }
    const config = {
      schema_version: 1,
      enabled_widgets: widgets,
      monthly_target_rub: monthly,
      staff_targets_rub: staffTargets,
    };
    const current = await this.financeState(scoped, actorUserId);
    return this.settingRequest(
      scoped,
      actorUserId,
      actor,
      command.sourceIntentRef,
      'finance_preferences',
      `dashboard-preference:${actorUserId}:finance`,
      current,
      config,
      mode,
    );
  }

  async buildAppointmentNotifications(
    tenantId: string,
    actorUserId: string,
    command: AppointmentNotificationCommand,
    mode: Mode,
  ) {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId, SETTINGS_MANAGERS);
    const leadTimes = [...new Set(command.leadTimesMinutes)].sort(
      (left, right) => right - left,
    );
    if (
      leadTimes.length < 1 ||
      leadTimes.length > MAX_LEAD_TIMES ||
      leadTimes.some(
        (value) =>
          !Number.isInteger(value) ||
          value < MIN_LEAD_MINUTES ||
          value > MAX_LEAD_MINUTES,
      )
    ) {
      throw new BadRequestException(
        'Appointment lead times are outside policy',
      );
    }
    const config = { enabled: command.enabled, lead_times_minutes: leadTimes };
    const current = await this.appointmentState(scoped);
    return this.settingRequest(
      scoped,
      actorUserId,
      actor,
      command.sourceIntentRef,
      'appointment_notifications',
      `appointment-notification-setting:${scoped}`,
      current,
      config,
      mode,
    );
  }

  async buildTaskCreate(
    tenantId: string,
    actorUserId: string,
    command: CreateWorkItemCommand,
    mode: Mode,
  ) {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId, BUSINESS_ROLES);
    await this.actor(scoped, command.assigneeUserId, TEAM_ROLES);
    return this.workCreateRequest(
      scoped,
      actorUserId,
      actor,
      command.sourceIntentRef,
      'create_task',
      'task',
      command.assigneeUserId,
      command.title,
      command.bodyText,
      command.dueAt ?? null,
      mode,
    );
  }

  async buildAdministratorContact(
    tenantId: string,
    actorUserId: string,
    command: AdministratorContactCommand,
    mode: Mode,
  ) {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId, CLIENT_ROLES);
    const assignee = await this.primaryAdministrator(scoped);
    return this.workCreateRequest(
      scoped,
      actorUserId,
      actor,
      command.sourceIntentRef,
      'request_admin_contact',
      'support_request',
      assignee.userId,
      'Клиент просит связаться',
      command.reason,
      null,
      mode,
    );
  }

  async buildTaskComplete(
    tenantId: string,
    actorUserId: string,
    command: CompleteWorkItemCommand,
    mode: Mode,
  ) {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId, TEAM_ROLES);
    const workItem = await this.prisma.operationalWorkItem.findUnique({
      where: { id_tenantId: { id: command.workItemId, tenantId: scoped } },
    });
    if (!workItem)
      throw new NotFoundException('Operational work item not found');
    if (
      workItem.kind !== 'task' ||
      !['OPEN', 'COMPLETED'].includes(workItem.status)
    ) {
      throw new BadRequestException('Operational task is not completable');
    }
    if (workItem.assigneeUserId !== actorUserId) {
      throw new ForbiddenException(
        'Only the exact assignee may complete the task',
      );
    }
    const nextGeneration = await this.nextGeneration(
      scoped,
      'operational_work_item',
      workItem.id,
    );
    const generation =
      workItem.status === 'COMPLETED' ? nextGeneration - 1 : nextGeneration;
    if (generation !== 1)
      throw new BadRequestException('Task generation is not completable');
    if (workItem.status === 'COMPLETED') {
      const prior = workItem.completeActionExecutionId
        ? await this.prisma.actionExecution.findUnique({
            where: {
              id_tenantId: {
                id: workItem.completeActionExecutionId,
                tenantId: scoped,
              },
            },
            select: { sourceRef: true, actionClass: true },
          })
        : null;
      if (
        !prior ||
        prior.actionClass !== 'complete_operational_task' ||
        prior.sourceRef !== `p5w1:${this.sourceHash(command.sourceIntentRef)}`
      ) {
        throw new BadRequestException('Operational task is already completed');
      }
    }
    const before = this.workItemState(workItem, 'OPEN');
    const after = this.workItemState(workItem, 'COMPLETED');
    return this.request(
      scoped,
      actorUserId,
      actor,
      command.sourceIntentRef,
      'complete_task',
      workItem.id,
      generation,
      before,
      after,
      {
        configJson: null,
        workItemId: workItem.id,
        workItemKind: 'task',
        assigneeUserId: workItem.assigneeUserId,
        createdByUserId: workItem.createdByUserId ?? actorUserId,
        title: workItem.title,
        bodyText: workItem.bodyText,
        dueAt: workItem.dueAt?.toISOString() ?? null,
        expectedStatus: 'OPEN',
        deliveryProjectionRequired: true,
      },
      mode,
    );
  }

  private async plan(
    request: TrustedActionExecutionRequestV1,
  ): Promise<Package5Wave1ShadowResult> {
    const execution = await this.actionEngine.planShadow(request);
    return {
      actionClass: execution.actionClass as Package5Wave1ActionClass,
      actionExecutionId: execution.id,
      outcome: 'planned',
      shadowDivergences: 0,
      settingMutations: 0,
      workItemMutations: 0,
      inboxMessages: 0,
      providerWrites: 0,
    };
  }

  private async settingRequest(
    tenantId: string,
    actorUserId: string,
    actor: { id: string; role: string },
    sourceIntentRef: string,
    operation: Extract<
      Package5Wave1Operation,
      | 'assistant_preferences'
      | 'finance_preferences'
      | 'appointment_notifications'
    >,
    targetRef: string,
    current: Record<string, unknown>,
    desired: Record<string, unknown>,
    mode: Mode,
  ) {
    const generation = await this.nextGeneration(
      tenantId,
      'setting',
      targetRef,
    );
    return this.request(
      tenantId,
      actorUserId,
      actor,
      sourceIntentRef,
      operation,
      targetRef,
      generation,
      current,
      desired,
      {
        configJson: desired,
        workItemId: null,
        workItemKind: null,
        assigneeUserId: null,
        createdByUserId: null,
        title: null,
        bodyText: null,
        dueAt: null,
        expectedStatus: null,
        deliveryProjectionRequired: false,
      },
      mode,
    );
  }

  private async workCreateRequest(
    tenantId: string,
    actorUserId: string,
    actor: { id: string; role: string },
    sourceIntentRef: string,
    operation: 'create_task' | 'request_admin_contact',
    kind: 'task' | 'support_request',
    assigneeUserId: string,
    titleValue: string,
    bodyValue: string,
    dueAt: Date | null,
    mode: Mode,
  ) {
    const title = this.bounded(titleValue, 160, 'title');
    const bodyText = this.bounded(bodyValue, 4000, 'body');
    const sourceHash = this.sourceHash(sourceIntentRef);
    const workItemId = `p5wi_${package5Wave1Hash({ tenantId, operation, actorUserId, sourceHash }).slice(0, 40)}`;
    const existing = await this.prisma.operationalWorkItem.findUnique({
      where: { id_tenantId: { id: workItemId, tenantId } },
      include: {
        createExecution: { select: { sourceRef: true, actionClass: true } },
      },
    });
    if (
      existing &&
      (existing.kind !== kind ||
        existing.assigneeUserId !== assigneeUserId ||
        existing.createdByUserId !== actorUserId ||
        existing.title !== title ||
        existing.bodyText !== bodyText ||
        existing.dueAt?.toISOString() !== (dueAt?.toISOString() ?? undefined) ||
        existing.createExecution.sourceRef !== `p5w1:${sourceHash}` ||
        existing.createExecution.actionClass !==
          (operation === 'create_task'
            ? 'create_operational_task'
            : 'request_administrator_contact'))
    ) {
      throw new BadRequestException('Logical work item identity conflicts');
    }
    const after = {
      contract: 'package5.operational-work-item-state/1',
      id: workItemId,
      kind,
      assigneeUserId,
      createdByUserId: actorUserId,
      title,
      bodyText,
      dueAt: dueAt?.toISOString() ?? null,
      status: 'OPEN',
    };
    return this.request(
      tenantId,
      actorUserId,
      actor,
      sourceIntentRef,
      operation,
      workItemId,
      0,
      null,
      after,
      {
        configJson: null,
        workItemId,
        workItemKind: kind,
        assigneeUserId,
        createdByUserId: actorUserId,
        title,
        bodyText,
        dueAt: dueAt?.toISOString() ?? null,
        expectedStatus: null,
        deliveryProjectionRequired: true,
      },
      mode,
    );
  }

  private request(
    tenantId: string,
    actorUserId: string,
    actor: { id: string; role: string },
    sourceIntentRef: string,
    operation: Package5Wave1Operation,
    targetRef: string,
    generation: number,
    before: unknown,
    after: unknown,
    specific: Record<string, unknown>,
    mode: Mode,
  ): TrustedActionExecutionRequestV1 {
    const registration = PACKAGE5_WAVE1_REGISTRATIONS.find(
      (candidate) => candidate.operation === operation,
    );
    if (!registration)
      throw new BadRequestException('Wave 1 operation is not registered');
    const beforeStateHash = before === null ? null : package5Wave1Hash(before);
    const afterStateHash = package5Wave1Hash(after);
    const noOp = beforeStateHash === afterStateHash;
    const mutationKey = `g${generation}:${operation}`;
    const policySnapshotHash = package5Wave1Hash({
      contract: PACKAGE5_WAVE1_POLICY_VERSION,
      tenantId,
      operation,
      targetRef,
      generation,
      actorMembershipId: actor.id,
      actorRole: actor.role,
      oneTargetCount: 1,
      bulkMutation: false,
    });
    const sourceRef = `p5w1:${this.sourceHash(sourceIntentRef)}`;
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId,
      capability:
        mode === 'shadow'
          ? registration.shadowCapability
          : registration.executableCapability,
      source: {
        type: mode === 'shadow' ? 'synthetic_shadow' : 'authenticated_request',
        occurrenceScope: `package5-wave1:${operation}:${targetRef}:g${generation}`,
        sourceRef,
        actorUserId,
      },
      targetRef,
      input: {
        operation,
        targetKind: registration.targetKind,
        targetRef,
        mutationKey,
        targetGeneration: generation,
        beforeStateHash,
        afterStateHash,
        noOp,
        actorMembershipId: actor.id,
        actorRole: actor.role,
        policyVersion: PACKAGE5_WAVE1_POLICY_VERSION,
        policySnapshotHash,
        approvalRequirement: 'SERVER_DERIVED_AUTHORITY',
        oneTargetCount: 1,
        bulkMutation: false,
        intendedMutation: operation,
        mutationPerformed: false,
        ...specific,
      },
      evidenceRefs: [`package5-wave1-policy:${policySnapshotHash}`],
      callerIdempotency: {
        scope: `package5.wave1.${mode}.${operation}`,
        key: sourceRef,
      },
    };
  }

  private async actor(
    tenantId: string,
    userId: string,
    roles?: ReadonlySet<string>,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { id: true, userId: true, role: true, status: true },
    });
    if (!membership || membership.status !== 'active') {
      throw new ForbiddenException('Active tenant membership is required');
    }
    if (roles && !roles.has(membership.role)) {
      throw new ForbiddenException(
        'Actor role cannot change this tenant setting',
      );
    }
    return {
      id: membership.id,
      userId: membership.userId,
      role: membership.role,
    };
  }

  private async primaryAdministrator(tenantId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: 'active',
        role: { in: [...SUPPORT_ROLE_PRIORITY] },
      },
      select: { userId: true, role: true },
    });
    const rank = new Map(
      SUPPORT_ROLE_PRIORITY.map((role, index) => [role, index]),
    );
    memberships.sort(
      (left, right) =>
        (rank.get(left.role as (typeof SUPPORT_ROLE_PRIORITY)[number]) ?? 99) -
          (rank.get(right.role as (typeof SUPPORT_ROLE_PRIORITY)[number]) ??
            99) || left.userId.localeCompare(right.userId),
    );
    if (!memberships[0])
      throw new NotFoundException('Active administrator is not configured');
    return memberships[0];
  }

  private async nextGeneration(
    tenantId: string,
    targetKind: string,
    targetRef: string,
  ) {
    const latest = await this.prisma.actionTargetMutation.findFirst({
      where: { tenantId, targetKind, targetRef },
      orderBy: { targetGeneration: 'desc' },
      select: { targetGeneration: true },
    });
    return (latest?.targetGeneration ?? -1) + 1;
  }

  private async assistantState(tenantId: string, userId: string) {
    const row = await this.prisma.dashboardPreference.findUnique({
      where: {
        userId_tenantId_section: { tenantId, userId, section: 'assistant' },
      },
      select: { configJson: true },
    });
    if (
      row?.configJson &&
      typeof row.configJson === 'object' &&
      !Array.isArray(row.configJson)
    ) {
      return canonicalJson(row.configJson) as Record<string, unknown>;
    }
    return {
      schema_version: 1,
      enabled_capabilities: [...DEFAULT_ASSISTANT_CAPABILITIES].sort(),
    };
  }

  private async financeState(tenantId: string, userId: string) {
    const row = await this.prisma.dashboardPreference.findUnique({
      where: {
        userId_tenantId_section: { tenantId, userId, section: 'finance' },
      },
      select: { configJson: true },
    });
    if (
      row?.configJson &&
      typeof row.configJson === 'object' &&
      !Array.isArray(row.configJson)
    ) {
      return canonicalJson(row.configJson) as Record<string, unknown>;
    }
    return {
      schema_version: 1,
      enabled_widgets: [...DEFAULT_FINANCE_DASHBOARD_WIDGETS].sort(),
      monthly_target_rub: null,
      staff_targets_rub: {},
    };
  }

  private async appointmentState(tenantId: string) {
    const row = await this.prisma.appointmentNotificationSetting.findUnique({
      where: { tenantId },
      select: { enabled: true, leadTimesMinutes: true },
    });
    const storedLeadTimes = Array.isArray(row?.leadTimesMinutes)
      ? row.leadTimesMinutes.filter((value): value is number =>
          Number.isInteger(value),
        )
      : [1440, 120];
    return {
      enabled: row?.enabled ?? true,
      lead_times_minutes: [...storedLeadTimes].sort((a, b) => b - a),
    };
  }

  private workItemState(
    row: {
      id: string;
      kind: string;
      assigneeUserId: string;
      createdByUserId: string | null;
      title: string;
      bodyText: string;
      dueAt: Date | null;
    },
    status: 'OPEN' | 'COMPLETED',
  ) {
    return {
      contract: 'package5.operational-work-item-state/1',
      id: row.id,
      kind: row.kind,
      assigneeUserId: row.assigneeUserId,
      createdByUserId: row.createdByUserId,
      title: row.title,
      bodyText: row.bodyText,
      dueAt: row.dueAt?.toISOString() ?? null,
      status,
    };
  }

  private moneyTarget(value: number | null): number | null {
    if (value === null) return null;
    if (!Number.isFinite(value) || value < 0 || value > 100_000_000) {
      throw new BadRequestException('Finance target is outside policy');
    }
    return Math.round(value * 100) / 100;
  }

  private sourceHash(value: string) {
    return package5Wave1Hash({
      sourceIntentRef: this.bounded(value, 240, 'sourceIntentRef'),
    });
  }

  private bounded(value: string, max: number, field: string) {
    const normalized = value.trim();
    if (!normalized || normalized.length > max) {
      throw new BadRequestException(`${field} is missing or too long`);
    }
    return normalized;
  }
}

export class Package5Wave1ExecutableService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly now: () => Date = () => new Date(),
    private readonly governed?: GovernedSettingsReadService,
  ) {}

  async execute(
    request: TrustedActionExecutionRequestV1,
  ): Promise<Package5Wave1ExecutionValue> {
    const registration = PACKAGE5_WAVE1_REGISTRATIONS.find(
      (candidate) => candidate.executableCapability === request.capability,
    );
    if (!registration)
      throw new Package5Wave1Error('Wave 1 capability is not executable');
    const execution = await this.ingress.createExecution(request);
    return this.executeCanonical(execution, registration);
  }

  async resume(
    tenantId: string,
    executionId: string,
  ): Promise<Package5Wave1ExecutionValue> {
    const execution = await this.prisma.actionExecution.findUniqueOrThrow({
      where: { id_tenantId: { id: executionId, tenantId } },
    });
    await attachExistingInvocationReceipt(execution);
    const registration = PACKAGE5_WAVE1_REGISTRATIONS.find(
      (candidate) => candidate.executableCapability === execution.capability,
    );
    if (!registration) {
      throw new Package5Wave1Error('Existing execution is not a Wave 1 action');
    }
    return this.executeCanonical(execution, registration);
  }

  private async executeCanonical(
    execution: ActionExecution,
    registration: (typeof PACKAGE5_WAVE1_REGISTRATIONS)[number],
  ): Promise<Package5Wave1ExecutionValue> {
    if (execution.state === ActionExecutionState.SUCCEEDED)
      return this.restore(execution);
    if (execution.state !== ActionExecutionState.READY) {
      throw new Package5Wave1Error(
        `Execution cannot run from ${execution.state}`,
      );
    }
    const input = await this.kernel.readTrustedNormalizedInput(
      execution.tenantId,
      execution.id,
    );
    const lockTargetKind = this.text(input.targetKind);
    const lockTargetRef = this.text(input.targetRef);
    return this.serializable(async (tx) => {
      if (
        input.operation === 'tenant_business_configuration' ||
        input.operation === 'staff_notification_preferences'
      )
        await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${execution.tenantId}:p5-wave1:${lockTargetKind}:${lockTargetRef}`}, 0))`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "ActionExecution" WHERE id = ${execution.id} AND "tenantId" = ${execution.tenantId} FOR UPDATE`,
      );
      const locked = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: execution.id, tenantId: execution.tenantId },
        },
      });
      if (locked.state === ActionExecutionState.SUCCEEDED)
        return this.restore(locked);
      this.assertExecutable(locked, registration.actionClass);
      await this.assertActor(tx, locked, input);
      const attemptId = await this.begin(tx, locked, input);
      const value =
        registration.targetKind === 'setting'
          ? await this.mutateSetting(tx, locked, input)
          : await this.mutateWorkItem(tx, locked, input);
      await this.finalize(tx, locked, attemptId, value);
      return value;
    });
  }

  private async mutateSetting(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    const operation = this.text(input.operation) as Package5Wave1Operation;
    const config = this.record(input.configJson);
    const current = await this.currentSetting(
      tx,
      execution.tenantId,
      execution.actorUserId!,
      operation,
      input,
    );
    if (package5Wave1Hash(current) !== input.beforeStateHash) {
      if (
        operation === 'tenant_business_configuration' ||
        operation === 'staff_notification_preferences'
      )
        throw new ConflictException('STALE_CONFIGURATION_REVISION');
      throw new Package5Wave1Error(
        'Setting state changed after canonical planning',
      );
    }
    const isGoverned =
      operation === 'tenant_business_configuration' ||
      operation === 'staff_notification_preferences';
    if (isGoverned) {
      validateGovernedNormalizedInput(operation, input);
      const support = this.governed;
      if (!support)
        throw new Package5Wave1Error('Governed A22 support unavailable');
      const member = await support.actor(
        tx,
        execution.tenantId,
        execution.actorUserId!,
      );
      if (member.id !== input.actorMembershipId)
        throw new ForbiddenException('Admitted membership was replaced');
      if (operation === 'tenant_business_configuration') {
        if (!GOVERNED_OWNER_ROLES.has(member.role))
          throw new ForbiddenException('Current owner required');
        if (config.namespace === 'staff_ai_provider')
          support.providerAvailable(this.record(config.content).provider);
      } else if (
        !GOVERNED_STAFF_ROLES.has(member.role) ||
        input.targetRef !== `staff-notifications:${execution.actorUserId}` ||
        config.membershipId !== member.id
      )
        throw new ForbiddenException('Personal preference target mismatch');
      const latest = await tx.actionTargetMutation.findFirst({
        where: {
          tenantId: execution.tenantId,
          targetKind: 'setting',
          targetRef: this.text(input.targetRef),
        },
        orderBy: { targetGeneration: 'desc' },
      });
      if ((latest?.targetGeneration ?? -1) + 1 !== input.targetGeneration)
        throw new ConflictException('STALE_CONFIGURATION_GENERATION');
    }
    const noOp = input.noOp === true;
    if (!noOp) {
      if (operation === 'tenant_business_configuration') {
        const namespace = governedNamespace(config.namespace);
        const content = governedConfigurationContent(namespace, config.content);
        if (namespace === 'c8_valuation')
          await c8PolicyScope(tx, execution.tenantId, content);
        await tx.tenantBusinessConfigurationRevision.create({
          data: {
            id: randomUUID(),
            tenantId: execution.tenantId,
            namespace,
            revision: Number(config.revision),
            previousRevisionId:
              config.previousRevisionId === null
                ? null
                : this.text(config.previousRevisionId),
            actionExecutionId: execution.id,
            actorUserId: execution.actorUserId!,
            actorMembershipId: this.text(input.actorMembershipId),
            contractVersion: 1,
            contentHash: governedHash(
              `maya.tenant-configuration-content/1/${namespace}`,
              content,
            ),
            encryptedContent: this.governed!.encrypt(content),
            createdAt: this.now(),
          },
        });
      } else if (operation === 'staff_notification_preferences') {
        await tx.dashboardPreference.upsert({
          where: {
            userId_tenantId_section: {
              tenantId: execution.tenantId,
              userId: execution.actorUserId!,
              section: 'staff_notifications',
            },
          },
          create: {
            tenantId: execution.tenantId,
            userId: execution.actorUserId!,
            section: 'staff_notifications',
            configJson: config as Prisma.InputJsonValue,
          },
          update: { configJson: config as Prisma.InputJsonValue },
        });
      } else if (
        operation === 'assistant_preferences' ||
        operation === 'finance_preferences'
      ) {
        const section =
          operation === 'assistant_preferences' ? 'assistant' : 'finance';
        await tx.dashboardPreference.upsert({
          where: {
            userId_tenantId_section: {
              userId: execution.actorUserId!,
              tenantId: execution.tenantId,
              section,
            },
          },
          create: {
            userId: execution.actorUserId!,
            tenantId: execution.tenantId,
            section,
            configJson: config as Prisma.InputJsonValue,
          },
          update: { configJson: config as Prisma.InputJsonValue },
        });
      } else if (operation === 'appointment_notifications') {
        await tx.appointmentNotificationSetting.upsert({
          where: { tenantId: execution.tenantId },
          create: {
            tenantId: execution.tenantId,
            enabled: config.enabled === true,
            leadTimesMinutes: this.numberArray(config.lead_times_minutes),
          },
          update: {
            enabled: config.enabled === true,
            leadTimesMinutes: this.numberArray(config.lead_times_minutes),
          },
        });
      } else {
        throw new Package5Wave1Error('Setting operation is invalid');
      }
      await this.recordMutation(tx, execution, input);
    }
    return this.value(execution, input, noOp ? 0 : 1, 0, false);
  }

  private async mutateWorkItem(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    const operation = this.text(input.operation);
    const workItemId = this.text(input.workItemId);
    if (operation === 'create_task' || operation === 'request_admin_contact') {
      await tx.operationalWorkItem.create({
        data: {
          id: workItemId,
          tenantId: execution.tenantId,
          kind: this.text(input.workItemKind),
          assigneeUserId: this.text(input.assigneeUserId),
          createdByUserId: this.text(input.createdByUserId),
          title: this.text(input.title),
          bodyText: this.text(input.bodyText),
          dueAt: input.dueAt === null ? null : new Date(this.text(input.dueAt)),
          status: 'OPEN',
          createActionExecutionId: execution.id,
        },
      });
      await this.recordMutation(tx, execution, input);
    } else if (operation === 'complete_task') {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "OperationalWorkItem" WHERE id = ${workItemId} AND "tenantId" = ${execution.tenantId} FOR UPDATE`,
      );
      if (rows.length !== 1)
        throw new Package5Wave1Error('Exact work item is absent');
      const current = await tx.operationalWorkItem.findUniqueOrThrow({
        where: {
          id_tenantId: { id: workItemId, tenantId: execution.tenantId },
        },
      });
      if (
        current.status !== 'OPEN' ||
        current.kind !== 'task' ||
        current.assigneeUserId !== execution.actorUserId ||
        package5Wave1Hash({
          contract: 'package5.operational-work-item-state/1',
          id: current.id,
          kind: current.kind,
          assigneeUserId: current.assigneeUserId,
          createdByUserId: current.createdByUserId,
          title: current.title,
          bodyText: current.bodyText,
          dueAt: current.dueAt?.toISOString() ?? null,
          status: 'OPEN',
        }) !== input.beforeStateHash
      ) {
        throw new Package5Wave1Error(
          'Task completion claim no longer matches OPEN state',
        );
      }
      await tx.operationalWorkItem.update({
        where: {
          id_tenantId: { id: workItemId, tenantId: execution.tenantId },
        },
        data: {
          status: 'COMPLETED',
          completeActionExecutionId: execution.id,
          completedAt: this.now(),
        },
      });
      await this.recordMutation(tx, execution, input);
    } else {
      throw new Package5Wave1Error('Work-item operation is invalid');
    }
    return this.value(execution, input, 0, 1, true);
  }

  private async currentSetting(
    tx: Tx,
    tenantId: string,
    userId: string,
    operation: Package5Wave1Operation,
    input?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (
      operation === 'tenant_business_configuration' ||
      operation === 'staff_notification_preferences'
    ) {
      if (!this.governed)
        throw new Package5Wave1Error('Governed A22 support unavailable');
      return operation === 'tenant_business_configuration'
        ? this.governed.configuration(
            tx,
            tenantId,
            governedNamespace(this.record(input?.configJson).namespace),
          )
        : this.governed.personal(tx, tenantId, userId);
    }
    if (
      operation === 'assistant_preferences' ||
      operation === 'finance_preferences'
    ) {
      const section =
        operation === 'assistant_preferences' ? 'assistant' : 'finance';
      const row = await tx.dashboardPreference.findUnique({
        where: { userId_tenantId_section: { tenantId, userId, section } },
        select: { configJson: true },
      });
      if (
        row?.configJson &&
        typeof row.configJson === 'object' &&
        !Array.isArray(row.configJson)
      ) {
        return canonicalJson(row.configJson) as Record<string, unknown>;
      }
      return operation === 'assistant_preferences'
        ? {
            schema_version: 1,
            enabled_capabilities: [...DEFAULT_ASSISTANT_CAPABILITIES].sort(),
          }
        : {
            schema_version: 1,
            enabled_widgets: [...DEFAULT_FINANCE_DASHBOARD_WIDGETS].sort(),
            monthly_target_rub: null,
            staff_targets_rub: {},
          };
    }
    if (operation === 'appointment_notifications') {
      const row = await tx.appointmentNotificationSetting.findUnique({
        where: { tenantId },
        select: { enabled: true, leadTimesMinutes: true },
      });
      const storedLeadTimes = Array.isArray(row?.leadTimesMinutes)
        ? row.leadTimesMinutes.filter((value): value is number =>
            Number.isInteger(value),
          )
        : [1440, 120];
      return {
        enabled: row?.enabled ?? true,
        lead_times_minutes: [...storedLeadTimes].sort((a, b) => b - a),
      };
    }
    throw new Package5Wave1Error('Setting operation is invalid');
  }

  private async recordMutation(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    await tx.actionTargetMutation.create({
      data: {
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
        mutationKey: this.text(input.mutationKey),
        targetKind: this.text(input.targetKind),
        targetRef: this.text(input.targetRef),
        mutationKind: this.text(input.operation),
        targetGeneration: this.integer(input.targetGeneration),
        beforeStateHash:
          input.beforeStateHash === null
            ? null
            : this.text(input.beforeStateHash),
        afterStateHash: this.text(input.afterStateHash),
      },
    });
  }

  private async assertActor(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    if (!execution.actorUserId)
      throw new Package5Wave1Error('Actor is required');
    const membership = await tx.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: execution.actorUserId,
          tenantId: execution.tenantId,
        },
      },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.id !== input.actorMembershipId ||
      membership.role !== input.actorRole
    ) {
      throw new Package5Wave1Error('Actor authority changed after planning');
    }
  }

  private assertExecutable(
    execution: ActionExecution,
    actionClass: Package5Wave1ActionClass,
  ) {
    if (
      execution.state !== ActionExecutionState.READY ||
      execution.policyDecision !== ActionPolicyDecision.ALLOW ||
      execution.dryRun ||
      execution.actionClass !== actionClass ||
      !execution.capability.endsWith('.execute.v1')
    ) {
      throw new Package5Wave1Error(
        'Execution is not a canonical Wave 1 local action',
      );
    }
  }

  private async begin(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    let rcScope = RC_DURABLE_COMMANDS.has(execution.capability);
    if (
      execution.capability === 'package5.settings.assistant.execute.v1' &&
      execution.actorUserId
    ) {
      const preference = await tx.dashboardPreference.findUnique({
        where: {
          userId_tenantId_section: {
            tenantId: execution.tenantId,
            userId: execution.actorUserId,
            section: 'assistant',
          },
        },
      });
      const before = preference?.configJson ?? {
        schema_version: 1,
        enabled_capabilities: [...DEFAULT_ASSISTANT_CAPABILITIES].sort(),
      };
      rcScope = expenseReminderPreferenceTransition(before, input.configJson);
    }
    if (rcScope) {
      // Approved R11 / exact R13 preference commands reuse the canonical claim,
      // fresh policy and transactional audit; other Wave 1 lifetimes are intact.
      const claim = await this.kernel.claimExecution(
        {
          tenantId: execution.tenantId,
          executionId: execution.id,
          workerId: 'package5.wave1.local-command',
        },
        tx,
      );
      return claim.attempt.id;
    }
    const now = this.now();
    const attemptId = randomUUID();
    const attemptNumber = execution.executionAttemptCount + 1;
    await tx.actionAttempt.create({
      data: {
        id: attemptId,
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
        attemptNumber,
        kind: ActionAttemptKind.EXECUTION,
        state: ActionAttemptState.STARTED,
        executorKey: 'package5.wave1.local-command',
        executorVersion: 1,
        externalDispatchState: ExternalDispatchState.NOT_CROSSED,
        reconciliationRequired: false,
        startedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.EXECUTING,
        executionAttemptCount: attemptNumber,
        firstAttemptedAt: execution.firstAttemptedAt ?? now,
        leaseOwner: `package5-wave1-local:${execution.id}`,
        leaseTokenHash: `local-transaction:${execution.id}`,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        revision: { increment: 1 },
      },
    });
    return attemptId;
  }

  private async finalize(
    tx: Tx,
    execution: ActionExecution,
    attemptId: string,
    value: Package5Wave1ExecutionValue,
  ) {
    const now = this.now();
    const safe = value as unknown as Prisma.InputJsonValue;
    await tx.actionAttempt.update({
      where: { id_tenantId: { id: attemptId, tenantId: execution.tenantId } },
      data: {
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode: 'local_transaction_committed',
        safeResultJson: safe,
        reconciliationRequired: false,
        finishedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.SUCCEEDED,
        finalOutcomeCode: 'local_transaction_committed',
        safeResultSummaryJson: safe,
        finalizedAt: now,
        reconciliationState: 'NOT_REQUIRED',
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        revision: { increment: 1 },
      },
    });
  }

  private value(
    execution: ActionExecution,
    input: Record<string, unknown>,
    settingMutations: 0 | 1,
    workItemMutations: 0 | 1,
    deliveryProjectionRequired: boolean,
  ): Package5Wave1ExecutionValue {
    return {
      ...([
        'tenant_business_configuration',
        'staff_notification_preferences',
      ].includes(String(input.operation))
        ? {
            governedCommandHash: governedHash(
              'maya.governed-command/1',
              input.semanticCommand,
            ),
          }
        : {}),
      actionClass: execution.actionClass as Package5Wave1ActionClass,
      actionExecutionId: execution.id,
      targetRef: this.text(input.targetRef),
      targetGeneration: this.integer(input.targetGeneration),
      noOp: input.noOp === true,
      settingMutations,
      workItemMutations,
      deliveryProjectionRequired,
      unknownApplicable: false,
      providerWrites: 0,
    };
  }

  private restore(execution: ActionExecution): Package5Wave1ExecutionValue {
    return this.record(
      execution.safeResultSummaryJson,
    ) as unknown as Package5Wave1ExecutionValue;
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (isPostgresSerializationConflict(error) && attempt < 3) continue;
        throw error;
      }
    }
    throw new Package5Wave1Error('Wave 1 transaction could not serialize');
  }

  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Package5Wave1Error('Canonical Wave 1 object is missing');
    }
    return value as Record<string, unknown>;
  }

  private text(value: unknown): string {
    if (typeof value !== 'string' || !value) {
      throw new Package5Wave1Error('Canonical Wave 1 string is missing');
    }
    return value;
  }

  private integer(value: unknown): number {
    if (!Number.isSafeInteger(value)) {
      throw new Package5Wave1Error('Canonical Wave 1 integer is missing');
    }
    return value as number;
  }

  private numberArray(value: unknown): number[] {
    if (
      !Array.isArray(value) ||
      value.some((item) => !Number.isInteger(item))
    ) {
      throw new Package5Wave1Error('Canonical lead-time array is missing');
    }
    return value as number[];
  }
}
