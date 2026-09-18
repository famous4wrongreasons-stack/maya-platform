// U10a — clause 10.10, the R3.12.4 routing duty at `EP-BUILD` (C11:4864-4871).
//
//   "Under R3.12.4 a tap's own lowered utterance must route to its own record: an emission fixture
//    whose rendered `utterance_template` does not do so through `routeUtterance` fails the build, so
//    rule 2 refuses at runtime only what the build did not catch."
//   "*Mechanism:* … a build test over recorded emission fixtures for the R3.12.4 routing duty.
//    *Evaluated at:* `EP-INGRESS` Gate 10; `EP-BUILD` (the fixture test)."
//
// WHY THIS TEST IS RED TODAY, AND MUST BE.
// The duty is over PRODUCTION-RECORDED emissions (plan §3.1 10.10; AREA-B §5.3: "green over ≥1
// production-recorded emission for every production-mintable kind that carries a token; the
// zero-fixture guard active"). P-MINT-CORE's recorder (Wave 2) writes them and P-MT2a (Wave 4) is the
// production trigger that makes them production-recorded. Until then the fixture directory is empty,
// and a duty that passed over an empty directory would be a green light bought with no evidence —
// exactly what §0.5 calls `false`. So the duty test is `it.failing`, with the blocker named, and it
// turns from XF to a real test when the recorder lands. HAND-WRITTEN fixtures never satisfy it
// (AREA-B §5.2 "Never counts: hand-written emission fixtures").
//
// The two tests beside it are green NOW and are what keeps the XF honest: one proves the zero-fixture
// guard refuses an empty directory, the other proves the duty itself can fail, over a LABELLED
// synthetic emission. A check that cannot fail is not a check.
//
// Class BUILD. Never live proof (§0.5).

import fs from 'node:fs';
import path from 'node:path';

import { renderUtterance } from '../lowering/lowering';
import { type RoutingCandidate, routeUtterance } from './deterministic-router';

/**
 * Where P-MINT-CORE's fixture recorder writes (handoff note U10A-N1). One JSON file per recorded
 * emission, holding the records the mint wrote, in the order `liveCandidates` would return them.
 */
const FIXTURE_DIR =
  process.env.WIDGETS_EMISSION_FIXTURES ??
  path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'test/widgets-live/fixtures/emissions',
  );

/** One recorded emission: its trigger provenance (D-17) and the records it minted. */
interface EmissionFixture {
  readonly file: string;
  /** The production trigger that minted it: `T-2b`, `T-2a`, `T-1`, `T-3` or a successor edge. */
  readonly trigger?: string;
  readonly widgetKind?: string;
  readonly records: readonly FixtureRecord[];
}

/** A minted record, in the columns the router reads (`RoutingCandidate`) plus its kind. */
type FixtureRecord = RoutingCandidate & { readonly widgetKind?: string };

/** A JSON member as a string, or null. Never a coercion: a recorded column is a string or it is absent. */
const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const toCandidate = (raw: Record<string, unknown>): FixtureRecord => ({
  intentTokenHash: text(raw.intentTokenHash) ?? '',
  effect: text(raw.effect) ?? '',
  priority: typeof raw.priority === 'number' ? raw.priority : 0,
  capabilitySpace: text(raw.capabilitySpace),
  capabilityKey: text(raw.capabilityKey),
  issuedAt: new Date(text(raw.issuedAt) ?? 0),
  erasedAt: text(raw.erasedAt) === null ? null : new Date(text(raw.erasedAt)!),
  utteranceTemplate: text(raw.utteranceTemplate),
  selectionDomainLabelsJson: raw.selectionDomainLabelsJson ?? null,
  widgetKind: text(raw.widgetKind) ?? undefined,
});

const loadFixtures = (): readonly EmissionFixture[] => {
  if (!fs.existsSync(FIXTURE_DIR)) return [];
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const raw = JSON.parse(
        fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'),
      ) as Record<string, unknown>;
      const records = Array.isArray(raw.records) ? raw.records : [];
      return {
        file: name,
        trigger: text(raw.trigger) ?? undefined,
        widgetKind: text(raw.widgetKind) ?? undefined,
        records: records.map((r) => toCandidate(r as Record<string, unknown>)),
      };
    });
};

/** Every sentence this record can be lowered to: the template, or the template once per label. */
const renderingsOf = (record: FixtureRecord): readonly string[] => {
  const template = record.utteranceTemplate;
  if (template === null) return [];
  const labels: string[] = [];
  const json = record.selectionDomainLabelsJson;
  if (json !== null && typeof json === 'object' && !Array.isArray(json))
    for (const field of Object.values(json as Record<string, unknown>))
      if (field !== null && typeof field === 'object' && !Array.isArray(field))
        for (const label of Object.values(field as Record<string, unknown>))
          if (typeof label === 'string') labels.push(label);
  const attempts: readonly (readonly string[])[] = template.includes(
    '{{selection}}',
  )
    ? labels.map((label) => [label])
    : [[]];
  const out: string[] = [];
  for (const attempt of attempts) {
    const rendered = renderUtterance(template, attempt);
    if (rendered.ok) out.push(rendered.utterance);
  }
  return out;
};

/**
 * The duty itself. Throws, naming every fixture that breaks it:
 *   - the zero-fixture guard: an empty corpus proves nothing and is a failure, not a pass;
 *   - a tokened intent whose own rendering routes to a DIFFERENT record, or to none, breaks R3.12.4;
 *   - a tokened intent that renders to nothing at all cannot be reached by its own words.
 */
