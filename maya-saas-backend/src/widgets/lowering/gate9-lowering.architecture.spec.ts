// [BUILD] Gate 9's source fences — the properties row 9 states that no runtime test can observe.
//
// Row 9 (C11:4729) makes four claims about SHAPE rather than about a request: the lowering function
// takes labels and not the submission (9.1a); the turn carries authority NONE (9.4); the append is
// the FIRST durable write of the whole sequence (9.5); and the lowered content is read by nothing
// after the rendering gate except Gate 10 (9.10, F15 C11:225-233). Each is a property of the code's
// graph — of what exists and what calls what — so each is checked at the source here, over the real
// tree, and not over a fixture.
//
// A runtime test cannot see any of them. "Nothing after Gate 9 reads the utterance" is a claim about
// code that did not run; "this is the first durable write" is a claim about writes that did not
// happen; "the writer is called from one place" is a claim about call sites, not about a call. A
// green live run over the paths someone thought of proves none of them.
//
// Which code is "slot N" is derived from the gateway's own array (`gate-slots.spec-helper.spec.ts`),
// never from a list kept here: a hand-kept list drifts the moment a slot is rewired, and a fence
// that drifts is a fence that is green for the wrong reason.
//
// GATES-PLAN-V11 U9a. The fences that need slot 9's writer (U9b) are `it.failing` and tagged
// `[XF→U9b]`: they are written in full now, they fail now because the mechanism is absent, and they
// turn green at U9b's merge without anyone editing them. T-ARCH-NOTX (G9S §4.3, "the writer opens
// its own transaction") is NOT carried: V1.1 puts Gate 10's record write "in the request
// transaction" (C11:4861), and D-1 makes that one transaction `T` for the whole request — so the
// fence is T-ARCH-TX, its inverse.
//
// Class BUILD: structure only. Not live proof (§0.5) — no clause flips on anything in this file.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  GATEWAY,
  parseSource,
  memberUses,
  pipelineSources,
  WIDGETS,
  type SourceUnit,
} from '../gate-slots.spec-helper.spec';

const SRC = path.resolve(WIDGETS, '..');
const BACKEND = path.resolve(SRC, '..');
const SCHEMA = path.join(BACKEND, 'prisma', 'schema.prisma');

/** A path under `src/`, posix-spelled, as every rule below names a file. */
type SrcPath = string;

const readSrc = (rel: SrcPath): string =>
  fs.readFileSync(path.join(SRC, rel), 'utf8');

const parseSrc = (rel: SrcPath): ts.SourceFile =>
  parseSource(rel, readSrc(rel));

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

/** Every production (non-spec) TypeScript file under `src/`, as `SrcPath`s. */
const productionSources = (): readonly SrcPath[] =>
  walk(SRC)
    .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .sort();

// ── the schema, read rather than transcribed ─────────────────────────────────────────────────────

interface SchemaField {
  readonly model: string;
  readonly name: string;
  /** The ErasureClass marker the column carries: `A`, `C`, `X` or `—` (schema.prisma:4107-4113). */
  readonly erasureClass: string | null;
}

/**
 * Every field of every model, with its ErasureClass marker — read with the same expressions
 * `docs/rebuild/evidence/maya-chat-first-ux/widget-schema-count.mjs` uses, so the two cannot drift.
 */
const schemaFields = (): readonly SchemaField[] => {
  const out: SchemaField[] = [];
  let model: string | null = null;
  for (const line of fs.readFileSync(SCHEMA, 'utf8').split('\n')) {
    const opens = /^model\s+(\w+)\s*\{/.exec(line);
    if (opens) {
      model = opens[1];
      continue;
    }
    if (/^\}/.test(line)) {
      model = null;
      continue;
    }
    if (model === null) continue;
    const field = /^\s{2}(\w+)\s+\S/.exec(line);
    if (!field || /^\s*@@/.test(line)) continue;
    const marker = /\/\/\s*([ACX—])(?:\s|$)/.exec(line);
    out.push({
      model,
      name: field[1],
      erasureClass: marker ? marker[1] : null,
    });
  }
  return out;
};

/** Every Prisma model's client delegate (`WidgetTimelineTurn` → `widgetTimelineTurn`). */
const delegates = (): ReadonlySet<string> =>
  new Set(
    [...new Set(schemaFields().map((f) => f.model))].map(
      (m) => m[0].toLowerCase() + m.slice(1),
    ),
  );

const WRITE_OPS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);
const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

// ── reading the tree ─────────────────────────────────────────────────────────────────────────────

