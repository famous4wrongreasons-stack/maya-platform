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

// One compiler program over every non-spec file under src/widgets, with the project's own options.
// Check 4 resolves names through its type checker, and check 9 reads the import graph with it.
const SRC = path.join(BE, 'src');
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
/** The Nest decorators (`Injectable`, `Controller`, `Module`) a class carries, in order, with their nodes. */
const nestDecorators = (cls) =>
  (ts.canHaveDecorators(cls) ? (ts.getDecorators(cls) ?? []) : []).flatMap((d) => {
    const callee = ts.isCallExpression(d.expression) ? d.expression.expression : d.expression;
    const id = ts.isIdentifier(callee) ? callee : ts.isPropertyAccessExpression(callee) ? callee.name : null;
    const name = id ? (aliased(checker.getSymbolAtLocation(id))?.name ?? id.text) : null;
    return name === 'Injectable' || name === 'Controller' || name === 'Module' ? [{ name, node: d }] : [];
  });
/** The first Nest decorator a class declaration carries, if any. */
const nestDecorator = (decl) => (ts.isClassDeclaration(decl) ? (nestDecorators(decl)[0]?.name ?? null) : null);
const classKey = (decl) => `${srcKey(decl.getSourceFile().fileName)}#${decl.name?.text ?? 'default'}`;

