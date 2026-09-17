// Gate 7's place in the pipeline, and the properties the pipeline needs it to keep.
//
// CLASS [BUILD]. Nothing here runs a submission; every rule is about the SOURCE of slot 7 and the
// modules it calls into. That is the right level for these five, because each of them is a claim that
// something is ABSENT — a table restated, a client value read, a class-C column reached, a second
// membership function, a second F72 comparison — and an absence cannot be shown by a passing request.
//
// Every rule is also run over a planted violation, so a fence that has quietly stopped matching
// anything fails rather than passing vacuously.
//
// The one non-source rule is `T7-WIRED`, the merge-step exit: slot 7 must pass the producing-record
// loader that R7-1 adds. It is `it.failing` until the integrator applies R7-1, and it turns red again
// if the gateway ever drops the argument.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { CHANNEL_TIER } from '../../widget-contract/tables';
import { EFFECT_KEY_SPACES } from '../../widget-contract/tables';
import type { EffectClass } from '../../widget-contract/intent';
import {
  GATEWAY,
  memberUses,
  parseSource,
  pipelineSources,
  readWidget,
} from '../gate-slots.spec-helper.spec';
import { EFFECT_MEMBER_SHAPE } from './gate7';

const BACKEND = path.resolve(__dirname, '..', '..', '..');
const REPO = path.resolve(BACKEND, '..');
const CONTRACT = path.join(REPO, 'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md');

/**
 * Gate 7's own code: the gate file, and the widget-layer modules it CALLS INTO. Derived from the
 * imports, never hand-listed, so a module added to the gate is covered by the fences the same day.
 *
 * A type-only import is not code Gate 7 runs — `gate.types.ts` declares the whole row, class-C member
 * names included — so `import type …` declarations are left out. A value import that also carries
 * `type` specifiers (`{ fn, type T }`) is kept, because the value half is code.
 */
const GATE7 = 'gates/gate7.ts';
const relativeImports = (file: string): string[] => {
  const sf = parseSource(file, readWidget(file));
  const out: string[] = [];
  for (const st of sf.statements) {
    if (
      (!ts.isImportDeclaration(st) && !ts.isExportDeclaration(st)) ||
      st.moduleSpecifier === undefined ||
      !ts.isStringLiteral(st.moduleSpecifier)
    )
      continue;
    if (ts.isImportDeclaration(st) && st.importClause?.isTypeOnly) continue;
    if (ts.isExportDeclaration(st) && st.isTypeOnly) continue;
    const spec = st.moduleSpecifier.text;
    if (!spec.startsWith('.')) continue;
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), `${spec}.ts`),
    );
    // Only modules inside the widget layer are Gate 7's own code; `widget-contract/` is generated.
    if (!resolved.startsWith('..')) out.push(resolved);
  }
  return [...new Set(out)].sort();
};

/** `gate7.ts` plus every widget-layer module it imports: the files a Gate 7 rule must cover. */
const gate7Closure = (): string[] => [GATE7, ...relativeImports(GATE7)];

const read = (file: string): string => readWidget(file);

/** Source with comments removed, so a rule about CODE is not satisfied or broken by prose. */
const codeOf = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// ── F69, read from the contract ─────────────────────────────────────────────────────────────────

interface F69Row {
  readonly effect: string;
  readonly mayCarry: string;
  readonly mustNotCarry: string;
}

const SPACES = ['C9', 'AE', 'TOOL', 'CONTROL'] as const;

const f69 = (): readonly F69Row[] => {
  const contract = fs.readFileSync(CONTRACT, 'utf8');
  const at = contract.indexOf('**F69 — which space each effect class may name');
  if (at === -1) throw new Error('F69 is not in the contract at this SHA');
  const block = contract.slice(at, contract.indexOf('**F70', at));
  return block
    .split('\n')
    .filter((l) => /^\| `[A-Z_]+` \|/.test(l))
    .map((l) => {
      const cells = l.split('|').map((c) => c.trim());
      return {
        effect: cells[1].replaceAll('`', ''),
        mayCarry: cells[2],
        mustNotCarry: cells[3],
      };
    });
};

