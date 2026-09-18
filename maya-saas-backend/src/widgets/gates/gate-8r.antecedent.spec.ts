// T-SRC-8R — Gate 8-R's antecedent, held at the source (EP-BUILD).
//
// Row 8-R applies "exactly when `record.confirmation?.requires_readback === true`" (C11:4728). E15
// (C11:5319), INV-30 (C11:5362) and V4 (C11:6103) say the same thing from the other side: the duty is
// not a property of the channel the submission arrived on, of a claimed render profile, or of a
// locale a client asserts. The gate this replaced read `ctx.carrier` and the effect set, which is why
// the fence is at the SOURCE and not only in the behaviour: a behavioural test can be satisfied by a
// gate that reads the right thing today and the wrong thing after one edit, and this file is what
// makes that edit fail the build.
//
// GATES-PLAN-V11 U8R amends the fence in one place: `effect` and `deliveryChannel` are now PERMITTED,
// because B-17's recompute is made of exactly those two terms (C11:4386-4389). They are permitted
// INSIDE THE RECOMPUTE ONLY, so an effect-keyed antecedent cannot come back disguised as a second
// read somewhere else in the file.
//
// The scan is over the syntax tree, not the text: identifiers, property names and string literals.
// A comment that mentions a forbidden member — this file's own header does — is not a read, and a
// fence that could not tell the difference would be a fence nobody could document around.
//
// The slot's files are DERIVED from the gateway's array (`gate-slots.spec-helper.spec.ts`), never
// hand-listed, so rewiring the slot moves the fence with it.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  parseSource,
  pipelineSources,
  type SourceUnit,
} from '../gate-slots.spec-helper.spec';

const OWNERS_FILE = 'gate-8r.owners.ts';

/**
 * Every name the code NAMES: an identifier, a property being read or written, and a string literal.
 * Comments are not in the tree, so they cannot satisfy or trip this fence.
 */
const namesIn = (sf: ts.SourceFile): Set<string> => {
  const out = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) out.add(n.text);
    else if (ts.isStringLiteralLike(n)) out.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

/** Every property read spelled `x.name` or `x['name']`, with the node, so a position can be asked. */
const propertyReads = (
  sf: ts.SourceFile,
): { name: string; start: number; end: number }[] => {
  const out: { name: string; start: number; end: number }[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n))
      out.push({
        name: n.name.text,
        start: n.getStart(sf),
        end: n.getEnd(),
      });
    else if (
      ts.isElementAccessExpression(n) &&
      ts.isStringLiteralLike(n.argumentExpression)
    )
      out.push({
        name: n.argumentExpression.text,
        start: n.getStart(sf),
        end: n.getEnd(),
      });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

/** The span of the declaration `const <name> = …`, or null when the file does not declare it. */
const declarationSpan = (
  sf: ts.SourceFile,
  name: string,
): { start: number; end: number } | null => {
  let found: { start: number; end: number } | null = null;
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name
    )
      found = { start: n.getStart(sf), end: n.getEnd() };
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
};

/**
 * What the duty may NEVER be read from. Each is either a member of the submission's transport (the
 * carrier, a header, a claimed profile) or a context member that belongs to another gate's
 * antecedent. `locale` and its neighbours are here because A2 gives "the envelope's locale" no
 * carrier to the ingress: the owner resolves it from the record, and the gate never asks.
 */
const FORBIDDEN: readonly string[] = [
  'carrier',
  'profile_id',
  'profileId',
  'headers',
  'header',
  'locale',
  'locale_hint',
  'defaultLocale',
  'preferredLocale',
  'x-maya-render-profile',
  'verificationLevel',
  'channelMaxLevel',
  'actor',
  'principal',
  'principalProofHash',
  'facts',
  'ACTUATING',
  'SPOKEN_CARRIERS',
];

/** What the antecedent must NAME, or it is reading something other than the row's own duty. */
const REQUIRED: readonly string[] = [
  'confirmation',
  'requires_readback',
  'readback_ref',
  'body_hash',
  'affirmation',
  'bodyHash',
  'isReadbackAffirmation',
];

/** The recompute's two terms: permitted, and permitted only inside the recompute. */
const RECOMPUTE_TERMS: readonly string[] = ['effect', 'deliveryChannel'];
const RECOMPUTE = 'recomputeRequiresReadback';

const slotUnits = (slot: string): SourceUnit[] =>
  pipelineSources().slotUnits.filter((u) => u.slot === slot);

const ownersUnit = (): SourceUnit => ({
  slot: '8-R',
  file: `gates/${OWNERS_FILE}`,
  source: fs.readFileSync(path.join(__dirname, OWNERS_FILE), 'utf8'),
});

/** The rules, each as a function over one unit, so the controls below can run the same code. */
const forbiddenNames = (unit: SourceUnit): string[] => {
  const names = namesIn(parseSource(unit.file, unit.source));
  return FORBIDDEN.filter((f) => names.has(f)).map((f) => `${unit.file}: ${f}`);
};