// ── 1. the pipeline is one ordered array ─────────────────────────────────────────────────────
// §0.3 fixes the mechanism as "a single ordered array whose ... no branch that skips a gate".
// An array can be counted; nested conditionals can only be read.
const gw = program.getSourceFile(path.join(W, 'intent-gateway.service.ts'));
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
//
// GATES-PLAN-V11 D-1 (P-PRINCIPAL) split the walk at ONE point: the request transaction `T` commits
// after slot 10, so slots 11-13 run outside it. That is a commit point, not a branch, and the check is
// tightened rather than relaxed to say so: `submit()` cuts `this.gates` into exactly two slices whose
// bounds are the same expression (`lastInTx + 1`), so they are contiguous and cover the array; there is
// ONE loop, a for-of over the slice it was handed, with no `continue`, no index, and no condition on a
// gate's identity; and it still stops at the first non-pass verdict. A third slice, an overlap or a gap
// would fail the range test, and a loop over anything but the handed slice would fail the loop test.
const runner = read('intent-gateway.service.ts');
const loop = /for \(const gate of slots\) \{([\s\S]*?)\n {4}\}/.exec(runner);
const ranges =
  /const inTransactionSlots = this\.gates\.slice\(0, lastInTx \+ 1\);\n\s*const afterCommitSlots = this\.gates\.slice\(lastInTx \+ 1\);/.test(runner) &&
  (runner.match(/this\.gates\.slice\(/g) ?? []).length === 2 &&
  (runner.match(/for \(const gate of /g) ?? []).length === 1 &&
  !/for \(let |this\.gates\[/.test(runner);
chk(
  'the runner walks every gate and stops only on a verdict',
  loop !== null && ranges && !/\bcontinue\b/.test(loop[1]) && /verdict\.outcome !== 'pass'/.test(loop[1]),
  loop && ranges
    ? 'one for-of over the handed slice; two contiguous slices of this.gates covering it; no continue, no index; stops at the first non-pass'
    : loop
      ? 'RANGES: the two slices are not this.gates cut once at lastInTx + 1'
      : 'no runner loop found',
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
//   fails. A `run` is a constant pass when every value it returns is a pass, whatever its parameters
//   and whether it is an arrow, a block of returns or a method. A pass is read in exactly these forms:
//   - the identifier `pass`, or a `const` the type checker resolves (in this file or through an
//     import) to an initialiser that is itself a pass;
//   - an object literal whose last outcome-setting member is `outcome: 'pass'` (the string literal or a
//     `const` resolving to it) or a spread of a pass (`{ ...pass }`, `{ ...{ outcome: 'pass' } }`);
//   - any of these, verdicts and outcome strings alike, through parentheses, casts, `await`, the right
//     side of a comma and a conditional whose branches are both passes; a verdict also through
//     `Promise.resolve`.
//   Not seen: a call into another function that can only pass (slot 12 today calls `gate12`, which
//   passes without a subject; that is read by the gate's own tests, not here), a property read, a
//   `let` or `var`, a shorthand `outcome` member, and any value computed at run time.
// - Exactly two constant passes can be admitted, each only when PROVEN, each for the one slot the
//   §3.9 table hosts there:
//   1. slot 2, hosted by 'HTTP middleware' — the pass is admissible because the middleware has
//      already run: the JWT guard is global and the widgets controller does not opt out. (Unchanged,
//      except that it is bound to slot 2 and the guard's name is matched whole: `JwtAuthGuardX` in
//      the APP_GUARD provider no longer reads as the JWT guard.)
//      GATES-PLAN-V11 D-16 (P-PRINCIPAL) makes this exception UNUSED: slot 2 now refuses
//      `unauthenticated` in-array when no transport session reached the gateway at all, so it is not a
//      constant pass and does not ask for the exception. A principal the transport chain admitted and
//      `C9Authority.current` denied is refused at slot 3 (`widget_principal_mismatch`), never at slot 2
//      — row 2 is the transport chain (C11:4721), row 3 is the live proof hash (C11:4722). The
//      exception is kept, not removed, because the property it states is still the one being checked:
//      a slot that IS a constant pass must prove why. If slot 2 becomes one again it must prove it
//      again, which is what kills the `slot 2 constant pass` mutant.
//   2. slot 12, hosted by 'Projector' — a POINTER (D-7, G12 §5.2): the data fence runs inside the
//      projector, which Gate 13's edges call. Admitted only when (a) its `run` IS the pointer, so the
//      slot reads nothing, and (b) the architecture proofs ARCH-12-9 (the projector is referenced only
//      from Gate 13's REFINE/NAVIGATE edges) and ARCH-12-10 (slot 12 references nothing and
//      `liveGateCount` excludes it) EXIST — each exactly one active `it`/`test` whose title begins with
//      its id, in `src/widgets/projection/*.architecture.spec.ts` — and PASS, run here with jest.
//      The pointer is one exact shape, not "returns only a pass": a block may run any statement before
//      its `return`, and an arrow in a class field closes over `this` (`this.prisma`, the stores)
//      without taking a parameter. So `run` is a non-async arrow with no parameter, no type parameter
//      and no return type, written directly as the member's value, whose body is `pass` or
//      `{ outcome: 'pass' }` (parentheses allowed), or a block whose only statement returns one of
//      them; `pass` must resolve to `src/widgets/gates/verdict.ts`'s `pass`; and every node of the
//      function is one of the kinds that shape consists of, so no `this`, call, property read or
//      other statement can be in it. The proofs are only run when a slot asks for the exception.
//      Until U12a builds them the exception is unused, and a constant-pass slot 12 fails like any
//      other.
//
// GATES-PLAN-V11 D-18 (I-CTX) moved the unbuilt slots 8, 9 and 10 into seam files, so the gateway has no
// `pending()` helper left. The helper's property is kept, and now read where the stub lives: a slot that
// carries `pendingOn` must be an object literal whose `run` returns exactly one call of a named function,
// that name must resolve through the type checker to one `const` arrow or function (in any file), and every
// value that function returns must be a direct call of `src/widgets/gates/verdict.ts`'s `refuse` whose
// first argument is the literal 'mechanism_absent'. A slot that carries `pendingOn` and could pass, or
// whose stub cannot be read this way, fails.
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
/**
 * The initialiser of the `const` a name resolves to, in this file or through an import, or null. `seen`
 * holds the initialisers already followed on this path, so a cycle ends instead of recursing.
 */
const constInitializer = (id, seen) => {
  const decls = aliased(checker.getSymbolAtLocation(id))?.declarations ?? [];
  const d = decls.length === 1 ? decls[0] : null;
  const init =
    d && ts.isVariableDeclaration(d) && d.initializer && ts.isVariableDeclarationList(d.parent) && d.parent.flags & ts.NodeFlags.Const
      ? d.initializer
      : null;
  return init && !seen.has(init) ? init : null;
};
const isPassString = (raw, seen) => {
  const e = stripExpr(raw);
  if (!e) return false;
  if (ts.isStringLiteralLike(e)) return e.text === 'pass';
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.CommaToken) return isPassString(e.right, seen);
  if (ts.isConditionalExpression(e)) return isPassString(e.whenTrue, seen) && isPassString(e.whenFalse, seen);
  const init = ts.isIdentifier(e) ? constInitializer(e, seen) : null;
  return init !== null && isPassString(init, new Set(seen).add(init));
};
const isPassExpr = (raw, seen = new Set()) => {
  const e = stripExpr(raw);
  if (!e) return false;
  if (ts.isIdentifier(e)) {
    if (e.text === 'pass') return true;
    const init = constInitializer(e, seen);
    return init !== null && isPassExpr(init, new Set(seen).add(init));
  }
  if (ts.isObjectLiteralExpression(e)) {
    const setters = e.properties.filter(
      (p) => ts.isSpreadAssignment(p) || memberName(p) === 'outcome' || (p.name && ts.isComputedPropertyName(p.name)),
    );
    const last = setters[setters.length - 1];
    if (last && ts.isSpreadAssignment(last)) return isPassExpr(last.expression, seen);
    if (!last || !ts.isPropertyAssignment(last) || memberName(last) !== 'outcome') return false;
    return isPassString(last.initializer, seen);
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.CommaToken) return isPassExpr(e.right, seen);
  if (ts.isConditionalExpression(e)) return isPassExpr(e.whenTrue, seen) && isPassExpr(e.whenFalse, seen);
  if (ts.isCallExpression(e) && e.expression.getText() === 'Promise.resolve')
    return e.arguments.length === 1 && isPassExpr(e.arguments[0], seen);
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
/** D-7's pointer: the one shape a slot 12 `run` may have. Returns why `run` is not it, or null. */
const VERDICT_FILE = path.join(W, 'gates/verdict.ts');
const POINTER_KINDS = new Set(
  [
    'ArrowFunction',
    'EqualsGreaterThanToken',
    'Block',
    'ReturnStatement',
    'ParenthesizedExpression',
    'Identifier',
    'ObjectLiteralExpression',
    'PropertyAssignment',
    'StringLiteral',
    'NoSubstitutionTemplateLiteral',
  ].map((k) => ts.SyntaxKind[k]),
);
const isVerdictPass = (e) => {
  if (!ts.isIdentifier(e) || e.text !== 'pass') return false;
  const decls = aliased(checker.getSymbolAtLocation(e))?.declarations ?? [];
  return (
    decls.length === 1 &&
    ts.isVariableDeclaration(decls[0]) &&
    ts.isIdentifier(decls[0].name) &&
    decls[0].name.text === 'pass' &&
    path.resolve(decls[0].getSourceFile().fileName) === VERDICT_FILE
  );
};
const isPassLiteral = (e) =>
  ts.isObjectLiteralExpression(e) &&
  e.properties.length === 1 &&
  ts.isPropertyAssignment(e.properties[0]) &&
  memberName(e.properties[0]) === 'outcome' &&
  ts.isStringLiteralLike(e.properties[0].initializer) &&
  e.properties[0].initializer.text === 'pass';
const notPointer = (run) => {
  if (!run || !ts.isPropertyAssignment(run) || !ts.isArrowFunction(run.initializer))
    return 'its run is not an arrow written directly as the member value';
  const fn = run.initializer;
  if (fn.modifiers?.length) return 'its run is async';
  if (fn.parameters.length > 0) return 'its run takes a parameter';
  if (fn.typeParameters?.length || fn.type) return 'its run carries a type parameter or a return type';
  let body = fn.body;
  if (ts.isBlock(body)) {
    const [only] = body.statements;
    if (body.statements.length !== 1 || !ts.isReturnStatement(only) || !only.expression)
      return 'its block is not a single return statement';
    body = only.expression;
  }
  while (ts.isParenthesizedExpression(body)) body = body.expression;
  if (!isVerdictPass(body) && !isPassLiteral(body))
    return "it does not return gates/verdict.ts's pass or the literal { outcome: 'pass' }";
  const stray = new Set();
  const visit = (n) => {
    if (!POINTER_KINDS.has(n.kind)) stray.add(ts.SyntaxKind[n.kind]);
    n.forEachChild(visit);
  };
  visit(fn);
  return stray.size ? `its run contains ${[...stray].join(', ')}` : null;
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
  return { kind: 'object', n, host: str('host'), fn, run, pendingOn: member('pendingOn') !== undefined };
};

/** I-CTX's seam stub: why a slot that carries `pendingOn` is not a readable refusing stub, or null. */
const isMechanismAbsentRefusal = (raw) => {
  const e = stripExpr(raw);
  if (!e || !ts.isCallExpression(e) || !ts.isIdentifier(e.expression) || e.expression.text !== 'refuse') return false;
  const decls = aliased(checker.getSymbolAtLocation(e.expression))?.declarations ?? [];
  const a0 = e.arguments[0];
  return (
    decls.length === 1 &&
    ts.isVariableDeclaration(decls[0]) &&
    path.resolve(decls[0].getSourceFile().fileName) === VERDICT_FILE &&
    a0 !== undefined &&
    ts.isStringLiteralLike(a0) &&
    a0.text === 'mechanism_absent'
  );
};
const notRefusingStub = (s) => {
  const calls = returnsOf(s.fn);
  const call = calls.length === 1 && calls[0] !== null ? stripExpr(calls[0]) : null;
  if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression))
    return 'its run does not return exactly one call of a named function';
  const name = call.expression.text;
  const decls = aliased(checker.getSymbolAtLocation(call.expression))?.declarations ?? [];
  const d = decls.length === 1 ? decls[0] : null;
  const init =
    d && ts.isVariableDeclaration(d) && d.initializer && ts.isVariableDeclarationList(d.parent) && d.parent.flags & ts.NodeFlags.Const
      ? stripExpr(d.initializer)
      : null;
  const stub =
    init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : d && ts.isFunctionDeclaration(d) ? d : null;
  if (!stub) return `${name} does not resolve to one const function`;
  const values = returnsOf(stub);
  if (values.length === 0 || !values.every((v) => v !== null && isMechanismAbsentRefusal(v)))
    return `${name} (${wKey(d.getSourceFile().fileName)}) does not only return refuse('mechanism_absent', …)`;
  return null;
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
/** Slots that carry `pendingOn` and whose seam reads as a refusing stub. */
const seamStubs = [];
let projectorException = 'unused: no slot hosted by Projector is a constant pass as read here (a call is not followed)';
for (const s of slots) {
  if (s.kind === 'unreadable') slotProblems.push(`slot ${s.n} cannot be read (${s.why})`);
  else if (s.kind === 'call' && s.callee !== 'pending') slotProblems.push(`slot ${s.n} is a call of ${s.callee}, not pending()`);
  else if (s.kind === 'object' && isConstantPass(s.fn)) {
    if (s.host === 'HTTP middleware' && s.n === '2') {
      if (jwtGuardGlobal) admitted.push('2 (HTTP middleware: the JWT guard is global and the controller does not opt out)');
      else slotProblems.push('slot 2 is a constant pass, and the global JWT guard is NOT proven');
    } else if (s.host === 'Projector' && s.n === '12') {
      const why = notPointer(s.run);
      if (why) {
        projectorException = `refused: slot 12 is not the pointer (${why})`;
        slotProblems.push(`slot 12 is a constant pass that is not the D-7 pointer, so it can read: ${why}`);
      } else {
        const proof = archProof();
        projectorException = proof.ok ? `admitted for 12: ${proof.why}` : `NOT PROVEN: ${proof.why}`;
        if (proof.ok) admitted.push('12 (Projector pointer, D-7)');
        else slotProblems.push(`slot 12 is a Projector pointer whose proof is absent or failing: ${proof.why}`);
      }
    } else slotProblems.push(`slot ${s.n} (host ${s.host}) is a constant pass`);
  }
  if (s.kind === 'object' && s.pendingOn) {
    const why = notRefusingStub(s);
    if (why) slotProblems.push(`slot ${s.n} carries pendingOn, but ${why}`);
    else seamStubs.push(s.n);
  }
}
const pendingRefuses = pendingHelper === null ||
  (/outcome: 'refuse'/.test(pendingHelper[0]) && /mechanism_absent/.test(pendingHelper[0]));
chk(
  'no gate can pass silently: no slot is a constant pass except a proven one, and a pending() helper refuses',
  slotProblems.length === 0 && pendingRefuses,
  `${slotProblems.length ? `NOT ADMITTED: ${slotProblems.join('; ')}` : `${slots.length} slots read`}; ` +
    `proven constant passes: ${admitted.length ? admitted.join(', ') : 'none'}; Projector exception (D-7): ${projectorException}; ` +
    (pendingHelper ? `pending() ${pendingRefuses ? 'returns refuse/mechanism_absent' : 'DOES NOT REFUSE'}` : 'no pending() helper') +
    `; refusing seam stubs (slots carrying pendingOn): ${seamStubs.length ? `${seamStubs.join(', ')}, each one call that only returns refuse('mechanism_absent', …)` : 'none'}`,
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
// The routes are read from `widgets.controller.ts`, so that must be the only controller the widget
// layer declares: a second one serves whatever module registers it, and its routes are not read here.
// So no other class under src/widgets carries @Controller (U0 S4 review, mutant R4b), whether or not a
// module registers it; check 9 holds each widget module's `controllers` member.
const WIDGETS_CONTROLLER = 'widgets.controller.ts#WidgetsController';
const posts = [...ctrl.matchAll(/@Post\('([^']+)'\)/g)].map((m) => m[1]);
const widgetControllers = [];
for (const f of widgetFiles) {
  const visit = (n) => {
    if (ts.isClassLike(n) && nestDecorators(n).some((d) => d.name === 'Controller'))
      widgetControllers.push(`${wKey(f)}#${n.name?.text ?? 'anonymous'}`);
    n.forEachChild(visit);
  };
  visit(program.getSourceFile(f));
}
chk(
  "the two widget routes, and no more",
  posts.length === 2 &&
    posts.includes('resolve') &&
    posts.includes('intent') &&
    widgetControllers.length === 1 &&
    widgetControllers[0] === WIDGETS_CONTROLLER,
  `${posts.map((p) => `POST /widgets/${p}`).join(', ')}; controllers under src/widgets: ${widgetControllers.join(', ') || 'none'}` +
    (widgetControllers.length === 1 && widgetControllers[0] === WIDGETS_CONTROLLER ? '' : ` (only ${WIDGETS_CONTROLLER})`),
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
// - widget @Module imports: `WidgetsModule` imports `PrismaModule`, the owner-ports boundary
//   `WidgetOwnerPortsModule`, and the closed widget-internal emission module;
//   `WidgetOwnerPortsModule` imports only the owner modules
//   ENUMERATED below (none in U0; `ActionEngineModule` never); no other widget module imports a
//   non-widget module. Every array is a literal and every element resolves to a class.
// - widget @Module members are closed: `WidgetsModule` has `imports`, `controllers`, `providers` and
//   `exports`, and its `controllers` is exactly `[WidgetsController]`; every other widget module,
//   the owner-ports module included, has only `imports`, `providers` and `exports`. The boundary
//   serves no route (U0 S4 review, mutant R4b: a `controllers` member there passed every fence).
// - the owner-ports module file imports only `@nestjs/common` and files that RESOLVE to di-tokens.ts,
//   to a file under owner-ports/, or to an enumerated owner module's file. Every import form counts,
//   and the specifier's text proves nothing (`./../../common/…` starts with './'). It re-exports
//   nothing; it provides and exports only the ENUMERATED bound port tokens (none in U0), wired to
//   owner-ports classes.
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
const EMISSION_MODULE = 'emission/emission.module.ts#WidgetEmissionModule';
/**
 * Owner modules `WidgetOwnerPortsModule` may import, as `<path under src>#<class>` (plan §1.3). Each is
 * added by the unit that binds a port through it, in the same commit as the test that pins the binding
 * (plan §3.5 item 7). U0: none.
 */
const OWNER_MODULES = [
  // U6-L1 (R6-2): C20's owner, `AiToolPolicyService.assertCanExecute` (C11:4761-4762).
  'ai-tools/ai-tool-policy.module.ts#AiToolPolicyModule',
  // U12b (G12-R3): the canonical READ runtime; the adapter calls execute, never the handler.
  'ai-tools/ai-tools.module.ts#AiToolsModule',
  // U12b: the two read-only result owners admitted by PLAN G12 §5.3.
  'measurement/measurement.module.ts#MeasurementModule',
  'valuation/c8.module.ts#C8Module',
  // P-PRINCIPAL (D-1, D-2): K1's resolver (C11:2536-2539) and B-02's in-transaction Membership read.
  'orchestration/c9.module.ts#C9Module',
  'crm/crm.module.ts#CrmModule',
  // U6-L1 (R6-2): (e)'s owner, `EntitlementsService` grants every `requiredFeatures` entry (C11:4755).
  'entitlements/entitlements.module.ts#EntitlementsModule',
  'tenancy/tenancy.module.ts#TenancyModule',
];
/** DI tokens of `di-tokens.ts` the owner-ports module may provide and export. */
const BOUND_PORT_TOKENS = [
  'CANONICAL_READ',
  'GATE6_OWNERS',
  'PRINCIPAL_RESOLVER',
  'TENANT_SCOPE',
  'NOUN_RESOLUTION_PORTS',
];
const NEVER_IMPORTED = ['action-engine/action-engine.module.ts#ActionEngineModule'];
/** The widget layer's own store client, and where it may be imported (`null`: any widget file). */
const STORE_CLIENT = {
  'prisma/prisma.service.ts#PrismaService': null,
  'prisma/prisma.module.ts#PrismaModule': WIDGETS_MODULE,
};
const BOUNDARY = 'owner-ports/widget-owner-ports.module.ts#WidgetOwnerPortsModule';

const PORTS_DIR = path.join(W, 'owner-ports');
const TOKENS_FILE = path.join(W, 'di-tokens.ts');

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
    const d = ts.isClassDeclaration(n) ? nestDecorators(n).find((x) => x.name === 'Module')?.node : undefined;
    if (d) widgetModules.push({ rel: wKey(f), s, cls: n, arg: ts.isCallExpression(d.expression) ? d.expression.arguments[0] : undefined });
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
  const members = rel === WIDGETS_MODULE ? ['imports', 'controllers', 'providers', 'exports'] : ['imports', 'providers', 'exports'];
  for (const p of arg.properties) {
    const key = memberName(p);
    if (!ts.isPropertyAssignment(p) || key === null) boundaryBreaks.push(`${at(p)}: @Module of ${name} has a member that cannot be read`);
    else if (!members.includes(key))
      boundaryBreaks.push(
        `${at(p)}: ${name} has a '${key}' member` +
          (key === 'controllers' ? ` (only WidgetsModule registers a controller, and only ${WIDGETS_CONTROLLER})` : ` (a widget module has only ${members.join(', ')})`),
      );
    else if (!ts.isArrayLiteralExpression(p.initializer)) boundaryBreaks.push(`${at(p)}: ${name}.${key} is not an array literal`);
    else arrays[key] = p.initializer.elements;
  }
  if (rel === WIDGETS_MODULE) {
    const registered = (arrays.controllers ?? []).map((el) => {
      const decl = ts.isIdentifier(el) ? classOf(el) : null;
      return decl ? `${wKey(decl.getSourceFile().fileName)}#${decl.name?.text ?? 'default'}` : `?${el.getText(s)}`;
    });
    if (registered.length !== 1 || registered[0] !== WIDGETS_CONTROLLER)
      boundaryBreaks.push(`${at(cls)}: WidgetsModule registers controllers [${registered.join(', ')}], not exactly [${WIDGETS_CONTROLLER}]`);
    moduleSummary['WidgetsModule controllers'] = registered;
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
        ? key === BOUNDARY || key === EMISSION_MODULE || key === 'prisma/prisma.module.ts#PrismaModule'
        : rel === PORTS
          ? !widget && OWNER_MODULES.includes(key) && !NEVER_IMPORTED.includes(key)
          : widget;
    if (!ok)
      boundaryBreaks.push(
        `${at(el)}: ${name} imports ${key}` +
          (rel === WIDGETS_MODULE
            ? ' (WidgetsModule imports PrismaModule, the owner-ports boundary and the internal emission module only)'
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
  for (const st of s.statements)
    if (ts.isExportDeclaration(st) && st.moduleSpecifier)
      boundaryBreaks.push(`${at(st)}: the owner-ports module re-exports '${st.moduleSpecifier.getText(s)}'`);
  for (const e of importEdges(s)) {
    if (e.spec === null) continue; // refused above: a module that is not a string literal
    const r = ts.resolveModuleName(e.spec, s.fileName, compilerOptions, ts.sys).resolvedModule;
    const file = r && !r.isExternalLibraryImport ? path.resolve(r.resolvedFileName) : null;
    const ok =
      e.spec === '@nestjs/common' ||
      (file !== null &&
        (file === TOKENS_FILE || under(file, PORTS_DIR) || OWNER_MODULES.some((k) => k.startsWith(`${srcKey(file)}#`))));
    if (!ok)
      boundaryBreaks.push(
        `${at(e.node)}: the owner-ports module imports '${e.spec}'${file ? `, which resolves to src/${srcKey(file)}` : ''} ` +
          '(only @nestjs/common, di-tokens.ts, files under owner-ports/ and enumerated owner module files)',
      );
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
    : `WidgetsModule imports [${(moduleSummary.WidgetsModule ?? []).join(', ')}] and registers [${(moduleSummary['WidgetsModule controllers'] ?? []).join(', ')}]; WidgetOwnerPortsModule imports ` +
        `[${(moduleSummary.WidgetOwnerPortsModule ?? []).join(', ')}] (enumerated owner modules: ${OWNER_MODULES.length ? OWNER_MODULES.join(', ') : 'none'}; ` +
        `ActionEngineModule never), registers no controller and provides [${(moduleSummary['WidgetOwnerPortsModule providers'] ?? []).join(', ')}] ` +
        `(bound port tokens: ${BOUND_PORT_TOKENS.length ? BOUND_PORT_TOKENS.join(', ') : 'none'}); ${widgetFiles.length} widget files read: ` +
        `the only non-widget DI class imported is the store client (${storeClientFiles.size} files); ` +
        `owner services under owner-ports/**: ${portServices.length ? portServices.join(', ') : 'none'}`,
);

// ── 10. `widgets.runtime` is granted by exactly one path (P-RENDER REN-6; §2.6 constraint 8) ──────
// Check 8 covers the PRODUCT's own grants (no plan, no trial). This covers the REPOSITORY's: a seed
// or a migration that granted the key would hand the dark runtime to a real tenant without any plan
// changing, and nothing in check 8 would notice. The one allowlisted path is `Fixtures.grantFeature`,
// which asserts the proof database before it writes, reached only from `test/widgets-live/**` and from
// the BIN runner's guarded `ctx.fixtures` (I-HAR). This block must not flag its OWN file, so every
// mention of the builder here is a regex literal or a message string and none of them spells the call
// with its opening parenthesis — writing that spelling in a comment is enough to make this check fail.
const GRANT_SOURCE = 'test/widgets-live/support/fixtures.ts';
const GRANT_CALLER_PREFIXES = ['test/widgets-live/', 'scripts/widgets-http-proof/'];
const GRANT_CALLER_FILE = 'scripts/widgets-intent-http-proof.ts';
const BIN_CASES_PREFIX = 'scripts/widgets-http-proof/';
const BIN_CASE_GUARD = /\.fixtures\s*\.\s*grantFeature\s*\(/;
const FIXTURES_MODULE_IMPORT = /from\s*'[^']*widgets-live\/support\/fixtures'/;
const ENTITLEMENT_WRITE =
  /tenantEntitlement\s*\.\s*(create|createMany|upsert|update|updateMany)|INSERT\s+INTO\s+"?TenantEntitlement"?/i;
const grantWalk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : grantWalk(p);
        return [p];
      })
    : [];
const grantBreaks = [];
for (const scope of ['prisma', 'scripts', 'src', 'test'])
  for (const f of grantWalk(path.join(BE, scope))) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (!text.includes('widgets.runtime')) continue;
    const key = path.relative(BE, f).split(path.sep).join('/');
    if ((scope === 'prisma' || scope === 'scripts') && ENTITLEMENT_WRITE.test(text) && key !== GRANT_SOURCE)
      grantBreaks.push(`${key} writes a TenantEntitlement row for widgets.runtime`);
    if (!/grantFeature\s*\(/.test(text)) continue;
    if (!GRANT_CALLER_PREFIXES.some((p) => key.startsWith(p)) && key !== GRANT_CALLER_FILE)
      grantBreaks.push(`${key} reaches Fixtures.grantFeature for widgets.runtime outside the allowlist`);
    else if (key.startsWith(BIN_CASES_PREFIX) && (!BIN_CASE_GUARD.test(text) || FIXTURES_MODULE_IMPORT.test(text)))
      grantBreaks.push(`${key} reaches the grant other than through the BIN runner's guarded ctx.fixtures`);
  }
chk(
  'widgets.runtime is granted by one path: Fixtures.grantFeature on the guarded proof DB, and by no migration, seed or script',
  grantBreaks.length === 0 && fs.existsSync(path.join(BE, GRANT_SOURCE)),
  grantBreaks.length
    ? `GRANT: ${[...new Set(grantBreaks)].join('; ')}`
    : `no migration, seed or script grants it; the one path is ${GRANT_SOURCE}, reached from ${GRANT_CALLER_PREFIXES.map((p) => `${p}**`).join(', ')} and ${GRANT_CALLER_FILE}`,
);

for (const c of out) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n        ${c.ev}`);
const bad = out.filter((c) => !c.ok).length;
console.log(bad ? `\n${out.length - bad}/${out.length} — K3 structural checks` : `\n${out.length}/${out.length} K3 structural checks pass`);
process.exit(bad ? 1 : 0);
