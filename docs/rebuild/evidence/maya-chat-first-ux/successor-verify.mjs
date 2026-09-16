// G2 — the ONE place a proposed successor is checked against what is actually built.
//
// A successor proposal is a judgement: somebody read a legacy surface and named what replaces it.
// A judgement is not evidence. This module turns it into evidence or refuses it, by asking of the
// code questions a script can answer:
//
//   ROUTE       is the key in the shell's route registry?
//   C9          is the key registered in the EXECUTED C9 registry, and does it have a policy row?
//   AE_BOOKING  is the key on the booking commit allowlist?
//   FENCE       does the file exist, does the symbol appear in it verbatim, does the code near the
//               symbol refuse something, and does a test name the symbol?
//   MULTI       does every component resolve? One ABSENT component leaves the row unresolved.
//
// Both the successor-map builder and the K16 evaluator import this, so the rule exists once. The
// evaluator re-runs it on every invocation, so a successor map written today cannot keep a row green
// after the code it names is gone.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const loadImplementation = (repo) => {
  const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
  const shellSrc = read('maya-chat-shell/src/routes/registry.ts');
  const listOf = (n) => {
    const m = new RegExp(`export const ${n} = \\[([\\s\\S]*?)\\] as const;`).exec(shellSrc);
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  };
  const routes = new Set([...listOf('BASE_ROUTES'), ...listOf('SHELL_ROUTES'), ...listOf('FULLSCREEN_ROUTES')]);

  // Executed, not grepped: a registry read as text once reported 50 keys where 56 execute.
  const dist = path.join(repo, 'maya-saas-backend/dist/src');
  if (!fs.existsSync(path.join(dist, 'orchestration/c9.registry.js')))
    throw new Error('maya-saas-backend is not built: run `npm run build` there first — the registries are executed, never grepped');
  const require = createRequire(import.meta.url);
  const { C9_CAPABILITIES } = require(path.join(dist, 'orchestration/c9.registry.js'));
  const { WIDGET_CAPABILITY_POLICY } = require(path.join(dist, 'widgets/authority/capability-policy.js'));
  const { AE_WIDGET_COMMIT_ALLOWLIST } = require(path.join(dist, 'widgets/booking/booking-allowlist.js'));

  // Every test file in the two trees a fence may live in, read once.
  const tests = [];
  const walk = (dir, re) => {
    const abs = path.join(repo, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel, re);
      else if (re.test(e.name)) tests.push({ file: rel, text: read(rel) });
    }
  };
  walk('maya-saas-backend/src', /\.spec\.ts$/);
  walk('maya-saas-backend/test', /\.(spec|e2e-spec)\.ts$/);
  walk('ai администратор', /^test_.*\.py$/);

  // The kind and channel of every surface, from the signed dossier, so a route can be refused as the
  // successor of something that was never a place a person went.
  const dossier = JSON.parse(read('docs/rebuild/evidence/maya-chat-first-ux/k1/k1-surface-dossier.json'));
  const surfaces = Object.fromEntries(dossier.map((r) => [r.id, { kind: r.kind, channel: r.channel }]));

  return {
    repo,
    surfaces,
    routes,
    c9: new Set(C9_CAPABILITIES.map((c) => c.capabilityKey)),
    policy: WIDGET_CAPABILITY_POLICY,
    booking: new Set(AE_WIDGET_COMMIT_ALLOWLIST.map((r) => r.ae)),
    tests,
  };
};

