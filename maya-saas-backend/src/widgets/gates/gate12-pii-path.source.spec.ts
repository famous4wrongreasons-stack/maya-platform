// P-K4K8 — the widget layer holds NO PII path of its own (GATES-PLAN-V11 Wave 1).
//
// What is being removed, and why it is not a security regression:
//
//   F95 item 2 (C11:1882-1886) rules the "five enforcement points" count UNPROVEN — "the five are
//   enumerated nowhere" — and keeps exactly this remainder normative: **no widget-layer module may
//   implement PII masking of its own**, and the projector reaches a capability only through the same
//   service call sites the non-widget read paths use. The five fences in `authority/pii-fences.ts`
//   and the presentation fence in `client/client-presentation.ts` were pure functions reached from
//   nowhere on the live admission path: slot 12 called `gate12(ctx)` with no subject, so the carrier
//   ceiling could only pass, and `evaluatePresentation` had no caller at all. A fence nothing calls
//   protects nobody, and asserting that a dead one is well formed reads as coverage it does not have.
//   F18 (C11:292-296, C.5 correction C11:7333) declares THREE presentation modes; the fourth mode
//   `'system'` in `client-presentation.ts:23` contradicts it.
//
//   Masking stays where it is enforced today: in the capability owners (F95). The gate-12 clause the
//   re-audit scores is G12-R4 "no widget PII path" — an ABSENCE. So the replacement for the deleted
//   assertions is this ratchet plus ARCH-12-2 in `../projection/*.architecture.spec.ts` (U12a): the
//   mechanism cannot come back into `src/widgets/**` without a named test going red.
//
// Add-only (D-18): the implementer adds this file; the integrator performs the deletions in the
// merge commit (IR-K4K8-1). K4K8-1 and K4K8-2 are green BEFORE that commit — they already hold over
// the whole widget tree outside the six files the unit touches. K4K8-3 is the merge-step exit: it is
// `it.failing` until the deletions land, and the integrator flips it to `it` in the same commit,
// which is what widens K4K8-1's and K4K8-2's reach to those six files too.

import fs from 'node:fs';
import path from 'node:path';

const WIDGETS = path.resolve(__dirname, '..');
const rel = (p: string): string =>
  path.relative(WIDGETS, p).split(path.sep).join('/');

/** The three modules IR-K4K8-1 deletes. Once they are gone this exclusion is inert. */
const DELETED_MODULES = [
  'authority/pii-fences.ts',
  'client/client-presentation.ts',
  'gates/gate12.ts',
] as const;

/** The three spec files IR-K4K8-1 rewrites: gate12's own cases, and the two fence sections. */
const REWRITTEN_SPECS = [
  'gates/gate12.spec.ts',
  'authority/authority.spec.ts',
  'client/wave3.spec.ts',
] as const;

const TOUCHED = new Set<string>([
  ...DELETED_MODULES,
  ...REWRITTEN_SPECS,
  rel(__filename),
]);

/**
 * The deleted mechanism, by name. Every one of these is an export of `pii-fences.ts`,
 * `client-presentation.ts` or the legacy `gate12.ts`, or a private helper of one of them; none is
 * used anywhere else in the widget layer. A ratchet on names, not on the word "mask": the widget
 * layer legitimately carries `data_scope.masked_fields` (G12-R5), and P-F88's forbidden-key walk
 * legitimately carries a key list, so a heuristic over either would refuse work other units own.
 */
const DELETED_SYMBOLS = [
  'PII_FENCES',
  'PiiFenceName',
  'PII_KEYS',
  'walkForPii',
  'clientPreviewFence',
  'llmBoundaryFence',
  'artifactPiiFence',
  'spokenReadbackFence',
  'secureSurfaceFence',
  'CARRIER_PII_CEILING',
  'PII_RANK',
  'DATA_FENCES',
  'FENCE_FUNCTIONS',
  'DataFenceSubject',
  'evaluatePresentation',
] as const;

