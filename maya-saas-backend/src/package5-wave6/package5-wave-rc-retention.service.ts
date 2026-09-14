import { C7_MEASUREMENT_RETENTION_CLASS } from './chapter7-measurement-retention';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { OperationalAlertStore } from '../operational-alerts/operational-alert.store';
import { OperationalAlertPayloadVerifier } from '../operational-alerts/operational-alert-payload-verifier';
import { Package5Wave6MaintenanceService } from './package5-wave6.service';
import {
  RC_PAYLOAD_CLASSES,
  type RCPayloadClass,
} from './package5-wave-rc-payloads';
import { Package5Wave4FileObjectStore } from '../package5-wave4/package5-wave4-object-store.service';
import { Package5TeamPayloadStorage } from './package5-team-payload-storage';
/** Timer initiator only. The existing AC6 coordinator owns every selection,
 * immutable maintenance run, claim, fencing decision and payload erasure. */
@Injectable()
export class WaveRcPayloadRetentionService {
  private busy = false;
  private readonly logger = new Logger(WaveRcPayloadRetentionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly config: ConfigService,
  ) {}
  async tick() {
    if (this.context.get())
      throw Error('AC6 retention timer cannot inherit a request principal');
    if (this.busy) return;
    this.busy = true;
    try {
      let cursor: string | undefined;
      for (;;) {
        const tenants: Array<{ id: string; status: string }> =
          await this.prisma.tenant.findMany({
            select: { id: true, status: true },
            orderBy: { id: 'asc' },
            take: 100,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
        if (!tenants.length) break;
        for (const tenant of tenants)
          await this.context.runAsSystemTenant(tenant.id, async () => {
            const verifier = new OperationalAlertPayloadVerifier(
              new OperationalAlertStore(
                this.prisma,
                this.context,
                this.ingress,
                this.config,
              ),
              this.kernel,
            );
            const storage = new Package5TeamPayloadStorage(
              new Package5Wave4FileObjectStore(this.config).privateTeam(),
            );
            const coordinator = new Package5Wave6MaintenanceService(
              this.prisma,
              this.context,
              undefined,
              storage,
              verifier,
            );
            for (const actionClass of [
              ...(Object.keys(RC_PAYLOAD_CLASSES) as RCPayloadClass[]),
              C7_MEASUREMENT_RETENTION_CLASS,
            ])
              try {
                if (
                  tenant.status !== 'active' &&
                  actionClass !== C7_MEASUREMENT_RETENTION_CLASS
                )
                  continue;
                if (!(await coordinator.shadow({ actionClass })).items.length)
                  continue;
                await coordinator.execute(
                  await coordinator.prepare({ actionClass }),
                );
              } catch {
                this.logger.warn(
                  'AC6 canonical payload remains held: ' + actionClass,
                );
              }
          });
        cursor = tenants.at(-1)!.id;
      }
    } finally {
      this.busy = false;
    }
  }
}