const assertRoutingDuty = (fixtures: readonly EmissionFixture[]): void => {
  if (fixtures.length === 0)
    throw new Error(
      `R3.12.4 routing duty: no recorded emission fixtures in ${FIXTURE_DIR}. ` +
        'The duty is unproven, not satisfied (10.10; P-MINT-CORE recorder, P-MT2a trigger).',
    );
  const problems: string[] = [];
  const kinds = new Set<string>();
  for (const fixture of fixtures) {
    if (fixture.records.length === 0)
      problems.push(`${fixture.file}: recorded no records`);
    for (const record of fixture.records) {
      if (record.intentTokenHash === '') continue; // a `NONE` intent mints no record (INV-21)
      if (record.widgetKind !== undefined) kinds.add(record.widgetKind);
      else if (fixture.widgetKind !== undefined) kinds.add(fixture.widgetKind);
      const renderings = renderingsOf(record);
      if (renderings.length === 0) {
        problems.push(
          `${fixture.file}: ${record.intentTokenHash} renders to nothing, so its own words cannot reach it`,
        );
        continue;
      }
      for (const rendering of renderings) {
        const matched = routeUtterance(rendering, fixture.records);
        if (matched === null)
          problems.push(
            `${fixture.file}: ${record.intentTokenHash} routes to NOTHING`,
          );
        else if (matched.intentTokenHash !== record.intentTokenHash)
          problems.push(
            `${fixture.file}: ${record.intentTokenHash} routes to ${matched.intentTokenHash}`,
          );
      }
    }
  }
  if (problems.length)
    throw new Error(
      `R3.12.4 routing duty broken (C11:4864-4866):\n  ${problems.join('\n  ')}`,
    );
  // Coverage is REPORTED, not asserted, until E1 fixes the list of production-mintable tokened kinds
  // (AREA-B §5.3). A corpus that covers one kind satisfies the duty and does not yet flip 10.10.
  if (kinds.size === 0)
    throw new Error(
      'R3.12.4 routing duty: no fixture named a widget kind, so coverage cannot be judged',
    );
};

describe('U10a — 10.10, the R3.12.4 routing duty (EP-BUILD)', () => {
  it.failing(
    "R3124-1 [XF→P-MT2a] every tapped record's own lowered utterance routes to itself, over production-recorded emissions",
    () => {
      // BLOCKER: P-MINT-CORE's fixture recorder (Wave 2) and the T-2b/T-2a triggers (P-MT2a, Wave 4).
      // Until both exist this throws on the zero-fixture guard, which is the honest state of 10.10.
      assertRoutingDuty(loadFixtures());
    },
  );

  it('R3124-2 the zero-fixture guard is active: an empty corpus FAILS the duty', () => {
    expect(() => assertRoutingDuty([])).toThrow(
      /no recorded emission fixtures|unproven/,
    );
    // And today the corpus really is empty — recorded here so the XF above is attributable.
    expect(loadFixtures()).toEqual([]);
  });

  it('R3124-3 [G-SYNTH — never evidence] the duty passes a clean emission and fails a colliding one', () => {
    // Labelled synthetic, to prove the CHECK works. §5.2: hand-written emission fixtures never count
    // as evidence for 10.10; only the recorder's output does.
    const clean: EmissionFixture = {
      file: '[G-SYNTH] clean',
      widgetKind: 'SERVICE_SELECTOR',
      records: [
        toCandidate({
          intentTokenHash: 'a',
          effect: 'REFINE',
          priority: 1,
          issuedAt: '2026-09-17T10:00:00.000Z',
          utteranceTemplate: 'записаться на {{selection}}',
          selectionDomainLabelsJson: { service_id: { s1: 'стрижку' } },
          widgetKind: 'SERVICE_SELECTOR',
        }),
        toCandidate({
          intentTokenHash: 'b',
          effect: 'CONTROL',
          priority: 0,
          capabilitySpace: 'CONTROL',
          capabilityKey: 'control.widget.dismiss',
          issuedAt: '2026-09-17T10:00:00.000Z',
          utteranceTemplate: 'закрыть карточку',
          widgetKind: 'SERVICE_SELECTOR',
        }),
      ],
    };
    expect(() => assertRoutingDuty([clean])).not.toThrow();

    const colliding: EmissionFixture = {
      ...clean,
      file: '[G-SYNTH] colliding',
      records: [
        clean.records[0],
        toCandidate({
          intentTokenHash: 'c',
          effect: 'REFINE',
          priority: 1,
          issuedAt: '2026-09-17T10:00:00.000Z',
          // The same words as record `a` renders: `c` can never be reached by its own sentence.
          utteranceTemplate: 'записаться на стрижку',
          widgetKind: 'SERVICE_SELECTOR',
        }),
      ],
    };
    expect(() => assertRoutingDuty([colliding])).toThrow(
      /routes to a\b|routes to/,
    );

    const unreachable: EmissionFixture = {
      ...clean,
      file: '[G-SYNTH] blank template',
      records: [
        toCandidate({
          intentTokenHash: 'd',
          effect: 'REFINE',
          priority: 1,
          issuedAt: '2026-09-17T10:00:00.000Z',
          utteranceTemplate: '   ',
          widgetKind: 'SERVICE_SELECTOR',
        }),
      ],
    };
    expect(() => assertRoutingDuty([unreachable])).toThrow(
      /renders to nothing/,
    );
  });
});
