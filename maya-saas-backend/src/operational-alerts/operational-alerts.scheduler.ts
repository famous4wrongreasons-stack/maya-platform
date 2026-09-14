import { C8Worker } from '../valuation/c8.worker';
import { CanonicalAppointmentAlertsService } from './canonical-appointment-alerts.service';
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { OperationalAlertsService } from './operational-alerts.service';
/** Replaces the inventoried native alert ticks; durable owners decide admission. */
@Injectable()
export class OperationalAlertsScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private readonly logger = new Logger(OperationalAlertsScheduler.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly owner: OperationalAlertsService,
    private readonly config: ConfigService,
    private readonly projections: CanonicalAppointmentAlertsService,
    private readonly valuation: C8Worker,
  ) {}
  onModuleInit() {
    if (
      !Number.isFinite(
        Date.parse(
          this.config.get<string>('OPERATIONAL_ALERTS_CANONICAL_CUTOVER_AT') ??
            '',
        ),
      )
    )
      return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 60000);
    this.timer.unref?.();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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
        for (const tenant of tenants) {
          try {
            await this.context.runAsSystemTenant(tenant.id, () =>
              this.valuation.tickTenant(tenant.id),
            );
          } catch {
            this.logger.warn(
              'C8 derived observation tick retained unresolved work',
            );
          }
          try {
            await this.context.runAsSystemTenant(tenant.id, async () => {
              await this.owner.tickTenant(tenant.id);
              await this.projections.tickTenant(tenant.id);
            });
          } catch {
            this.logger.warn(
              'Canonical operational alert tick retained unresolved work',
            );
          }
        }
        cursor = tenants.at(-1)!.id;
      }
    } finally {
      this.busy = false;
    }
  }
}