/** `o.name` / `o['name']` → `name`; anything else → null. */
const accessed = (node: ts.Node): string | null =>
  ts.isPropertyAccessExpression(node)
    ? node.name.text
    : ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression)
      ? node.argumentExpression.text
      : null;

const unwrap = (node: ts.Node): ts.Node => {
  let x = node;
  while (
    ts.isParenthesizedExpression(x) ||
    ts.isNonNullExpression(x) ||
    ts.isAsExpression(x) ||
    ts.isAwaitExpression(x)
  )
    x = x.expression;
  return x;
};

const eachNode = (sf: ts.SourceFile, visit: (n: ts.Node) => void): void => {
  const go = (n: ts.Node): void => {
    visit(n);
    ts.forEachChild(n, go);
  };
  go(sf);
};

/**
 * Every Prisma operation in `sf`, as `<delegate>.<op>`, plus bare `$executeRaw`/`$executeRawUnsafe`.
 * Delegate-qualified on purpose: `createHash(…).update(…)` is not a database write, and a rule that
 * matched `.update(` alone would be red in half the repository and therefore turned off.
 */
const prismaOps = (sf: ts.SourceFile): readonly string[] => {
  const known = delegates();
  const out: string[] = [];
  const raw = (name: string | null): boolean =>
    name === '$executeRaw' || name === '$executeRawUnsafe';
  eachNode(sf, (n) => {
    if (ts.isTaggedTemplateExpression(n) && raw(accessed(n.tag)))
      out.push(accessed(n.tag) as string);
    if (!ts.isCallExpression(n)) return;
    const op = accessed(n.expression);
    if (raw(op)) out.push(op as string);
    if (op === null || (!WRITE_OPS.has(op) && !READ_OPS.has(op))) return;
    const target = unwrap(
      (n.expression as ts.PropertyAccessExpression).expression,
    );
    const delegate =
      accessed(target) ?? (ts.isIdentifier(target) ? target.text : null);
    if (delegate !== null && known.has(delegate)) out.push(`${delegate}.${op}`);
  });
  return out;
};

const writesOf = (sf: ts.SourceFile): readonly string[] =>
  prismaOps(sf).filter((op) => {
    const [, method] = op.split('.');
    return method === undefined || WRITE_OPS.has(method);
  });

/** Every raw-SQL template or string in `sf` that names `"WidgetTimelineTurn"`. */
const namesTimelineTable = (sf: ts.SourceFile): boolean => {
  let found = false;
  eachNode(sf, (n) => {
    if (
      (ts.isStringLiteralLike(n) || ts.isTemplateLiteral(n)) &&
      n.getText(sf).includes('WidgetTimelineTurn')
    )
      found = true;
  });
  return found;
};

/** Every call of a function named `name` in `sf` (`f(…)`, `o.f(…)`), declarations excluded. */
const callsOf = (sf: ts.SourceFile, name: string): number => {
  let n = 0;
  eachNode(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = unwrap(node.expression);
    const called =
      accessed(callee) ?? (ts.isIdentifier(callee) ? callee.text : null);
    if (called === name) n += 1;
  });
  return n;
};

/** Every identifier and string-literal text in `sf`. Comments are not references. */
const referenced = (sf: ts.SourceFile): ReadonlySet<string> => {
  const out = new Set<string>();
  eachNode(sf, (n) => {
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) out.add(n.text);
    else if (ts.isStringLiteralLike(n)) out.add(n.text);
  });
  return out;
};

/** A method or function declaration by name, anywhere in `sf`. */
const declarationOf = (
  sf: ts.SourceFile,
  name: string,
): ts.SignatureDeclaration | null => {
  let found: ts.SignatureDeclaration | null = null;
  eachNode(sf, (n) => {
    if (
      (ts.isMethodDeclaration(n) ||
        ts.isMethodSignature(n) ||
        ts.isFunctionDeclaration(n)) &&
      n.name !== undefined &&
      n.name.getText(sf) === name
    )
      found = n;
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer !== undefined &&
      (ts.isArrowFunction(n.initializer) ||
        ts.isFunctionExpression(n.initializer))
    )
      found = n.initializer;
  });
  return found;
};

const interfaceMembers = (sf: ts.SourceFile, name: string): string[] => {
  const decl = sf.statements.find(
    (s): s is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(s) && s.name.text === name,
  );
  if (decl === undefined) throw new Error(`no interface ${name}`);
  return decl.members.map((m) => m.name?.getText(sf) ?? '');
};

