// T-SRC-INV30 — no gate antecedent may name a CLAIMED render profile, a locale hint or a header.
//
// GATES-PLAN-V11 §2.1 assigns this file to the integrator; U8R requests it as R8R-3, because its own
// `T-SRC-8R` states the rule for slot 8-R alone and the rule is the pipeline's. INV-30 and F88.3 are
// the same idea from two directions: the caller may not hand a gate an authority input, and a render
// profile, a locale and a request header are three of the things a caller controls. R3.8.3 declares
// `profile_id` on the WIRE (§3.8) so the emitter can pick a rendering; no gate may read it, and
// FR-14 (C11:1798) says the same of `presentation_mode`, `profile_id` and `a11y_env` at Gate 6.
//
// WHAT IS SCANNED: every runtime (non-spec) module under `src/widgets/` REACHABLE by relative import
// from `intent-gateway.service.ts` or `widgets.controller.ts`. Reachability is the right scope: a
// file no request can reach cannot be an antecedent, and a file that becomes reachable is scanned the
// same day. Comments are stripped first, so a fence that must NAME what it forbids is not itself a
// violation (the mistake R8R-7 records against F88-7).
//
// EXCEPTIONS are enumerated, never patterned, and each says why it is not a caller-controlled read.
// A new exception has to be argued in this file.
//
// Class BUILD. It proves a shape, not a run; the runtime half is each gate's own live spec.

import fs from 'node:fs';
import path from 'node:path';

const W = path.resolve(__dirname, '..');

/** The five spellings a caller-supplied rendering claim reaches code by. Case-insensitive. */
const FORBIDDEN = [
  'profile_id',
  'profileId',
  'locale_hint',
  'headers',
  'x-maya-render-profile',
] as const;

/**
 * Files that may contain one of the spellings, and why each is a DECLARATION rather than a read.
 *
 * A declaration is what makes the member refusable: §3.8's DTO must name `profile_id` to validate it,
 * and `SubmissionShape` must name it for the DTO's type to be the wire's. Neither is read by a gate —
 * `f88-walk.spec.ts` F88-7 is the fence that says so over the whole layer.
 */
const DECLARED_NOT_READ: Readonly<Record<string, string>> = {
  'dto/submit-intent.dto.ts':
    "§3.8's DTO: it DECLARES `profile_id` so the global ValidationPipe can require and bound it (P-F88). A member that is never declared cannot be refused when it is malformed.",
  'gate.types.ts':
    '`SubmissionShape` is the wire shape the DTO is typed against; declaring the member is what keeps the two from drifting. No gate reads it — F88-7 holds that over every file.',
  'carriers/channel-profile.ts':
    "K6's CHANNEL profile registry: `profileId` there is the SERVER's own profile row id (F53), not the caller's claimed render profile. A name collision, not an authority input.",
  'emission/seal.service.ts':
    "H4's seal term declaration: `profileId` is the SERVER-STORED render receipt term covered by the keyed seal, never the submission's claimed profile.",
  'emission/seal-verifier.service.ts':
    "H4 verification reads `profileId` from the SERVER-STORED WidgetRenderReceipt inside T; it never reads submission.profile_id and treats the value only as a sealed term.",
};

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, (_m, lead: string) => lead);

const resolveRelative = (from: string, spec: string): string | null => {
  const base = path.resolve(path.dirname(path.join(W, from)), spec);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')])
    if (fs.existsSync(candidate)) return path.relative(W, candidate);
  return null;
};

/** Every runtime module under `src/widgets/` the two entry points reach by relative import. */
const reachable = (): string[] => {
  const seen = new Set<string>();
  const queue = ['intent-gateway.service.ts', 'widgets.controller.ts'];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(path.join(W, file), 'utf8');
    for (const m of source.matchAll(/from\s+'(\.[^']*)'/g)) {
      const next = resolveRelative(file, m[1]);
      if (next !== null && !next.startsWith('..') && !seen.has(next))
        queue.push(next);
    }
  }
  return [...seen].filter((f) => !f.endsWith('.spec.ts')).sort();
};

/** Every (file, spelling) pair a scan of `sources` finds, minus the enumerated declarations. */
const violations = (sources: ReadonlyMap<string, string>): string[] => {
  const out: string[] = [];
  for (const [file, source] of sources) {
    if (file in DECLARED_NOT_READ) continue;
    const code = stripComments(source);
    for (const needle of FORBIDDEN)
      if (new RegExp(needle, 'i').test(code)) out.push(`${file}: ${needle}`);
  }
  return out;
};

describe('T-SRC-INV30 — no gate antecedent names a claimed render profile, a locale hint or a header', () => {
  const files = reachable();
  const sources = new Map(
    files.map((f) => [f, fs.readFileSync(path.join(W, f), 'utf8')]),
  );

  it('T-SRC-INV30-a the scan reaches the pipeline it claims to: the gateway, its slots and its seams', () => {
    // Not vacuous, and not a hand-written list: the set is derived, and these are the files the
    // pipeline cannot be without.
    expect(files.length).toBeGreaterThan(20);
    for (const f of [
      'intent-gateway.service.ts',
      'widgets.controller.ts',
      'gates/gate6.ts',
      'gates/gate7.ts',
      'gates/gate8r.ts',
      'input-validation/input-validation.gate.ts',
    ])
      expect(files).toContain(f);
    // Every file under `src/widgets` that the walk did NOT reach is either a spec or unreachable from
    // the two entry points; nothing is skipped by accident.
    const all = walk(W)
      .map((f) => path.relative(W, f))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
    expect(all.length).toBeGreaterThanOrEqual(files.length);
  });

  it('T-SRC-INV30-b no reachable runtime module names one of the five spellings', () => {
    expect(violations(sources)).toEqual([]);
  });

  it('T-SRC-INV30-c each enumerated exception exists, still carries the spelling, and says why it is a declaration', () => {
    for (const [file, why] of Object.entries(DECLARED_NOT_READ)) {
      expect(fs.existsSync(path.join(W, file))).toBe(true);
      const code = stripComments(fs.readFileSync(path.join(W, file), 'utf8'));
      expect(FORBIDDEN.some((n) => new RegExp(n, 'i').test(code))).toBe(true);
      expect(why.length).toBeGreaterThan(40);
    }
  });

  it('T-SRC-INV30-d RED: the fence goes red on a planted read, on any of the five spellings, and a comment is not a read', () => {
    for (const needle of FORBIDDEN)
      expect(
        violations(
          new Map([
            ['gates/planted.ts', `const x = ctx.submission.${needle};\n`],
          ]),
        ),
      ).toEqual([`gates/planted.ts: ${needle}`]);
    expect(
      violations(
        new Map([
          [
            'gates/planted.ts',
            `// this file must not read profile_id\nconst x = 1;\n`,
          ],
        ]),
      ),
    ).toEqual([]);
    // An exception is per FILE, not per spelling: a planted read in an enumerated file is still not
    // seen, which is why the list has three entries and each carries a reason.
    expect(
      violations(
        new Map([['gate.types.ts', 'const x = ctx.submission.profile_id;\n']]),
      ),
    ).toEqual([]);
  });
});
