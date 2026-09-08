import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationDeliveryService } from '../communication-delivery';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { expenseWeek } from './expense-reminder.contract';
import { ExpenseReminderStore } from './expense-reminder.store';
@Injectable()
export class ExpenseReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private readonly logger = new Logger(ExpenseReminderScheduler.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly store: ExpenseReminderStore,
    private readonly delivery: CommunicationDeliveryService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (
      this.config.get<string>('EXPENSE_REMINDERS_CANONICAL_ENABLED') !== 'true'
    )
      return;
    this.timer = setInterval(() => void this.tick(), 60000);
    this.timer.unref?.();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  async tickTenant(tenantId: string) {
    const context = this.context.get();
    if (
      context?.source !== 'system' ||
      context.tenantId !== tenantId ||
      context.userId
    )
      throw new Error('Canonical system expense initiator required');
    let cursor: string | undefined;
    // Resume retained owners before reading current timezone/audience/content.
    for (;;) {
      const roots = await this.prisma.expenseReminderRun.findMany({
        where: {
          tenantId,
          intentEncrypted: { not: null },
          executions: { some: { state: { in: ['READY', 'UNKNOWN'] } } },
        },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!roots.length) break;
      for (const root of roots) await this.resume(root.id, tenantId);
      cursor = roots.at(-1)!.id;
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
      }),
      week = expenseWeek(tenant.defaultTimezone, this.store.clock());
    let root = await this.store.find(tenantId, week.start, week.end);
    if (!root)
      try {
        root = await this.store.admit(tenantId, week.start, week.end);
      } catch (e) {
        if (e instanceof Error && e.name === 'ForbiddenException') return;
        throw e;
      }
    if (root) await this.resume(root.id, tenantId);
  }
  async resume(id: string, tenantId: string) {
    const principal = this.context.get();
    if (
      principal?.source !== 'system' ||
      principal.tenantId !== tenantId ||
      principal.userId
    )
      throw new Error('Canonical system expense initiator required');
    const root = await this.store.load(tenantId, id),
      plan = this.store.read(root),
      rows = await this.store.executions(root, plan);
    for (const slot of plan.slots) {
      if (
        ['SUCCEEDED', 'FAILED', 'NOT_EXECUTED'].includes(
          rows.find((r) => r.expenseReminderSlotKey === slot.slotKey)!.state,
        )
      )
        continue;
      try {
        await this.delivery.deliverExpenseReminderSlot(
          tenantId,
          id,
          slot.slotKey,
        );
      } catch {
        /* Same A13/CD outcome remains authoritative; another recipient may continue. */
      }
    }
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      let cursor: string | undefined;
      for (;;) {
        const tenants = await this.prisma.tenant.findMany({
          where: { status: 'active' },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (!tenants.length) break;
        for (const t of tenants)
          try {
            await this.context.runAsSystemTenant(t.id, () =>
              this.tickTenant(t.id),
            );
          } catch {
            this.logger.warn(
              'Expense reminder retained unresolved canonical work',
            );
          }
        cursor = tenants.at(-1)!.id;
      }
    } finally {
      this.busy = false;
    }
  }
}