const REFUSAL = /throw\b|Forbidden|Unauthorized|refuse|reject|deny|\b40[13]\b|http_response_code\(\s*4|HTTPForbidden|HTTPUnauthorized|raise\b|return\s+False/;

// A ROUTE can succeed only something a person looked at or went to. A backend controller, a relay, a
// secret store, a cron job or a native plugin was never a place: its successor is a fence or a
// capability, and naming a route for it is the "covered by Maya" answer the owner ruled out. Several
// dossier successors of this shape were DERIVED from class plus keywords, not signed, which is how a
// moderation controller came to be "succeeded" by the Account route.
const PRESENTATION_KINDS = new Set([
  'screen', 'flow', 'modal', 'tab', 'nav-stack', 'widget', 'consent', 'onboarding', 'deep-link',
  'notification', 'redirect', 'chat', 'voice', 'bot-command', 'browser-auth-flow', 'oauth-redirect-flow',
  'session-resume', 'frontend-client', 'frontend-fallback', 'frontend-subscription', 'ui-screen',
]);
const NON_PRESENTATION_CHANNELS = new Set(['backend', 'scheduler', 'edge-relay']);
export const isPresentation = (surface) =>
  !!surface && PRESENTATION_KINDS.has(surface.kind) && !NON_PRESENTATION_CHANNELS.has(surface.channel);

const resolveRef = (impl, type, ref, surface) => {
  if (!ref) return { ok: false, why: `${type} with no identifier` };
  switch (type) {
    case 'ROUTE':
      if (!impl.routes.has(ref)) return { ok: false, why: `'${ref}' is not a shell route` };
      if (surface && !isPresentation(surface))
        return { ok: false, why: `a route cannot succeed a ${surface.kind} on ${surface.channel}; its successor would be a fence or a capability` };
      return { ok: true };
    case 'C9':
      if (!impl.c9.has(ref)) return { ok: false, why: `'${ref}' is not a registered C9 capability` };
      if (!impl.policy[`C9:${ref}`]) return { ok: false, why: `'${ref}' has no WIDGET_CAPABILITY_POLICY row` };
      return { ok: true };
    case 'AE_BOOKING':
      return impl.booking.has(ref) ? { ok: true } : { ok: false, why: `'${ref}' is not on the booking commit allowlist` };
    default:
      return { ok: false, why: `${type} is not a resolvable successor type` };
  }
};

const verifyFence = (impl, p) => {
  if (!p.file || !p.symbol) return { ok: false, why: 'fence named without file and symbol' };
  const abs = path.join(impl.repo, p.file);
  if (!fs.existsSync(abs)) return { ok: false, why: `fence file ${p.file} does not exist` };
  const text = fs.readFileSync(abs, 'utf8');
  const at = text.indexOf(p.symbol);
  if (at < 0) return { ok: false, why: `symbol '${p.symbol}' does not appear in ${p.file}` };
  if (p.successorType === 'FENCE' && !p.file.startsWith('maya-saas-backend/src/'))
    return { ok: false, why: `a canonical FENCE must live in maya-saas-backend/src, not ${p.file}` };
  // The body at the named line must refuse something. A route that merely exists is not a fence.
  // The named line is used when it really carries the symbol; otherwise the first occurrence, which
  // may be a call site — so a proposal that names its line precisely is the one that can pass.
  const all = text.split('\n');
  const named = Number.isInteger(p.line) && all[p.line - 1]?.includes(p.symbol) ? p.line : null;
  const lineNo = named ?? text.slice(0, at).split('\n').length;
  const window = all.slice(Math.max(0, lineNo - 5), lineNo + 60).join('\n');
  if (!REFUSAL.test(window)) return { ok: false, located: true, why: `no refusal within 60 lines of '${p.symbol}' at ${p.file}:${lineNo}` };
  // A test proves the fence only if it names the symbol AND reaches the fence's own module. Symbols
  // like `status` or `refresh` appear in hundreds of tests; the module name is what binds the two.
  const moduleName = path.basename(p.file).replace(/\.(ts|py|php)$/, '');
  const tested = impl.tests.some((t) => t.text.includes(p.symbol) && t.text.includes(moduleName));
  if (!tested) return { ok: false, located: true, why: `fence located, but no test both names '${p.symbol}' and reaches ${moduleName} — located is not proven` };
  return { ok: true };
};

/** One proposal in, one verdict out. Never throws on a bad proposal; a bad proposal is a verdict. */
export const verifySuccessor = (impl, p) => {
  if (!p) return { resolved: false, why: 'no successor proposal recorded for this row' };
  const surface = impl.surfaces[p.id];
  switch (p.successorType) {
    case 'ROUTE':
    case 'C9':
    case 'AE_BOOKING': {
      const r = resolveRef(impl, p.successorType, p.ref, surface);
      return r.ok ? { resolved: true, successor: `${p.successorType}:${p.ref}` } : { resolved: false, why: r.why };
    }
    case 'MULTI': {
      const comps = Array.isArray(p.components) ? p.components : [];
      if (!comps.length) return { resolved: false, why: 'MULTI with no components' };
      const bad = comps
        .map((c) => ({ c, r: c.type === 'ABSENT' ? { ok: false, why: 'ABSENT' } : resolveRef(impl, c.type, c.ref, surface) }))
        .filter((x) => !x.r.ok);
      return bad.length
        ? { resolved: false, why: `${bad.length}/${comps.length} served functions have no successor: ${bad.map((x) => x.c.function).join('; ')}` }
        : { resolved: true, successor: comps.map((c) => `${c.type}:${c.ref}`).join(' + ') };
    }
    case 'FENCE':
    case 'LEGACY_ONLY_FENCE': {
      const r = verifyFence(impl, p);
      if (!r.ok) return { resolved: false, located: !!r.located, why: r.why };
      // A fence that exists only in the legacy bot or relay is real, but it is not the canonical
      // successor K15 names: it retires with the legacy system it lives in.
      return p.successorType === 'FENCE'
        ? { resolved: true, successor: `FENCE:${p.file}#${p.symbol}` }
        : { resolved: false, located: true, why: `enforced only in legacy ${p.file}#${p.symbol}; no canonical fence` };
    }
    case 'NONE_SIGNED':
      // Signed "no successor" is a disposition, not a proof. The row then rests on a proof of its own
      // — an unreachability probe, an orphan (zero-reference) proof, or the owning widget's parity for
      // a sub-state — and none of those is recorded per row.
      return { resolved: false, why: 'signed: no successor owed; the row rests on its own proof (unreachability probe, orphan proof, or the owning widget\'s parity), and none is recorded' };
    case 'ABSENT':
      return { resolved: false, why: `ABSENT — ${p.reason ?? 'no successor exists'}` };
    case 'AMBIGUOUS':
      return { resolved: false, ambiguous: true, why: `AMBIGUOUS — ${p.reason ?? ''}` };
    default:
      return { resolved: false, why: `unknown successor type '${p.successorType}'` };
  }
};
