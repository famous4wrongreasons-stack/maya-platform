import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { RequestTx } from '../authority/principal-view';
import type {
  SelectorObservation,
  SelectorObservationAuditPort,
} from './selector-observation-audit.port';

@Injectable()
export class SelectorObservationAuditAdapter implements SelectorObservationAuditPort {
  constructor(private readonly audit: AuditLogService) {}

  private identity(o: SelectorObservation) {
    return {
      tenantId: o.tenantId,
      userId: o.userId,
      action:
        o.state === 'LIVE'
          ? 'widget.selector.rendered'
          : 'widget.selector.delivered',
      entityType: 'WidgetEmission',
      entityId: o.widgetId,
    };
  }
  private metadata(o: SelectorObservation) {
    return {
      contract: 'maya.selector.lifecycle-observation/1',
      from: o.state === 'LIVE' ? 'DELIVERED' : 'MINTED',
      to: o.state,
      bodyHash: o.bodyHash,
      principalProofHash: o.principalProofHash,
      deliveryChannel: o.deliveryChannel,
      authority: 'NONE',
      humanAttentionProven: false,
    };
  }
  async exists(o: SelectorObservation, tx: RequestTx): Promise<boolean> {
    const rows = await this.audit.entityEvents(this.identity(o), tx);
    const expected = this.metadata(o);
    const actual = rows[0]?.metadataJson;
    return (
      rows.length === 1 &&
      typeof actual === 'object' &&
      actual !== null &&
      !Array.isArray(actual) &&
      Object.entries(expected).every(([key, value]) => actual[key] === value)
    );
  }
  async append(o: SelectorObservation, tx: RequestTx): Promise<void> {
    await this.audit.log(
      { ...this.identity(o), metadata: this.metadata(o) },
      tx,
    );
  }
}
