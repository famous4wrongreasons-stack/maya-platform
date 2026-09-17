#!/usr/bin/env node
// K1 rows S-746 and S-747 — the unreachability probe their signed "no successor" rests on.
//
//   S-746  PWA hands-free voice orb — realtime client (rtStart/rtStop/rtPlay)
//   S-747  PWA legacy hands-free voice fallback (vmListen → chat proxy STT)
//
// Both rows are NONE_SIGNED in successor-proposals.json ("proof is an unreachability probe") and
// "RETIRE IN K16 after the probe is recorded" in successor-map.json. SHELL-PLAN v2.1 §3.1 S8 asks the
// probe to show that `vmEnter` has 0 callers. This file is that probe; its recorded output is
// s746-s747-unreachability-probe.json next to it.
//
// What it proves, statically, over the file the two rows name (read from surface-inventory.json, never
// hard-coded), with the TypeScript parser from maya-saas-backend/node_modules (read-only):
//
//   1. `vmEnter` is declared once, as a function nested inside a component function. A nested function
//      declaration is visible only inside its enclosing function, so it can be called only through an
//      identifier inside that scope, or through a direct `eval`/`with` there. The probe counts, over
//      the WHOLE file: identifier references, property names and keys spelled `vmEnter`, string and
//      template mentions, and every textual mention it cannot attribute to a declaration, a reference,
//      a string or a comment (including mentions outside the parsed <script> blocks). All are counted
//      as callers — fail closed. Direct `eval` calls and `with` statements inside the enclosing scope
//      are counted as scope escapes. vmEnter is unreachable iff callers = 0 and scope escapes = 0.
//   2. S-746: `rtStart` is called only from inside `vmEnter`, and `RT_URL` (the realtime WebSocket
//      address) is read only inside `rtStart`.
//   3. S-747: the fallback loop cannot run without `vmRef.current.active === true`: `vmRef` starts
//      with `active: false`; the only write of a value other than `false` to `vmRef.current.active`
//      (directly or through a local alias) is inside `vmEnter`; `vmRef.current` is never replaced or
//      Object.assign'ed; `vmListen` and `vmSend` each open with `if (!<vmRef.current>.active) return;`;
//      the `__vg__` greeting request is made only inside `vmEnter`.
//   4. It also records vmEnter's first statement, the SaaS early return, as found.
//
// What it does NOT prove, and says so in its output: anything about other copies of the legacy PWA
// (listed under `otherCopies`, with their own vmEnter counts, because they are not the rows' file),
// nor anything about production serving (quoted from three-bundle-probe.json, not re-probed).
//
// Every file is opened READ ONLY. No network. No browser.
//
// Run (from anywhere):
//   node docs/rebuild/evidence/maya-chat-first-ux/k1/s746-s747-unreachability-probe.mjs           text
//   node docs/rebuild/evidence/maya-chat-first-ux/k1/s746-s747-unreachability-probe.mjs --json    JSON
//   node docs/rebuild/evidence/maya-chat-first-ux/k1/s746-s747-unreachability-probe.mjs --write   record
//   node docs/rebuild/evidence/maya-chat-first-ux/k1/s746-s747-unreachability-probe.mjs --check   re-run and
//        compare every proof-bearing field with the record (recordedAt/head/toolchain may differ)
//
// Exit: 0 both rows UNREACHABLE (and, with --check, the record still matches); 1 not proven or the
// record drifted; 2 the probe could not run.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../..');
const EVIDENCE = 'docs/rebuild/evidence/maya-chat-first-ux';
const RECORD = `${EVIDENCE}/k1/s746-s747-unreachability-probe.json`;
const ROWS = ['S-746', 'S-747'];

const args = new Set(process.argv.slice(2));
for (const a of args)
  if (!['--json', '--write', '--check'].includes(a)) {
    console.error(`unknown argument ${a} (--json | --write | --check)`);
    process.exit(2);
  }

const fail2 = (msg) => {
  console.error(`s746-s747 probe cannot run: ${msg}`);
  process.exit(2);
};
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

let ts;
try {
  ts = createRequire(path.join(REPO, 'maya-saas-backend', 'package.json'))('typescript');
} catch (e) {
  fail2(`maya-saas-backend/node_modules/typescript is not installed (npm --prefix maya-saas-backend ci): ${e.message}`);
}

