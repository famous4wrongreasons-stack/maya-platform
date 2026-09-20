// P-SEAL — SEAL-4 (the H6 ratchet) and SEAL-5 (no key under the gateway's run-time import graph).
//
// H6 (C11:2627): "No widget-layer artefact may introduce a canonicalisation or hashing scheme other
// than `stableActionJson` + SHA-256, or a keyed scheme other than `ActionIdentityService.hmac`", with
// `EP-BUILD` as its evaluation point. The widget layer does not satisfy that today: six files hash
// with their own `createHash` and their own `JSON.stringify` canonicaliser. Declaring them forbidden
// now would only make the check red and therefore ignored, so this is a RATCHET instead:
//   - every hashing site under `src/widgets/**` is either in the list below or the check fails;
//   - a listed file that no longer hashes must LEAVE the list, so an entry cannot be kept as cover;
//   - the list may only shrink. Its ceiling is frozen at the size it had when P-SEAL merged.
// Each entry names the unit whose merge removes it, which is how the ratchet reaches zero (R8-5).
//
// SEAL-5 is the other half of custody (B-22, C11:7217): there is no fourth holder of the seal key.
// The gateway reaches verification through the `SEAL_VERIFIER` token and the `SealVerifier` interface,
// which is a type and is erased, so no file the gateway can reach at RUN TIME may hold, construct or
// read the key. That is read from the import graph rather than agreed to in review.
//
// Class BUILD (§0.5): an `EP-BUILD` structural test. It flips no clause by itself.

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const WIDGETS = path.resolve(__dirname, '..');
const SRC = path.resolve(WIDGETS, '..');

/**
 * The widget-layer files that may still hash their own way, with the unit whose merge removes the
 * entry. THIS LIST MAY ONLY SHRINK (`RATCHET_CEILING`). Nothing is ever added: a new hashing site is a
 * second scheme, which is what H6 forbids.
 */
const EXEMPT: Readonly<Record<string, string>> = Object.freeze({
  'token.util.ts': 'integrator — the intent-token digest (R8-5)',
  'authority/contract-bindings.ts':
    'integrator — retired in the U8b merge (R8-5)',
  'consent/erasure.ts': 'P-RT6',
  'proactive/provenance.ts': 'P-MT3',
  'analytics/projection.ts': 'U12b',
});

/** The size of the list when P-SEAL merged. Each owner's merge lowers it; nothing raises it. */
const RATCHET_CEILING = 5;

/** The gateway file whose run-time import closure must hold no key. */
const GATEWAY = 'intent-gateway.service.ts';

/** Names that ARE a hashing primitive: calling one is a hashing site on its own. */
const HASH_PRIMITIVES = new Set(['createHash', 'createHmac']);

/** Names that hash through a helper: they make a `JSON.stringify` in the same file a canonicaliser. */
const HASH_HELPERS = new Set(['sha256Hex', 'digest']);

const widgetFiles = (): string[] => {
  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? walk(path.join(dir, entry.name))
          : [path.join(dir, entry.name)],
      );
  return walk(WIDGETS)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .sort();
};

const key = (file: string) =>
  path.relative(WIDGETS, file).split(path.sep).join('/');

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  );

/** The name a call expression calls, for `f()` and for `a.b.f()` alike. */
const calleeName = (node: ts.CallExpression): string | null => {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
};

/** Every call in a file, by name. Comments and strings cannot reach this: it reads the syntax tree. */
const callsIn = (source: ts.SourceFile): string[] => {
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name !== null) {
        names.push(
          ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression)
            ? `${node.expression.expression.text}.${name}`
            : name,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
};

/**
 * The hashing sites of one file. A `JSON.stringify` counts only where the file also hashes: the widget
 * layer serialises for other reasons (an audit row is written, not digested), and a ratchet that called
 * those hashing would be a ratchet nobody could satisfy.
 */
const hashingSites = (file: string): string[] => {
  const calls = callsIn(parse(file));
  const primitives = calls.filter((name) =>
    HASH_PRIMITIVES.has(name.split('.').pop() ?? ''),
  );
  const hashes =
    primitives.length > 0 ||
    calls.some((name) => HASH_HELPERS.has(name.split('.').pop() ?? ''));
  const canonicalisers = hashes
    ? calls.filter((name) => name === 'JSON.stringify')
    : [];
  return [...primitives, ...canonicalisers];
};