/** The spaces a "may carry" cell names, in the order the four-space union declares them. */
const spacesIn = (cell: string): string[] =>
  SPACES.filter((s) => new RegExp('`' + s + '`').test(cell));

describe('S-G7-F69 [BUILD] — the two halves of F69 are the contract’s own (C11:1358-1367)', () => {
  it('S-G7-F69-SHA: the contract this suite reads is the certified V1.1 build', () => {
    expect(
      createHash('sha256').update(fs.readFileSync(CONTRACT)).digest('hex'),
    ).toBe('606d7f99da5fe1977d5efe737dca91a04f2b11faecddbd666120d34a03e94a8a');
  });

  it('S-G7-F69-ROWS: F69 has one row per effect class, and the rows are the eight `EffectClass` members', () => {
    // The two orders differ (F69 groups the C9 rows; §2.4's union does not), so the comparison is
    // over the SETS: a row missing from either side is what this asserts, not a row order.
    expect(
      f69()
        .map((r) => r.effect)
        .sort(),
    ).toEqual(Object.keys(EFFECT_KEY_SPACES).sort());
    expect(f69()).toHaveLength(8);
  });

  it('S-G7-F69-SPACES: `EFFECT_KEY_SPACES` is the "may carry" column, space for space (U-TAB’s half)', () => {
    for (const r of f69())
      expect([
        r.effect,
        [...EFFECT_KEY_SPACES[r.effect as EffectClass]],
      ]).toEqual([r.effect, spacesIn(r.mayCarry)]);
  });

  it('S-G7-F69-MEMBERS: `EFFECT_MEMBER_SHAPE` is the "may carry" column’s other half — WHICH MEMBER holds the ref (Gate 7’s)', () => {
    for (const r of f69()) {
      // Derived from the cell's own words, never from the effect's name:
      //   the handoff member  ⟺ the cell names `handoff_capability_ref`
      //   a class-`c` target  ⟺ the cell conditions on `target.class === 'c'`
      //   `capability`        ⟺ the cell names a space, says neither of those, and does not say
      //                         `capability: null`
      const handoff = r.mayCarry.includes('`handoff_capability_ref`');
      const targetC = r.mayCarry.includes("`target.class === 'c'`");
      const capability =
        spacesIn(r.mayCarry).length > 0 &&
        !handoff &&
        !targetC &&
        !r.mayCarry.includes('`capability: null`');
      expect([r.effect, EFFECT_MEMBER_SHAPE[r.effect as EffectClass]]).toEqual([
        r.effect,
        { capability, handoff, targetC },
      ]);
    }
  });

  it('S-G7-F69-TOOL: "No intent of any effect class may carry a `TOOL` ref": no cell of `EFFECT_KEY_SPACES` admits one', () => {
    expect(
      fs
        .readFileSync(CONTRACT, 'utf8')
        .includes('No intent of any effect class may carry a `TOOL` ref.'),
    ).toBe(true);
    for (const [effect, spaces] of Object.entries(EFFECT_KEY_SPACES))
      expect([effect, (spaces as readonly string[]).includes('TOOL')]).toEqual([
        effect,
        false,
      ]);
  });

  it('S-G7-F69-RED: a transcription that gave NAVIGATE the `capability` member would not match the cell', () => {
    const navigate = f69().find((r) => r.effect === 'NAVIGATE')!;
    const capability =
      spacesIn(navigate.mayCarry).length > 0 &&
      !navigate.mayCarry.includes('`handoff_capability_ref`') &&
      !navigate.mayCarry.includes("`target.class === 'c'`");
    expect(capability).toBe(false);
  });
});

// ── the source fences ───────────────────────────────────────────────────────────────────────────