const git = (...a) => {
  try {
    return execFileSync('git', ['-C', REPO, ...a], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

// ── 1. the rows, from the ledgers ─────────────────────────────────────────────────────────────────
// surface-inventory.json is ordered: row S-NNN is element NNN-1. The name is cross-checked against
// successor-map.json so an off-by-one can never pick another surface.
const inventory = readJson(`${EVIDENCE}/surface-inventory.json`);
const successorMap = readJson(`${EVIDENCE}/successor-map.json`).rows;
const proposals = readJson(`${EVIDENCE}/successor-proposals.json`);
const proposalRows = Array.isArray(proposals) ? proposals : proposals.rows;
const rows = ROWS.map((id) => {
  const inv = inventory[Number(id.slice(2)) - 1];
  const map = successorMap.find((r) => r.id === id);
  const prop = proposalRows.find((r) => r.id === id);
  if (!inv || !map || !prop) fail2(`${id} missing from a ledger`);
  if (inv.name !== map.surface) fail2(`${id}: surface-inventory name «${inv.name}» != successor-map surface «${map.surface}»`);
  return { id, name: inv.name, file: inv.file, liveStatus: inv.liveStatus ?? null, successorType: prop.successorType, retirementCondition: map.retirementCondition };
});
if (new Set(rows.map((r) => r.file)).size !== 1) fail2(`the rows name different files: ${rows.map((r) => r.file).join(', ')}`);
const TARGET = rows[0].file;
if (!fs.existsSync(path.join(REPO, TARGET))) fail2(`${TARGET} does not exist`);

// ── 2. parsing a legacy bundle ────────────────────────────────────────────────────────────────────

const WORD = (name) => new RegExp(`(?<![A-Za-z0-9_$])${name}(?![A-Za-z0-9_$])`, 'g');
const countWord = (text, name) => (text.match(WORD(name)) ?? []).length;
const JS_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);

function scriptBlocks(html) {
  const blocks = [];
  const skipped = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (let m; (m = re.exec(html)); ) {
    const attrs = m[1];
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? '').toLowerCase();
    const contentStart = m.index + m[0].indexOf('>') + 1;
    const line = html.slice(0, contentStart).split('\n').length;
    if (/\bsrc\s*=/i.test(attrs)) skipped.push({ line, why: 'external src' });
    else if (!JS_TYPES.has(type)) skipped.push({ line, why: `type ${type}` });
    else blocks.push({ line, text: m[2] });
  }
  return { blocks, skipped };
}

const FUNCTION_LIKE = (n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isConstructorDeclaration(n);

function functionName(fn, lineOf) {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  const p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p.name.text;
  if (p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) return p.left.getText();
  return `<anonymous:${lineOf(fn)}>`;
}

const isLiteralToken = (node) => ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node) || ts.isRegularExpressionLiteral(node);
const isJsDoc = (node) => node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;

/** Parse one bundle; return per-symbol facts and the parsed blocks for the structural checks. */
function analyse(rel, symbols) {
  const html = read(rel);
  const { blocks, skipped } = scriptBlocks(html);
  const stats = Object.fromEntries(
    symbols.map((s) => [s, { declarations: [], references: [], propertyMentions: [], stringMentions: [], commentMentions: 0, unattributed: 0, outsideScripts: 0 }]),
  );
  const parsed = [];
  let withDiagnostics = 0;
  const rawInBlocks = Object.fromEntries(symbols.map((s) => [s, 0]));
  for (const [i, b] of blocks.entries()) {
    const present = symbols.filter((s) => countWord(b.text, s) > 0);
    const sf = ts.createSourceFile(`${rel}#script${i}`, b.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const diagnostics = sf.parseDiagnostics?.length ?? 0;
    if (diagnostics) withDiagnostics += 1;
    const lineOf = (node) => b.line + sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    const chain = (node) => {
      const names = [];
      for (let p = node.parent; p; p = p.parent) if (FUNCTION_LIKE(p)) names.unshift(functionName(p, lineOf));
      return names;
    };
    parsed.push({ sf, block: b, lineOf, chain, diagnostics });
    if (!present.length) continue;

    // Identifiers and literal tokens come from the syntax tree; comments from the trivia in front of
    // (and trailing) every token, which is where the scanner put them. JSDoc nodes are skipped: their
    // positions lie inside a comment, which is already counted as one.
    const identifiers = [];
    const literals = [];
    const visit = (node) => {
      if (ts.isIdentifier(node)) identifiers.push(node);
      if (isLiteralToken(node)) literals.push(node);
      ts.forEachChild(node, visit);
    };
    visit(sf);
    const comments = new Map();
    const tokens = (node) => {
      if (isJsDoc(node)) return;
      const children = node.getChildren(sf);
      if (!children.length) {
        for (const r of ts.getLeadingCommentRanges(b.text, node.pos) ?? []) comments.set(`${r.pos}:${r.end}`, b.text.slice(r.pos, r.end));
        for (const r of ts.getTrailingCommentRanges(b.text, node.end) ?? []) comments.set(`${r.pos}:${r.end}`, b.text.slice(r.pos, r.end));
        return;
      }
      for (const c of children) tokens(c);
    };
    tokens(sf);

    for (const s of present) {
      const raw = countWord(b.text, s);
      rawInBlocks[s] += raw;
      let attributed = 0;
      for (const id of identifiers) {
        if (id.text !== s) continue;
        attributed += 1;
        const p = id.parent;
        const where = { line: lineOf(id), in: chain(id) };
        if ((ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p) || ts.isParameter(p)) && p.name === id) stats[s].declarations.push({ ...where, kind: ts.SyntaxKind[p.kind] });
        else if (ts.isPropertyAccessExpression(p) && p.name === id) stats[s].propertyMentions.push({ ...where, kind: 'property-name', text: p.getText(sf).slice(0, 120) });
        else if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) && p.name === id) stats[s].propertyMentions.push({ ...where, kind: 'property-key', text: p.getText(sf).slice(0, 120) });
        else {
          const call = ts.isCallExpression(p) && p.expression === id;
          const kind = call ? 'call' : ts.isShorthandPropertyAssignment(p) ? 'shorthand-value' : 'value';
          stats[s].references.push({ ...where, kind, text: p.getText(sf).slice(0, 120) });
        }
      }
      for (const lit of literals) {
        const n = countWord(lit.getText(sf), s);
        if (!n) continue;
        attributed += n;
        stats[s].stringMentions.push({ line: lineOf(lit), count: n, in: chain(lit), text: lit.getText(sf).slice(0, 120) });
      }
      let inComments = 0;
      for (const c of comments.values()) inComments += countWord(c, s);
      stats[s].commentMentions += inComments;
      attributed += inComments;
      stats[s].unattributed += Math.max(0, raw - attributed);
    }
  }
  for (const s of symbols) stats[s].outsideScripts = countWord(html, s) - rawInBlocks[s];
  return {
    rel,
    sha256: crypto.createHash('sha256').update(html).digest('hex'),
    bytes: Buffer.byteLength(html),
    scripts: { inline: blocks.length, parsedWithDiagnostics: withDiagnostics, skipped },
    stats,
    parsed,
  };
}

