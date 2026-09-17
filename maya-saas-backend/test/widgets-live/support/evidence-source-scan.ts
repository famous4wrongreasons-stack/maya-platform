// The D-17 (3) BUILD scan (GATES-PLAN-V11; CKPT-W0 review finding 2): no `*.live-spec.ts` or `*.cases.ts` may, in a
// test labelled `[E-MINT]`, `[E-HOSTILE]`, `[E-DRIFT]`, `[E-TAMPER:…]` or `[E-INDEP]`, name the mint provenance
// context or call `Fixtures.widget`, `Fixtures.synthetic`, `WidgetEmitterService.emit` or the record writer. A record
// such a test used would be the harness's, not a production trigger's, however its manifest line reads.
//
// Syntactic and fail closed, over the TypeScript AST:
//   - a jest test is a call of `it`/`test`/`fit`/`xit`/`xtest` (also `.only`, `.failing`, `.concurrent`, `.each(…)(…)`);
//     it is labelled when its title (a string, a template's literal parts, or `+`-joined literals) carries an evidence
//     label in any case; a `describe` whose title carries one labels every test inside it;
//   - a BIN case is an object literal with a `run` member; it is labelled when a string inside it carries a label;
//   - the scope scanned is the labelled callback AND every function of the same file it reaches by name, transitively
//     (a helper cannot launder the call);
//   - forbidden in that scope: the identifiers `WidgetMintProvenance`, `WIDGET_MINT_PROVENANCE_CONTEXT`,
//     `MintProvenanceSink`, `WidgetEmitterService`, `WidgetRecordWriter`, `writeRecord`, `recordWriter`; any string
//     containing `WidgetMintProvenance`; a call of a member named `widget`, `synthetic` or `emit`; a write on a
//     `widget*` model delegate; and constructing or replacing a logger (`new Logger`, `new ConsoleLogger`,
//     `Logger.overrideLogger`, `useLogger`), because a provenance context name can be assembled at run time.
// The verifier (`scripts/widgets-evidence-verify.mjs`) applies a stricter file-level scan to every claim's source; this
// scan is the per-test rule D-17 (3) states, run over the repository on every live run (HAR-12).

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

export interface EvidenceSourceFinding {
  readonly file: string;
  readonly test: string;
  readonly what: string;
}

const EVIDENCE_LABEL =
  /\[\s*(?:E-MINT|E-HOSTILE|E-DRIFT|E-INDEP[^\]]*|E-TAMPER\s*:[^\]]*)\]/i;
const TEST_CALLEES = new Set(['it', 'test', 'fit', 'xit', 'xtest']);
const FORBIDDEN_IDENTIFIERS = new Set([
  'WidgetMintProvenance',
  'WIDGET_MINT_PROVENANCE_CONTEXT',
  'MintProvenanceSink',
  'WidgetEmitterService',
  'WidgetRecordWriter',
  'writeRecord',
  'recordWriter',
]);
const FORBIDDEN_MEMBER_CALLS = new Set(['widget', 'synthetic', 'emit']);
const MODEL_WRITES = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

/** The base identifier of a callee: `it`, `it.only`, `it.each(t)` → `it`. */
const calleeBase = (expression: ts.Expression): string | null => {
  let e: ts.Expression = expression;
  for (;;) {
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) e = e.expression;
    else if (ts.isCallExpression(e)) e = e.expression;
    else return null;
  }
};

/** The literal text of a title expression, as far as it is literal. */
const titleText = (node: ts.Expression | undefined): string => {
  if (!node) return '';
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return [
      node.head.text,
      ...node.templateSpans.map((s) => s.literal.text),
    ].join(' ');
  if (ts.isBinaryExpression(node))
    return `${titleText(node.left)} ${titleText(node.right)}`;
  if (ts.isParenthesizedExpression(node)) return titleText(node.expression);
  return '';
};