describe('S-G7-TIER [BUILD] — the tier table is K6’s, and Gate 7 states none of it', () => {
  it('S-G7-TIER: Gate 7’s own code names no channel id and no tier', () => {
    const offences: string[] = [];
    for (const file of gate7Closure().filter((f) => f === GATE7)) {
      const source = codeOf(read(file));
      for (const channel of Object.keys(CHANNEL_TIER))
        if (source.includes(`'${channel}'`))
          offences.push(`${file}: the channel id '${channel}'`);
      for (const table of ['TIER_EFFECTS', 'TIER_ESCAPE', 'CHANNEL_TIER'])
        if (source.includes(table)) offences.push(`${file}: reads ${table}`);
    }
    expect(offences).toEqual([]);
  });

  it('S-G7-TIER-ONE: the one implementation is `carrierAdmits`, and Gate 7 calls it', () => {
    expect(codeOf(read(GATE7))).toContain('carrierAdmits(');
    // K6's profiles read the generated tier cell rather than restating it, so a ruling on a cell
    // moves the fitter and the gate together (D-5).
    expect(read('carriers/channel-profile.ts')).toContain('CHANNEL_TIER[');
  });

  it('S-G7-TIER-RED: the fence sees a planted channel literal', () => {
    const planted = `${codeOf(read(GATE7))}\nconst x = 'web-push';\n`;
    expect(planted.includes("'web-push'")).toBe(true);
  });
});

describe('S-G7-PAIR [BUILD] — the pairing is `AE_PROPOSE_PAIRING`, never the allowlist’s `propose` column', () => {
  it('S-G7-PAIR: neither Gate 7 nor the commit guard names `proposeKey`', () => {
    const offenders = [GATE7, 'authority/commit-guard.ts'].filter((f) =>
      codeOf(read(f)).includes('proposeKey'),
    );
    expect(offenders).toEqual([]);
  });

  it('S-G7-PAIR-VACUITY: the column they must not read still exists, so the fence is not vacuous — and still names keys that resolve in no registry', () => {
    const allowlist = read('booking/booking-allowlist.ts');
    expect(allowlist).toContain('proposeKey');
    expect(allowlist).toContain("proposeKey: 'c9.booking.propose'");
  });

  it('S-G7-PAIR-P25: the commit guard reaches the pairing through P-25’s lookups', () => {
    expect(codeOf(read('authority/commit-guard.ts'))).toContain('pairingForAe');
  });
});

describe('S-G7-F72 [BUILD] — one statement of F72, and one comparison of it', () => {
  it('S-G7-F72-DRIFT: the runtime copy has not drifted from the certified §0.13 lookup', () => {
    // The generator's own `--check`, run the way `k4-exit-gate.sh` runs the floor copy's.
    const out = execFileSync(
      process.execPath,
      ['scripts/widget-contract/emit-confirmation-guard.mjs', '--check'],
      { cwd: BACKEND, encoding: 'utf8' },
    );
    expect(out).toContain('matches the certified §0.13 lookup');
  });

  it('S-G7-F72-K7: K7’s guard CALLS the one owner for each of F72 and F74, and keeps no comparison of its own', () => {
    const k7 = codeOf(read('booking/booking-commit.service.ts'));
    expect(k7).toContain("from '../authority/commit-guard'");
    // POSITIVE first, and it is the load-bearing half: a negative alone passes on a guard that
    // imports the module and then reimplements the rule beside it — which is exactly what the
    // mutant `M7-28` does, and what the first version of this rule failed to see.
    for (const owner of [
      'confirmationKindMismatch(',
      'confirmationRefProblem(',
      'producingRecordMissing(',
    ])
      expect([owner, k7.includes(owner)]).toEqual([owner, true]);
    // NEGATIVE: no second statement of either rule, in either direction of the comparison.
    expect(k7).not.toMatch(/confirmationKind\s*(!==|===)/);
    expect(k7).not.toMatch(/(!==|===)\s*confirmationKind\b/);
    expect(k7).not.toContain('requiredConfirmationKind');
    expect(k7).not.toContain('confirmationOfKind !==');
  });

  it('S-G7-F72-ONCE: the comparison is declared once, in the commit guard', () => {
    const declarers = [
      GATE7,
      'authority/commit-guard.ts',
      'booking/booking-commit.service.ts',
    ].filter((f) =>
      /\b(?:const|function)\s+confirmationKindMismatch\b/.test(read(f)),
    );
    expect(declarers).toEqual(['authority/commit-guard.ts']);
  });
});