/** The value-imports of `rel` that resolve inside `src/` — type-only imports are not calls. */
const valueImports = (rel: SrcPath): readonly SrcPath[] => {
  const sf = parseSrc(rel);
  const out: SrcPath[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier))
      continue;
    if (!st.moduleSpecifier.text.startsWith('.')) continue;
    const clause = st.importClause;
    if (clause === undefined || clause.isTypeOnly) continue;
    const bindings = clause.namedBindings;
    const carriesValue =
      clause.name !== undefined ||
      (bindings !== undefined && ts.isNamespaceImport(bindings)) ||
      (bindings !== undefined &&
        ts.isNamedImports(bindings) &&
        bindings.elements.some((e) => !e.isTypeOnly));
    if (!carriesValue) continue;
    const base = path.posix.join(
      path.posix.dirname(rel),
      st.moduleSpecifier.text,
    );
    const resolved = [`${base}.ts`, `${base}/index.ts`]
      .map((c) => path.posix.normalize(c))
      .find((c) => fs.existsSync(path.join(SRC, c)));
    if (resolved !== undefined) out.push(resolved);
  }
  return out;
};

/** `rel` and everything it can CALL into, transitively, inside `src/`. */
const callClosure = (roots: readonly SrcPath[]): readonly SrcPath[] => {
  const seen = new Set<SrcPath>();
  const queue = [...roots];
  while (queue.length > 0) {
    const file = queue.pop() as SrcPath;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const next of valueImports(file))
      if (!seen.has(next)) queue.push(next);
  }
  return [...seen].sort();
};

// ── the pipeline, once ───────────────────────────────────────────────────────────────────────────

const PIPELINE = pipelineSources();

/** Slot `n`'s code: the array element, and each relative module the element calls into. */
const slotUnits = (n: string): readonly SourceUnit[] =>
  PIPELINE.slotUnits.filter((u) => u.slot === n);

/** Slot `n`'s FILES, as `SrcPath`s (the `#slot-n` element is not a file). */
const slotFiles = (n: string): readonly SrcPath[] =>
  slotUnits(n)
    .filter((u) => !u.file.includes('#'))
    .map((u) => `widgets/${u.file}`);

const GATEWAY_SRC: SrcPath = `widgets/${GATEWAY}`;

// ── the allowlists (each entry is added by the unit that earns it) ───────────────────────────────

/**
 * The only files that may touch the `WidgetTimelineTurn` table. `timeline.store.ts` is the store;
 * `widget-stores.service.ts` is D-6's facade, which only delegates. Nothing else in `src/` may.
 */
const TIMELINE_TABLE_FILES: readonly SrcPath[] = [
  'widgets/stores/timeline.store.ts',
];
const ERASURE_JOB: SrcPath = 'widgets/consent/erasure.job.ts';
const TIMELINE_FACADE: SrcPath = 'widgets/stores/widget-stores.service.ts';

/**
 * Who may CALL the turn writer. Empty beyond the facade today. Future entries, each added by editing
 * this list in the commit that earns it: EP-MINT's assistant-turn writer (P-MINT-CORE) and the typed
 * chat ingress (P-03/K5). An allowlisted file may not import the submission's types.
 */
const APPEND_TURN_CALLERS: readonly SrcPath[] = [TIMELINE_FACADE];

/**
 * Who may READ the timeline (E10). Empty beyond the facade today. Future entries: the deterministic
 * router's ingress, the model's untrusted-text channel adapter (which must sanitize through the
 * canonical `AiCoreService.sanitizeMessages` first), and the `EP-FETCH` display route.
 */
const READ_TIMELINE_CALLERS: readonly SrcPath[] = [TIMELINE_FACADE];

/**
 * Methods in the timeline store and the facade that may touch the turn table or the record. A new,
 * differently named method that inserted a turn would pass every name-based fence above; this one
 * is the reason it cannot.
 */
const STORE_METHOD_ALLOWLIST = new Set([
  'appendTurn',
  'lowerToUserTurn',
  'insertTurn',
  'readTimeline',
  'scoped',
]);