const callersOf = (st) =>
  st.references.length + st.propertyMentions.length + st.stringMentions.reduce((a, m) => a + m.count, 0) + st.unattributed + st.outsideScripts;

/** Every node of the parsed blocks that satisfies `pred`, with its line and enclosing function chain. */
function findNodes(a, pred) {
  const out = [];
  for (const p of a.parsed) {
    const visit = (node) => {
      if (pred(node, p)) out.push({ node, line: p.lineOf(node), in: p.chain(node), sf: p.sf, lineOf: p.lineOf });
      ts.forEachChild(node, visit);
    };
    visit(p.sf);
  }
  return out;
}

/** Lexically inside the named function, at any depth (a closure it creates exists only once it has run). */
const within = (chain, name) => chain.includes(name);
const shown = (chain) => (chain.length ? chain.join(' > ') : '<top level>');

/** The nearest `const X = <init>` visible from `node` (walking out through enclosing blocks). */
function aliasInit(node, name, sf) {
  for (let p = node.parent; p; p = p.parent) {
    const statements = p.statements ?? (FUNCTION_LIKE(p) && p.body && ts.isBlock(p.body) ? p.body.statements : null);
    if (!statements) continue;
    for (const st of statements)
      if (ts.isVariableStatement(st))
        for (const d of st.declarationList.declarations)
          if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) return d.initializer.getText(sf);
  }
  return null;
}