// Module specifiers that resolve to a deleted module, however the importer spells the prefix.
// Deliberately not a `/g` regex: `RegExp.prototype.test` carries `lastIndex` between calls when it
// is global, so a shared one would skip files depending on where the previous match ended.
const DELETED_MODULE_SPECIFIER =
  /from\s+'[^']*\/(?:pii-fences|client-presentation|gate12)'/;

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? walk(path.join(dir, e.name))
        : e.isFile() && e.name.endsWith('.ts')
          ? [path.join(dir, e.name)]
          : [],
    );

const widgetFiles = (): ReadonlyArray<readonly [string, string]> =>
  walk(WIDGETS)
    .map((p) => [rel(p), fs.readFileSync(p, 'utf8')] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));

const outsideTheUnit = (): ReadonlyArray<readonly [string, string]> =>
  widgetFiles().filter(([name]) => !TOUCHED.has(name));

/** Every `type`/`const` declaration of a presentation mode, with the modes it spells. */
const presentationModeDeclarations = (
  text: string,
): ReadonlyArray<readonly string[]> =>
  [...text.matchAll(/(?:type|const)\s+PresentationMode\b[^;]*;/g)].map((m) =>
    [...m[0].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]),
  );

describe('P-K4K8 — no widget-layer PII path (F95 item 2, F18)', () => {
  it('K4K8-0 [BUILD] reads the widget tree it guards, down to its leaves', () => {
    // A scan that stopped at the top level, or found nothing, would make every ratchet below
    // vacuously green. The anchors are three files in three different subdirectories that survive
    // IR-K4K8-1, so this case reads the same before and after the merge commit.
    const names = widgetFiles().map(([n]) => n);
    expect(names.length).toBeGreaterThan(40);
    for (const f of [
      'authority/capability-policy.ts',
      'gates/verdict.ts',
      'client/wave3.spec.ts',
    ])
      expect(names).toContain(f);
    // And the exclusion removes only the unit's own files, never a whole directory.
    expect(outsideTheUnit()).toHaveLength(
      names.length - names.filter((n) => TOUCHED.has(n)).length,
    );
  });

  it('K4K8-1 [BUILD] no widget module outside P-K4K8 names the deleted PII mechanism', () => {
    const offenders = outsideTheUnit().flatMap(([name, text]) =>
      DELETED_SYMBOLS.filter((s) => new RegExp(`\\b${s}\\b`).test(text)).map(
        (s) => `${name}: ${s}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('K4K8-2 [BUILD] no widget module outside P-K4K8 declares a fourth presentation mode', () => {
    // F18 declares three. `client-presentation.ts` adds `'system'`; nothing may add it back.
    const offenders = outsideTheUnit()
      .flatMap(([name, text]) =>
        presentationModeDeclarations(text).map(
          (modes) => [name, modes] as const,
        ),
      )
      .filter(([, modes]) => modes.includes('system'))
      .map(([name, modes]) => `${name}: ${modes.join('|')}`);
    expect(offenders).toEqual([]);
  });

  it('K4K8-3 [BUILD] the deleted modules are gone, nothing imports them, and no P-K4K8 file still names them', () => {
    for (const f of DELETED_MODULES)
      expect([f, fs.existsSync(path.join(WIDGETS, f))]).toEqual([f, false]);

    const importers = widgetFiles()
      .filter(([name]) => name !== rel(__filename))
      .filter(([, text]) => DELETED_MODULE_SPECIFIER.test(text))
      .map(([name]) => name);
    expect(importers).toEqual([]);

    const survivors = widgetFiles()
      .filter(([name]) => name !== rel(__filename))
      .flatMap(([name, text]) =>
        DELETED_SYMBOLS.filter((s) => new RegExp(`\\b${s}\\b`).test(text)).map(
          (s) => `${name}: ${s}`,
        ),
      );
    expect(survivors).toEqual([]);
  });
});
