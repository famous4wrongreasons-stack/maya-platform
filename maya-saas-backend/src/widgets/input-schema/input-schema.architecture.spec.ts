// U8b-c — the single-implementation fence. Class [BUILD] (§0.5): an `EP-BUILD` structural test. It
// flips no clause by itself; it is what makes D-7's "nothing else may re-implement them" checkable
// instead of agreed to in review.
//
// WHY IT EXISTS. D-7 split this directory out of U8b because P-MINT-CORE and Gate 8 must read one
// document the same way. Two implementations of `inputSchemaHash` would report a schema the server
// itself wrote as tampered (B-10, C11:7202). Two implementations of the `selection_domain` codec would
// make Gate 10's SUPERSEDED comparison — which reads the column as a STRING (C11:4514) — answer that two
// equal domains differ. The failure mode in both cases is a gate that looks enforced and is not, which
// is the one thing a structural test can still catch after the drift has happened.
//
// FOUR RULES, each with a planted-violation control. The controls edit a copy of the source IN MEMORY:
// the repository is never written, and a rule that could not go red is reported as such.

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const HERE = __dirname;
const WIDGETS = path.resolve(HERE, '..');
const DIR = 'input-schema';

/** The exports this directory owns. No other widget file may declare a binding of these names. */
const OWNED = [
  'parseInputSchema',
  'inputSchemaHash',
  'inputsByteLength',
  'encodeSelectionDomain',
  'decodeSelectionDomain',
  'decodeSelectionDomainLabels',
] as const;

/** The stored members a decoder would be decoding. Naming one beside a parse call is the signature. */
const STORED = [
  'selectionDomain',
  'selection_domain',
  'selectionDomainLabelsJson',
  'selection_domain_labels',
  'inputSchemaHash',
  'input_schema_hash',
  'input_schema',
];

/**
 * What a file in this directory may import. It is pure: no Nest, no store client, no owner port, no
 * gate. The two non-widget entries are the one canonicalisation discipline H6 names (C11:2627) and the
 * generated contract types.
 */
const ALLOWED_IMPORTS: readonly (string | RegExp)[] = [
  '../../action-engine/action-engine.identity',
  '../token.util',
  /^\.\.\/\.\.\/widget-contract\//,
  /^\.\/[a-z-]+$/,
];

const key = (file: string): string =>
  path.relative(WIDGETS, file).split(path.sep).join('/');

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : [path.join(dir, entry.name)],
    );

const sources = (): string[] =>
  walk(WIDGETS)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .sort();

const parse = (file: string, text?: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    text ?? fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  );

const isMine = (file: string): boolean => key(file).startsWith(`${DIR}/`);

// ── the readers ──────────────────────────────────────────────────────────────────────────────────

/** Top-level bindings a file DECLARES (a function, a class, a const): the shape of a re-implementation. */
const declaredNames = (source: ts.SourceFile): string[] => {
  const names: string[] = [];
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      names.push(statement.name.text);
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      names.push(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.push(d.name.text);
      }
    }
  }
  return names;
};

interface ImportUse {
  readonly specifier: string;
  readonly names: readonly string[];
}

const importsOf = (source: ts.SourceFile): ImportUse[] => {
  const out: ImportUse[] = [];
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    const names =
      bindings !== undefined && ts.isNamedImports(bindings)
        ? bindings.elements.map((e) => e.name.text)
        : [];
    out.push({ specifier: statement.moduleSpecifier.text, names });
  }
  return out;
};

