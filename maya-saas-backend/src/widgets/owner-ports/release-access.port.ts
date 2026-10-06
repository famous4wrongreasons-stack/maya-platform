import type { RequestTx } from '../authority/principal-view';
import type {
  MintReleaseFacts,
  ReleaseIntentFacts,
} from '../../entitlements/widget-release-access.service';

export type { MintReleaseFacts, ReleaseIntentFacts };
export interface WidgetReleaseAccessPort {
  canProject(
    tenantId: string,
    widgetId: string,
    tx?: RequestTx,
  ): Promise<boolean>;
  bindMint(
    tenantId: string,
    rows: readonly MintReleaseFacts[],
    tx: RequestTx,
    widgetKind: string,
  ): Promise<void>;
  admits(
    tenantId: string,
    record: ReleaseIntentFacts,
    tx?: RequestTx,
  ): Promise<boolean>;
}