const VMREF = 'vmRef.current';
const isVmRefObject = (expr, sf) => {
  const t = expr.getText(sf);
  if (t === VMREF) return true;
  return ts.isIdentifier(expr) && aliasInit(expr, expr.text, sf) === VMREF;
};

/** `if (!<vmRef.current or alias>.active) return;` among the first statements of a function body. */
function opensWithActiveGuard(fnNode, sf) {
  const body = fnNode.body;
  if (!body || !ts.isBlock(body)) return null;
  for (const [i, st] of body.statements.slice(0, 4).entries()) {
    if (ts.isVariableStatement(st)) continue;
    if (!ts.isIfStatement(st)) return null;
    const c = st.expression;
    const then = st.thenStatement;
    const returns = ts.isReturnStatement(then) || (ts.isBlock(then) && then.statements.length === 1 && ts.isReturnStatement(then.statements[0]));
    const guard =
      ts.isPrefixUnaryExpression(c) &&
      c.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isPropertyAccessExpression(c.operand) &&
      c.operand.name.text === 'active' &&
      isVmRefObject(c.operand.expression, sf);
    if (guard && returns) return { statement: i, text: st.getText(sf) };
    if (!returns) return null;
  }
  return null;
}

// ── 3. the rows' file ─────────────────────────────────────────────────────────────────────────────

const SYMBOLS = ['vmEnter', 'rtStart', 'RT_URL', 'vmListen', 'vmSend'];
const a = analyse(TARGET, SYMBOLS);
const st = a.stats;
const fnDecl = (name) => findNodes(a, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name);

// vmEnter: declaration, callers, scope escapes, first statement
const vmEnterDecls = fnDecl('vmEnter');
// The scope a nested declaration is visible in: its nearest enclosing function. A top-level declaration
// in a classic script is a global (reachable by name from anywhere), so no scope is found and the
// verdict fails closed.
const vmEnterScope = (() => {
  if (vmEnterDecls.length !== 1) return null;
  for (let p = vmEnterDecls[0].node.parent; p; p = p.parent) if (FUNCTION_LIKE(p)) return p;
  return null;
})();
const scopeEscapes = vmEnterScope
  ? (() => {
      const { lineOf } = vmEnterDecls[0];
      const hits = [];
      const visit = (node) => {
        if (ts.isWithStatement(node)) hits.push({ kind: 'with', line: lineOf(node) });
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval') hits.push({ kind: 'direct eval', line: lineOf(node) });
        ts.forEachChild(node, visit);
      };
      visit(vmEnterScope);
      return hits;
    })()
  : null;
const firstStatement = vmEnterDecls.length === 1 ? vmEnterDecls[0].node.body.statements[0] : null;
const saasEarlyReturn =
  firstStatement && ts.isIfStatement(firstStatement) && ts.isReturnStatement(firstStatement.thenStatement) && !firstStatement.thenStatement.expression
    ? { condition: firstStatement.expression.getText(vmEnterDecls[0].sf), line: vmEnterDecls[0].lineOf(firstStatement), returns: 'when the condition holds' }
    : null;

// S-746: rtStart only from vmEnter; RT_URL only inside rtStart; the WebSocket opened on RT_URL only there
const rtStartDecls = fnDecl('rtStart');
const rtStartCallersOutsideVmEnter = st.rtStart.references.filter((r) => !within(r.in, 'vmEnter'));
const rtUrlReadsOutsideRtStart = st.RT_URL.references.filter((r) => !within(r.in, 'rtStart'));
const webSocketsOnRtUrl = findNodes(a, (n, p) => ts.isNewExpression(n) && n.expression.getText(p.sf) === 'WebSocket' && (n.arguments ?? []).some((x) => x.getText(p.sf) === 'RT_URL'));

