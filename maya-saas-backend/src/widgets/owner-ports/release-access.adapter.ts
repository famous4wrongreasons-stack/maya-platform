import { Injectable } from '@nestjs/common';
import type { RequestTx } from '../authority/principal-view';
import { WidgetReleaseAccessService } from '../../entitlements/widget-release-access.service';
import { releaseHash } from '../../entitlements/widget-release.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { INTENT_TEMPLATE_REGISTRY } from '../emission/intent-template.registry';
import { BOOKING_INTENT_TEMPLATE_REGISTRY } from '../booking/booking-intent-template.registry';
import { SERVICE_PRICE_INTENT_TEMPLATE_REGISTRY } from '../pricing/service-price-intent-template.registry';
import type {
  MintReleaseFacts,
  ReleaseIntentFacts,
  WidgetReleaseAccessPort,
} from './release-access.port';

@Injectable()
export class WidgetReleaseAccessAdapter implements WidgetReleaseAccessPort {
  constructor(
    private readonly owner: WidgetReleaseAccessService,
    private readonly prisma: PrismaService,
  ) {}
  private registryDigest(): string {
    return releaseHash({
      general: INTENT_TEMPLATE_REGISTRY,
      booking: BOOKING_INTENT_TEMPLATE_REGISTRY,
      servicePrice: SERVICE_PRICE_INTENT_TEMPLATE_REGISTRY,
    });
  }
  bindMint(
    tenantId: string,
    rows: readonly MintReleaseFacts[],
    tx: RequestTx,
  ): Promise<void> {
    return this.owner.bindMint(tenantId, rows, this.registryDigest(), tx);
  }
  async canProject(
    tenantId: string,
    widgetId: string,
    tx?: RequestTx,
  ): Promise<boolean> {
    const read = async (client: RequestTx) => {
      const records = await client.widgetIntentRecord.findMany({
        where: { tenantId, widgetId },
        select: {
          tenantId: true,
          widgetId: true,
          intentTokenHash: true,
          effect: true,
          widgetKind: true,
          bodyHash: true,
          principalProofHash: true,
          capabilitySpace: true,
          capabilityKey: true,
          sourceCapabilitySpace: true,
          sourceCapabilityKey: true,
          targetJson: true,
          inputSchemaHash: true,
          selectionDomain: true,
        },
      });
      if (
        records.length === 0 ||
        (await this.owner.current(tenantId, client)) === null
      )
        return false;
      for (const record of records)
        if (!(await this.admits(tenantId, record, client))) return false;
      return true;
    };
    return tx ? read(tx) : this.prisma.$transaction(read);
  }
  async admits(
    tenantId: string,
    record: ReleaseIntentFacts,
    tx?: RequestTx,
  ): Promise<boolean> {
    const read = (tx: RequestTx) =>
      this.owner.admits(tenantId, record, this.registryDigest(), tx);
    return tx ? read(tx) : this.prisma.$transaction(read);
  }
}