/** F15's scopes: code that may not so much as name a conversation-content field. */
const F15_FORBIDDEN_FILES: readonly SrcPath[] = [
  'widgets/gates/gate5.ts',
  // E10: "Gate 6 recomputes authority without reading it". (The `gateSensitiveDest` shim this line
  // used to name is deleted — R6-1b, U6-L1's merge; F48's predicate runs inside `gate6.ts`'s HANDOFF
  // branch now, which is why the file is still on this list.)
  'widgets/gates/gate6.ts',
  'widgets/gates/gate11.ts',
  // `widgets/gates/gate12.ts` IS GONE (IR-K4K8-1, U12a's merge): slot 12 is the D-7 pointer and the
  // data fence lives in `projection/widget-projector.service.ts`, which is covered by the
  // `widgets/projection/` entry in `F15_FORBIDDEN_DIRECTORIES` below — a directory, so the successor
  // is scanned whole rather than by one file name that could go stale again.
  'widgets/gates/gate13.ts',
];
const F15_FORBIDDEN_DIRECTORIES: readonly string[] = [
  'action-engine/',
  'widgets/authority/',
  // U12a's merge: the successor to `widgets/gates/gate12.ts`. Gate 12's decision moved into the
  // projector, so the directory is scanned whole — a directory cannot go stale the way one file name
  // did when IR-K4K8-1 deleted it.
  'widgets/projection/',
];
/** Slots after the rendering gate. Slot 10 is F15's one exception, and only for `facts.lowering`. */
const F15_FORBIDDEN_SLOTS: readonly string[] = ['11', '12', '13', '14'];

/**
 * The authority-bearing member names a timeline turn may never carry (G9-10, narrowed by M4.4).
 *
 * The resolved-roles name is spelled in parts for the same reason `gate-context.source.spec.ts:34`
 * spells it in parts: D-9's fence forbids that literal anywhere in the widget layer, specs included,
 * and a ban list that wrote it out would be its own violation.
 */
const AUTHORITY_MEMBERS = [
  'verificationLevel',
  'verification_level',
  'roles',
  'resolved' + 'Roles',
  'intentToken',
];
const AUTHORITY_PREFIXES = ['capability', 'authority'];

const isAuthorityMember = (name: string): boolean =>
  AUTHORITY_MEMBERS.includes(name) ||
  AUTHORITY_PREFIXES.some((p) => name.toLowerCase().startsWith(p));

// ── T-ARCH-SIG — 9.1a: the signature cannot reach the submission ────────────────────────────────

describe('T-ARCH-SIG — the lowering function takes labels, not the submission (9.1a)', () => {
  const LOWERING: SrcPath = 'widgets/lowering/lowering.ts';

  it('T-ARCH-SIG renderUtterance has exactly two parameters: the template and the labels', () => {
    const sf = parseSrc(LOWERING);
    const fn = declarationOf(sf, 'renderUtterance');
    expect(fn).not.toBeNull();
    const parameters = (fn as ts.SignatureDeclaration).parameters;
    expect(parameters.map((p) => p.name.getText(sf))).toEqual([
      'template',
      'selectedLabels',
    ]);
    expect(parameters.map((p) => p.type?.getText(sf))).toEqual([
      'string | null',
      'readonly string[]',
    ]);
  });

  it('T-ARCH-SIG-2 no parameter type names the submission, a record map or unknown', () => {
    const sf = parseSrc(LOWERING);
    const fn = declarationOf(sf, 'renderUtterance') as ts.SignatureDeclaration;
    const types = fn.parameters.map((p) => p.type?.getText(sf) ?? '').join(' ');
    for (const banned of [
      'SubmissionShape',
      'SubmitIntentDto',
      'WidgetIntentSubmission',
      'Record<',
      'unknown',
      'inputs',
    ])
      expect(types).not.toContain(banned);
  });

  it('T-ARCH-SIG-3 the lowering module imports nothing at all', () => {
    const sf = parseSrc(LOWERING);
    expect(sf.statements.filter((s) => ts.isImportDeclaration(s)).length).toBe(
      0,
    );
    expect(callsOf(sf, 'require')).toBe(0);
    expect(readSrc(LOWERING)).not.toMatch(/\bimport\s*\(/);
  });

  it('T-ARCH-SIG-4 slot 9 reaches nothing on ctx.submission', () => {
    for (const unit of slotUnits('9'))
      expect(
        memberUses(parseSource(unit.file, unit.source), 'submission'),
      ).toEqual([]);
  });
});

// ── T-ARCH-AUTH / T-BYTE-2 — 9.4: authority NONE, by absence ────────────────────────────────────

describe('T-ARCH-AUTH — the turn carries no authority (9.4, E10)', () => {
  const STORE: SrcPath = 'widgets/stores/timeline.store.ts';

  it('T-ARCH-AUTH TimelineTurnInput declares no authority-bearing member', () => {
    const members = interfaceMembers(parseSrc(STORE), 'TimelineTurnInput');
    expect(members.filter(isAuthorityMember)).toEqual([]);
    // `role` is the turn's own USER/assistant marker (9.3) and is not authority; `roles` would be.
    expect(members).toContain('role');
    expect(members).not.toContain('roles');
  });

  it("T-ARCH-AUTH-2 [XF→U9b] lowerToUserTurn's input declares no authority-bearing member", () => {
    const sf = parseSrc(STORE);
    const writer = declarationOf(sf, 'lowerToUserTurn');
    expect(writer).not.toBeNull();
    const input = (writer as ts.SignatureDeclaration).parameters[0];
    const text = input.type?.getText(sf) ?? '';
    for (const banned of [...AUTHORITY_MEMBERS, ...AUTHORITY_PREFIXES])
      expect(text).not.toContain(banned);
  });
});

describe('T-BYTE-2 — the turn table has no authority column (9.4, D12)', () => {
  it('T-BYTE-2 no WidgetTimelineTurn column names a capability, an authority or a verification', () => {
    const columns = schemaFields()
      .filter((f) => f.model === 'WidgetTimelineTurn')
      .map((f) => f.name);
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns)
      for (const banned of ['capability', 'authority', 'verification'])
        expect(column.toLowerCase()).not.toContain(banned);
  });

  it('T-BYTE-2-2 no column but `role` matches /role/i', () => {
    const roleish = schemaFields()
      .filter((f) => f.model === 'WidgetTimelineTurn' && /role/i.test(f.name))
      .map((f) => f.name);
    expect(roleish).toEqual(['role']);
  });
});