// S-747: the active flag
const vmRefDecls = findNodes(a, (n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'vmRef');
const vmRefInit = vmRefDecls.length === 1 ? vmRefDecls[0].node.initializer : null;
const initialActive = (() => {
  if (!vmRefInit || !ts.isCallExpression(vmRefInit) || vmRefInit.expression.getText(vmRefDecls[0].sf) !== 'React.useRef') return null;
  const obj = vmRefInit.arguments[0];
  if (!obj || !ts.isObjectLiteralExpression(obj)) return null;
  const prop = obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(vmRefDecls[0].sf) === 'active');
  return prop ? prop.initializer.getText(vmRefDecls[0].sf) : null;
})();
const activeWrites = findNodes(
  a,
  (n) => ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && n.left.name.text === 'active',
).map((w) => ({ line: w.line, in: w.in, object: w.node.left.expression.getText(w.sf), vmRef: isVmRefObject(w.node.left.expression, w.sf), value: w.node.right.getText(w.sf) }));
const vmRefActiveNonFalse = activeWrites.filter((w) => w.vmRef && w.value !== 'false');
const vmRefReplacements = findNodes(a, (n, p) => ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && isVmRefObject(n.left, p.sf) && n.left.getText(p.sf) === VMREF);
const vmRefAssigns = findNodes(a, (n, p) => ts.isCallExpression(n) && n.expression.getText(p.sf) === 'Object.assign' && n.arguments[0] && isVmRefObject(n.arguments[0], p.sf));
const guards = Object.fromEntries(
  ['vmListen', 'vmSend'].map((name) => {
    const d = fnDecl(name);
    return [name, d.length === 1 ? opensWithActiveGuard(d[0].node, d[0].sf) : null];
  }),
);
const greeting = findNodes(a, (n) => ts.isStringLiteralLike(n) && n.text === '__vg__').map((g) => ({ line: g.line, in: g.in }));

const vmEnterCallers = callersOf(st.vmEnter);
const vmEnterUnreachable = vmEnterDecls.length === 1 && vmEnterCallers === 0 && Array.isArray(scopeEscapes) && scopeEscapes.length === 0;
const s746 =
  vmEnterUnreachable &&
  rtStartDecls.length === 1 &&
  st.rtStart.references.length > 0 &&
  rtStartCallersOutsideVmEnter.length === 0 &&
  st.rtStart.propertyMentions.length + st.rtStart.stringMentions.length + st.rtStart.unattributed + st.rtStart.outsideScripts === 0 &&
  rtUrlReadsOutsideRtStart.length === 0 &&
  st.RT_URL.propertyMentions.length + st.RT_URL.stringMentions.length + st.RT_URL.unattributed + st.RT_URL.outsideScripts === 0 &&
  webSocketsOnRtUrl.length > 0 &&
  webSocketsOnRtUrl.every((w) => within(w.in, 'rtStart'));
const s747 =
  vmEnterUnreachable &&
  initialActive === 'false' &&
  vmRefActiveNonFalse.length > 0 &&
  vmRefActiveNonFalse.every((w) => within(w.in, 'vmEnter')) &&
  vmRefReplacements.length === 0 &&
  vmRefAssigns.length === 0 &&
  guards.vmListen !== null &&
  guards.vmSend !== null &&
  greeting.length > 0 &&
  greeting.every((g) => within(g.in, 'vmEnter'));

const trim = (s) => ({
  declarations: s.declarations,
  references: s.references,
  propertyMentions: s.propertyMentions,
  stringMentions: s.stringMentions,
  commentMentions: s.commentMentions,
  unattributed: s.unattributed,
  outsideScripts: s.outsideScripts,
});

// ── 4. other copies of the legacy PWA that declare vmEnter (context, not covered by the rows) ─────

const trackedHtml = (() => {
  const out = git('ls-files', '-z', '--', '*.html');
  if (!out) return ['сайт и приложение/app.html', 'сайт и приложение/app-tenant.html', 'maya-os-site/index.html', 'сайт и приложение/index.html'];
  return out.toString('utf8').split('\0').filter(Boolean).map((f) => f.normalize('NFC'));
})();
const otherCopies = trackedHtml
  .filter((f) => f.normalize('NFC') !== TARGET.normalize('NFC') && fs.existsSync(path.join(REPO, f)))
  .filter((f) => /\bfunction vmEnter\b/.test(read(f)))
  .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
  .map((f) => {
    const c = analyse(f, ['vmEnter']);
    const decl = findNodes(c, (n) => ts.isFunctionDeclaration(n) && n.name?.text === 'vmEnter');
    const first = decl.length === 1 ? decl[0].node.body.statements[0] : null;
    return {
      file: f,
      sha256: c.sha256,
      vmEnterDeclarations: c.stats.vmEnter.declarations.length,
      vmEnterCallers: callersOf(c.stats.vmEnter),
      references: c.stats.vmEnter.references,
      saasEarlyReturn: Boolean(first && ts.isIfStatement(first) && /__ME_SAAS_CTX/.test(first.expression.getText(decl[0].sf))),
      coveredByRows: false,
    };
  });

