#!/usr/bin/env node
// K3 structural checks. The package's central claim is NEGATIVE — BUTTON -> ENDPOINT must be
// unrepresentable — and a negative claim is exactly the kind that passes review by being agreed
// with rather than tested. So each assertion below reads the source with the TypeScript compiler
// and fails if the property stops holding, rather than if someone stops believing it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BE = path.resolve(HERE, '..');
const W = path.join(BE, 'src/widgets');
const ts = createRequire(path.join(BE, 'package.json'))('typescript');

const out = [];
const chk = (n, ok, ev) => out.push({ n, ok, ev });
const read = (p) => fs.readFileSync(path.join(W, p), 'utf8');
const sf = (p) => ts.createSourceFile(p, read(p), ts.ScriptTarget.ES2022, true);

// ── 1. the pipeline is one ordered array ─────────────────────────────────────────────────────
// §0.3 fixes the mechanism as "a single ordered array whose ... no branch that skips a gate".
// An array can be counted; nested conditionals can only be read.
const gw = sf('intent-gateway.service.ts');
let gatesArray = null;
const walk = (n) => {
  if (
    ts.isPropertyDeclaration(n) &&
    n.name?.getText(gw) === 'gates' &&
    n.initializer &&
    ts.isArrayLiteralExpression(n.initializer)
  )
    gatesArray = n.initializer;
  n.forEachChild(walk);
};
walk(gw);
chk('the gate pipeline is a single ordered array', gatesArray !== null, gatesArray ? 'one array literal' : 'NOT AN ARRAY');

// ── 2. every gate §3.9 names is present, in order ────────────────────────────────────────────
const EXPECTED = ['1', '2', '3', '4', '5', '6', '7', '8', '8-R', '9', '10', '11', '12', '13', '14'];
const numbers = gatesArray
  ? gatesArray.elements.map((e) => {
      const text = e.getText(gw);
      const m = /n:\s*'([^']+)'|pending\(\s*'([^']+)'/.exec(text);
      return m ? (m[1] ?? m[2]) : '?';
    })
  : [];
chk(
  `all ${EXPECTED.length} gates of §3.9 are present, in the contract's order`,
  numbers.join(',') === EXPECTED.join(','),
  numbers.join(' ') || 'none',
);

// ── 3. no gate can be skipped ────────────────────────────────────────────────────────────────
// The runner must walk the array. A `continue`, or an index that is not the loop's, would be a
// branch around a gate — which is the one thing the ordering is supposed to make impossible.
const runner = read('intent-gateway.service.ts');
const loop = /for \(const gate of this\.gates\) \{([\s\S]*?)\n {4}\}/.exec(runner);
chk(
  'the runner walks every gate and stops only on a verdict',
  loop !== null && !/\bcontinue\b/.test(loop[1]) && /verdict\.outcome !== 'pass'/.test(loop[1]),
  loop ? 'one for-of over this.gates; no continue; stops at the first non-pass' : 'no runner loop found',
);

// ── 4. a gate cannot pass silently ───────────────────────────────────────────────────────────
// Every gate whose mechanism a later package owns must REFUSE, not pass. "Not built yet" and
// "allowed" being the same branch is the failure mode F5's fail-closed default exists to prevent.
const pendingHelper = /const pending = \([\s\S]*?\n\}\);/.exec(runner);
chk(
  'a gate pending on a later package refuses rather than passes',
  pendingHelper !== null && /outcome: 'refuse'/.test(pendingHelper[0]) && /mechanism_absent/.test(pendingHelper[0]),
  pendingHelper ? "pending() returns refuse/mechanism_absent" : 'no pending() helper',
);

// ── 5. BUTTON -> ENDPOINT is unrepresentable ─────────────────────────────────────────────────
// Read the DTO's declared members. The guarantee is that no member could carry an endpoint — so
// the check is over what the class HAS, not over what a validator rejects.
const dto = sf('dto/submit-intent.dto.ts');
const members = [];
const dtoWalk = (n) => {
  if (ts.isPropertyDeclaration(n) && n.name) members.push(n.name.getText(dto));
  n.forEachChild(dtoWalk);
};
dtoWalk(dto);
const FORBIDDEN = ['url', 'href', 'endpoint', 'capability', 'table', 'provider', 'tenant_id', 'role', 'method', 'path'];
const carried = members.filter((m) => FORBIDDEN.includes(m));
chk(
  'the submission shape has no member able to carry an endpoint',
  carried.length === 0,
  carried.length ? `CARRIES: ${carried.join(', ')}` : `members: ${members.join(', ')}`,
);

// ── 6. the tenant is never taken from the body ───────────────────────────────────────────────
const ctrl = read('widgets.controller.ts');
chk(
  'the tenant comes from the authenticated principal, never from the body',
  /tenantId: actor\.tenantId/.test(ctrl) && !/tenantId: dto\./.test(ctrl),
  'controller reads actor.tenantId; the DTO has no tenant field to read',
);

// ── 7. exactly two routes ────────────────────────────────────────────────────────────────────
const posts = [...ctrl.matchAll(/@Post\('([^']+)'\)/g)].map((m) => m[1]);
chk(
  "the programme's only two new routes, and no more",
  posts.length === 2 && posts.includes('resolve') && posts.includes('intent'),
  posts.map((p) => `POST /widgets/${p}`).join(', '),
);

// ── 8. dark behind an entitlement no plan grants ─────────────────────────────────────────────
const catalog = fs.readFileSync(path.join(BE, 'src/common/feature-catalog.ts'), 'utf8');
const planBlock = catalog.slice(catalog.indexOf('MAYA_PLAN_FEATURES'));
chk(
  'the runtime is dark: gated by widgets.runtime, which no plan grants',
  /@RequiresFeature\('widgets\.runtime'\)/.test(ctrl) && !/widgets\.runtime/.test(planBlock),
  'controller requires widgets.runtime; the key appears in no plan',
);

// ── 9. the gateway reaches no capability owner ───────────────────────────────────────────────
// A gateway that could import a capability module would be a second authority path. It imports
// Prisma and nothing else, and that is checked rather than intended.
const mod = read('widgets.module.ts');
const imports = [...mod.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).filter((p) => p.startsWith('.'));
const foreign = imports.filter((p) => !p.startsWith('./') && p !== '../prisma/prisma.module');
chk(
  'the widget module imports Prisma and no capability module',
  foreign.length === 0,
  foreign.length ? `IMPORTS: ${foreign.join(', ')}` : imports.join(', '),
);

for (const c of out) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n        ${c.ev}`);
const bad = out.filter((c) => !c.ok).length;
console.log(bad ? `\n${out.length - bad}/${out.length} — K3 structural checks` : `\n${out.length}/${out.length} K3 structural checks pass`);
process.exit(bad ? 1 : 0);