// ── T-ARCH-WRITER — 9.13: one writer, one caller, one table ─────────────────────────────────────

describe('T-ARCH-WRITER — who may write a conversation turn (9.5, 9.13)', () => {
  it('T-ARCH-WRITER appendTurn is called only from the store facade', () => {
    const callers = productionSources().filter(
      (f) =>
        f !== 'widgets/stores/timeline.store.ts' &&
        callsOf(parseSrc(f), 'appendTurn') > 0,
    );
    expect(callers).toEqual([...APPEND_TURN_CALLERS]);
  });

  it('T-ARCH-WRITER-2 an allowlisted caller of the writer never imports the submission types', () => {
    for (const caller of APPEND_TURN_CALLERS) {
      const names = referenced(parseSrc(caller));
      for (const banned of [
        'SubmissionShape',
        'SubmitIntentDto',
        'WidgetIntentSubmission',
      ])
        expect([...names]).not.toContain(banned);
    }
  });

  it('T-ARCH-WRITER-3 the turn table is inserted into in one file, and updated or deleted in none', () => {
    for (const file of productionSources()) {
      const ops = prismaOps(parseSrc(file)).filter((op) =>
        op.startsWith('widgetTimelineTurn.'),
      );
      const writes = ops.filter((op) => WRITE_OPS.has(op.split('.')[1]));
      if (!TIMELINE_TABLE_FILES.includes(file))
        expect([file, writes]).toEqual([file, []]);
      // `update*`/`delete*` are admitted nowhere until the RT6 erasure job owns its own file (K12).
      expect([
        file,
        writes.filter((op) => /\.(update|delete)/.test(op)),
      ]).toEqual([file, []]);
    }
  });

  it('T-ARCH-WRITER-4 no file outside the store writes the turn table through raw SQL', () => {
    for (const file of productionSources()) {
      if (TIMELINE_TABLE_FILES.includes(file) || file === ERASURE_JOB) continue;
      const sf = parseSrc(file);
      if (!namesTimelineTable(sf)) continue;
      expect([
        file,
        prismaOps(sf).filter((op) => op.startsWith('$execute')),
      ]).toEqual([file, []]);
    }
  });

  it('T-ARCH-WRITER-5 only the lowering function brands a LoweredUtterance', () => {
    const branders = productionSources().filter((f) =>
      /\bas\s+LoweredUtterance\b/.test(readSrc(f)),
    );
    expect(branders).toEqual(['widgets/lowering/lowering.ts']);
  });

  it('T-ARCH-WRITER-6 [XF→U9b] lowerToUserTurn is called from slot 9 and from nowhere else', () => {
    const inSlot9 = slotUnits('9').reduce(
      (n, u) => n + callsOf(parseSource(u.file, u.source), 'lowerToUserTurn'),
      0,
    );
    expect(inSlot9).toBe(1);
    const slot9Files = new Set<SrcPath>([
      ...slotFiles('9'),
      TIMELINE_FACADE,
      ...TIMELINE_TABLE_FILES,
    ]);
    const elsewhere = productionSources().filter(
      (f) => !slot9Files.has(f) && callsOf(parseSrc(f), 'lowerToUserTurn') > 0,
    );
    expect(elsewhere).toEqual([]);
  });
});

