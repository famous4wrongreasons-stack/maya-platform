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
//
// Once every gate is wired there is no pending() helper left, and "the helper refuses" can no longer
// be the test. The property itself can: no slot's run is a constant pass. A pending() helper, where
// one still exists, must still refuse.
const pendingHelper = /const pending = \([\s\S]*?\n\}\);/.exec(runner);
const appModuleSrc = fs.readFileSync(path.join(BE, 'src/app.module.ts'), 'utf8');
const jwtGuardGlobal =
  /provide:\s*APP_GUARD,\s*useClass:\s*JwtAuthGuard/.test(appModuleSrc) &&
  !/@Public\(/.test(read('widgets.controller.ts'));
const constantPass = gatesArray
  ? gatesArray.elements
      .map((e) => e.getText(gw))
      .filter((t) => /run:\s*\(\s*\)\s*=>\s*(\(\s*)?\{\s*outcome:\s*'pass'/.test(t) || /run:\s*\(\s*\)\s*=>\s*pass\b/.test(t))
      // A slot hosted by HTTP middleware passes because the middleware has already run — admissible
      // only when that is PROVEN: the guard is global and the widgets controller does not opt out.
      .filter((t) => !(/host:\s*'HTTP middleware'/.test(t) && jwtGuardGlobal))
      .map((t) => /n:\s*'([^']+)'/.exec(t)?.[1] ?? '?')
  : ['no gate array'];
const pendingRefuses = pendingHelper === null ||
  (/outcome: 'refuse'/.test(pendingHelper[0]) && /mechanism_absent/.test(pendingHelper[0]));
chk(
  'no gate can pass silently: no slot is a constant pass, and a pending() helper refuses',
  constantPass.length === 0 && pendingRefuses,
  `${constantPass.length ? `constant-pass slots: ${constantPass.join(' ')}` : '0 constant-pass slots'}; ` +
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

// ── 9. the gateway reaches no capability owner ───────────────────────────────────────────────
// A gateway that could import a capability module would be a second authority path. It imports
// Prisma and nothing else, and that is checked rather than intended.
const mod = read('widgets.module.ts');
const imports = [...mod.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).filter((p) => p.startsWith('.'));
const foreign = imports.filter((p) => !p.startsWith('./') && p !== '../prisma/prisma.module');
// U0 (D-6) added `WidgetOwnerPortsModule`, the one widget module that will ever import an owner
// module. The widget module's relative import of it passes the rule above, so without this clause
// the new module would be a path around the check. Until the plan's enumerated rule replaces this
// clause (U0 item 9), the owner-ports module imports nothing but `@nestjs/common`, and its
// `imports`, `providers` and `exports` are empty. Read with the compiler, so a multi-line import or
// a re-export is seen too.
const PORTS = 'owner-ports/widget-owner-ports.module.ts';
const portsSf = sf(PORTS);
const portsSpecifiers = portsSf.statements
  .filter((s) => (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) && s.moduleSpecifier)
  .map((s) => s.moduleSpecifier.text);
const portsArrays = {};
const portsWalk = (n) => {
  if (ts.isDecorator(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(portsSf) === 'Module') {
    const arg = n.expression.arguments[0];
    if (arg && ts.isObjectLiteralExpression(arg))
      for (const p of arg.properties)
        if (ts.isPropertyAssignment(p))
          portsArrays[p.name.getText(portsSf)] = ts.isArrayLiteralExpression(p.initializer)
            ? p.initializer.elements.length
            : 'not an array literal';
  }
  n.forEachChild(portsWalk);
};
portsWalk(portsSf);
const portsForeign = portsSpecifiers.filter((p) => p !== '@nestjs/common');
const portsEmpty = ['imports', 'providers', 'exports'].every((k) => portsArrays[k] === 0);
chk(
  'the widget module imports Prisma and no capability module',
  foreign.length === 0 && portsForeign.length === 0 && portsEmpty,
  (foreign.length ? `IMPORTS: ${foreign.join(', ')}` : imports.join(', ')) +
    `; ${PORTS}: ${portsForeign.length ? `IMPORTS: ${portsForeign.join(', ')}` : 'imports only @nestjs/common'}, ` +
    `@Module arrays ${JSON.stringify(portsArrays)}`,
);

for (const c of out) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n        ${c.ev}`);
const bad = out.filter((c) => !c.ok).length;
console.log(bad ? `\n${out.length - bad}/${out.length} — K3 structural checks` : `\n${out.length}/${out.length} K3 structural checks pass`);
process.exit(bad ? 1 : 0);