describe('P-SEAL — SEAL-4: the H6 hashing ratchet', () => {
  const sites = new Map(
    widgetFiles()
      .map((file) => [key(file), hashingSites(file)] as const)
      .filter(([, found]) => found.length > 0),
  );

  it('SEAL-4 [BUILD] every hashing site under src/widgets is on the list', () => {
    expect([...sites.keys()].filter((file) => !(file in EXEMPT))).toEqual([]);
  });

  it('SEAL-4 [BUILD] a listed file that no longer hashes has left the list', () => {
    expect(Object.keys(EXEMPT).filter((file) => !sites.has(file))).toEqual([]);
  });

  it('SEAL-4 [BUILD] the list may only shrink', () => {
    expect(Object.keys(EXEMPT).length).toBeLessThanOrEqual(RATCHET_CEILING);
    // Non-vacuous: the scanner finds the sites that are there, so an empty scan cannot pass it.
    expect(sites.size).toBeGreaterThan(0);
    expect(sites.get('token.util.ts')).toContain('createHash');
  });

  it('SEAL-4 [BUILD] the seal introduces no second scheme of its own', () => {
    for (const file of [
      'emission/seal.service.ts',
      'emission/seal-verifier.service.ts',
    ]) {
      expect(`${file}: ${JSON.stringify(sites.get(file) ?? [])}`).toBe(
        `${file}: []`,
      );
      expect(file in EXEMPT).toBe(false);
    }
    // And it hashes through the one keyed discipline H6 names.
    const seal = fs.readFileSync(
      path.join(WIDGETS, 'emission/seal.service.ts'),
      'utf8',
    );
    expect(seal).toContain('ActionIdentityService');
    expect(seal).toContain('.hmac(');
  });
});

// ── SEAL-5 ───────────────────────────────────────────────────────────────────────────────────────