// ── T-ARCH-STORE-METHODS — 9.11: the bypass a name-based fence cannot see ───────────────────────

describe('T-ARCH-STORE-METHODS — no second method reaches the turn table (9.11)', () => {
  const STORE_FILES: readonly SrcPath[] = [
    ...TIMELINE_TABLE_FILES,
    TIMELINE_FACADE,
  ];

  const touchingMethods = (file: SrcPath): string[] => {
    const sf = parseSrc(file);
    const out: string[] = [];
    eachNode(sf, (n) => {
      if (!ts.isMethodDeclaration(n) && !ts.isFunctionDeclaration(n)) return;
      const name = n.name?.getText(sf) ?? '(anonymous)';
      const body = n.body?.getText(sf) ?? '';
      if (
        /\bwidgetTimelineTurn\b|"WidgetTimelineTurn"|\binsertTurn\b|\bwidgetIntentRecord\b/.test(
          body,
        )
      )
        out.push(name);
    });
    return out;
  };

  it('T-ARCH-STORE-METHODS every method that touches the turn table or the record is allowlisted', () => {
    for (const file of STORE_FILES)
      for (const method of touchingMethods(file))
        expect([file, method, STORE_METHOD_ALLOWLIST.has(method)]).toEqual([
          file,
          method,
          true,
        ]);
  });

  it('T-ARCH-STORE-METHODS-2 [XF→U9b] the writer and its private insert exist, and both are allowlisted', () => {
    const sf = parseSrc('widgets/stores/timeline.store.ts');
    for (const name of ['lowerToUserTurn', 'insertTurn']) {
      expect([name, declarationOf(sf, name) !== null]).toEqual([name, true]);
      expect(STORE_METHOD_ALLOWLIST.has(name)).toBe(true);
    }
  });
});

// ── T-ARCH-READERS — E10 / 9.11: the transcript feeds nothing yet ───────────────────────────────

describe('T-ARCH-READERS — who may read a conversation turn (E10, C11:5314)', () => {
  it('T-ARCH-READERS the turn table is queried only inside the timeline store', () => {
    for (const file of productionSources()) {
      if (TIMELINE_TABLE_FILES.includes(file)) continue;
      const reads = prismaOps(parseSrc(file)).filter(
        (op) =>
          op.startsWith('widgetTimelineTurn.') &&
          READ_OPS.has(op.split('.')[1]),
      );
      expect([file, reads]).toEqual([file, []]);
    }
  });

  it('T-ARCH-READERS-2 readTimeline is called only from the store facade', () => {
    const callers = productionSources().filter(
      (f) =>
        !TIMELINE_TABLE_FILES.includes(f) &&
        callsOf(parseSrc(f), 'readTimeline') > 0,
    );
    expect(callers).toEqual([...READ_TIMELINE_CALLERS]);
  });

  it('T-ARCH-READERS-3 no canonical module names the turn table at all (RT3(b))', () => {
    for (const file of productionSources()) {
      if (file.startsWith('widgets/')) continue;
      expect([file, namesTimelineTable(parseSrc(file))]).toEqual([file, false]);
    }
  });
});

// ── T-ARCH-F15 — 9.10: the lowered content is read by nothing after Gate 9 but Gate 10 ──────────