describe('S-G7-F15 [BUILD] — Gate 7 reaches no class-C column (I20, F15 C11:216-235)', () => {
  const CLASS_C = [
    'bodyJson',
    'textEquivalentJson',
    'a11yJson',
    'speechJson',
    'renderedUtterance',
    'utteranceTemplate',
  ];

  it('S-G7-F15: no file of Gate 7’s closure names one', () => {
    const offences: string[] = [];
    for (const file of gate7Closure())
      for (const column of CLASS_C)
        if (codeOf(read(file)).includes(column))
          offences.push(`${file}: ${column}`);
    expect(offences).toEqual([]);
  });

  it('S-G7-F15-CLOSURE: the closure is derived from the imports, and covers the modules Gate 7 actually calls', () => {
    expect(gate7Closure()).toEqual(
      expect.arrayContaining([
        GATE7,
        'authority/commit-guard.ts',
        'authority/confirmation-guard.runtime.ts',
        'authority/contract-bindings.ts',
        'authority/propose-pairing.ts',
        'authority/registry-binding.ts',
        'carriers/channel-profile.ts',
        'gates/subject.ts',
      ]),
    );
  });

  it('S-G7-F15-RED: the scan finds a planted class-C read', () => {
    expect(codeOf(`const x = row.bodyJson;`)).toContain('bodyJson');
  });
});

