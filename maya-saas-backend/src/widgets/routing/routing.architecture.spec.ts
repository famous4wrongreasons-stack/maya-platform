// U10a exit tests B10-2, B10-3, B10-4 and B10-10 (AREA-B §3.4).
//
// Class BUILD: structure at the source, read with the TypeScript parser rather than with greps, so a
// renamed import or a member access inside a template string cannot slip past. Not live proof (§0.5).
//
// What each one defends:
//   B10-2  R3.12.4's "three front doors, ONE function". A second utterance→capability function is the
//          defect the clause exists to prevent: two routers that disagree turn one tap into two
//          different intents depending on which door it came through.
//   B10-3  "pure, pre-LLM" (C11:4807). A router that could reach Prisma or an `ai-*` module could read
//          state or call a model, and Gate 10's comparison would stop being a function of its inputs.
//   B10-4  ONE owner table (plan D-5). `ownerSet` reads the shared registries and nothing else; a
//          private owner map inside Gate 10 is how two gates quietly stop agreeing about ownership.
//   B10-10 AMB-09 (C11:7195): `handoff_capability_ref` has exactly one reader, `subjectCapability`.
//          Routing and Gate 10 read the subject through it, never the column.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const WIDGETS = path.resolve(__dirname, '..');
const SRC = path.resolve(WIDGETS, '..');
const ROUTING = __dirname;
const ROUTER = path.join(ROUTING, 'deterministic-router.ts');
const OWNER_SET = path.join(ROUTING, 'owner-set.ts');

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

const walk = (node: ts.Node, visit: (n: ts.Node) => void): void => {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
};

/** Every `.ts` file under a directory, excluding `node_modules`. */
const filesUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
};

interface Import {
  readonly from: string;
  readonly names: readonly string[];
  /** `import type …`, or a clause whose every binding is `type`. */
  readonly typeOnly: boolean;
}

const importsOf = (file: string): readonly Import[] => {
  const out: Import[] = [];
  walk(parse(file), (node) => {
    if (!ts.isImportDeclaration(node)) return;
    const from = (node.moduleSpecifier as ts.StringLiteral).text;
    const clause = node.importClause;
    const names: string[] = [];
    let typeOnly = clause?.isTypeOnly === true;
    if (clause?.name) names.push(clause.name.text);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      const elements = clause.namedBindings.elements;
      for (const element of elements)
        if (!element.isTypeOnly) names.push(element.name.text);
      if (elements.length > 0 && elements.every((e) => e.isTypeOnly))
        typeOnly = true;
    }
    out.push({ from, names, typeOnly });
  });
  return out;
};