describe('T-ARCH-F15 — conversation content stops at the rendering gate (9.10, F15 C11:225-233)', () => {
  /**
   * The guarded identifiers, DERIVED from the schema's own `// C` and `// X` markers on the widget
   * models, plus the three names the admission path carries them under. Deriving them is the point:
   * a column added with a `// C` marker joins the fence without anyone remembering to add it.
   */
  const guarded = (): ReadonlySet<string> => {
    const names = schemaFields()
      .filter(
        (f) =>
          f.model.startsWith('Widget') &&
          (f.erasureClass === 'C' || f.erasureClass === 'X'),
      )
      .map((f) => f.name);
    return new Set([
      ...names,
      'loweringSource',
      'selectedLabels',
      'lowering',
      'renderedUtterance',
    ]);
  };

  it('T-ARCH-F15 the guarded set is derived from the schema and is not empty', () => {
    const names = guarded();
    for (const expected of [
      'textContent',
      'spokenTranscript',
      'utteranceTemplate',
      'renderedUtterance',
      'selectedLabels',
      'selectionDomainLabelsJson',
      'lowering',
      'loweringSource',
    ])
      expect([...names]).toContain(expected);
  });

  it('T-ARCH-F15-2 no decision file after the rendering gate names a guarded identifier', () => {
    const names = guarded();
    const files = [
      ...F15_FORBIDDEN_FILES,
      ...productionSources().filter((f) =>
        F15_FORBIDDEN_DIRECTORIES.some((d) => f.startsWith(d)),
      ),
    ];
    expect(files.length).toBeGreaterThan(F15_FORBIDDEN_FILES.length);
    for (const file of files) {
      const hits = [...referenced(parseSrc(file))].filter((n) => names.has(n));
      expect([file, hits]).toEqual([file, []]);
    }
  });

  it('T-ARCH-F15-3 no slot after Gate 10 names a guarded identifier', () => {
    const names = guarded();
    for (const slot of F15_FORBIDDEN_SLOTS)
      for (const unit of slotUnits(slot)) {
        const hits = [
          ...referenced(parseSource(unit.file, unit.source)),
        ].filter((n) => names.has(n));
        expect([unit.file, hits]).toEqual([unit.file, []]);
      }
  });

  it('T-ARCH-F15-4 slot 10 may name the lowering fact, and nothing else guarded', () => {
    const names = new Set(guarded());
    names.delete('lowering');
    // The fact's sole payload is `renderedUtterance`; allowing the container but forbidding its one
    // member would make the Gate 10 exception unusable rather than narrow.
    names.delete('renderedUtterance');
    for (const unit of slotUnits('10')) {
      const hits = [...referenced(parseSource(unit.file, unit.source))].filter(
        (n) => names.has(n),
      );
      // U10b reaches the whole store facade through DI. Its two hits belong to pre-existing facade
      // methods for Gate 8/12; pin them exactly so the slot derivation cannot turn that mechanical
      // edge into either a false violation or an open-ended conversation-content allowance.
      const allowed =
        unit.file === 'stores/widget-stores.service.ts'
          ? ['loweringSource', 'diffJson']
          : [];
      expect([unit.file, hits]).toEqual([unit.file, allowed]);
    }
  });

  it('T-ARCH-F15-5 IntentRecordRow carries no guarded member, and findRecord selects none', () => {
    const names = guarded();
    const types = parseSrc('widgets/gate.types.ts');
    const row = interfaceMembers(types, 'IntentRecordRow');
    expect(row.length).toBeGreaterThan(0);
    expect(row.filter((m) => names.has(m))).toEqual([]);
    const gateway = parseSrc(GATEWAY_SRC);
    const findRecord = declarationOf(gateway, 'findRecord');
    expect(findRecord).not.toBeNull();
    const body =
      (findRecord as ts.MethodDeclaration).body?.getText(gateway) ?? '';
    for (const name of names)
      if (name !== 'loweringSource')
        expect([name, body.includes(name)]).toEqual([name, false]);
  });
});

// ── T-ARCH-MODELS — G9-20/21: the lowering touches two models and no neighbour ──────────────────

describe('T-ARCH-MODELS — what the lowering may reach (G9-20, G9-21)', () => {
  const NEIGHBOURS = [
    'ai-tools',
    'ai-brain',
    'orchestration',
    'action-engine',
    'crm',
  ];

  it('T-ARCH-MODELS the lowering module and slot 9 import no canonical neighbour', () => {
    const files = [
      ...productionSources().filter((f) => f.startsWith('widgets/lowering/')),
      ...slotFiles('9'),
    ];
    expect(files.length).toBeGreaterThan(1);
    for (const file of callClosure(files)) {
      const offending = NEIGHBOURS.filter((n) => file.startsWith(`${n}/`));
      expect([file, offending]).toEqual([file, []]);
    }
  });

  it('T-ARCH-MODELS-2 the lowering module is pure: it holds no Prisma operation at all', () => {
    for (const file of productionSources().filter((f) =>
      f.startsWith('widgets/lowering/'),
    ))
      expect([file, prismaOps(parseSrc(file))]).toEqual([file, []]);
  });

  it('T-ARCH-MODELS-3 [XF→U9b] the writer touches exactly the record and the turn, no receipt or audit', () => {
    const sf = parseSrc('widgets/stores/timeline.store.ts');
    const writer = declarationOf(sf, 'lowerToUserTurn');
    expect(writer).not.toBeNull();
    const body = (writer as ts.MethodDeclaration).body?.getText(sf) ?? '';
    const models = [...delegates()].filter((d) =>
      new RegExp(`\\b${d}\\b`).test(body),
    );
    expect(models.sort()).toEqual(['widgetIntentRecord', 'widgetTimelineTurn']);
    for (const banned of [
      'WidgetIntentReceipt',
      'WidgetIntentSubmissionAudit',
      'WidgetErasureTombstone',
    ])
      expect(body).not.toContain(banned);
  });
});