// ── 5. production context, quoted (not re-probed) ─────────────────────────────────────────────────

const productionContext = (() => {
  const rel = `${EVIDENCE}/three-bundle-probe.json`;
  if (!fs.existsSync(path.join(REPO, rel))) return { recordedIn: null };
  const p = readJson(rel);
  const appHtml = (p.canonicalEntries ?? []).find((e) => /\/app\.html$/.test(e.url ?? ''));
  return {
    recordedIn: rel,
    performedAt: p.performedAt ?? null,
    appHtmlCanonicalUrlStatus: appHtml?.status ?? null,
    legacyCopiesServedAfterRemediation: p.postRemediation?.served200 ?? null,
    note: 'quoted from the production probe record; this probe made no request',
  };
})();

// ── 6. the record ─────────────────────────────────────────────────────────────────────────────────

const headBuf = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain', '--', TARGET);
const record = {
  contract: 'maya.k1.s746-s747-unreachability-probe/1',
  recordedAt: new Date().toISOString(),
  head: headBuf ? headBuf.toString('utf8').trim() : null,
  targetCleanAtHead: dirty === null ? null : dirty.toString('utf8').trim() === '',
  toolchain: { node: process.version, typescript: ts.version, parser: 'ts.createSourceFile ScriptKind.JS over each inline classic <script> block' },
  productionEffects: 0,
  rows,
  target: { file: TARGET, sha256: a.sha256, bytes: a.bytes, scripts: a.scripts },
  vmEnter: {
    declarations: vmEnterDecls.map((d) => ({ line: d.line, in: d.in })),
    callers: vmEnterCallers,
    scopeEscapesInEnclosingFunction: scopeEscapes,
    saasEarlyReturn,
    mentions: trim(st.vmEnter),
  },
  s746: {
    rtStart: { declarations: rtStartDecls.map((d) => ({ line: d.line, in: d.in })), callersOutsideVmEnter: rtStartCallersOutsideVmEnter, mentions: trim(st.rtStart) },
    RT_URL: { readsOutsideRtStart: rtUrlReadsOutsideRtStart, mentions: trim(st.RT_URL) },
    webSocketsOpenedOnRtUrl: webSocketsOnRtUrl.map((w) => ({ line: w.line, in: w.in })),
  },
  s747: {
    vmRefInitialActive: initialActive,
    activeWritesOnVmRef: activeWrites.filter((w) => w.vmRef),
    activeWritesOnOtherObjects: activeWrites.filter((w) => !w.vmRef).map((w) => ({ line: w.line, object: w.object, value: w.value, in: shown(w.in) })),
    vmRefReplaced: vmRefReplacements.length,
    vmRefObjectAssigned: vmRefAssigns.length,
    activeGuards: guards,
    greetingRequest: greeting,
    vmListen: { mentions: trim(st.vmListen) },
    vmSend: { mentions: trim(st.vmSend) },
  },
  verdict: {
    vmEnterCallers,
    vmEnterUnreachable,
    'S-746': s746 ? 'UNREACHABLE' : 'NOT PROVEN',
    'S-747': s747 ? 'UNREACHABLE' : 'NOT PROVEN',
  },
  otherCopies,
  productionContext,
  limits: [
    `Static proof over ${TARGET} only. The otherCopies entries are NOT covered by S-746/S-747 and carry their own vmEnter counts.`,
    'Production serving is quoted from three-bundle-probe.json, not re-probed here.',
    'A mention the parser cannot attribute is counted as a caller (fail closed), so a non-zero count is a finding to read, not necessarily a live call.',
  ],
};

const VOLATILE = new Set(['recordedAt', 'head', 'toolchain', 'targetCleanAtHead']);
const stable = (r) => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !VOLATILE.has(k))));

