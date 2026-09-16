// K10 — METRIC, CHART and REPORT, and the rule that every number has a provenance.
//
// The exit is unusually strict and the strictness is the point:
//
//   cells that are not C7/C8 projections = 0
//   numerals originating from an LLM = 0
//   every `Measure` traces to a `FactUsed`
//
// A model that can produce a number a person then acts on is the single most dangerous thing this
// product could contain. So a numeric cell is not a number here — it is a number PLUS the fact it
// came from, and a cell without a `factRef` cannot be constructed. There is no path where a bare
// numeral enters a body, which is why "numerals originating from an LLM" is zero by construction
// rather than by inspection.

import { createHash } from 'node:crypto';

/** The two read facades a cell may come from. There is no third, and no free-text option. */
export type Facade = 'c7.measurement.read' | 'c8.result.read';

/**
 * A measured cell. `value` is meaningless without `factRef`, so they travel together and neither is
 * optional — a projection that could omit its provenance is a projection that will.
 */
export interface Measure {
  readonly value: number;
  readonly unit: string;
  /** The canonical fact this number was read from. Traceability is the field, not a convention. */
  readonly factRef: string;
  readonly facade: Facade;
  /** When the underlying fact was true. A number without an `as_of` is a number about no moment. */
  readonly asOf: string;
}

export class ProjectionRefusal extends Error {}

/**
 * The only constructor. It refuses rather than defaulting: an empty `factRef` is not a cell with a
 * missing field, it is a number nobody can trace, and the honest response is to have no cell.
 */
export const measure = (m: Measure): Measure => {
  if (!m.factRef.trim())
    throw new ProjectionRefusal(
      'a Measure with no FactUsed is not constructible',
    );
  if (!Number.isFinite(m.value))
    throw new ProjectionRefusal(`Measure value is not finite: ${m.value}`);
  if (m.facade !== 'c7.measurement.read' && m.facade !== 'c8.result.read')
    throw new ProjectionRefusal(
      `${String(m.facade)} is not a C7/C8 read facade`,
    );
  return Object.freeze({ ...m });
};

export interface ChartSeries {
  readonly label: string;
  readonly points: readonly Measure[];
}

export interface ChartBody {
  readonly kind: 'CHART';
  readonly series: readonly ChartSeries[];
  /**
   * Computed ON THE READ PATH, OUTSIDE THE PROJECTOR. The distinction is the whole value of the
   * digest: a projector that hashed its own output would certify itself, and the digest would move
   * whenever the projector did. Computed here, over the rows as read, it is a statement a third
   * party can recheck.
   */
  readonly rows_digest: string;
  readonly series_digest: string;
}

/** Canonical, order-insensitive over keys and order-SENSITIVE over points — a series is a sequence. */
const canonical = (v: unknown): string => {
  const walk = (x: unknown): unknown => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(walk);
    const o = x as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((a, k) => {
        a[k] = walk(o[k]);
        return a;
      }, {});
  };
  return JSON.stringify(walk(v));
};

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** The read-path digest of the raw rows, before anything shapes them into series. */
export const rowsDigest = (rows: readonly Measure[]): string =>
  sha(canonical(rows));

/** The read-path digest of the emitted series. Different input, so deliberately a different digest. */
export const seriesDigest = (series: readonly ChartSeries[]): string =>
  sha(canonical(series));

/**
 * Build a chart, digesting on the way out.
 *
 * Every point must be a `Measure`, so every point traces to a fact. A chart cannot contain a number
 * that came from anywhere else, because there is no member that would hold one.
 */
export const chart = (
  rows: readonly Measure[],
  series: readonly ChartSeries[],
): ChartBody => {
  const orphan = series.flatMap((s) => s.points).filter((p) => !p.factRef);
  if (orphan.length)
    throw new ProjectionRefusal(
      `${orphan.length} chart points trace to no fact`,
    );
  return Object.freeze({
    kind: 'CHART' as const,
    series,
    rows_digest: rowsDigest(rows),
    series_digest: seriesDigest(series),
  });
};

/**
 * An ARTIFACT is minted for ONE principal.
 *
 * The delivery route re-compares the live principal's proof hash at fetch time — not the one the
 * artefact was minted with, the one presenting now. An owner report is the most concentrated
 * personal data this product produces, and a link that works for whoever holds it is how that data
 * leaves.
 */
export interface ArtifactRef {
  readonly artifactRef: string;
  readonly boundPrincipalProofHash: string;
  /** Stated BEFORE the file can be fetched. Undeclared is refused, per K4's third fence. */
  readonly contains_pii: boolean;
}

export const assertFetchable = (
  art: ArtifactRef,
  livePrincipalProofHash: string,
): void => {
  if (typeof art.contains_pii !== 'boolean')
    throw new ProjectionRefusal(
      'contains_pii is undeclared; the artefact may not be fetched',
    );
  if (art.boundPrincipalProofHash !== livePrincipalProofHash)
    throw new ProjectionRefusal(
      'this artefact was minted for a different principal',
    );
};
