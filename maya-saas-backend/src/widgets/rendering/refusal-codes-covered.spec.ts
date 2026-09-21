// P-RENDER exit tests REN-1, REN-3 and REN-6 (GATES-PLAN-V11, Wave 1). Class BUILD: the rendering
// map's totality and the two interlocks. Not live proof — no gate runs here.
//
//   REN-1  the reason table covers every §3.9 refusal code, every response outcome §4.5.2 L8 names,
//          and every §1.3 `ReasonCode`, and carries no row that is none of those.
//   REN-3  `RefusalCode ⊆ table`. U8b removes the final interim-only refusal member, so this is a
//          normal passing interlock: adding any future refusal without a rendering row fails build.
//   REN-6  `widgets.runtime` is granted by exactly one path. Stated here as a spec AND requested as
//          an extension of k3 check 8 (IR-REN-2), because the two catch different things: k3 reads
//          the plan and trial rules, this reads the migrations, seeds and scripts. The scanner is
//          run over planted trees as well as over the repository, so a scanner that answered "no
//          violations" to everything would be caught.
//
// The code lists below are TRANSCRIBED from the contract, and each transcription is checked against
// the contract's own bytes in the same test. A transcription nobody re-reads is a comment.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { LIMITATION_REASON_TABLE } from '../../widget-contract/reason-table';
import { reasonText, reasonTextOrNull } from './reason-text';