let exit = s746 && s747 ? 0 : 1;
let checkLine = null;
if (args.has('--check')) {
  const abs = path.join(REPO, RECORD);
  if (!fs.existsSync(abs)) {
    checkLine = `check: no record at ${RECORD}`;
    exit = 1;
  } else {
    const prior = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const same = stable(prior) === stable(record);
    checkLine = same ? `check: the record matches (recorded ${prior.recordedAt} at ${prior.head?.slice(0, 8) ?? '?'})` : `check: DRIFT — the re-run differs from ${RECORD}`;
    if (!same) exit = 1;
  }
}
if (args.has('--write')) fs.writeFileSync(path.join(REPO, RECORD), `${JSON.stringify(record, null, 2)}\n`);

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
} else {
  const w = (l, v) => console.log(`  ${l.padEnd(58)} ${v}`);
  console.log('K1 S-746 / S-747 UNREACHABILITY PROBE  (every file read only; no network)');
  console.log('='.repeat(78));
  for (const r of rows) console.log(`  ${r.id}  ${r.successorType}  ${r.name}`);
  console.log(`  file: ${TARGET}  sha256 ${a.sha256.slice(0, 16)}…  ${a.scripts.inline} inline scripts, ${a.scripts.parsedWithDiagnostics} with parse diagnostics`);
  console.log(`  head: ${record.head ?? 'unknown'}  file clean at head: ${record.targetCleanAtHead}`);
  console.log();
  w('vmEnter declarations:', vmEnterDecls.map((d) => `line ${d.line} in ${d.in.join(' > ')}`).join('; ') || 'none');
  w('vmEnter CALLERS (refs + property/string/unattributed/outside):', `${vmEnterCallers}   want 0`);
  w('  identifier references:', st.vmEnter.references.length);
  w('  property names/keys, string mentions:', `${st.vmEnter.propertyMentions.length}, ${st.vmEnter.stringMentions.reduce((x, m) => x + m.count, 0)}`);
  w('  unattributed in scripts, outside scripts, in comments:', `${st.vmEnter.unattributed}, ${st.vmEnter.outsideScripts}, ${st.vmEnter.commentMentions}`);
  w('direct eval / with in the enclosing function:', scopeEscapes ? scopeEscapes.length : 'not evaluated');
  w('vmEnter first statement (SaaS early return):', saasEarlyReturn ? `if (${saasEarlyReturn.condition}) return;` : 'absent');
  console.log();
  w('S-746 rtStart callers outside vmEnter:', `${rtStartCallersOutsideVmEnter.length} (of ${st.rtStart.references.length})`);
  w('S-746 RT_URL reads outside rtStart:', `${rtUrlReadsOutsideRtStart.length} (of ${st.RT_URL.references.length})`);
  w('S-746 new WebSocket(RT_URL) sites:', webSocketsOnRtUrl.map((x) => `line ${x.line} in ${shown(x.in)}`).join('; ') || 'none');
  w('S-747 vmRef initial active:', initialActive);
  w('S-747 non-false writes to vmRef.current.active:', vmRefActiveNonFalse.map((x) => `line ${x.line} in ${shown(x.in)} (= ${x.value})`).join('; ') || 'none');
  w('S-747 vmRef.current replaced / Object.assign:', `${vmRefReplacements.length} / ${vmRefAssigns.length}`);
  w('S-747 vmListen / vmSend open with the active guard:', `${guards.vmListen ? 'yes' : 'NO'} / ${guards.vmSend ? 'yes' : 'NO'}`);
  w('S-747 __vg__ greeting request:', greeting.map((g) => `line ${g.line} in ${shown(g.in)}`).join('; ') || 'none');
  console.log();
  for (const c of otherCopies)
    w(`other copy (NOT covered by the rows): ${c.file}`, `vmEnter callers ${c.vmEnterCallers}${c.references.length ? ` (${c.references.map((r) => `line ${r.line} ${r.kind}: ${r.text}`).join('; ')})` : ''}; SaaS early return ${c.saasEarlyReturn ? 'yes' : 'no'}`);
  w('production (quoted from three-bundle-probe.json):', `app.html canonical URL ${productionContext.appHtmlCanonicalUrlStatus}; legacy copies served after remediation ${productionContext.legacyCopiesServedAfterRemediation}`);
  console.log();
  console.log(`  S-746: ${record.verdict['S-746']}`);
  console.log(`  S-747: ${record.verdict['S-747']}`);
  if (checkLine) console.log(`  ${checkLine}`);
  if (args.has('--write')) console.log(`  recorded: ${RECORD}`);
}
process.exitCode = exit;