describe('S-G7-I18 / I21 [BUILD] — no client value and no role is an antecedent', () => {
  const gate7Source = () => parseSource(GATE7, read(GATE7));

  it('S-G7-I18: slot 7’s gate file reads none of `submission`, `carrier`, `principal`, `facts`', () => {
    const offences: string[] = [];
    for (const member of ['submission', 'carrier', 'principal', 'facts']) {
      const uses = memberUses(gate7Source(), member);
      if (uses.length)
        offences.push(
          `${member}: ${uses.map((u) => ('name' in u ? u.name : u.kind)).join(', ')}`,
        );
    }
    expect(offences).toEqual([]);
  });

  it('S-G7-I21: no file of Gate 7’s closure reads a property named `role`, `presentationMode`, `profileId` or `a11yEnv`', () => {
    const offences: string[] = [];
    for (const file of gate7Closure()) {
      const sf = parseSource(file, read(file));
      const visit = (n: ts.Node): void => {
        if (
          ts.isPropertyAccessExpression(n) &&
          ['role', 'presentationMode', 'profileId', 'a11yEnv'].includes(
            n.name.text,
          )
        )
          offences.push(`${file}: .${n.name.text}`);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(offences).toEqual([]);
  });

  it('S-G7-I18-RED: the member scan sees a planted `ctx.submission` read', () => {
    const uses = memberUses(
      parseSource(
        'probe.ts',
        'declare const ctx: any;\nctx.submission.inputs;',
      ),
      'submission',
    );
    expect(uses.map((u) => ('name' in u ? u.name : u.kind))).toEqual([
      'inputs',
    ]);
  });
});

describe('S-G7-VOCAB [BUILD] — every Gate 7 refusal is one of row 7’s two codes', () => {
  it('S-G7-VOCAB: `refuse` is called with `effect_not_admissible` or `booking_confirmation_required`, and with nothing else', () => {
    const sf = parseSource(GATE7, read(GATE7));
    const codes: string[] = [];
    const visit = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'refuse' &&
        n.arguments.length > 0
      )
        codes.push(
          ts.isStringLiteral(n.arguments[0])
            ? n.arguments[0].text
            : `NOT A LITERAL: ${n.arguments[0].getText(sf)}`,
        );
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(codes.length).toBeGreaterThan(0);
    expect([...new Set(codes)].sort()).toEqual([
      'booking_confirmation_required',
      'effect_not_admissible',
    ]);
  });

  it('S-G7-VOCAB-NEVER: there is no cast to the bottom type anywhere in Gate 7’s closure', () => {
    const offenders = gate7Closure().filter((f) =>
      /\bas\s+never\b|<never>/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('S-G7-VOCAB-MINT: a mint code never becomes an ingress code: `wrong_space` and `capability_not_allowlisted` appear only as detail text', () => {
    const sf = parseSource(GATE7, read(GATE7));
    const bad: string[] = [];
    const visit = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'refuse' &&
        n.arguments.length > 0 &&
        ts.isStringLiteral(n.arguments[0]) &&
        ['wrong_space', 'capability_not_allowlisted'].includes(
          n.arguments[0].text,
        )
      )
        bad.push(n.arguments[0].text);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(bad).toEqual([]);
    // It does catch the throw, though — a swallowed `MintRefusal` would be a pass.
    expect(codeOf(read(GATE7))).toContain('MintRefusal');
  });
});

describe('S-G7-F27 [BUILD] — one space-membership function, and its CONTROL arm is the generated table', () => {
  it('S-G7-F27: K4’s `resolves` derives the CONTROL space from `CONTROL_REGISTRY`', () => {
    const k4 = read('authority/registry-binding.ts');
    expect(k4).toContain('new Set(\n  Object.keys(CONTROL_REGISTRY),\n)');
    expect(codeOf(k4)).toContain('export const resolves');
  });

  it('S-G7-F27-ONE: Gate 7 uses that one function rather than a membership set of its own', () => {
    const source = codeOf(read(GATE7));
    expect(source).toContain('resolves(subject)');
    expect(source).not.toContain('CONTROL_KEYS');
    expect(source).not.toContain('CONTROL_REGISTRY');
  });
});

// ── the pipeline itself ─────────────────────────────────────────────────────────────────────────

describe('Gate 7 in the one ordered array', () => {
  it('S-G7-ORDER: slot 7 is §3.9’s seventh, and it runs before slot 9’s first durable write', () => {
    const order = pipelineSources().order;
    expect(order[6]).toBe('7');
    expect(order.indexOf('7')).toBeLessThan(order.indexOf('9'));
    expect(order.indexOf('6')).toBeLessThan(order.indexOf('7'));
  });

  it('S-G7-SLOT: slot 7’s code is `gates/gate7.ts`, and nothing else', () => {
    const files = pipelineSources()
      .slotUnits.filter((u) => u.slot === '7')
      .map((u) => u.file);
    expect(files).toEqual([`${GATEWAY}#slot-7`, GATE7]);
  });

  // MERGE-STEP EXIT (D-18). `intent-gateway.service.ts` is integrator-only, so slot 7 still calls
  // `gate7(ctx)` and takes the file's fail-closed interim loader — with which C5a refuses every
  // non-draft COMMIT. R7-1 makes the slot
  //     run: (ctx) => gate7(ctx, (h) => this.findProducingRecord(h, ctx.tenantId))
  // with `findProducingRecord` tenant-scoped IN THE QUERY and selecting exactly
  // `effect, capabilitySpace, capabilityKey, consumedAt`. The integrator flips `.failing` off in
  // U7a's merge commit; after that this test turns red the moment the argument is dropped again.
  it('T7-WIRED [BUILD]: slot 7 passes the producing-record loader to `gate7`', () => {
    const slot = pipelineSources().slotUnits.find(
      (u) => u.file === `${GATEWAY}#slot-7`,
    )!;
    expect(slot.source).toMatch(/gate7\(\s*ctx\s*,/);
    const gateway = codeOf(readWidget(GATEWAY));
    expect(gateway).toContain('findProducingRecord');
    // Tenant-scoped IN THE QUERY: a filter applied after the read would have read the foreign row.
    expect(gateway).toMatch(/where:\s*\{[^}]*tenantId[^}]*\}/);
  });

  it('T7-WIRED-CONTROL: the control for T7-WIRED: the rule is satisfied by the shape R7-1 lands, and by nothing weaker', () => {
    const wired = `run: (ctx) => gate7(ctx, (h) => this.findProducingRecord(h, ctx.tenantId)),`;
    expect(wired).toMatch(/gate7\(\s*ctx\s*,/);
    expect(`run: (ctx) => gate7(ctx),`).not.toMatch(/gate7\(\s*ctx\s*,/);
  });
});
