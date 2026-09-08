import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CommunicationDeliveryService } from '../communication-delivery';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { NativeFeedbackStore } from './native-feedback.store';

/** Only resumes explicit canonical requests; never attests attendance, admits
 * a business request, selects new recipients or owns a delivery lifecycle. */
@Injectable()
export class NativeFeedbackScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;
  private busy = false;
  private readonly logger = new Logger(NativeFeedbackScheduler.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly store: NativeFeedbackStore,
    private readonly delivery: CommunicationDeliveryService,
  ) {}
  onModuleInit() {
    this.first = setTimeout(() => void this.tick(), 90000);
    this.first.unref();
    this.timer = setInterval(() => void this.tick(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }
  async tickTenant(tenantId: string) {
    let cursor: string | undefined;
    for (;;) {
      const rows: { id: string }[] = await canonicalUtcTransaction(
        this.prisma,
        (tx) =>
          tx.nativeFeedbackRequest.findMany({
            where: {
              tenantId,
              retentionUntil: { gt: new Date() },
              eligibleAt: { lte: new Date() },
            },
            orderBy: { id: 'asc' },
            take: 100,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: { id: true },
          }),
        { readOnly: true },
      );
      for (const root of rows) {
        const revisions = await this.prisma.nativeFeedbackRevision.findMany({
          where: { tenantId, requestId: root.id, kind: 'response' },
          orderBy: { version: 'asc' },
          select: { id: true },
        });
        for (const revisionId of [null, ...revisions.map((r) => r.id)]) {
          let loaded: Awaited<ReturnType<NativeFeedbackStore['read']>>;
          try {
            loaded = await canonicalUtcTransaction(
              this.prisma,
              (tx) => this.store.read(tx, tenantId, root.id, revisionId),
              { readOnly: true },
            );
          } catch {
            continue;
          }
          for (const slot of loaded.plan.slots) {
            const prior = await this.prisma.actionExecution.findFirst({
              where: {
                tenantId,
                nativeFeedbackRequestId: root.id,
                nativeFeedbackSlotKey: slot.slotKey,
              },
            });
            if (prior?.state === 'SUCCEEDED') continue;
            if (
              !prior ||
              !['FAILED', 'NOT_EXECUTED', 'CANCELED'].includes(prior.state)
            ) {
              try {
                await this.delivery.deliverNativeFeedbackSlot(
                  tenantId,
                  root.id,
                  revisionId,
                  slot.slotKey,
                );
              } catch {
                /* Existing AE/CD records exact terminal/UNKNOWN state. */
              }
            }
            const after = await this.prisma.actionExecution.findFirst({
              where: {
                tenantId,
                nativeFeedbackRequestId: root.id,
                nativeFeedbackSlotKey: slot.slotKey,
              },
            });
            // Invitation has one Client. Its next device cannot bypass an
            // unresolved/failed slot. Inbox recipients are independent.
            if (loaded.plan.phase === 'request' && after?.state !== 'SUCCEEDED')
              break;
          }
        }
      }
      if (rows.length < 100) break;
      cursor = rows.at(-1)!.id;
    }
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      let cursor: string | undefined;
      for (;;) {
        const tenants: { id: string }[] = await this.prisma.tenant.findMany({
          where: { status: 'active' },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const tenant of tenants)
          await this.context.runAsSystemTenant(tenant.id, () =>
            this.tickTenant(tenant.id).catch(() => {
              this.logger.warn('Canonical native feedback resume held');
            }),
          );
        if (tenants.length < 100) break;
        cursor = tenants.at(-1)!.id;
      }
    } finally {
      this.busy = false;
    }
  }
}