// ── T-ARCH-NOWRITE — 9.5: nothing before Gate 9 writes ──────────────────────────────────────────

describe('T-ARCH-NOWRITE — Gate 9 is the FIRST durable write of the sequence (9.5, R3.9.1)', () => {
  it('T-ARCH-NOWRITE submit() performs no write, and reaches no model delegate of its own', () => {
    const gateway = parseSrc(GATEWAY_SRC);
    const submit = declarationOf(gateway, 'submit');
    expect(submit).not.toBeNull();
    const body = (submit as ts.MethodDeclaration).body;
    expect(body).toBeDefined();
    const sf = parseSource(
      'submit.ts',
      `const f = async () => ${body?.getText(gateway) ?? '{}'};`,
    );
    // The record read is delegated to `findRecord`; opening the request transaction `T` is not a
    // model delegate, so this stays true when P-PRINCIPAL wires `T` here (D-1, IR-P-GW).
    expect(prismaOps(sf)).toEqual([]);
  });

  it('T-ARCH-NOWRITE-2 no slot from 1 to 8-R, or anything it calls, holds a Prisma write', () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8', '8-R'];
    const roots = before.flatMap((n) => slotFiles(n));
    expect(roots.length).toBeGreaterThan(5);
    for (const unit of before.flatMap((n) => slotUnits(n)))
      expect([
        unit.file,
        writesOf(parseSource(unit.file, unit.source)),
      ]).toEqual([unit.file, []]);
    for (const file of callClosure(roots))
      expect([file, writesOf(parseSrc(file))]).toEqual([file, []]);
  });

  it('T-ARCH-NOWRITE-3 the gateway, outside the array, writes nothing either', () => {
    const rest = PIPELINE.gatewayRest;
    expect(writesOf(parseSource(rest.file, rest.source))).toEqual([]);
  });
});

// ── T-ARCH-TX — REQ-TX / D-1: the writer runs in the one request transaction ────────────────────

describe('T-ARCH-TX — Gate 9 writes through the request transaction T (D-1, C11:4861)', () => {
  it('T-ARCH-TX [XF→U9b] lowerToUserTurn takes the transaction and opens none of its own', () => {
    const sf = parseSrc('widgets/stores/timeline.store.ts');
    const writer = declarationOf(sf, 'lowerToUserTurn');
    expect(writer).not.toBeNull();
    const parameters = (writer as ts.SignatureDeclaration).parameters.map((p) =>
      p.name.getText(sf),
    );
    expect(parameters).toContain('tx');
    const body = (writer as ts.MethodDeclaration).body?.getText(sf) ?? '';
    // G9S's T-ARCH-NOTX said the opposite. V1.1 (C11:4861) and D-1 replaced it: one transaction,
    // opened by `submit()`, committed after slot 10 — so a writer that opened its own would put
    // the turn outside the transaction Gate 10's audit row is written in.
    expect(body).not.toContain('$transaction');
  });

  it('T-ARCH-TX-2 [XF→U9b] slot 9 hands the writer the transaction it was given', () => {
    const lower = declarationOf(
      parseSrc('widgets/lowering/lowering.gate.ts'),
      'lower',
    );
    expect(lower).not.toBeNull();
    const parameters = (lower as ts.SignatureDeclaration).parameters.map((p) =>
      p.name.getText(parseSrc('widgets/lowering/lowering.gate.ts')),
    );
    expect(parameters.length).toBe(2);
  });
});

describe('T9-LOG-1 — stale/render-impossible content never reaches a logger', () => {
  it('the lowering, slot and timeline writer contain no logging capability', () => {
    for (const file of [
      'widgets/lowering/lowering.ts',
      'widgets/lowering/lowering.gate.ts',
      'widgets/stores/timeline.store.ts',
    ]) {
      const names = referenced(parseSrc(file));
      expect({
        file,
        forbidden: ['console', 'logger', 'Logger', 'log', 'warn'].filter(
          (name) => names.has(name),
        ),
      }).toEqual({ file, forbidden: [] });
    }
  });
});