/** The files a file imports for its VALUES. A type-only import is erased and carries nothing. */
const valueImports = (file: string): string[] => {
  const source = parse(file);
  const out: string[] = [];
  const resolve = (spec: string): string | null => {
    if (!spec.startsWith('.')) return null;
    const base = path.resolve(path.dirname(file), spec);
    for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const typeOnly =
        clause?.isTypeOnly === true ||
        (clause?.namedBindings !== undefined &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.name === undefined &&
          clause.namedBindings.elements.every((el) => el.isTypeOnly));
      if (!typeOnly) {
        const resolved = resolve(node.moduleSpecifier.text);
        if (resolved !== null) out.push(resolved);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
};

/** Every file reachable from the gateway through value imports, the gateway itself included. */
const gatewayClosure = (): Set<string> => {
  const seen = new Set<string>();
  const queue = [path.join(WIDGETS, GATEWAY)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const next of valueImports(file)) queue.push(next);
  }
  return seen;
};

describe('P-SEAL — SEAL-5: no seal key under the gateway', () => {
  const closure = gatewayClosure();
  const srcKey = (file: string) =>
    path.relative(SRC, file).split(path.sep).join('/');

  it('SEAL-5 [BUILD] the closure is read, not assumed', () => {
    // A walker that resolved nothing would pass every assertion below. These are the edges it must
    // have followed: a widget file, a file one directory up, and a gate the pipeline calls.
    const keys = [...closure].map(srcKey);
    expect(keys).toContain(`widgets/${GATEWAY}`);
    expect(keys).toContain('widgets/token.util.ts');
    expect(keys).toContain('widgets/gates/gate1.ts');
    expect(keys).toContain('prisma/prisma.service.ts');
    expect(closure.size).toBeGreaterThan(10);
  });

  it('SEAL-5 [BUILD] nothing the gateway reaches at run time holds or reads the key', () => {
    // "Holds the key" is constructing `ActionIdentityService` with secrets, or reading a secret —
    // not merely being able to see the class. The gateway already reaches the class's MODULE, through
    // `gates/gate6.ts` → `authority/contract-bindings.ts` → the Action Engine capability registry →
    // `native-feedback.contract.ts`, and a module with no secret in it is not a key. What B-22 forbids
    // is a second holder, and that is what is checked.
    const offenders: string[] = [];
    for (const file of closure) {
      const text = fs.readFileSync(file, 'utf8');
      if (/new\s+ActionIdentityService\s*\(/.test(text)) {
        offenders.push(`${srcKey(file)}: constructs ActionIdentityService`);
      }
      for (const name of [
        'ACTION_ENGINE_IDENTITY_SECRET',
        'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
        'CRM_ENCRYPTION_KEY',
      ]) {
        if (text.includes(name)) offenders.push(`${srcKey(file)}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('SEAL-5 [BUILD] the only keyed primitive the gateway reaches is the one discipline H6 names', () => {
    const holders = [...closure]
      .filter((file) =>
        callsIn(parse(file)).some(
          (name) => name.split('.').pop() === 'createHmac',
        ),
      )
      .map(srcKey)
      .sort();
    expect(holders).toEqual(['action-engine/action-engine.identity.ts']);
  });

  it('SEAL-5 [BUILD] the seal services are minter-held: outside the closure, and the only key holders', () => {
    const inClosure = [...closure].map(srcKey);
    expect(inClosure).not.toContain('widgets/emission/seal.service.ts');
    expect(inClosure).not.toContain(
      'widgets/emission/seal-verifier.service.ts',
    );

    const holders = widgetFiles().filter((file) =>
      /\bActionIdentityService\b/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(holders.map(key)).toEqual(['emission/seal.service.ts']);
  });

  // ── SEAL-5c ────────────────────────────────────────────────────────────────────────────────────
  //
  // CKPT-W1 review fix. P-SEAL's scope states
  // B-22 as "the gateway module never holds the key; `SEAL_VERIFIER` is provided by the emission
  // module". P-MINT-CORE supplies that module and moves `SealService`, `SealVerifierService` and the
  // `SEAL_VERIFIER` binding into it. The constructor assertion remains as a direct ratchet against a
  // future gateway injection, while the provider-location assertion proves custody is now structural.
  //
  describe('SEAL-5c [BUILD] the gateway cannot inject a key holder and custody stays in emission', () => {
    const KEY_HOLDERS = ['SealService', 'SealVerifierService'];
    const gatewaySource = (): string =>
      fs.readFileSync(path.join(WIDGETS, GATEWAY), 'utf8');
    const parseText = (source: string): ts.SourceFile =>
      ts.createSourceFile(
        GATEWAY,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

    /** Every key-holder name the class's CONSTRUCTOR names, in a parameter type or a decorator. */
    const keyHoldersInConstructor = (source: string): string[] => {
      const sf = parseText(source);
      const out: string[] = [];
      const visit = (n: ts.Node): void => {
        if (ts.isConstructorDeclaration(n))
          for (const p of n.parameters) {
            const text = p.getText(sf);
            for (const name of KEY_HOLDERS)
              if (new RegExp(`\\b${name}\\b`).test(text))
                out.push(`${name} in ${p.name.getText(sf)}`);
          }
        ts.forEachChild(n, visit);
      };
      visit(sf);
      return out;
    };

    const constructorParameters = (source: string): number => {
      const sf = parseText(source);
      let parameters = 0;
      const count = (n: ts.Node): void => {
        if (ts.isConstructorDeclaration(n)) parameters += n.parameters.length;
        ts.forEachChild(n, count);
      };
      count(sf);
      return parameters;
    };

    it('SEAL-5c the gateway’s constructor names neither seal service', () => {
      // Not vacuous: the constructor really does take injected members, so a parser that found no
      // parameters at all would be caught here rather than passing by silence.
      expect(constructorParameters(gatewaySource())).toBeGreaterThan(3);
      expect(keyHoldersInConstructor(gatewaySource())).toEqual([]);
    });

    it('SEAL-5c RED: a planted injection of either service turns it red', () => {
      for (const name of KEY_HOLDERS) {
        const planted = gatewaySource().replace(
          'private readonly prisma: PrismaService,',
          `private readonly prisma: PrismaService,\n    private readonly seal: ${name},`,
        );
        expect({
          name,
          planted: planted !== gatewaySource(),
          found: keyHoldersInConstructor(planted).length > 0,
        }).toEqual({ name, planted: true, found: true });
      }
    });

    it('SEAL-5c the deviation is bounded: the two providers stand in ONE module, and it is named', () => {
      // If they are ever provided in two places, "move them in P-MINT-CORE's merge" stops being one
      // edit, and the note above stops being true.
      const providers = widgetFiles().filter((file) => {
        const text = fs.readFileSync(file, 'utf8');
        return (
          file.endsWith('.module.ts') &&
          KEY_HOLDERS.every((n) => new RegExp(`\\b${n}\\b`).test(text))
        );
      });
      expect(providers.map(key)).toEqual(['emission/emission.module.ts']);
    });
  });
});