describe('U10a — routing architecture (B10-2, B10-3, B10-4, B10-10)', () => {
  const SRC_FILES = filesUnder(SRC);

  // ── B10-2 ──────────────────────────────────────────────────────────────────────────────────────

  it('B10-2 exactly one module in `src/**` IMPLEMENTS `routeUtterance`', () => {
    // The generated `widget-contract/intent.ts` DECLARES it (`export declare function`, the contract's
    // own signature at C11:4804) and implements nothing; an implementation is a function with a body
    // or a variable with an initialiser. There must be exactly one of those, and it must be here.
    const implementers = SRC_FILES.filter((file) => {
      let found = false;
      walk(parse(file), (node) => {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name?.text === 'routeUtterance' &&
          node.body !== undefined
        )
          found = true;
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === 'routeUtterance' &&
          node.initializer !== undefined
        )
          found = true;
      });
      return found;
    });
    expect(implementers).toEqual([ROUTER]);
  });

  it('B10-2 the implementation answers the contract’s declared shape (C11:4804-4810)', () => {
    const declared = parse(path.join(SRC, 'widget-contract', 'intent.ts'));
    let signature: ts.FunctionDeclaration | undefined;
    walk(declared, (node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'routeUtterance'
      )
        signature = node;
    });
    expect(signature).toBeDefined();
    expect(signature?.body).toBeUndefined();
    expect(signature?.parameters.map((p) => p.name.getText(declared))).toEqual([
      'utterance',
      'candidates',
    ]);
    const router = fs.readFileSync(ROUTER, 'utf8');
    expect(router).toMatch(/utterance:\s*string/);
    expect(router).toMatch(/candidates:\s*readonly C\[\]/);
    expect(router).toMatch(/\):\s*C \| null =>/);
  });

  it('B10-2 the V1 alias router is gone from `src/**`', () => {
    // `SPEECH_ALIASES` mapped a phrase to a capability KEY and carried `cancel → c9.no_action`, which
    // F60 forbids ("appears in no routing map that reaches a canonical owner", C11:1242).
    // Identifiers, not text: a comment recording that the table was deleted is not the table.
    const dead = new Set(['SPEECH_ALIASES', 'resolveCapability']);
    const offenders: string[] = [];
    for (const file of SRC_FILES)
      walk(parse(file), (node) => {
        if (ts.isIdentifier(node) && dead.has(node.text))
          offenders.push(`${path.relative(SRC, file)}: ${node.text}`);
      });
    expect(offenders).toEqual([]);
  });

  it('B10-2 no other `src/**` function maps an utterance to a capability or a token', () => {
    const SUSPECT_PARAM = /^(utterance|phrase|sentence|spoken|said|text)$/i;
    const SUSPECT_RETURN =
      /CapabilityRef|IntentRecord|RoutingCandidate|intent_?token/i;
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      if (file === ROUTER) continue;
      const source = parse(file);
      walk(source, (node) => {
        if (
          !ts.isFunctionDeclaration(node) &&
          !ts.isMethodDeclaration(node) &&
          !ts.isArrowFunction(node) &&
          !ts.isFunctionExpression(node)
        )
          return;
        // A declaration with no body implements nothing: the generated contract modules declare the
        // shapes this repository must supply, and one of them IS `routeUtterance` (C11:4804).
        if (node.body === undefined) return;
        const takesWords = node.parameters.some(
          (p) =>
            ts.isIdentifier(p.name) &&
            SUSPECT_PARAM.test(p.name.text) &&
            (p.type === undefined || /string/.test(p.type.getText(source))),
        );
        if (!takesWords) return;
        const returns = node.type?.getText(source) ?? '';
        if (SUSPECT_RETURN.test(returns))
          offenders.push(
            `${path.relative(SRC, file)}: → ${returns.replace(/\s+/g, ' ')}`,
          );
      });
    }
    expect(offenders).toEqual([]);
  });

  it('B10-2 `MayaBrainRouterService` returns no `CapabilityRef` and names no intent token', () => {
    const brain = path.join(SRC, 'ai-brain', 'maya-brain-router.service.ts');
    expect(fs.existsSync(brain)).toBe(true);
    const text = fs.readFileSync(brain, 'utf8');
    expect(text).not.toMatch(/CapabilityRef/);
    expect(text).not.toMatch(/intent_token|intentToken/);
    expect(text).not.toMatch(/routeUtterance/);
  });

  // ── B10-3 ──────────────────────────────────────────────────────────────────────────────────────

  it('B10-3 the router imports only the lowering, the owner set and types', () => {
    const allowed: Readonly<Record<string, 'value' | 'type'>> = {
      '../lowering/lowering': 'value',
      './owner-set': 'value',
      '../gate.types': 'type',
    };
    for (const imported of importsOf(ROUTER)) {
      expect(Object.keys(allowed)).toContain(imported.from);
      if (allowed[imported.from] === 'type')
        expect(imported.typeOnly).toBe(true);
    }
    expect(
      importsOf(ROUTER)
        .map((i) => i.from)
        .sort(),
    ).toEqual(Object.keys(allowed).sort());
  });

  it('B10-3 neither routing module reaches Prisma, an `ai-*` module, a network client or Nest DI', () => {
    const FORBIDDEN =
      /(^|\/)(prisma|@prisma|ai-brain|ai-tools|ai-core|action-engine|axios|node-fetch|undici|@nestjs)/;
    for (const file of [ROUTER, OWNER_SET])
      for (const imported of importsOf(file))
        expect(imported.from).not.toMatch(FORBIDDEN);
    for (const file of [ROUTER, OWNER_SET]) {
      const text = fs.readFileSync(file, 'utf8');
      // No DI, no decorators, no clock, no randomness: `routeUtterance` and `ownerSet` are functions
      // of their arguments and the frozen registries, and nothing else.
      expect(text).not.toMatch(/@Injectable|@Inject\(/);
      expect(text).not.toMatch(/\brequire\s*\(/);
      expect(text).not.toMatch(/Date\.now\(|Math\.random\(/);
    }
  });

  // ── B10-4 ──────────────────────────────────────────────────────────────────────────────────────

  it('B10-4 `ownerSet` reads exactly c9Registry, KIND_OWNER_CLASS, ownerClassKeys, AE_PROPOSE_PAIRING and CONTROL_REGISTRY', () => {
    const valueImports = new Map<string, readonly string[]>();
    for (const imported of importsOf(OWNER_SET))
      if (!imported.typeOnly && imported.names.length)
        valueImports.set(imported.from, imported.names);
    expect(Object.fromEntries(valueImports)).toEqual({
      '../../widget-contract/owner-classes': [
        'KIND_OWNER_CLASS',
        'isOwnerClassKey',
        'ownerClassKeys',
      ],
      '../../widget-contract/tables': ['CONTROL_REGISTRY'],
      '../authority/contract-bindings': ['c9Registry'],
      '../authority/propose-pairing': ['AE_PROPOSE_PAIRING'],
    });
  });

  it('B10-4 the owner tables are read, never redeclared inside the widget routing layer', () => {
    const text = fs.readFileSync(OWNER_SET, 'utf8');
    // No literal owner map and no literal key list: every owner name comes from the shared tables.
    expect(text).not.toMatch(/BOOKING_OWNER'\s*[,:]/);
    expect(text).not.toMatch(/'catalog\.services\.read'/);
    expect(text).not.toMatch(/POST \/api\/orchestration/);
    // …and Gate 10 owns no pairing rows of its own (D-6: P-25 owns them).
    expect(text).not.toMatch(/crm\.appointment\./);
  });

  // ── B10-10 ─────────────────────────────────────────────────────────────────────────────────────

  it('B10-10 no `handoff*` member is read under `routing/` or in `gates/gate10.ts` (AMB-09)', () => {
    const files = [
      ...filesUnder(ROUTING).filter((f) => !f.endsWith('.spec.ts')),
      path.join(WIDGETS, 'gates', 'gate10.ts'),
    ].filter((f) => fs.existsSync(f));
    expect(files).toContain(ROUTER);
    expect(files).toContain(OWNER_SET);
    const offenders: string[] = [];
    const isHandoff = (name: string): boolean => /^handoff/i.test(name);
    for (const file of files) {
      const source = parse(file);
      walk(source, (node) => {
        if (ts.isPropertyAccessExpression(node) && isHandoff(node.name.text))
          offenders.push(`${path.relative(SRC, file)}: .${node.name.text}`);
        if (
          ts.isElementAccessExpression(node) &&
          ts.isStringLiteral(node.argumentExpression) &&
          isHandoff(node.argumentExpression.text)
        )
          offenders.push(
            `${path.relative(SRC, file)}: ['${node.argumentExpression.text}']`,
          );
        if (
          ts.isBindingElement(node) &&
          ts.isIdentifier(node.name) &&
          isHandoff(node.name.text)
        )
          offenders.push(`${path.relative(SRC, file)}: { ${node.name.text} }`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
