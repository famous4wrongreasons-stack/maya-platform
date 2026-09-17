#!/usr/bin/env node
// K3 structural checks. The package's central claim is NEGATIVE — BUTTON -> ENDPOINT must be
// unrepresentable — and a negative claim is exactly the kind that passes review by being agreed
// with rather than tested. So each assertion below reads the source with the TypeScript compiler
// and fails if the property stops holding, rather than if someone stops believing it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BE = path.resolve(HERE, '..');
const W = path.join(BE, 'src/widgets');
const requireBE = createRequire(path.join(BE, 'package.json'));
const ts = requireBE('typescript');

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
//
// Once every gate is wired there is no pending() helper left, and "the helper refuses" can no longer
// be the test. The property itself can: no slot's run is a constant pass. A pending() helper, where
// one still exists, must still refuse.
//
// U0 item 9 (integrator decision D-7) amends this check; it does not relax it.
// - The slots are read with the compiler, not with two text patterns. A slot is an object literal
//   whose `run` is an inline function, or a call of `pending`; any other element cannot be read, and
//   fails. A `run` is a constant pass when every value it returns is `pass` or an object whose last
//   outcome-setting member is `outcome: 'pass'` (through parentheses, casts, `await`, a conditional
//   whose branches are both passes, and `Promise.resolve`), whatever its parameters and however it
//   is written: an arrow, a block of returns, a method. Not seen: a call into another function that
//   can only pass; that is read by the gate's own tests.
// - Exactly two constant passes can be admitted, each only when PROVEN, each for the one slot the
//   §3.9 table hosts there:
//   1. slot 2, hosted by 'HTTP middleware' — the pass is admissible because the middleware has
//      already run: the JWT guard is global and the widgets controller does not opt out. (Unchanged,
//      except that it is bound to slot 2 and the guard's name is matched whole: `JwtAuthGuardX` in
//      the APP_GUARD provider no longer reads as the JWT guard.)
//   2. slot 12, hosted by 'Projector' — a POINTER (D-7, G12 §5.2): the data fence runs inside the
//      projector, which Gate 13's edges call. Admitted only when (a) its `run` takes no parameter and
//      returns nothing but a bare pass, so the slot reads nothing, and (b) the architecture proofs
//      ARCH-12-9 (the projector is referenced only from Gate 13's REFINE/NAVIGATE edges) and
//      ARCH-12-10 (slot 12 references nothing and `liveGateCount` excludes it) EXIST — each exactly
//      one active `it`/`test` whose title begins with its id, in `src/widgets/projection/
//      *.architecture.spec.ts` — and PASS, run here with jest. The proofs are only run when a slot
//      asks for the exception. Until U12a builds them the exception is unused, and a constant-pass
//      slot 12 fails like any other.
const pendingHelper = /const pending = \([\s\S]*?\n\}\);/.exec(runner);
const appModuleSrc = fs.readFileSync(path.join(BE, 'src/app.module.ts'), 'utf8');
const jwtGuardGlobal =
  /provide:\s*APP_GUARD,\s*useClass:\s*JwtAuthGuard\b/.test(appModuleSrc) &&
  !/@Public\(/.test(read('widgets.controller.ts'));

const stripExpr = (e) => {
  while (
    e &&
    (ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      ts.isAwaitExpression(e))
  )
    e = e.expression;
  return e;
};
const memberName = (m) =>
  m.name && (ts.isIdentifier(m.name) || ts.isStringLiteralLike(m.name)) ? m.name.text : null;
const isPassExpr = (raw) => {
  const e = stripExpr(raw);
  if (!e) return false;
  if (ts.isIdentifier(e)) return e.text === 'pass';
  if (ts.isObjectLiteralExpression(e)) {
    const setters = e.properties.filter(
      (p) => ts.isSpreadAssignment(p) || memberName(p) === 'outcome' || (p.name && ts.isComputedPropertyName(p.name)),
    );
    const last = setters[setters.length - 1];
    if (!last || !ts.isPropertyAssignment(last) || memberName(last) !== 'outcome') return false;
    const v = stripExpr(last.initializer);
    return ts.isStringLiteralLike(v) && v.text === 'pass';
  }
  if (ts.isConditionalExpression(e)) return isPassExpr(e.whenTrue) && isPassExpr(e.whenFalse);
  if (ts.isCallExpression(e) && e.expression.getText(gw) === 'Promise.resolve')
    return e.arguments.length === 1 && isPassExpr(e.arguments[0]);
  return false;
};
/** The values a function can return: its concise body, or each `return` of its own body. */
const returnsOf = (fn) => {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
  const found = [];
  const visit = (n) => {
    if (n !== fn && (ts.isFunctionLike(n) || ts.isClassLike(n))) return;
    if (ts.isReturnStatement(n)) found.push(n.expression ?? null);
    n.forEachChild(visit);
  };
  if (fn.body) visit(fn.body);
  return found;
};
const isConstantPass = (fn) => {
  const r = returnsOf(fn);
  return r.length > 0 && r.every((e) => e !== null && isPassExpr(e));
};
const isBarePass = (fn) => {
  const r = returnsOf(fn);
  if (r.length !== 1 || r[0] === null) return false;
  const e = stripExpr(r[0]);
  return (
    (ts.isIdentifier(e) && e.text === 'pass') ||
    (ts.isObjectLiteralExpression(e) && e.properties.length === 1 && isPassExpr(e))
  );
};
const slotOf = (e) => {
  const text = e.getText(gw);
  if (ts.isCallExpression(e)) {
    const a0 = e.arguments[0];
    return { kind: 'call', callee: e.expression.getText(gw), n: a0 && ts.isStringLiteralLike(a0) ? a0.text : '?' };
  }
  if (!ts.isObjectLiteralExpression(e)) return { kind: 'unreadable', n: '?', why: `not an object literal: ${text.slice(0, 40)}` };
  const member = (name) => e.properties.find((p) => memberName(p) === name);
  const str = (name) => {
    const m = member(name);
    const v = m && ts.isPropertyAssignment(m) ? stripExpr(m.initializer) : null;
    return v && ts.isStringLiteralLike(v) ? v.text : null;
  };
  const run = member('run');
  const fn =
    run && ts.isMethodDeclaration(run)
      ? run
      : run && ts.isPropertyAssignment(run) && (ts.isArrowFunction(stripExpr(run.initializer)) || ts.isFunctionExpression(stripExpr(run.initializer)))
        ? stripExpr(run.initializer)
        : null;
  const n = str('n') ?? '?';
  if (!fn) return { kind: 'unreadable', n, why: 'its run is not an inline function' };
  return { kind: 'object', n, host: str('host'), fn };
};

/** D-7's proof: ARCH-12-9 and ARCH-12-10 exist, once each and active, and pass under jest. */
const ARCH_IDS = ['ARCH-12-9', 'ARCH-12-10'];
const PROJECTION = path.join(W, 'projection');
const archProof = () => {
  const files = fs.existsSync(PROJECTION)
    ? fs.readdirSync(PROJECTION).filter((f) => f.endsWith('.architecture.spec.ts')).sort()
    : [];
  if (files.length === 0) return { ok: false, why: 'no src/widgets/projection/*.architecture.spec.ts exists' };
  const found = Object.fromEntries(ARCH_IDS.map((id) => [id, []]));
  const INACTIVE = /^(?:describe|it|test)\.(?:skip|todo|failing)$|^x(?:describe|it|test)$/;
  for (const f of files) {
    const s = ts.createSourceFile(f, fs.readFileSync(path.join(PROJECTION, f), 'utf8'), ts.ScriptTarget.ES2022, true);
    const visit = (n, inactive) => {
      let off = inactive;
      if (ts.isCallExpression(n)) {
        const callee = n.expression.getText(s);
        const a0 = n.arguments[0];
        const title = a0 && ts.isStringLiteralLike(a0) ? a0.text : null;
        if (INACTIVE.test(callee)) off = true;
        if (title && /^(?:it|test|it\.\w+|test\.\w+|xit|xtest)$/.test(callee)) {
          const id = ARCH_IDS.find((x) => new RegExp(`^${x}(?!\\d)`).test(title));
          if (id) found[id].push({ file: f, title, active: !off && (callee === 'it' || callee === 'test') });
        }
      }
      n.forEachChild((c) => visit(c, off));
    };
    visit(s, false);
  }
  for (const id of ARCH_IDS) {
    const active = found[id].filter((t) => t.active);
    if (active.length !== 1 || found[id].length !== 1)
      return { ok: false, why: `${id}: ${found[id].length} test(s), ${active.length} active; exactly one active test is required` };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k3-arch-12-'));
  try {
    const outFile = path.join(dir, 'result.json');
    const titles = ARCH_IDS.map((id) => found[id][0].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const run = spawnSync(
      process.execPath,
      [requireBE.resolve('jest/bin/jest'), '--ci', '--runTestsByPath', ...[...new Set(ARCH_IDS.map((id) => path.join(PROJECTION, found[id][0].file)))],
        '--testNamePattern', titles.join('|'), '--json', '--outputFile', outFile],
      { cwd: BE, encoding: 'utf8' },
    );
    if (!fs.existsSync(outFile)) return { ok: false, why: `jest wrote no result (exit ${run.status})` };
    const result = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    for (const id of ARCH_IDS) {
      const { file, title } = found[id][0];
      const statuses = result.testResults
        .filter((r) => path.resolve(r.name) === path.join(PROJECTION, file))
        .flatMap((r) => r.assertionResults.filter((a) => a.title === title).map((a) => a.status));
      if (statuses.length !== 1 || statuses[0] !== 'passed')
        return { ok: false, why: `${id} did not pass (${statuses.join(', ') || 'not run'}; jest exit ${run.status})` };
    }
    return { ok: true, why: `${ARCH_IDS.join(' and ')} passed (${[...new Set(ARCH_IDS.map((id) => found[id][0].file))].join(', ')})` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const slots = gatesArray ? gatesArray.elements.map(slotOf) : [];
const slotProblems = gatesArray ? [] : ['no gate array'];
const admitted = [];
let projectorException = 'unused: no slot hosted by Projector is a constant pass';
for (const s of slots) {
  if (s.kind === 'unreadable') slotProblems.push(`slot ${s.n} cannot be read (${s.why})`);
  else if (s.kind === 'call' && s.callee !== 'pending') slotProblems.push(`slot ${s.n} is a call of ${s.callee}, not pending()`);
  else if (s.kind === 'object' && isConstantPass(s.fn)) {
    if (s.host === 'HTTP middleware' && s.n === '2') {
      if (jwtGuardGlobal) admitted.push('2 (HTTP middleware: the JWT guard is global and the controller does not opt out)');
      else slotProblems.push('slot 2 is a constant pass, and the global JWT guard is NOT proven');
    } else if (s.host === 'Projector' && s.n === '12') {
      if (!isBarePass(s.fn) || s.fn.parameters.length > 0) {
        projectorException = 'refused: the slot takes a parameter or returns more than a bare pass';
        slotProblems.push('slot 12 is a constant pass that is not a pointer (it can read)');
      } else {
        const proof = archProof();
        projectorException = proof.ok ? `admitted for 12: ${proof.why}` : `NOT PROVEN: ${proof.why}`;
        if (proof.ok) admitted.push('12 (Projector pointer, D-7)');
        else slotProblems.push(`slot 12 is a Projector pointer whose proof is absent or failing: ${proof.why}`);
      }
    } else slotProblems.push(`slot ${s.n} (host ${s.host}) is a constant pass`);
  }
}
const pendingRefuses = pendingHelper === null ||
  (/outcome: 'refuse'/.test(pendingHelper[0]) && /mechanism_absent/.test(pendingHelper[0]));
chk(
  'no gate can pass silently: no slot is a constant pass except a proven one, and a pending() helper refuses',
  slotProblems.length === 0 && pendingRefuses,
  `${slotProblems.length ? `NOT ADMITTED: ${slotProblems.join('; ')}` : `${slots.length} slots read`}; ` +
    `proven constant passes: ${admitted.length ? admitted.join(', ') : 'none'}; Projector exception (D-7): ${projectorException}; ` +
    (pendingHelper ? `pending() ${pendingRefuses ? 'returns refuse/mechanism_absent' : 'DOES NOT REFUSE'}` : 'no pending() helper (every gate wired)'),
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
// U0 item 8 moved the controller's submit-argument derivation, unchanged, into `intentSubmitArgs`.
// The check follows it rather than loosening: the controller submits exactly that derivation and
// nothing else, the derivation sets the tenant once and from the actor, and neither file sets a
// tenant from the DTO.
//
// Those text tests read `intent-submit-args.ts`, which is only the code the controller runs if the
// controller's `intentSubmitArgs` IS that file's derivation. A controller importing the name from a
// sibling that lets the body override the tenant passed all of them (U0 S3 review, mutant M1), and
// so would `intent-submit-args.ts` re-exporting the name from such a sibling. So the binding is read
// with the compiler at both ends, closed rather than enumerated:
// - the controller has exactly one import declaration of './intent-submit-args'; it binds
//   `intentSubmitArgs` by name, un-aliased and as a value; and every other occurrence of the name in
//   the file is the callee of a call — so no import, declaration, parameter or assignment rebinds it;
// - `intent-submit-args.ts` declares the name once, as its exported top-level `const`; it has no
//   export declaration (no re-export); the name occurs nowhere else; and the one `tenantId:` member
//   lies inside that declaration.
const ctrl = read('widgets.controller.ts');
const submitArgs = read('intent-submit-args.ts');
const ctrlSubmits = [...ctrl.matchAll(/\.submit\(/g)].length;
const tenantAssignments = [...submitArgs.matchAll(/tenantId:/g)].length;
const ARGS_NAME = 'intentSubmitArgs';
const ARGS_MODULE = './intent-submit-args';
const lineOf = (s, n) => s.getLineAndCharacterOfPosition(n.getStart(s)).line + 1;
const occurrences = (s, name) => {
  const found = [];
  const visit = (n) => {
    if (ts.isIdentifier(n) && n.text === name) found.push(n);
    n.forEachChild(visit);
  };
  visit(s);
  return found;
};
const bindingBreaks = [];
const ctrlSf = sf('widgets.controller.ts');
const argsImports = ctrlSf.statements.filter(
  (s) => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === ARGS_MODULE,
);
let importedName = null;
if (argsImports.length !== 1)
  bindingBreaks.push(`widgets.controller.ts has ${argsImports.length} import declarations of '${ARGS_MODULE}'`);
else {
  const clause = argsImports[0].importClause;
  const bound =
    clause && !clause.isTypeOnly && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
      ? clause.namedBindings.elements.filter((e) => !e.isTypeOnly && !e.propertyName && e.name.text === ARGS_NAME)
      : [];
  if (bound.length === 1) importedName = bound[0].name;
  else bindingBreaks.push(`'${ARGS_MODULE}' does not bind ${ARGS_NAME} by name, un-aliased, as a value`);
}
for (const id of occurrences(ctrlSf, ARGS_NAME))
  if (id !== importedName && !(ts.isCallExpression(id.parent) && id.parent.expression === id))
    bindingBreaks.push(`widgets.controller.ts:${lineOf(ctrlSf, id)}: ${ARGS_NAME} in a ${ts.SyntaxKind[id.parent.kind]}`);
const argsSf = sf('intent-submit-args.ts');
const derivations = [];
for (const s of argsSf.statements) {
  if (ts.isExportDeclaration(s) || ts.isExportAssignment(s))
    bindingBreaks.push(`intent-submit-args.ts:${lineOf(argsSf, s)}: an export declaration`);
  if (
    ts.isVariableStatement(s) &&
    s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
    s.declarationList.flags & ts.NodeFlags.Const
  )
    for (const d of s.declarationList.declarations)
      if (ts.isIdentifier(d.name) && d.name.text === ARGS_NAME && d.initializer && ts.isArrowFunction(d.initializer))
        derivations.push(d);
}
if (derivations.length !== 1)
  bindingBreaks.push(`intent-submit-args.ts has ${derivations.length} exported top-level const arrow ${ARGS_NAME}`);
for (const id of occurrences(argsSf, ARGS_NAME))
  if (derivations.length !== 1 || id !== derivations[0].name)
    bindingBreaks.push(`intent-submit-args.ts:${lineOf(argsSf, id)}: ${ARGS_NAME} in a ${ts.SyntaxKind[id.parent.kind]}`);
const tenantMembers = [];
const tenantVisit = (n) => {
  if (ts.isPropertyAssignment(n) && n.name.getText(argsSf) === 'tenantId') tenantMembers.push(n);
  n.forEachChild(tenantVisit);
};
tenantVisit(argsSf);
if (
  derivations.length === 1 &&
  !tenantMembers.every((m) => m.pos >= derivations[0].initializer.pos && m.end <= derivations[0].initializer.end)
)
  bindingBreaks.push(`intent-submit-args.ts: a tenantId member outside the exported ${ARGS_NAME}`);
chk(
  'the tenant comes from the authenticated principal, never from the body',
  /this\.gateway\.submit\(intentSubmitArgs\(dto, actor\)\)/.test(ctrl) &&
    ctrlSubmits === 1 &&
    tenantAssignments === 1 &&
    /tenantId: actor\.tenantId/.test(submitArgs) &&
    !/tenantId: dto\./.test(ctrl) &&
    !/tenantId: dto\./.test(submitArgs) &&
    bindingBreaks.length === 0,
  `controller submits intentSubmitArgs(dto, actor) (${ctrlSubmits} submit call); intentSubmitArgs sets the tenant ` +
    `${tenantAssignments} time(s), from actor.tenantId; the DTO has no tenant field to read; ` +
    (bindingBreaks.length
      ? `BINDING: ${bindingBreaks.join('; ')}`
      : `the controller's ${ARGS_NAME} is the one imported from '${ARGS_MODULE}', which declares and exports it once`),
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
// A plan is not the only grant. Trial full access expands platform features too, and until
// 2026-09-16 it expanded `planned` ones — which would have handed the runtime to every live
// full-access trial tenant. So the check also reads the trial rule and the key's readiness.
const registrySrc = fs.readFileSync(path.join(BE, 'src/entitlements/feature-registry.service.ts'), 'utf8');
const entitlementsSrc = fs.readFileSync(path.join(BE, 'src/entitlements/entitlements.service.ts'), 'utf8');
const runtimePlanned = /'widgets\.runtime':\s*defineReadiness\('planned'/.test(catalog);
const trialExcludesPlanned =
  /trialGrantable\([^)]*\)[^{]*\{[\s\S]*?implementationStatus !== 'planned'/.test(registrySrc) &&
  /this\.registry\.trialGrantable\(featureKey\)/.test(entitlementsSrc) &&
  !/this\.registry\.platformAvailable\(featureKey\)/.test(entitlementsSrc);
chk(
  'the runtime is dark: gated by widgets.runtime, which no plan and no trial grants',
  /@RequiresFeature\('widgets\.runtime'\)/.test(ctrl) && !/widgets\.runtime/.test(planBlock) && runtimePlanned && trialExcludesPlanned,
  `controller requires widgets.runtime; in no plan; readiness planned: ${runtimePlanned}; trial expansion excludes planned: ${trialExcludesPlanned}`,
);

// ── 9. the widget layer reaches an owner only through the owner-ports boundary ───────────────────
// A gateway that could import a capability module would be a second authority path, and that is
// checked rather than intended.
//
// Until U0 item 9 this read `widgets.module.ts`'s own import lines: Prisma and nothing else. It could
// not see a gate file or a service importing an owner directly, and U0 (D-6) added the one module
// whose job is to import owners. Integrator decision D-6 replaces it with an enumerated rule, read with
// the compiler over every non-spec file under src/widgets (the type checker resolves aliases, re-exports
// and `export *`):
// - widget @Module imports: `WidgetsModule` imports `PrismaModule` and the owner-ports boundary
//   `WidgetOwnerPortsModule`, nothing else; `WidgetOwnerPortsModule` imports only the owner modules
//   ENUMERATED below (none in U0; `ActionEngineModule` never); no other widget module imports a
//   non-widget module. Every array is a literal and every element resolves to a class.
// - the owner-ports module imports only @nestjs/common, the DI tokens, owner-ports files and the
//   enumerated owner modules; it re-exports nothing; it provides and exports only the ENUMERATED bound
//   port tokens (none in U0), wired to owner-ports classes.
// - non-widget services: a class decorated @Injectable, @Controller or @Module declared outside
//   src/widgets is imported — by any import, `export … from`, `import()`, `require()` or `import('…')`
//   type, value or type-only — only by files under `owner-ports/**` and `projection/canonical-read.port.ts`
//   (services), and by the owner-ports module (enumerated modules). The one exception is the widget
//   layer's own store client: `PrismaService`, and `PrismaModule` in `widgets.module.ts`. An import
//   that does not resolve, or whose module is not a literal, cannot be read and fails.
// The stricter replacement test lands in the same commit: the union import-graph test
// (`src/widgets/widget-import-graph.architecture.spec.ts`: a closed allowlist of non-widget modules and
// packages, FR-1's Prisma models, gate files, and these enumerations read back from this script). The
// empty boundary itself stays pinned by `src/widgets/owner-ports/widget-owner-ports.module.spec.ts`.
const PORTS = 'owner-ports/widget-owner-ports.module.ts';
const WIDGETS_MODULE = 'widgets.module.ts';
/**
 * Owner modules `WidgetOwnerPortsModule` may import, as `<path under src>#<class>` (plan §1.3). Each is
 * added by the unit that binds a port through it, in the same commit as the test that pins the binding
 * (plan §3.5 item 7). U0: none.
 */
const OWNER_MODULES = [];
/** DI tokens of `di-tokens.ts` the owner-ports module may provide and export. U0: none. */
const BOUND_PORT_TOKENS = [];
const NEVER_IMPORTED = ['action-engine/action-engine.module.ts#ActionEngineModule'];
/** The widget layer's own store client, and where it may be imported (`null`: any widget file). */
const STORE_CLIENT = {
  'prisma/prisma.service.ts#PrismaService': null,
  'prisma/prisma.module.ts#PrismaModule': WIDGETS_MODULE,
};
const BOUNDARY = 'owner-ports/widget-owner-ports.module.ts#WidgetOwnerPortsModule';

const SRC = path.join(BE, 'src');
const PORTS_DIR = path.join(W, 'owner-ports');
const TOKENS_FILE = path.join(W, 'di-tokens.ts');
const walkFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkFiles(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
const widgetFiles = walkFiles(W).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts')).sort();
const compilerOptions = {
  ...ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(BE, 'tsconfig.json'), ts.sys.readFile).config, ts.sys, BE)
    .options,
  noEmit: true,
  incremental: false,
};
const program = ts.createProgram({ rootNames: widgetFiles, options: compilerOptions });
const checker = program.getTypeChecker();
const under = (f, dir) => path.resolve(f).startsWith(dir + path.sep);
const srcKey = (f) => path.relative(SRC, f).split(path.sep).join('/');
const wKey = (f) => path.relative(W, f).split(path.sep).join('/');
const aliased = (s) => (s && s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s);
const lineIn = (s, n) => s.getLineAndCharacterOfPosition(n.getStart(s)).line + 1;
/** The Nest decorator (`Injectable`, `Controller`, `Module`) a class declaration carries, if any. */
const nestDecorator = (decl) => {
  if (!ts.isClassDeclaration(decl)) return null;
  for (const d of ts.getDecorators(decl) ?? []) {
    const callee = ts.isCallExpression(d.expression) ? d.expression.expression : d.expression;
    const id = ts.isIdentifier(callee) ? callee : ts.isPropertyAccessExpression(callee) ? callee.name : null;
    const name = id ? (aliased(checker.getSymbolAtLocation(id))?.name ?? id.text) : null;
    if (name === 'Injectable' || name === 'Controller' || name === 'Module') return name;
  }
  return null;
};
const classKey = (decl) => `${srcKey(decl.getSourceFile().fileName)}#${decl.name?.text ?? 'default'}`;

/** Every import edge of a file, with the symbols it brings in (every export, when it names none). */
const importEdges = (s) => {
  const edges = [];
  // The checker's own resolution first (it also knows ambient modules such as `node:crypto`), then the
  // compiler's module resolution (for a `require` it does not bind).
  const moduleOf = (spec, specNode) => {
    const bound = checker.getSymbolAtLocation(specNode);
    if (bound && bound.flags & ts.SymbolFlags.Module) return { symbol: bound };
    const r = ts.resolveModuleName(spec, s.fileName, compilerOptions, ts.sys).resolvedModule;
    const target = r ? program.getSourceFile(r.resolvedFileName) : undefined;
    const symbol = target ? checker.getSymbolAtLocation(target) : undefined;
    return symbol ? { symbol } : null;
  };
  const everyExport = (m) => checker.getExportsOfModule(m.symbol).map(aliased);
  const add = (node, specNode, symbolsOf) => {
    const m = moduleOf(specNode.text, specNode);
    edges.push({ node, spec: specNode.text, module: m, symbols: m ? symbolsOf(m) : [] });
  };
  const visit = (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const c = n.importClause;
      add(n, n.moduleSpecifier, (m) => {
        if (!c) return everyExport(m);
        const syms = [];
        if (c.name) syms.push(aliased(checker.getSymbolAtLocation(c.name)));
        if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) syms.push(...everyExport(m));
        if (c.namedBindings && ts.isNamedImports(c.namedBindings))
          for (const el of c.namedBindings.elements) syms.push(aliased(checker.getSymbolAtLocation(el.name)));
        return syms;
      });
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      add(n, n.moduleSpecifier, (m) =>
        n.exportClause && ts.isNamedExports(n.exportClause)
          ? n.exportClause.elements.map((el) => aliased(checker.getExportSpecifierLocalTargetSymbol(el)))
          : everyExport(m),
      );
    } else if (
      ts.isImportEqualsDeclaration(n) &&
      ts.isExternalModuleReference(n.moduleReference) &&
      ts.isStringLiteral(n.moduleReference.expression)
    ) {
      add(n, n.moduleReference.expression, everyExport);
    } else if (
      ts.isCallExpression(n) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))
    ) {
      const a = n.arguments[0];
      if (a && ts.isStringLiteralLike(a)) add(n, a, everyExport);
      else edges.push({ node: n, spec: null, module: null, symbols: [] });
    } else if (ts.isImportTypeNode(n)) {
      const a = n.argument;
      if (ts.isLiteralTypeNode(a) && ts.isStringLiteral(a.literal)) add(n, a.literal, everyExport);
      else edges.push({ node: n, spec: null, module: null, symbols: [] });
    }
    n.forEachChild(visit);
  };
  visit(s);
  return edges;
};

const boundaryBreaks = [];
const storeClientFiles = new Set();
const portServices = [];
for (const f of widgetFiles) {
  const s = program.getSourceFile(f);
  const rel = wKey(f);
  const servicesAllowed = rel.startsWith('owner-ports/') || rel === 'projection/canonical-read.port.ts';
  for (const e of importEdges(s)) {
    const at = `${rel}:${lineIn(s, e.node)}`;
    if (e.spec === null) {
      boundaryBreaks.push(`${at}: an import whose module is not a string literal`);
      continue;
    }
    if (e.module === null) {
      boundaryBreaks.push(`${at}: '${e.spec}' does not resolve`);
      continue;
    }
    for (const sym of e.symbols)
      for (const d of sym?.declarations ?? []) {
        const kind = nestDecorator(d);
        if (!kind || under(d.getSourceFile().fileName, W)) continue;
        const key = classKey(d);
        if (key in STORE_CLIENT && (STORE_CLIENT[key] === null || STORE_CLIENT[key] === rel)) {
          storeClientFiles.add(rel);
          continue;
        }
        if (kind === 'Module') {
          if (rel === PORTS && OWNER_MODULES.includes(key) && !NEVER_IMPORTED.includes(key)) continue;
          boundaryBreaks.push(`${at}: imports the non-widget module ${key}`);
        } else if (kind === 'Injectable' && servicesAllowed) portServices.push(`${rel} -> ${key}`);
        else
          boundaryBreaks.push(
            `${at}: imports the non-widget ${kind === 'Controller' ? 'controller' : 'service'} ${key}; only owner-ports/** and projection/canonical-read.port.ts may import a service`,
          );
      }
  }
}

// The widget @Modules and their arrays.
const widgetModules = [];
for (const f of widgetFiles) {
  const s = program.getSourceFile(f);
  const visit = (n) => {
    if (ts.isClassDeclaration(n) && nestDecorator(n) === 'Module') {
      const d = (ts.getDecorators(n) ?? []).find((x) => ts.isCallExpression(x.expression));
      widgetModules.push({ rel: wKey(f), s, cls: n, arg: d ? d.expression.arguments[0] : undefined });
    }
    n.forEachChild(visit);
  };
  visit(s);
}
const classOf = (el) => {
  let target = el;
  if (ts.isCallExpression(el)) {
    const cb = el.arguments[0];
    if (ts.isIdentifier(el.expression) && el.expression.text === 'forwardRef' && cb && ts.isArrowFunction(cb) && !ts.isBlock(cb.body))
      target = cb.body;
    else if (ts.isPropertyAccessExpression(el.expression)) target = el.expression.expression;
  }
  if (!ts.isIdentifier(target)) return null;
  return aliased(checker.getSymbolAtLocation(target))?.declarations?.find(ts.isClassDeclaration) ?? null;
};
const tokenName = (id) => {
  const sym = aliased(checker.getSymbolAtLocation(id));
  return sym?.declarations?.some((d) => path.resolve(d.getSourceFile().fileName) === TOKENS_FILE) ? sym.name : null;
};
const declaredAtBoundary = (id) => {
  const decls = aliased(checker.getSymbolAtLocation(id))?.declarations ?? [];
  return decls.length > 0 && decls.every((d) => under(d.getSourceFile().fileName, PORTS_DIR) || path.resolve(d.getSourceFile().fileName) === TOKENS_FILE);
};
const moduleSummary = {};
for (const { rel, s, cls, arg } of widgetModules) {
  const name = cls.name?.text ?? 'default';
  const at = (n) => `${rel}:${lineIn(s, n)}`;
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    boundaryBreaks.push(`${at(cls)}: @Module of ${name} is not an object literal`);
    continue;
  }
  const arrays = {};
  for (const p of arg.properties) {
    const key = memberName(p);
    if (!ts.isPropertyAssignment(p) || key === null) boundaryBreaks.push(`${at(p)}: @Module of ${name} has a member that cannot be read`);
    else if (!ts.isArrayLiteralExpression(p.initializer)) boundaryBreaks.push(`${at(p)}: ${name}.${key} is not an array literal`);
    else arrays[key] = p.initializer.elements;
  }
  const imported = [];
  for (const el of arrays.imports ?? []) {
    const decl = classOf(el);
    if (!decl) {
      boundaryBreaks.push(`${at(el)}: ${name}.imports has an element that is not a class: ${el.getText(s)}`);
      continue;
    }
    const key = under(decl.getSourceFile().fileName, W) ? `${wKey(decl.getSourceFile().fileName)}#${decl.name?.text}` : classKey(decl);
    imported.push(decl.name?.text ?? key);
    const widget = under(decl.getSourceFile().fileName, W);
    const ok =
      rel === WIDGETS_MODULE
        ? key === BOUNDARY || key === 'prisma/prisma.module.ts#PrismaModule'
        : rel === PORTS
          ? !widget && OWNER_MODULES.includes(key) && !NEVER_IMPORTED.includes(key)
          : widget;
    if (!ok)
      boundaryBreaks.push(
        `${at(el)}: ${name} imports ${key}` +
          (rel === WIDGETS_MODULE
            ? ' (WidgetsModule imports PrismaModule and the owner-ports boundary only)'
            : rel === PORTS
              ? ' (not an enumerated owner module)'
              : ' (only the owner-ports module may import a non-widget module)'),
      );
  }
  moduleSummary[name] = imported;
  if (rel !== PORTS) continue;
  const bound = [];
  for (const el of arrays.providers ?? []) {
    if (ts.isObjectLiteralExpression(el)) {
      const provide = el.properties.find((p) => memberName(p) === 'provide');
      const token = provide && ts.isPropertyAssignment(provide) && ts.isIdentifier(provide.initializer) ? tokenName(provide.initializer) : null;
      if (token === null || !BOUND_PORT_TOKENS.includes(token)) {
        boundaryBreaks.push(`${at(el)}: the owner-ports module provides ${provide ? provide.getText(s) : el.getText(s)}, not an enumerated port token of di-tokens.ts`);
        continue;
      }
      bound.push(token);
      const idVisit = (n) => {
        if (ts.isIdentifier(n) && !(n.parent && 'name' in n.parent && n.parent.name === n && !ts.isShorthandPropertyAssignment(n.parent)) && !declaredAtBoundary(n))
          boundaryBreaks.push(`${at(n)}: the ${token} provider names ${n.text}, which is not declared under owner-ports/`);
        n.forEachChild(idVisit);
      };
      for (const p of el.properties) if (p !== provide) idVisit(p);
    } else if (!(ts.isIdentifier(el) && declaredAtBoundary(el) && BOUND_PORT_TOKENS.length > 0))
      boundaryBreaks.push(`${at(el)}: the owner-ports module provides ${el.getText(s)}, which is not a bound port`);
  }
  for (const el of arrays.exports ?? []) {
    const token = ts.isIdentifier(el) ? tokenName(el) : null;
    if (token === null || !BOUND_PORT_TOKENS.includes(token))
      boundaryBreaks.push(`${at(el)}: the owner-ports module exports ${el.getText(s)}, not an enumerated port token`);
  }
  moduleSummary[`${name} providers`] = bound;
  for (const st of s.statements) {
    if (ts.isExportDeclaration(st) && st.moduleSpecifier)
      boundaryBreaks.push(`${at(st)}: the owner-ports module re-exports '${st.moduleSpecifier.getText(s)}'`);
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      const r = ts.resolveModuleName(spec, s.fileName, compilerOptions, ts.sys).resolvedModule;
      const file = r && !r.isExternalLibraryImport ? srcKey(r.resolvedFileName) : null;
      const ok =
        spec === '@nestjs/common' ||
        spec === '../di-tokens' ||
        spec.startsWith('./') ||
        (file !== null && OWNER_MODULES.some((k) => k.startsWith(`${file}#`)));
      if (!ok)
        boundaryBreaks.push(`${at(st)}: the owner-ports module imports '${spec}' (only @nestjs/common, ../di-tokens, owner-ports files and enumerated owner modules)`);
    }
  }
}
for (const required of [WIDGETS_MODULE, PORTS])
  if (!widgetModules.some((m) => m.rel === required)) boundaryBreaks.push(`${required} declares no @Module`);
if (!(moduleSummary.WidgetsModule ?? []).includes('WidgetOwnerPortsModule'))
  boundaryBreaks.push('WidgetsModule does not import the owner-ports boundary');
if (OWNER_MODULES.some((k) => NEVER_IMPORTED.includes(k))) boundaryBreaks.push('an owner module that is never imported is enumerated');
chk(
  'the widget layer reaches an owner only through the owner-ports boundary (D-6)',
  boundaryBreaks.length === 0,
  boundaryBreaks.length
    ? `BOUNDARY: ${[...new Set(boundaryBreaks)].join('; ')}`
    : `WidgetsModule imports [${(moduleSummary.WidgetsModule ?? []).join(', ')}]; WidgetOwnerPortsModule imports ` +
        `[${(moduleSummary.WidgetOwnerPortsModule ?? []).join(', ')}] (enumerated owner modules: ${OWNER_MODULES.length ? OWNER_MODULES.join(', ') : 'none'}; ` +
        `ActionEngineModule never) and provides [${(moduleSummary['WidgetOwnerPortsModule providers'] ?? []).join(', ')}] ` +
        `(bound port tokens: ${BOUND_PORT_TOKENS.length ? BOUND_PORT_TOKENS.join(', ') : 'none'}); ${widgetFiles.length} widget files read: ` +
        `the only non-widget DI class imported is the store client (${storeClientFiles.size} files); ` +
        `owner services under owner-ports/**: ${portServices.length ? portServices.join(', ') : 'none'}`,
);

for (const c of out) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n        ${c.ev}`);
const bad = out.filter((c) => !c.ok).length;
console.log(bad ? `\n${out.length - bad}/${out.length} — K3 structural checks` : `\n${out.length}/${out.length} K3 structural checks pass`);
process.exit(bad ? 1 : 0);