describe('P-RENDER — R3.9.3 rendering: the map is total and the grant path is one', () => {
  const BE = path.resolve(__dirname, '..', '..', '..');
  const REPO = path.resolve(BE, '..');
  const CONTRACT = fs.readFileSync(
    path.resolve(REPO, 'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md'),
    'utf8',
  );

  /** §3.9's gate table (C11:4718-4734), located by its header rather than by a pinned line. */
  const gateTableRows = (): string[] => {
    const header =
      '| # | Gate | What it checks | Rejects with | Runs in | Status |';
    const at = CONTRACT.indexOf(header);
    expect(at).toBeGreaterThan(-1);
    expect(CONTRACT.indexOf(header, at + 1)).toBe(-1);
    return CONTRACT.slice(at)
      .split('\n')
      .slice(2, 2 + 15) // the separator, then rows 1..14 with 8-R among them
      .filter((l) => l.startsWith('|'));
  };

  /** Every refusal code §3.9's "Rejects with" column names, in row order. */
  const GATE_REFUSAL_CODES = [
    'unauthenticated',
    'widget_principal_mismatch',
    'tenant_mismatch',
    'policy_floor_changed',
    'insufficient_authority',
    'effect_not_admissible',
    'booking_confirmation_required',
    'selection_out_of_domain',
    'bound_violation',
    'use_secure_surface',
    'oversize_submission',
    'readback_missing',
    'readback_mismatch',
    'intent_divergence',
    'handle_stale',
  ] as const;

  /**
   * The response outcomes. `EXPIRED` and `SUPERSEDED` are §3.9 row 1 and §4.5.2 L8 (C11:5506);
   * `NEEDS_SECOND_CHANNEL` and `HANDOFF_REQUIRED` are row 5. Their lowercase twins
   * `needs_second_channel` / `handoff_required` are members of the gateway's `RefusalCode` and are
   * covered by REN-3, not here.
   */
  const RESPONSE_OUTCOMES = [
    'EXPIRED',
    'SUPERSEDED',
    'NEEDS_SECOND_CHANNEL',
    'HANDOFF_REQUIRED',
  ] as const;

  /** §1.3's `ReasonCode` union, read from the compiled contract rather than retyped. */
  const reasonCodeMembers = (): string[] => {
    const envelope = fs.readFileSync(
      path.join(BE, 'src/widget-contract/envelope.ts'),
      'utf8',
    );
    const at = envelope.indexOf('export type ReasonCode =');
    expect(at).toBeGreaterThan(-1);
    const decl = envelope.slice(at, envelope.indexOf(';', at));
    const members = [...decl.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(members.length).toBeGreaterThan(0);
    return members;
  };

  it('REN-1 every §3.9 refusal code the contract prints has a LIMITATION_REASON_TABLE row', () => {
    const rows = gateTableRows();
    const printed = rows.join('\n');
    // The transcription is checked against the contract's bytes before it is used as a list.
    for (const code of GATE_REFUSAL_CODES) expect(printed).toContain(code);
    for (const outcome of RESPONSE_OUTCOMES) expect(printed).toContain(outcome);

    const missing = [...GATE_REFUSAL_CODES, ...RESPONSE_OUTCOMES].filter(
      (code) =>
        !Object.prototype.hasOwnProperty.call(LIMITATION_REASON_TABLE, code),
    );
    expect(missing).toEqual([]);
  });

  it('REN-1 every §1.3 ReasonCode has a row, because DenialProjection.reason_code is a table key', () => {
    const missing = reasonCodeMembers().filter(
      (code) =>
        !Object.prototype.hasOwnProperty.call(LIMITATION_REASON_TABLE, code),
    );
    expect(missing).toEqual([]);
  });

  it('REN-1 the table carries no row that is neither a §3.9 code, a response outcome nor a ReasonCode', () => {
    const permitted = new Set<string>([
      ...GATE_REFUSAL_CODES,
      ...RESPONSE_OUTCOMES,
      ...reasonCodeMembers(),
      // The gateway's own lowercase spelling of row 5's two outcomes (`RefusalCode`, REN-3).
      'needs_second_channel',
      'handoff_required',
    ]);
    const dead = Object.keys(LIMITATION_REASON_TABLE).filter(
      (k) => !permitted.has(k),
    );
    expect(dead).toEqual([]);
  });

  it('REN-1 every row states a reason code equal to its key, and a severity that is never error', () => {
    for (const [key, row] of Object.entries(LIMITATION_REASON_TABLE)) {
      expect(row.reason_code).toBe(key);
      expect(['limitation', 'caveat']).toContain(row.severity);
      expect(row.text_key.length).toBeGreaterThan(0);
    }
  });

  it('REN-1 the barrel hazard is checked, not commented: nobody reads the two tables through ./index', () => {
    // `envelope.ts` declares both names ambiently and `index.ts` re-exports it, so a barrel import
    // of either name resolves to the DECLARATION and is `undefined` at run time — a table that is
    // silently empty is worse than one that is missing. Two assertions, not a comment:
    //   (a) the barrel does not re-export this module (which would also make both names ambiguous);
    //   (b) no file anywhere imports either name from the barrel.
    const barrel = fs.readFileSync(
      path.join(BE, 'src/widget-contract/index.ts'),
      'utf8',
    );
    expect(barrel).not.toMatch(/reason-table/);

    const walkTs = (dir: string): string[] =>
      fs.existsSync(dir)
        ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
            const p = path.join(dir, e.name);
            if (e.isDirectory())
              return e.name === 'node_modules' ? [] : walkTs(p);
            return p.endsWith('.ts') ? [p] : [];
          })
        : [];
    const offenders: string[] = [];
    for (const file of [
      ...walkTs(path.join(BE, 'src')),
      ...walkTs(path.join(BE, 'test')),
      ...walkTs(path.join(BE, 'scripts')),
    ]) {
      const text = fs.readFileSync(file, 'utf8');
      // Anchored at column 0: an import statement starts a line, and a prose mention of one inside
      // a doc comment (this file and `reason-table.ts` both carry one) does not.
      for (const m of text.matchAll(
        /^import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']*widget-contract(?:\/index)?)'/gm,
      ))
        if (/LIMITATION_REASON_TABLE|C9_DENIAL_PROJECTION/.test(m[1]))
          offenders.push(
            `${path.relative(BE, file)} imports a rendering table from '${m[2]}'`,
          );
    }
    expect(offenders).toEqual([]);
  });

  // ── REN-3: the interlock ───────────────────────────────────────────────────────────────────────

  /** The `RefusalCode` union, read from `gate.types.ts`'s source (the union has no runtime value). */
  const refusalCodeMembers = (): string[] => {
    const types = fs.readFileSync(
      path.join(BE, 'src/widgets/gate.types.ts'),
      'utf8',
    );
    const at = types.indexOf('export type RefusalCode =');
    expect(at).toBeGreaterThan(-1);
    const decl = types.slice(at, types.indexOf(';', at));
    const members = [...decl.matchAll(/'([A-Za-z_]+)'/g)].map((m) => m[1]);
    expect(members.length).toBeGreaterThan(10);
    return members;
  };

  it('REN-3 every RefusalCode has a canonical rendering row after U8b', () => {
    const uncovered = refusalCodeMembers().filter(
      (code) =>
        !Object.prototype.hasOwnProperty.call(LIMITATION_REASON_TABLE, code),
    );
    expect(uncovered).toEqual([]);
    for (const code of refusalCodeMembers())
      expect(reasonTextOrNull(code)).toEqual(reasonText(code));
    expect(reasonTextOrNull('EXPIRED')).toEqual(reasonText('EXPIRED'));
    expect(reasonTextOrNull(null)).toBeNull();
  });

  // ── REN-6: one grant path for `widgets.runtime` ────────────────────────────────────────────────

  const RUNTIME_KEY = 'widgets.runtime';
  const WRITE_TOKEN =
    /tenantEntitlement\s*\.\s*(create|createMany|upsert|update|updateMany)|INSERT\s+INTO\s+"?TenantEntitlement"?/i;
  const GRANT_CALL = /grantFeature\s*\(/;
  /**
   * The one grant path, and the only places allowed to reach it. §2.6 constraint 8: granted "only by
   * `Fixtures.grantFeature` … called from the jest harness or from the BIN runner's guarded fixture
   * context". Three callers answer to that sentence:
   *   - `test/widgets-live/**` — the jest harness, including I-HAR's own BIN self-test cases;
   *   - `scripts/widgets-intent-http-proof.ts` — the BIN runner itself;
   *   - `scripts/widgets-http-proof/**` — the BIN runner's case directory. This is I-HAR's own
   *     convention, stated by the runner: "Each gate unit owns its cases in
   *     `scripts/widgets-http-proof/gate<N>.cases.ts`" and `DEFAULT_CASES_DIR` points there. A case
   *     file never constructs `Fixtures`; it receives `ctx.fixtures`, which IS the guarded context,
   *     and `BIN_CASE_GUARD` below refuses one that tries to build its own.
   */
  const GRANT_SOURCE = 'test/widgets-live/support/fixtures.ts';
  const CALLER_PREFIXES = ['test/widgets-live/', 'scripts/widgets-http-proof/'];
  const CALLER_FILE = 'scripts/widgets-intent-http-proof.ts';
  const BIN_CASES_PREFIX = 'scripts/widgets-http-proof/';
  /** A BIN case reaches the grant through the runner's context, never through the module. */
  const BIN_CASE_GUARD = /\.fixtures\s*\.\s*grantFeature\s*\(/;
  const FIXTURES_MODULE_IMPORT =
    /from\s*'[^']*widgets-live\/support\/fixtures'/;

  type Violation = { file: string; why: string };

  const walk = (dir: string): string[] =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
          return [p];
        })
      : [];

  /**
   * The scanner. Pure over a root directory, so the same bytes answer for the repository and for a
   * planted tree. Three rules:
   *   (a) a migration, seed or script that WRITES a `TenantEntitlement` row mentioning the key;
   *   (b) anything that reaches `grantFeature` for the key from outside the allowlisted callers;
   *   (c) a BIN case file that reaches it other than through the runner's guarded `ctx.fixtures`.
   */
  const scanEntitlementGrants = (root: string): Violation[] => {
    const rel = (p: string) => path.relative(root, p).split(path.sep).join('/');
    const violations: Violation[] = [];
    const writeScopes = ['prisma', 'scripts'];
    const callScopes = ['prisma', 'scripts', 'src', 'test'];
    for (const scope of new Set([...writeScopes, ...callScopes]))
      for (const file of walk(path.join(root, scope))) {
        const key = rel(file);
        let text: string;
        try {
          text = fs.readFileSync(file, 'utf8');
        } catch {
          continue; // a binary or unreadable artefact grants nothing
        }
        if (!text.includes(RUNTIME_KEY)) continue;
        if (
          writeScopes.includes(scope) &&
          WRITE_TOKEN.test(text) &&
          key !== GRANT_SOURCE
        )
          violations.push({
            file: key,
            why: 'writes a TenantEntitlement row for widgets.runtime',
          });
        if (!GRANT_CALL.test(text)) continue;
        const allowed =
          CALLER_PREFIXES.some((p) => key.startsWith(p)) || key === CALLER_FILE;
        if (!allowed)
          violations.push({
            file: key,
            why: 'reaches Fixtures.grantFeature for widgets.runtime outside the allowlist',
          });
        else if (
          key.startsWith(BIN_CASES_PREFIX) &&
          (!BIN_CASE_GUARD.test(text) || FIXTURES_MODULE_IMPORT.test(text))
        )
          violations.push({
            file: key,
            why: 'a BIN case reaches the grant other than through the runner’s guarded ctx.fixtures',
          });
      }
    return violations;
  };

  it('REN-6 no migration, seed or script creates a widgets.runtime TenantEntitlement', () => {
    expect(scanEntitlementGrants(BE)).toEqual([]);
  });

  it('REN-6 the one grant path exists, asserts the proof database, and is the only writer', () => {
    const fixtures = fs.readFileSync(path.join(BE, GRANT_SOURCE), 'utf8');
    expect(fixtures).toMatch(/async grantFeature\s*\(/);
    expect(fixtures).toMatch(/assertProofDatabase\(/);
    expect(fixtures).toMatch(/tenantEntitlement\.create/);
  });

  it('REN-6 self-test: the scanner fails a planted seed grant and passes the BIN runner call', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ren6-selftest-'));
    try {
      const plant = (rel: string, body: string) => {
        const p = path.join(root, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, body, 'utf8');
      };
      // The call token is assembled rather than written out, so that THIS file is not itself a
      // planted violation the scanner then has to be told to ignore. A scanner with a carve-out for
      // its own test is a scanner with a carve-out.
      const grantCall = (receiver: string) =>
        `await ${receiver}.grantFeature` + "(tenant, 'widgets.runtime');\n";

      // (A) a seed that grants the runtime — the exact thing §2.6 constraint 8 forbids.
      plant(
        'prisma/seed.ts',
        "await prisma.tenantEntitlement.create({ data: { featureKey: 'widgets.runtime', enabled: true } });\n",
      );
      // (B) the BIN runner reaching the one allowlisted grant path — permitted (I-HAR).
      plant('scripts/widgets-intent-http-proof.ts', grantCall('ctx.fixtures'));
      // (C) any other script reaching it — not permitted.
      plant('scripts/some-other-proof.ts', grantCall('fixtures'));
      // (D) a script that only NAMES the key, as k3-gateway-check.mjs does — permitted.
      plant(
        'scripts/k3-gateway-check.mjs',
        "chk('the runtime is dark: gated by widgets.runtime', true);\n",
      );
      // (E) a BIN case file receiving the runner's guarded context — permitted (I-HAR's convention,
      //     `DEFAULT_CASES_DIR`). This is the shape `scripts/widgets-http-proof/gateP-f88.cases.ts`
      //     has, and the reason the allowlist names the directory rather than one file.
      plant(
        'scripts/widgets-http-proof/gateZ-ok.cases.ts',
        "import type { HttpProofContext } from '../widgets-intent-http-proof';\n" +
          grantCall('ctx.fixtures'),
      );
      // (F) a BIN case file that builds its own Fixtures instead of taking the guarded context —
      //     not permitted: the guard is the context, not the directory.
      plant(
        'scripts/widgets-http-proof/gateZ-bad.cases.ts',
        "import { Fixtures } from '../../test/widgets-live/support/fixtures';\n" +
          grantCall('new Fixtures(ctx)'),
      );

      const found = scanEntitlementGrants(root).sort((a, b) =>
        a.file.localeCompare(b.file),
      );
      expect(found.map((v) => v.file)).toEqual([
        'prisma/seed.ts',
        'scripts/some-other-proof.ts',
        'scripts/widgets-http-proof/gateZ-bad.cases.ts',
      ]);
      expect(found[0].why).toContain('TenantEntitlement');
      expect(found[2].why).toContain('ctx.fixtures');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