/** Every call in a file, as `<callee>(<argument source>)`. */
const calls = (source: ts.SourceFile): { name: string; args: string }[] => {
  const out: { name: string; args: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? `${callee.expression.getText(source)}.${callee.name.text}`
          : null;
      if (name !== null) {
        out.push({
          name,
          args: node.arguments.map((a) => a.getText(source)).join(', '),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
};

// ── the rules ────────────────────────────────────────────────────────────────────────────────────

type Violation = string;

/** ISC-1 — one declaration per owned name, and it lives in this directory. */
const isc1 = (
  files: readonly { file: string; source: ts.SourceFile }[],
): Violation[] =>
  files.flatMap(({ file, source }) =>
    declaredNames(source)
      .filter((name) => (OWNED as readonly string[]).includes(name))
      .filter(() => !isMine(file))
      .map((name) => `ISC-1 ${key(file)} declares ${name}`),
  );

/** ISC-2 — a widget file that USES an owned name imports it from this directory. */
const isc2 = (
  files: readonly { file: string; source: ts.SourceFile }[],
): Violation[] =>
  files.flatMap(({ file, source }) => {
    if (isMine(file)) return [];
    const text = source.getFullText();
    const fromMine = new Set(
      importsOf(source)
        .filter(
          (i) =>
            i.specifier.includes(`/${DIR}/`) ||
            i.specifier.startsWith(`./${DIR}/`),
        )
        .flatMap((i) => i.names),
    );
    return OWNED.filter(
      (name) =>
        new RegExp(`\\b${name}\\s*\\(`).test(text) && !fromMine.has(name),
    ).map(
      (name) =>
        `ISC-2 ${key(file)} calls ${name} without importing it from ${DIR}/`,
    );
  });

/** ISC-3 — no widget file outside this directory parses a stored schema or domain of its own. */
const isc3 = (
  files: readonly { file: string; source: ts.SourceFile }[],
): Violation[] =>
  files.flatMap(({ file, source }) => {
    if (isMine(file)) return [];
    return calls(source)
      .filter(
        (c) =>
          (c.name === 'JSON.parse' || c.name.endsWith('.split')) &&
          STORED.some((member) => c.args.includes(member)),
      )
      .map((c) => `ISC-3 ${key(file)} decodes a stored member with ${c.name}`);
  });

/** ISC-4 — H6 locally: one canonicaliser and one digest, neither of them written here. */
const isc4 = (
  files: readonly { file: string; source: ts.SourceFile }[],
): Violation[] =>
  files.flatMap(({ file, source }) => {
    if (!isMine(file)) return [];
    return calls(source)
      .filter((c) =>
        ['createHash', 'createHmac', 'JSON.stringify'].includes(c.name),
      )
      .map((c) => `ISC-4 ${key(file)} introduces a second scheme: ${c.name}`);
  });

/** ISC-5 — purity: a closed import allowlist, and no Nest-decorated class. */
const isc5 = (
  files: readonly { file: string; source: ts.SourceFile }[],
): Violation[] =>
  files.flatMap(({ file, source }) => {
    if (!isMine(file)) return [];
    const bad = importsOf(source)
      .map((i) => i.specifier)
      .filter(
        (specifier) =>
          !ALLOWED_IMPORTS.some((allowed) =>
            typeof allowed === 'string'
              ? allowed === specifier
              : allowed.test(specifier),
          ),
      )
      .map((specifier) => `ISC-5 ${key(file)} imports ${specifier}`);
    const decorated = source.statements
      .filter(ts.isClassDeclaration)
      .filter((c) => ts.getDecorators(c) !== undefined)
      .map((c) => `ISC-5 ${key(file)} declares the DI class ${c.name?.text}`);
    return [...bad, ...decorated];
  });

const RULES = { isc1, isc2, isc3, isc4, isc5 } as const;

const readAll = (): { file: string; source: ts.SourceFile }[] =>
  sources().map((file) => ({ file, source: parse(file) }));

// ── the tests ────────────────────────────────────────────────────────────────────────────────────

describe('U8b-c — the input-schema single-implementation fence', () => {
  const all = readAll();

  it('ISC-0 [BUILD] the scan reads the widget layer, and this directory is in it', () => {
    // A walker that resolved nothing would satisfy every "no violations" assertion below.
    const keys = all.map(({ file }) => key(file));
    expect(keys).toContain('input-schema/codec.ts');
    expect(keys).toContain('input-schema/parse-input-schema.ts');
    expect(keys).toContain('input-schema/input-schema-hash.ts');
    expect(keys).toContain('input-schema/inputs-bytes.ts');
    expect(keys).toContain('token.util.ts');
    expect(keys.length).toBeGreaterThan(20);
    // And the readers really see the declarations they are about to fence.
    const codec = all.find(({ file }) => key(file) === 'input-schema/codec.ts');
    expect(codec === undefined ? [] : declaredNames(codec.source)).toEqual(
      expect.arrayContaining([
        'encodeSelectionDomain',
        'decodeSelectionDomain',
      ]),
    );
  });

  it('ISC-1 [BUILD] every owned name is declared exactly once, in input-schema/', () => {
    expect(isc1(all)).toEqual([]);
    const mine = new Map<string, string[]>();
    for (const { file, source } of all.filter(({ file }) => isMine(file))) {
      for (const name of declaredNames(source)) {
        if ((OWNED as readonly string[]).includes(name)) {
          mine.set(name, [...(mine.get(name) ?? []), key(file)]);
        }
      }
    }
    expect([...mine.keys()].sort()).toEqual([...OWNED].sort());
    expect(
      [...mine.entries()].filter(([, files]) => files.length !== 1),
    ).toEqual([]);
  });

  it('ISC-2 [BUILD] a widget file that calls an owned name imports it from input-schema/', () => {
    expect(isc2(all)).toEqual([]);
  });

  it('ISC-3 [BUILD] no widget file outside input-schema/ decodes a stored schema or domain', () => {
    expect(isc3(all)).toEqual([]);
  });

  it('ISC-4 [BUILD] this directory adds no second canonicaliser and no second digest (H6, C11:2627)', () => {
    expect(isc4(all)).toEqual([]);
    // Positively: the canonicaliser is the platform's, and the digest is the widget layer's one helper.
    const specifiers = all
      .filter(({ file }) => isMine(file))
      .flatMap(({ source }) => importsOf(source).map((i) => i.specifier));
    expect(specifiers).toContain('../../action-engine/action-engine.identity');
    expect(specifiers).toContain('../token.util');
  });

  it('ISC-5 [BUILD] input-schema/ is pure: a closed import list and no DI class', () => {
    expect(isc5(all)).toEqual([]);
  });

  describe('each rule goes red on a planted violation (in memory; the repository is not edited)', () => {
    const planted = (
      file: string,
      find: string,
      replace: string,
    ): { file: string; source: ts.SourceFile }[] => {
      const target = path.join(WIDGETS, file);
      const text = fs.readFileSync(target, 'utf8');
      expect(text.split(find).length).toBe(2); // the anchor is unique, or the plant proves nothing
      return all.map((entry) =>
        entry.file === target
          ? { file: target, source: parse(target, text.replace(find, replace)) }
          : entry,
      );
    };

    it('ISC-1 goes red when another widget file declares an owned name', () => {
      const tree = planted(
        'token.util.ts',
        'export const sha256Hex',
        'export const inputSchemaHash = (v: unknown): string => String(v);\nexport const sha256Hex',
      );
      expect(RULES.isc1(tree)).toEqual([
        'ISC-1 token.util.ts declares inputSchemaHash',
      ]);
    });

    it('ISC-2 goes red when a widget file calls an owned name it did not import from here', () => {
      const tree = planted(
        'token.util.ts',
        "createHash('sha256').update(value, 'utf8').digest('hex')",
        "inputsByteLength(value) + createHash('sha256').update(value, 'utf8').digest('hex')",
      );
      expect(RULES.isc2(tree)).toEqual([
        'ISC-2 token.util.ts calls inputsByteLength without importing it from input-schema/',
      ]);
    });

    it('ISC-3 goes red when a widget file parses a stored domain itself', () => {
      const tree = planted(
        'token.util.ts',
        'export const digestEquals',
        'export const own = (r: { selectionDomain: string }) => JSON.parse(r.selectionDomain) as unknown;\nexport const digestEquals',
      );
      expect(RULES.isc3(tree)).toEqual([
        'ISC-3 token.util.ts decodes a stored member with JSON.parse',
      ]);
    });

    it('ISC-4 goes red when this directory hashes or canonicalises its own way', () => {
      const tree = planted(
        'input-schema/inputs-bytes.ts',
        "Buffer.byteLength(stableActionJson(inputs), 'utf8')",
        "Buffer.byteLength(JSON.stringify(inputs), 'utf8')",
      );
      expect(RULES.isc4(tree)).toEqual([
        'ISC-4 input-schema/inputs-bytes.ts introduces a second scheme: JSON.stringify',
      ]);
    });

    it('ISC-5 goes red on an import outside the allowlist', () => {
      const tree = planted(
        'input-schema/inputs-bytes.ts',
        "import { stableActionJson } from '../../action-engine/action-engine.identity';",
        "import { stableActionJson } from '../../action-engine/action-engine.identity';\nimport { PrismaService } from '../../prisma/prisma.service';",
      );
      expect(RULES.isc5(tree)).toEqual([
        'ISC-5 input-schema/inputs-bytes.ts imports ../../prisma/prisma.service',
      ]);
    });
  });
});
