import type { RequestTx } from '../authority/principal-view';

export interface SelectorObservation {
  tenantId: string;
  userId: string;
  widgetId: string;
  bodyHash: string;
  principalProofHash: string;
  deliveryChannel: string;
  state: 'DELIVERED' | 'LIVE';
}

/** L25: lifecycle evidence only. No business operation or authority writer. */
export interface SelectorObservationAuditPort {
  exists(observation: SelectorObservation, tx: RequestTx): Promise<boolean>;
  append(observation: SelectorObservation, tx: RequestTx): Promise<void>;
}