/** Same-file functions by name: declarations and `const f = (…) => …` / `function` expressions. */
const localFunctions = (source: ts.SourceFile): Map<string, ts.Node> => {
  const found = new Map<string, ts.Node>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name)
      found.set(node.name.text, node);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    )
      found.set(node.name.text, node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

/** Every forbidden construct reachable from `root` (the labelled callback), following same-file functions by name. */
const forbiddenIn = (
  root: ts.Node,
  functions: Map<string, ts.Node>,
): string[] => {
  const found = new Set<string>();
  const seen = new Set<ts.Node>();
  const queue: ts.Node[] = [root];
  while (queue.length > 0) {
    const scope = queue.shift() as ts.Node;
    if (seen.has(scope)) continue;
    seen.add(scope);
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        if (FORBIDDEN_IDENTIFIERS.has(node.text))
          found.add(`names ${node.text}`);
        const target = functions.get(node.text);
        if (target && !seen.has(target)) queue.push(target);
      }
      if (
        ts.isStringLiteralLike(node) &&
        /WidgetMintProvenance/i.test(node.text)
      )
        found.add('names the WidgetMintProvenance context in a string');
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isPropertyAccessExpression(callee)) {
          const member = callee.name.text;
          if (FORBIDDEN_MEMBER_CALLS.has(member))
            found.add(`calls .${member}(…)`);
          if (
            MODEL_WRITES.has(member) &&
            ts.isPropertyAccessExpression(callee.expression) &&
            /^widget[A-Z]/.test(callee.expression.name.text)
          )
            found.add(`writes ${callee.expression.name.text}.${member}`);
          if (member === 'overrideLogger' || member === 'useLogger')
            found.add(`replaces the logger (.${member})`);
        } else if (ts.isIdentifier(callee) && callee.text === 'useLogger')
          found.add('replaces the logger (useLogger)');
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        /^(?:Console)?Logger$/.test(node.expression.text)
      )
        found.add(`constructs a ${node.expression.text}`);
      ts.forEachChild(node, visit);
    };
    visit(scope);
  }
  return [...found].sort();
};

/** Findings of one file's text; `file` is only a label. `*.cases.ts` files are read as BIN cases. */
export function scanEvidenceSource(
  file: string,
  text: string,
): EvidenceSourceFinding[] {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const functions = localFunctions(source);
  const findings: EvidenceSourceFinding[] = [];
  const report = (test: string, scope: ts.Node): void => {
    for (const what of forbiddenIn(scope, functions))
      findings.push({ file, test, what });
  };

  const visit = (node: ts.Node, labelledBy: string | null): void => {
    if (ts.isCallExpression(node)) {
      const base = calleeBase(node.expression);
      const title = titleText(node.arguments[0]);
      const callback = node.arguments.find(
        (a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a),
      );
      if (base === 'describe' && callback) {
        const label = EVIDENCE_LABEL.test(title) ? title : labelledBy;
        ts.forEachChild(callback, (child) => visit(child, label));
        return;
      }
      if (base !== null && TEST_CALLEES.has(base) && callback) {
        const label = EVIDENCE_LABEL.test(title) ? title : labelledBy;
        if (label !== null) report(title || label, callback);
        return;
      }
    }
    if (
      file.endsWith('.cases.ts') &&
      ts.isObjectLiteralExpression(node) &&
      node.properties.some(
        (p) =>
          (ts.isMethodDeclaration(p) || ts.isPropertyAssignment(p)) &&
          p.name !== undefined &&
          ts.isIdentifier(p.name) &&
          p.name.text === 'run',
      )
    ) {
      let labelled = false;
      const find = (n: ts.Node): void => {
        if (ts.isStringLiteralLike(n) && EVIDENCE_LABEL.test(n.text))
          labelled = true;
        ts.forEachChild(n, find);
      };
      find(node);
      if (labelled || labelledBy !== null) {
        const id = node.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) &&
            ts.isIdentifier(p.name) &&
            p.name.text === 'id',
        );
        report(
          id ? titleText(id.initializer) || 'a BIN case' : 'a BIN case',
          node,
        );
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, labelledBy));
  };
  visit(source, null);
  return findings;
}

/** The files D-17 (3) covers, relative to maya-saas-backend: every live spec and every cases file. */
export function evidenceSourceFiles(backendRoot: string): string[] {
  const out: string[] = [];
  const walk = (relative: string, keep: (name: string) => boolean): void => {
    const absolute = path.join(backendRoot, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const next = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(next, keep);
      else if (entry.isFile() && keep(entry.name)) out.push(next);
    }
  };
  walk(
    'test/widgets-live',
    (name) => name.endsWith('.live-spec.ts') || name.endsWith('.cases.ts'),
  );
  walk('scripts/widgets-http-proof', (name) => name.endsWith('.cases.ts'));
  return out.sort();
}
