import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Membership } from '@prisma/client';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  CanonicalActionIngressService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { ActionIdentityService } from '../action-engine/action-engine.identity';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { OwnerReportStore } from '../owner-reports/owner-report.store';
import {
  CommunicationDeliveryService,
  type Package2InboxType,
} from '../communication-delivery';
const ADMINS = [
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
] as const;
const EVENTS: Record<string, { type: Package2InboxType; title: string }> = {
  'appointment.created': { type: 'new_appointment', title: 'Новая запись' },
  'appointment.removed': { type: 'appointment_deleted', title: 'Запись снята' },
  'appointment.rescheduled': {
    type: 'appointment_rescheduled',
    title: 'Запись перенесена',
  },
  'appointment.staff_changed': {
    type: 'appointment_reassigned',
    title: 'Смена сотрудника в записи',
  },
  'appointment.services_changed': {
    type: 'owner_alert',
    title: 'Услуги записи изменены',
  },
};
type Source = {
  kind: 'work' | 'appointment_event' | 'appointment_execution';
  id: string;
  hash: string;
  appointmentId?: string;
  branchId?: string;
  staffIds: string[];
  type: Package2InboxType;
  title: string;
  bodyText: string;
  payload: Record<string, unknown>;
  deepLink: string;
  expiresAt: string;
  assigneeUserId?: string;
};
type Plan = {
  contract: 'maya.canonical-inbox-projection/1';
  source: Source;
  userId: string;
  membershipId: string;
  role: string;
  branchScope: string;
  devices: Array<{ id: string; token: string }>;
};
/** Only projects a committed existing owner. It cannot change WorkItem/Appointment/Event. */
@Injectable()
export class CanonicalInboxProjectionService {
  private readonly identity: ActionIdentityService;
  private readonly cutoverAt: number;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly delivery: CommunicationDeliveryService,
    private readonly bindings: OwnerReportStore,
    config: ConfigService,
  ) {
    this.identity = new ActionIdentityService(
      config.get<string>('ACTION_ENGINE_IDENTITY_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
      config.get<string>('ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
    );
    this.cutoverAt = Date.parse(
      config.get<string>('CANONICAL_INBOX_PROJECTION_CUTOVER_AT') ?? '',
    );
  }
  private async source(
    tenantId: string,
    kind: Source['kind'],
    id: string,
  ): Promise<Source> {
    this.context.assertTenantId(tenantId);
    if (kind === 'work') {
      const work = await this.prisma.operationalWorkItem.findUnique({
        where: { id_tenantId: { id, tenantId } },
        include: { createExecution: true },
      });
      if (
        !work ||
        !['task', 'support_request'].includes(work.kind) ||
        work.createExecution.state !== 'SUCCEEDED' ||
        work.createExecution.dryRun ||
        !['create_operational_task', 'request_administrator_contact'].includes(
          work.createExecution.actionClass,
        )
      )
        throw new ForbiddenException(
          'R06 committed canonical A23 work required',
        );
      return {
        kind,
        id,
        hash: this.identity.hmac('maya.work-inbox-source/1', {
          tenantId,
          id,
          executionId: work.createActionExecutionId,
          inputHash: work.createExecution.normalizedInputHash,
        }),
        staffIds: [],
        type: work.kind === 'task' ? 'maya_task' : 'client_support_request',
        title: work.title,
        bodyText: work.bodyText,
        payload: {
          operational_work_item_id: work.id,
          status: 'active',
          due_date: work.dueAt?.toISOString().slice(0, 10) ?? null,
          source: 'maya_chat',
        },
        deepLink: work.kind === 'task' ? '/app/?panel=chat' : '/clients',
        expiresAt: new Date(
          work.createdAt.getTime() + 7 * 86400000,
        ).toISOString(),
        assigneeUserId: work.assigneeUserId,
      };
    }
    let appointmentId: string,
      eventKind: string,
      hash: string,
      occurredAt: Date,
      staffIds: string[] = [],
      bodyText: string;
    if (kind === 'appointment_event') {
      const event = await this.prisma.domainEvent.findFirst({
        where: {
          id,
          tenantId,
          entityType: 'appointment',
          version: 1,
          observation: 'after_watch_started',
        },
      });
      if (
        !event ||
        !EVENTS[event.type] ||
        !event.entitySequence ||
        !Number.isFinite(this.cutoverAt) ||
        event.receivedAt.getTime() <= this.cutoverAt
      )
        throw new ForbiddenException(
          'R06 post-cutover accepted canonical event required',
        );
      appointmentId = event.entityId;
      eventKind = event.type;
      occurredAt = event.receivedAt;
      hash = this.identity.hmac('maya.event-inbox-source/1', {
        tenantId,
        id,
        appointmentId,
        eventKind,
        sequence: event.entitySequence,
        fingerprint: event.dedupFingerprint,
        payload: event.payload,
      });
      const data = event.payload as Record<string, unknown>;
      if (eventKind === 'appointment.staff_changed')
        staffIds = [data.from_staff_id, data.to_staff_id].filter(
          (v): v is string => typeof v === 'string' && !!v,
        );
      else if (
        eventKind === 'appointment.created' &&
        typeof data.staff_id === 'string'
      )
        staffIds = [data.staff_id];
      if (
        ['appointment.created', 'appointment.staff_changed'].includes(
          eventKind,
        ) &&
        !staffIds.length
      )
        throw new ForbiddenException(
          'R06 historical canonical Staff fact unresolved',
        );
      bodyText = `${EVENTS[eventKind].title}. Изменение принято Maya ${event.receivedAt.toISOString()}. Откройте актуальную запись в расписании.`;
    } else {
      const execution = await this.prisma.actionExecution.findFirst({
        where: {
          id,
          tenantId,
          state: 'SUCCEEDED',
          dryRun: false,
          actionClass: {
            in: [
              'create_appointment',
              'cancel_appointment',
              'reschedule_appointment',
            ],
          },
        },
      });
      const safe = execution?.safeResultSummaryJson as
        Record<string, unknown> | undefined;
      if (
        !execution ||
        typeof safe?.externalId !== 'string' ||
        !execution.finalizedAt
      )
        throw new ForbiddenException(
          'R06 exact confirmed appointment execution required',
        );
      appointmentId = safe.externalId;
      eventKind =
        execution.actionClass === 'create_appointment'
          ? 'appointment.created'
          : execution.actionClass === 'cancel_appointment'
            ? 'appointment.removed'
            : 'appointment.rescheduled';
      occurredAt = execution.finalizedAt;
      hash = this.identity.hmac('maya.appointment-execution-inbox/1', {
        tenantId,
        id,
        inputHash: execution.normalizedInputHash,
        safe,
      });
      bodyText = `${EVENTS[eventKind].title}. Подтверждено Maya ${occurredAt.toISOString()}. Откройте актуальную запись в расписании.`;
    }
    const appointment = await this.prisma.appointment.findUnique({
      where: { id_tenantId: { id: appointmentId, tenantId } },
    });
    if (
      !appointment?.branchId ||
      !appointment.mayaClientId ||
      (kind === 'appointment_execution' && appointment.source !== 'internal')
    )
      throw new ForbiddenException(
        'R06 exact canonical Appointment/Client/branch required',
      );
    if (!staffIds.length && appointment.staffId)
      staffIds = [appointment.staffId];
    if (!staffIds.length)
      throw new ForbiddenException('R06 unresolved canonical Staff source');
    hash = this.identity.hmac('maya.projection-source-binding/1', {
      hash,
      branchId: appointment.branchId,
      clientId: appointment.mayaClientId,
      staffIds: [...new Set(staffIds)].sort(),
    });
    return {
      kind,
      id,
      hash,
      appointmentId,
      branchId: appointment.branchId,
      staffIds: [...new Set(staffIds)].sort(),
      ...EVENTS[eventKind],
      bodyText,
      payload: {
        appointment_id: appointment.id,
        branch_id: appointment.branchId,
        canonical_source_id: id,
        event: eventKind,
      },
      deepLink: '/app/?panel=schedule',
      expiresAt: new Date(occurredAt.getTime() + 7 * 86400000).toISOString(),
    };
  }
  private async authorize(
    tenantId: string,
    plan: Plan,
    device?: { id: string; token: string },
  ) {
    const source = await this.source(
      tenantId,
      plan.source.kind,
      plan.source.id,
    );
    if (
      source.hash !== plan.source.hash ||
      Date.parse(plan.source.expiresAt) <= Date.now()
    )
      throw new ForbiddenException('R06 projection source expired or changed');
    const member = await this.prisma.membership.findFirst({
      where: {
        id: plan.membershipId,
        tenantId,
        userId: plan.userId,
        role: plan.role as never,
        status: 'active',
        user: { status: 'active' },
        tenant: { status: 'active' },
      },
    });
    if (
      !member ||
      (member.branchId ? 'branch:' + member.branchId : 'tenant') !==
        plan.branchScope ||
      (source.branchId &&
        member.branchId &&
        member.branchId !== source.branchId)
    )
      throw new ForbiddenException(
        'R06 exact current projection recipient required',
      );
    if (source.kind === 'work') {
      const current = await this.prisma.operationalWorkItem.findUnique({
        where: { id_tenantId: { id: source.id, tenantId } },
      });
      if (source.assigneeUserId !== member.userId || current?.status !== 'OPEN')
        throw new ForbiddenException('R06 exact OPEN A23 assignee required');
    } else {
      const staff = await this.prisma.staff.findFirst({
        where: { tenantId, userId: member.userId, active: true },
      });
      if (staff) {
        const binding = await this.bindings.staffBinding(
          tenantId,
          member.userId,
        );
        if (!binding || !plan.source.staffIds.includes(binding.staffId))
          throw new ForbiddenException(
            'R06 exact canonical staff chair required',
          );
      } else if (!ADMINS.includes(member.role as never))
        throw new ForbiddenException('R06 no canonical recipient role');
    }
    if (
      device &&
      !(await this.prisma.devicePushToken.findFirst({
        where: {
          id: device.id,
          tenantId,
          userId: plan.userId,
          token: device.token,
        },
      }))
    )
      throw new ForbiddenException('R06 admitted APNS device revoked');
  }
  private request(
    tenantId: string,
    plan: Plan,
    device?: { id: string; token: string },
  ): TrustedActionExecutionRequestV1 {
    const sourceRef = this.logical(
        tenantId,
        plan.source.kind,
        plan.source.id,
        plan.userId,
      ),
      slot = device
        ? 'apns:' +
          this.identity.hmac('maya.projection-device/1', {
            id: device.id,
            token: device.token,
          })
        : 'inbox';
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId,
      capability:
        !device && plan.source.type === 'new_appointment'
          ? 'communication.transactional-single.new-appointment.execute.v1'
          : 'communication.business-alerts.execute.v1',
      source: {
        type: 'scheduler',
        sourceRef: sourceRef + ':' + slot,
        occurrenceScope: sourceRef + ':' + slot,
      },
      targetRef: 'user:' + plan.userId,
      input: {
        channel: device ? 'apns' : 'inbox',
        messageType: plan.source.type,
        userId: plan.userId,
        ...(device ? { deviceToken: device.token } : {}),
        sourceEventId: sourceRef,
        title: plan.source.title,
        bodyText: plan.source.bodyText,
        deepLink: plan.source.deepLink,
        payload: plan.source.payload,
        producerPlan: plan,
      },
      evidenceRefs: ['canonical-source:' + plan.source.hash],
      intentExpiresAt: new Date(plan.source.expiresAt),
      callerIdempotency: {
        scope: 'communication:canonical-projection:v1',
        key: sourceRef + ':' + slot,
      },
    };
  }
  private logical(tenantId: string, kind: string, id: string, userId: string) {
    return (
      'canonical-projection:' +
      this.identity.hmac('maya.canonical-projection/1', {
        tenantId,
        kind,
        id,
        userId,
      })
    );
  }
  private async recipient(
    tenantId: string,
    source: Source,
    member: Membership,
  ) {
    const sourceRef =
      this.logical(tenantId, source.kind, source.id, member.userId) + ':inbox';
    const find = () =>
      this.prisma.actionExecution.findFirst({
        where: {
          tenantId,
          capability:
            source.type === 'new_appointment'
              ? 'communication.transactional-single.new-appointment.execute.v1'
              : 'communication.business-alerts.execute.v1',
          sourceRef,
        },
      });
    let execution = await find(),
      plan: Plan;
    if (execution) {
      if (
        !execution.payloadRetentionUntil ||
        execution.payloadRetentionUntil <= new Date()
      )
        return false;
      const normalized = await this.kernel.readTrustedNormalizedInput(
        tenantId,
        execution.id,
      );
      plan = normalized.producerPlan as Plan;
    } else {
      const devices = await this.prisma.devicePushToken.findMany({
        where: { tenantId, userId: member.userId, platform: 'ios' },
        select: { id: true, token: true },
        orderBy: { id: 'asc' },
      });
      plan = {
        contract: 'maya.canonical-inbox-projection/1',
        source,
        userId: member.userId,
        membershipId: member.id,
        role: member.role,
        branchScope: member.branchId ? 'branch:' + member.branchId : 'tenant',
        devices,
      };
      await this.authorize(tenantId, plan);
      try {
        execution = await this.ingress.createExecution(
          this.request(tenantId, plan),
        );
      } catch (error) {
        execution = await find();
        if (!execution) throw error;
        plan = (
          await this.kernel.readTrustedNormalizedInput(tenantId, execution.id)
        ).producerPlan as Plan;
      }
    }
    if (
      plan.contract !== 'maya.canonical-inbox-projection/1' ||
      plan.source.id !== source.id ||
      plan.userId !== member.userId
    )
      throw new ForbiddenException('R06 immutable projection plan mismatch');
    await this.delivery.deliverCanonicalProjection({
      request: this.request(tenantId, plan),
      authorize: () => this.authorize(tenantId, plan),
    });
    for (const device of plan.devices) {
      try {
        await this.delivery.deliverCanonicalProjection({
          request: this.request(tenantId, plan, device),
          authorize: () => this.authorize(tenantId, plan, device),
        });
      } catch {
        break;
      }
    }
    return true;
  }
  private async publish(tenantId: string, source: Source) {
    const members = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: 'active',
        user: { status: 'active' },
        ...(source.assigneeUserId ? { userId: source.assigneeUserId } : {}),
        ...(source.branchId
          ? { OR: [{ branchId: null }, { branchId: source.branchId }] }
          : {}),
      },
      orderBy: { userId: 'asc' },
    });
    let stored = 0;
    const userIds: string[] = [];
    for (const member of members) {
      try {
        if (await this.recipient(tenantId, source, member)) {
          stored++;
          userIds.push(member.userId);
        }
      } catch {
        /* The existing canonical owner receipt survives projection failure. */
      }
    }
    if (source.kind === 'work' && !stored)
      throw new ForbiddenException('R06 canonical work projection pending');
    return { stored, user_ids: userIds };
  }
  async work(tenantId: string, id: string) {
    return this.publish(tenantId, await this.source(tenantId, 'work', id));
  }
  async appointmentExecution(
    tenantId: string,
    appointmentId: string,
    kind:
      'create_appointment' | 'cancel_appointment' | 'reschedule_appointment',
  ) {
    const execution = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId,
        actionClass: kind,
        state: 'SUCCEEDED',
        dryRun: false,
        safeResultSummaryJson: { path: ['externalId'], equals: appointmentId },
      },
      orderBy: { finalizedAt: 'desc' },
    });
    if (!execution)
      throw new ForbiddenException('R06 exact appointment receipt absent');
    return this.publish(
      tenantId,
      await this.source(tenantId, 'appointment_execution', execution.id),
    );
  }
  async event(tenantId: string, id: string) {
    return this.publish(
      tenantId,
      await this.source(tenantId, 'appointment_event', id),
    );
  }
  async tickTenant(tenantId: string) {
    this.context.assertTenantId(tenantId);
    if (!Number.isFinite(this.cutoverAt)) return;
    // Resume original admitted plans even if their source or recipient was later
    // revoked: reconciliation is read-only; authorization still gates each effect.
    let cursor: string | undefined;
    for (;;) {
      const roots = await this.prisma.actionExecution.findMany({
        where: {
          tenantId,
          capability: {
            in: [
              'communication.business-alerts.execute.v1',
              'communication.transactional-single.new-appointment.execute.v1',
            ],
          },
          sourceRef: {
            startsWith: 'canonical-projection:',
            endsWith: ':inbox',
          },
          payloadRetentionUntil: { gt: new Date() },
        },
        orderBy: { id: 'asc' },
        take: 200,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!roots.length) break;
      for (const root of roots)
        try {
          const normalized = await this.kernel.readTrustedNormalizedInput(
              tenantId,
              root.id,
            ),
            plan = normalized.producerPlan as Plan;
          if (plan?.contract === 'maya.canonical-inbox-projection/1')
            await this.recipient(tenantId, plan.source, {
              userId: plan.userId,
            } as Membership);
        } catch {
          /* Same execution retains its outcome. */
        }
      cursor = roots.at(-1)!.id;
    }
    cursor = undefined;
    for (;;) {
      const events: Array<{ id: string }> =
        await this.prisma.domainEvent.findMany({
          where: {
            tenantId,
            entityType: 'appointment',
            type: { in: Object.keys(EVENTS) },
            receivedAt: {
              gt: new Date(Math.max(this.cutoverAt, Date.now() - 7 * 86400000)),
            },
          },
          orderBy: { id: 'asc' },
          take: 200,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
      if (!events.length) break;
      for (const row of events)
        try {
          await this.event(tenantId, row.id);
        } catch {
          /* No source authority means no delivery. */
        }
      cursor = events.at(-1)!.id;
    }
  }
}