const recomputeTermsOutsideTheRecompute = (unit: SourceUnit): string[] => {
  const sf = parseSource(unit.file, unit.source);
  const span = declarationSpan(sf, RECOMPUTE);
  return propertyReads(sf)
    .filter((p) => RECOMPUTE_TERMS.includes(p.name))
    .filter((p) => span === null || p.start < span.start || p.end > span.end)
    .map((p) => `${unit.file}: ${p.name} is read outside ${RECOMPUTE}`);
};

describe('T-SRC-8R — slot 8-R reads the record’s stored duty, and the recompute’s two terms', () => {
  // MERGE FIX (U8R's merge): `ownersUnit()` was added because the owner file was NOT derivable while
  // the slot read the gate's own default. R8R-1 injects the owner set, so `slotUnits('8-R')` now
  // derives `gates/gate-8r.owners.ts` on its own — the derivation follows a slot through a DI member
  // (`gate-slots.spec-helper.spec.ts`). The explicit unit is kept so the fence still reads the owner
  // file if the wiring ever changes shape, and the two are deduplicated by file.
  const units = [...slotUnits('8-R'), ownersUnit()].filter(
    (u, i, all) => all.findIndex((x) => x.file === u.file) === i,
  );

  it('T-SRC-8R (0) reads the slot it guards: the files are derived from the gateway’s array, and `gates/gate8r.ts` is one of them', () => {
    expect(pipelineSources().order).toContain('8-R');
    expect(units.map((u) => u.file).sort()).toEqual([
      'gates/gate-8r.owners.ts',
      'gates/gate8r.ts',
      'intent-gateway.service.ts#slot-8-R',
    ]);
  });

  it('T-SRC-8R (a): no file of slot 8-R names a carrier, a claimed render profile, a header, a locale or another gate’s antecedent', () => {
    expect(units.flatMap(forbiddenNames)).toEqual([]);
  });

  it('T-SRC-8R (b): the antecedent names the stored duty and the owner it asks about membership', () => {
    const names = new Set(
      units.flatMap((u) => [...namesIn(parseSource(u.file, u.source))]),
    );
    expect(REQUIRED.filter((r) => !names.has(r))).toEqual([]);
  });

  it('T-SRC-8R (c): `effect` and `deliveryChannel` are read ONLY inside the recompute (B-17), so an effect-keyed antecedent cannot return as a second read', () => {
    expect(units.flatMap(recomputeTermsOutsideTheRecompute)).toEqual([]);
  });

  it('T-SRC-8R (d): the stored duty is compared to the boolean `true` by identity — the source says so, and no coercion stands in for it', () => {
    const gate = units.find((u) => u.file === 'gates/gate8r.ts');
    expect(gate?.source).toMatch(/c\.requires_readback === true/);
  });

  describe('each rule is red for its own reason (planted violations)', () => {
    const unit = (source: string): SourceUnit => ({
      slot: '8-R',
      file: 'planted.ts',
      source,
    });

    it('RED: a carrier read comes back', () => {
      expect(
        forbiddenNames(
          unit(
            "export const g = (ctx: C) => ctx.carrier === 'realtime-voice';",
          ),
        ),
      ).toEqual(['planted.ts: carrier']);
    });

    it('RED: a claimed render profile is read', () => {
      // The plant's name is ASSEMBLED, never spelled: P-F88's F88-7 ratchet scans every source under
      // `src/widgets` for a read of `profile_id`, and a fence that must name the member it forbids
      // would otherwise trip the ratchet that forbids reading it.
      const claimed = `profile${'_'}id`;
      expect(
        forbiddenNames(unit(`export const g = (s: S) => s.${claimed};`)),
      ).toEqual([`planted.ts: ${claimed}`]);
    });

    it('RED: the effect is read outside the recompute', () => {
      expect(
        recomputeTermsOutsideTheRecompute(
          unit(
            `export const ${RECOMPUTE} = (r: R) => r.effect === 'COMMIT';\n` +
              "export const g = (r: R) => r.effect === 'DRAFT';\n",
          ),
        ),
      ).toEqual([`planted.ts: effect is read outside ${RECOMPUTE}`]);
    });

    it('GREEN control: the same two terms inside the recompute are permitted', () => {
      expect(
        recomputeTermsOutsideTheRecompute(
          unit(
            `export const ${RECOMPUTE} = (r: R) =>\n` +
              "  r.effect === 'COMMIT' && tierOf(r.deliveryChannel) === 'SPOKEN';\n",
          ),
        ),
      ).toEqual([]);
    });

    it('a comment that mentions a forbidden member is not a read', () => {
      expect(
        forbiddenNames(
          unit('// this gate never reads ctx.carrier\nexport const g = 1;\n'),
        ),
      ).toEqual([]);
    });
  });
});
