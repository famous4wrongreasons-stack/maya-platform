// BUILD/RI only: no production approval record is minted by this proof.
import { INTENT_TEMPLATE_INVENTORY } from '../../../src/widgets/emission/intent-template.inventory';
import {
  resolveIntentTemplate,
  IntentTemplateRefusal,
} from '../../../src/widgets/emission/intent-template.registry';
import {
  AE_WIDGET_COMMIT_ALLOWLIST,
  MONEY,
} from '../../../src/widgets/authority/ae-commit-allowlist.runtime';
import { ActionCapabilityRegistry } from '../../../src/action-engine/action-engine.registry';
import {
  NO_PRICE_GOODS_MANIFEST,
  PRICE_GOODS_TEMPLATES,
} from '../../../src/entitlements/widget-release-profile.contract';

export function firstPhoneSourceCensus() {
  const groups: Readonly<
    Record<
      string,
      {
        effect: string;
        kinds?: readonly string[];
        subject: { key: string } | null;
      }
    >
  >[] = Object.values(INTENT_TEMPLATE_INVENTORY);
  const rows = groups.flatMap((group) =>
    Object.entries(group).map(([key, row]) => ({ key, row })),
  );
  const require = (ok: unknown, message: string) => {
    if (!ok) throw new Error(`FP-CENSUS: ${message}`);
  };
  // Census the actual registries, not just the generated release snapshot.
  const approvals = rows
    .filter(
      ({ row }) =>
        row.kinds?.includes('APPROVAL') &&
        !['NONE', 'CONTROL'].includes(row.effect),
    )
    .map(({ key }) => key)
    .sort();
  require(JSON.stringify(approvals) ===
    JSON.stringify(
      [...PRICE_GOODS_TEMPLATES].sort(),
    ), 'approval source changed; requalify every remaining approval branch');
  const selected = new Set<string>(NO_PRICE_GOODS_MANIFEST.templates);
  require(approvals.every(
    (key) => !selected.has(key),
  ), 'excluded source admitted');
  const commits = rows.filter(
    ({ key, row }) => selected.has(key) && row.effect === 'COMMIT',
  );
  require(JSON.stringify(commits.map(({ key }) => key).sort()) ===
    JSON.stringify([
      'commit.booking.cancel@1',
      'commit.booking.create@1',
      'commit.booking.reschedule@1',
    ]), 'remaining commit source changed');
  const caps = new ActionCapabilityRegistry().list();
  for (const { row } of commits) {
    const cap = caps.find((c) => c.capability === row.subject?.key);
    require(cap && !MONEY(cap), 'remaining commit is MONEY');
  }
  // B35's owner is still present and allowlisted. Absence is in the widget
  // carrier, not a new business exclusion and not removal of its authority.
  require(AE_WIDGET_COMMIT_ALLOWLIST['communication.bulk-campaign.admit.v2']
    ?.requires_ae_approval, 'existing AE approval owner changed');
  for (const key of [
    'draft.blocked@1',
    'request-approval.blocked@1',
    'commit.blocked@1',
  ]) {
    let refused = false;
    try {
      resolveIntentTemplate({
        proposal: { intent_template_key: key, role: 'primary' },
        widgetKind: 'APPROVAL',
        deliveryChannel: 'pwa',
      });
    } catch (error) {
      refused =
        error instanceof IntentTemplateRefusal &&
        error.code === 'generic_actuating_template_forbidden';
    }
    require(refused, 'generic approval carrier no longer refuses');
  }
  return {
    approvals,
    commits: commits.map(({ key }) => key).sort(),
    remainingApprovalCarrier: false as const,
    b35OwnerPreserved: true as const,
  };
}
