import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Package5Wave1CanonicalCutoverService } from './package5-wave1-canonical-cutover.service';

const MANAGERS = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.ACCOUNTANT,
];
const TEAM = [
  ...MANAGERS,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
];

/** R04 HTTP initiator and personal read projection over the approved A23 owner.
 * Global current-session/tenant/role guards apply. No legacy identity or writer. */
@Controller('operational-work')
@TenantScoped()
export class OperationalWorkController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly canonical: Package5Wave1CanonicalCutoverService,
  ) {}

  @Get()
  @Roles(...TEAM)
  async list(@CurrentUser() actor: AuthenticatedUser) {
    const tenantId = this.tenant(actor);
    const rows = await this.prisma.operationalWorkItem.findMany({
      where: { tenantId, assigneeUserId: actor.userId, kind: 'task' },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
      select: {
        id: true,
        title: true,
        bodyText: true,
        dueAt: true,
        status: true,
        createActionExecutionId: true,
        completeActionExecutionId: true,
        inboxItems: {
          where: {
            tenantId,
            userId: actor.userId,
            type: 'maya_task',
            deletedAt: null,
          },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 1,
        },
      },
    });
    return {
      contract: 'maya.operational-work/1',
      ok: true,
      read_only: true,
      current_user_id: actor.userId,
      tenant_id: tenantId,
      tasks: rows.map((row) => ({
        canonical: true,
        work_item_id: row.id,
        task_id: row.inboxItems[0]?.id ?? null,
        title: row.title,
        detail: row.bodyText,
        due_at: row.dueAt,
        status: row.status,
        work_state: row.status === 'COMPLETED' ? 'done' : '',
        work_label: row.status === 'COMPLETED' ? 'Выполнено' : 'Открыто',
        next_actions:
          row.status === 'OPEN' && row.inboxItems.length ? ['done'] : [],
        create_execution_id: row.createActionExecutionId,
        complete_execution_id: row.completeActionExecutionId,
      })),
    };
  }

  @Post('create')
  @Roles(...MANAGERS)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') identity: string | undefined,
    @Body() value: unknown,
  ) {
    const tenantId = this.tenant(actor);
    const body = this.object(value, [
      'assigneeUserId',
      'title',
      'bodyText',
      'dueAt',
    ]);
    const dueAt =
      body.dueAt == null ? null : new Date(this.text(body.dueAt, 40));
    if (dueAt && !Number.isFinite(dueAt.getTime()))
      throw new BadRequestException('Invalid dueAt');
    return this.canonical.createTask(
      tenantId,
      actor.userId,
      {
        assigneeUserId: this.text(body.assigneeUserId, 160),
        title: this.text(body.title, 300),
        bodyText: this.text(body.bodyText, 4000),
        dueAt,
      },
      this.identity(identity),
    );
  }

  @Post('complete')
  @Roles(...TEAM)
  complete(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') identity: string | undefined,
    @Body() value: unknown,
  ) {
    const tenantId = this.tenant(actor);
    const body = this.object(value, ['inboxItemId']);
    const inboxItemId = this.text(body.inboxItemId, 160);
    if (/^\d+$/.test(inboxItemId))
      throw new BadRequestException('Legacy journal IDs are not task bindings');
    return this.canonical.completeTask(
      tenantId,
      actor.userId,
      inboxItemId,
      this.identity(identity),
    );
  }

  private tenant(actor: AuthenticatedUser): string {
    if (
      !actor.tenantId ||
      !actor.membershipId ||
      actor.membershipStatus !== 'active'
    )
      throw new ForbiddenException('Exact active tenant membership required');
    return actor.tenantId;
  }

  private object(value: unknown, keys: string[]): Record<string, unknown> {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw new BadRequestException('Exact canonical task command required');
    return value as Record<string, unknown>;
  }

  private text(value: unknown, limit: number): string {
    if (typeof value !== 'string' || !value.trim() || value.length > limit)
      throw new BadRequestException('Bounded canonical task field required');
    return value.trim();
  }

  private identity(value: string | undefined): string {
    return this.text(value, 240);
  }
}
