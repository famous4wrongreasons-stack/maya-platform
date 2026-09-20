// P-MINT / 10.10 — the closed projection written by production-trigger fixture harnesses.
//
// This function performs no I/O. P-MT2a owns the first qualifying production trigger and writes the
// returned JSON into WIDGETS_EMISSION_FIXTURES during its build proof. Keeping the projection here
// means the future trigger cannot choose extra database columns or accidentally record raw tokens.

import type { WidgetKind } from '../../widget-contract/kinds';

export type ProductionMintTrigger =
  'T-2b' | 'T-2a' | 'T-1' | 'T-3' | 'successor';

export interface RecordedIntentRow {
  readonly intentTokenHash: string;
  readonly effect: string;
  readonly priority: number;
  readonly capabilitySpace: string | null;
  readonly capabilityKey: string | null;
  readonly issuedAt: Date;
  readonly erasedAt: Date | null;
  readonly utteranceTemplate: string | null;
  readonly selectionDomainLabelsJson: unknown;
}

export interface RecordedEmissionFixture {
  readonly trigger: ProductionMintTrigger;
  readonly widgetKind: WidgetKind;
  readonly records: readonly Readonly<Record<string, unknown>>[];
}

export const recordEmissionFixture = (args: {
  readonly trigger: ProductionMintTrigger;
  readonly widgetKind: WidgetKind;
  readonly records: readonly RecordedIntentRow[];
}): RecordedEmissionFixture => {
  if (args.records.length === 0)
    throw new Error(
      'production-recorded emission fixture has no tokened records',
    );
  return Object.freeze({
    trigger: args.trigger,
    widgetKind: args.widgetKind,
    records: Object.freeze(
      args.records.map((record) =>
        Object.freeze({
          intentTokenHash: record.intentTokenHash,
          effect: record.effect,
          priority: record.priority,
          capabilitySpace: record.capabilitySpace,
          capabilityKey: record.capabilityKey,
          issuedAt: record.issuedAt.toISOString(),
          erasedAt: record.erasedAt?.toISOString() ?? null,
          utteranceTemplate: record.utteranceTemplate,
          selectionDomainLabelsJson: record.selectionDomainLabelsJson,
          widgetKind: args.widgetKind,
        }),
      ),
    ),
  });
};
