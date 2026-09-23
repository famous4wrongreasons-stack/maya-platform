// D-6 — the union import-graph test. The widget layer reaches a canonical owner only through the
// owner-ports boundary, and everything else in it imports port interfaces, DI tokens and DI-free values.
//
// Integrator decision D-6 folds four specs' import fences into one boundary (plan §1.4):
//   - G6 S-8 (FR-1, Gate 6 half): gate code references no Prisma delegate, and the gateway none outside
//     the widget layer's own models;
//   - G11 G11-ARCH: owner services are imported only under `owner-ports/`; gate and gateway files import
//     port interfaces; `unwrapHandle`/`unwrapWitness` are imported only under `owner-ports/`; FR-1's
//     Prisma-model import test;
//   - G12 ARCH-12-1 (import half): the projection imports no appointments, CRM or AI-tool handler, and
//     no Prisma model outside `Widget*`;
//   - G13 B15 (module half): one widget module imports owner modules — under D-6, the owner-ports module.
// It lands in the same commit as the amended k3 check 9 (U0 item 9), and it is stricter than that check:
//   - CLOSED: every non-widget module or package a widget file imports is enumerated below with the
//     reason it is DI-free, per importer, and each enumerated module is DI-free through its value
//     imports. k3 check 9 reads Nest DI classes only, so a DI-free function that reaches a provider or
//     a raw HTTP client passes it and fails here;
//   - FR-1: no widget file references a Prisma client delegate outside `Widget*` (property, element or
//     destructuring access, on the client or a transaction client), no unsafe raw query, and no raw
//     query naming another table;
//   - GATE FILES: a gate file (every module a slot of the gateway's array calls into, every file under
//     `gates/`, every `gate*.ts` and `*.gate.ts`) imports no store client and references no Prisma client
//     member at all; it reads the store only through a widget store or a port;
//   - the enumerations here and k3 check 9's are the same (read from the script).
// Each rule is also run over planted violations, in memory, each asserted red for its own rule.
//
// Not seen: a DI-free owner function handed the Prisma client at run time, and a reference graph of owner
// write or decision methods. The latter belongs to the gate units' own architecture tests (G11-ARCH item
// 3, G13 B15, ARCH-12-1's reference list), which disagree today on `createForClient` (G11 bans it from
// `src/widgets`; G13's COMMIT edge calls it through a port), so it is not decided here.
//
// Class BUILD: structure only. Not live proof.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const WIDGETS = __dirname;
const BE = path.resolve(WIDGETS, '..', '..');
const SRC = path.join(BE, 'src');

// ── the enumerations ─────────────────────────────────────────────────────────────────────────────

/**
 * Owner modules the owner-ports module may import, as `<path under src>#<class>` (plan §1.3). Each is
 * added by the unit that binds a port through it, in the same commit as the test that pins the binding
 * (plan §3.5 item 7), here AND in k3 check 9. U0: none.
 */
const OWNER_MODULES: readonly string[] = [
  // U6-L1 (R6-2): C20's owner, `AiToolPolicyService.assertCanExecute` (C11:4761-4762).
  'ai-tools/ai-tool-policy.module.ts#AiToolPolicyModule',
  'ai-tools/ai-tools.module.ts#AiToolsModule',
  'measurement/measurement.module.ts#MeasurementModule',
  'valuation/c8.module.ts#C8Module',
  // P-PRINCIPAL (D-1, D-2): K1's resolver (C11:2536-2539) and B-02's in-transaction Membership read.
  'orchestration/c9.module.ts#C9Module',
  // U6-L1 (R6-2): (e)'s owner, `EntitlementsService` grants every `requiredFeatures` entry (C11:4755).
  'entitlements/entitlements.module.ts#EntitlementsModule',
  'tenancy/tenancy.module.ts#TenancyModule',
];
const NEVER_IMPORTED: readonly string[] = [
  'action-engine/action-engine.module.ts#ActionEngineModule',
];
/** The widget layer's own store client, and the one file that may import it (`null`: any). */
const STORE_CLIENT: Readonly<Record<string, string | null>> = {
  'prisma/prisma.service.ts#PrismaService': null,
  'prisma/prisma.module.ts#PrismaModule': 'widgets.module.ts',
};
const WIDGETS_MODULE = 'widgets.module.ts';
const PORTS_MODULE = 'owner-ports/widget-owner-ports.module.ts';
const BOUNDARY = `${PORTS_MODULE}#WidgetOwnerPortsModule`;
const EMISSION_MODULE = 'emission/emission.module.ts#WidgetEmissionModule';

interface Allowed {
  /** Why importing it reaches no owner: what it is, and that it needs no DI. */
  readonly why: string;
  /** The widget files that may import it; every widget file when absent. */
  readonly only?: readonly string[];
}

/** Non-widget modules any widget file may import. Closed: a module not listed here is refused. */
const NON_WIDGET_MODULES: Readonly<Record<string, Allowed>> = {
  'action-engine/action-engine.identity.ts': {
    why: "H4/H6: the platform's one keyed-HMAC discipline (`ActionIdentityService.hmac`) and its one canonicaliser (`stableActionJson`); a plain class and a pure function over static code, constructed as values, no DI (D-6 registries)",
    only: [
      'emission/seal.service.ts',
      // U8b-c (IR-8C-1): the input-schema codec reaches the UNKEYED half of the same discipline.
      // H6 admits no canonicalisation scheme other than `stableActionJson`, and §2.2 rule 3 forbids a
      // local copy of a shared codec — so the three pure files import it rather than restating it.
      'input-schema/codec.ts',
      'input-schema/input-schema-hash.ts',
      'input-schema/inputs-bytes.ts',
    ],
  },
  'prisma/prisma.service.ts': {
    why: "the widget layer's store client; its delegates are fenced by FR-1 below",
  },
  'prisma/prisma.module.ts': {
    why: "the store client's module",
    only: ['widgets.module.ts'],
  },
  'common/authenticated-user.interface.ts': {
    why: 'the type of the JWT-validated actor (D-9)',
  },
  'orchestration/c9.registry.ts': {
    why: 'the frozen C9 capability registry and its hash (values)',
  },
  'orchestration/c9.contract.ts': {
    why: 'C9 contract types (the principal)',
  },
  'ai-tools/ai-tool.catalog.ts': { why: 'the frozen AI tool catalogue' },
  'ai-tools/ai-tool.types.ts': { why: 'AI tool definition types' },
  'action-engine/action-engine.registry.ts': {
    why: 'the Action Engine capability registry: a plain class over static rows, constructed as a value (D-6 registries)',
  },
  'action-engine/action-engine.policy-registry.ts': {
    why: 'P-23 reads the canonical production policy definitions at registry load; a deterministic registry factory with no injected owner',
    only: [
      'authority/allowlist-startup.assert.ts',
      'owner-ports/gate6.owners.provider.ts',
    ],
  },
  'action-engine/action-engine.contract.ts': {
    why: 'Action Engine contract types',
  },
  'decorators/current-user.decorator.ts': {
    why: "the route's parameter decorator",
    only: ['widgets.controller.ts'],
  },
  'decorators/tenant-scoped.decorator.ts': {
    why: "the route's tenant metadata decorator",
    only: ['widgets.controller.ts'],
  },
  'entitlements/requires-feature.decorator.ts': {
    why: 'the entitlement that keeps the route dark (k3 check 8)',
    only: ['widgets.controller.ts'],
  },
};

/** Non-widget directories any widget file may import from. */
const NON_WIDGET_DIRECTORIES: Readonly<Record<string, Allowed>> = {
  'widget-contract/': {
    why: 'the widget contract: generated tables, registries and types',
  },
};

/** Packages a widget file may import. Closed, so a provider client or a second database client is refused. */
const PACKAGES: Readonly<Record<string, Allowed>> = {
  '@nestjs/common': { why: 'Nest decorators and the logger' },
  '@nestjs/swagger': {
    why: 'request documentation on the DTOs and the controller',
  },
  'class-validator': { why: 'DTO validation' },
  'node:crypto': { why: 'hashes, digests and random tokens' },
};

/** Non-widget modules only the boundary files may import: owner services and adapters. */
const OWNER_PORT_MODULES: Readonly<Record<string, Allowed>> = {
  'ai-tools/ai-tools.module.ts': {
    why: 'U12b canonical capability-read owner module',
    only: ['owner-ports/widget-owner-ports.module.ts'],
  },
  'ai-tools/ai-tool-runtime.service.ts': {
    why: 'U12b canonical capability-read call site',
    only: ['owner-ports/canonical-read.provider.ts'],
  },
  'measurement/measurement.module.ts': {
    why: 'U12b canonical measurement-read owner module',
    only: ['owner-ports/widget-owner-ports.module.ts'],
  },
  'valuation/c8.module.ts': {
    why: 'U12b canonical valuation-read owner module',
    only: ['owner-ports/widget-owner-ports.module.ts'],
  },
  'orchestration/c9.store.ts': {
    why: 'U12b canonical orchestrator-state read call site',
    only: ['owner-ports/canonical-read.provider.ts'],
  },
  'orchestration/c9.authority.ts': {
    why: "K1's principal resolver; the one call of `C9Authority.current` in the widget layer (P-PRINCIPAL)",
    only: ['owner-ports/principal.adapter.ts'],
  },
  'orchestration/c9.identity.ts': {
    why: "K3's `c9PrincipalHash`, imported and re-exported at the boundary so the layer has one import site for it",
    only: ['owner-ports/principal.adapter.ts'],
  },
  'tenancy/memberships.service.ts': {
    why: "B-02's in-transaction `FOR SHARE` role read (C11:7189-7191)",
    only: ['owner-ports/principal.adapter.ts'],
  },
  'orchestration/c9.module.ts': {
    why: "the C9 owner's module, so the boundary can resolve PRINCIPAL_RESOLVER",
    only: ['owner-ports/widget-owner-ports.module.ts'],
  },
  'tenancy/tenancy.module.ts': {
    why: "the tenancy owner's module, so the boundary can resolve the Membership read and TENANT_SCOPE",
    only: ['owner-ports/widget-owner-ports.module.ts'],
  },
  'tenancy/tenant-context.service.ts': {
    why: "Gate 4's tenancy owner: row 4 names TenantContextService.assertTenantId (C11:4723); reached only through the TENANT_SCOPE adapter",
    only: ['owner-ports/tenant-scope.provider.ts'],
  },
  'ai-tools/ai-tool-policy.service.ts': {
    why: "C20's owner: AiToolPolicyService.assertCanExecute, the 47 (C11:4761)",
    only: ['owner-ports/gate6.owners.provider.ts'],
  },
  'entitlements/entitlements.service.ts': {
    why: "(e)'s owner: EntitlementsService grants requiredFeatures (C11:4755)",
    only: ['owner-ports/gate6.owners.provider.ts'],
  },
  'ai-tools/ai-tool-policy.module.ts': {
    why: "C20's owner module, so the boundary can resolve GATE6_OWNERS (R6-2)",
    only: ['owner-ports/widget-owner-ports.module.ts'],
  },
  'entitlements/entitlements.module.ts': {
    why: "(e)'s owner module, so the boundary can resolve GATE6_OWNERS (R6-2)",
    only: ['owner-ports/widget-owner-ports.module.ts'],
  },
};

// ── the program ──────────────────────────────────────────────────────────────────────────────────

type RuleId =
  | 'D6-MODULE'
  | 'D6-SERVICE'
  | 'D6-CLOSED'
  | 'FR1-MODEL'
  | 'GATE-FILE'
  | 'G11-UNWRAP'
  | 'ARCH-12-1'
  | 'UNREADABLE';

interface Violation {
  readonly rule: RuleId;
  readonly at: string;
  readonly what: string;
}

const readOptions = (): ts.CompilerOptions => {
  const config = ts.readConfigFile(path.join(BE, 'tsconfig.json'), (f) =>
    ts.sys.readFile(f),
  );
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, BE);
  return { ...parsed.options, noEmit: true, incremental: false };
};
const OPTIONS = readOptions();

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const under = (file: string, dir: string): boolean =>
  path.resolve(file).startsWith(dir + path.sep);
const isWidgetSource = (file: string): boolean =>
  under(file, WIDGETS) && file.endsWith('.ts') && !file.endsWith('.spec.ts');
const posix = (p: string): string => p.split(path.sep).join('/');
const widgetKey = (file: string): string =>
  posix(path.relative(WIDGETS, path.resolve(file)));
const srcKey = (file: string): string =>
  posix(path.relative(SRC, path.resolve(file)));

/** Parsed once and shared by every program built here, so a mutant re-parses only the files it plants. */
const parsedFiles = new Map<string, ts.SourceFile>();
const baseHost = ts.createCompilerHost(OPTIONS, true);

/** The host each program was built over, so a resolution outside the program sees the same files. */
const hosts = new WeakMap<ts.Program, ts.CompilerHost>();

/** Files relative to the backend root: text replaces or adds the file, `null` removes it. */
type Overlay = Readonly<Record<string, string | null>>;

const programFor = (overlay: Overlay = {}): ts.Program => {
  const planted = new Map(
    Object.entries(overlay).map(([rel, text]) => [path.join(BE, rel), text]),
  );
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: (f) => {
      const text = planted.get(path.resolve(f));
      return text === undefined ? baseHost.fileExists(f) : text !== null;
    },
    readFile: (f) => {
      const text = planted.get(path.resolve(f));
      return text === undefined ? baseHost.readFile(f) : (text ?? undefined);
    },
    // A planted file may open a directory the disk does not have.
    directoryExists: (d) =>
      [...planted].some(
        ([f, text]) => text !== null && under(f, path.resolve(d)),
      ) ||
      (baseHost.directoryExists?.(d) ?? ts.sys.directoryExists(d)),
    getSourceFile: (f, language) => {
      const abs = path.resolve(f);
      const text = planted.get(abs);
      if (text !== undefined)
        return text === null
          ? undefined
          : ts.createSourceFile(f, text, language, true);
      const cached = parsedFiles.get(abs);
      if (cached) return cached;
      const source = baseHost.readFile(f);
      if (source === undefined) return undefined;
      const sf = ts.createSourceFile(f, source, language, true);
      parsedFiles.set(abs, sf);
      return sf;
    },
  };
  const roots = [...new Set([...walk(WIDGETS), ...planted.keys()])].filter(
    (f) => isWidgetSource(f) && planted.get(f) !== null,
  );
  const program = ts.createProgram({
    rootNames: roots,
    options: OPTIONS,
    host,
  });
  hosts.set(program, host);
  return program;
};

// ── reading imports ──────────────────────────────────────────────────────────────────────────────

interface Edge {
  readonly node: ts.Node;
  /** `null`: the module is not a string literal. */
  readonly spec: string | null;
  /** `null`: the module does not resolve. */
  readonly module: ts.Symbol | null;
  /** What the edge brings in: the named bindings, or every export when it names none. */
  readonly symbols: readonly ts.Symbol[];
}

type Target =
  | { readonly kind: 'widget'; readonly key: string }
  | { readonly kind: 'repo'; readonly key: string }
  | { readonly kind: 'package'; readonly name: string }
  | { readonly kind: 'outside'; readonly file: string };

class Reader {
  readonly checker: ts.TypeChecker;
  constructor(readonly program: ts.Program) {
    this.checker = program.getTypeChecker();
  }

  aliased(s: ts.Symbol | undefined): ts.Symbol | undefined {
    return s && s.flags & ts.SymbolFlags.Alias
      ? this.checker.getAliasedSymbol(s)
      : s;
  }

  widgetFiles(): ts.SourceFile[] {
    return this.program
      .getSourceFiles()
      .filter((s) => isWidgetSource(s.fileName))
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
  }

  line(s: ts.SourceFile, n: ts.Node): string {
    return `${widgetKey(s.fileName)}:${s.getLineAndCharacterOfPosition(n.getStart(s)).line + 1}`;
  }

  private moduleOf(spec: ts.StringLiteralLike, from: ts.SourceFile) {
    const bound = this.checker.getSymbolAtLocation(spec);
    if (bound && bound.flags & ts.SymbolFlags.Module) return bound;
    const resolved = ts.resolveModuleName(
      spec.text,
      from.fileName,
      OPTIONS,
      hosts.get(this.program) ?? ts.sys,
    ).resolvedModule;
    const target = resolved
      ? this.program.getSourceFile(resolved.resolvedFileName)
      : undefined;
    return (target && this.checker.getSymbolAtLocation(target)) ?? null;
  }

  edges(s: ts.SourceFile): Edge[] {
    const out: Edge[] = [];
    const every = (m: ts.Symbol): ts.Symbol[] =>
      this.checker
        .getExportsOfModule(m)
        .map((x) => this.aliased(x))
        .filter((x): x is ts.Symbol => x !== undefined);
    const add = (
      node: ts.Node,
      spec: ts.StringLiteralLike,
      named: ((m: ts.Symbol) => (ts.Symbol | undefined)[]) | null,
    ): void => {
      const module = this.moduleOf(spec, s);
      const symbols = module
        ? (named ? named(module) : every(module)).filter(
            (x): x is ts.Symbol => x !== undefined,
          )
        : [];
      out.push({ node, spec: spec.text, module, symbols });
    };
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const clause = n.importClause;
        add(
          n,
          n.moduleSpecifier,
          clause
            ? (m) => {
                const syms: (ts.Symbol | undefined)[] = [];
                if (clause.name)
                  syms.push(
                    this.aliased(this.checker.getSymbolAtLocation(clause.name)),
                  );
                const b = clause.namedBindings;
                if (b && ts.isNamespaceImport(b)) syms.push(...every(m));
                if (b && ts.isNamedImports(b))
                  for (const el of b.elements)
                    syms.push(
                      this.aliased(this.checker.getSymbolAtLocation(el.name)),
                    );
                return syms;
              }
            : null,
        );
      } else if (
        ts.isExportDeclaration(n) &&
        n.moduleSpecifier &&
        ts.isStringLiteral(n.moduleSpecifier)
      ) {
        const clause = n.exportClause;
        add(
          n,
          n.moduleSpecifier,
          clause && ts.isNamedExports(clause)
            ? () =>
                clause.elements.map((el) =>
                  this.aliased(
                    this.checker.getExportSpecifierLocalTargetSymbol(el),
                  ),
                )
            : null,
        );
      } else if (
        ts.isImportEqualsDeclaration(n) &&
        ts.isExternalModuleReference(n.moduleReference) &&
        ts.isStringLiteral(n.moduleReference.expression)
      ) {
        add(n, n.moduleReference.expression, null);
      } else if (
        ts.isCallExpression(n) &&
        (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(n.expression) && n.expression.text === 'require'))
      ) {
        const a = n.arguments[0];
        if (a && ts.isStringLiteralLike(a)) add(n, a, null);
        else out.push({ node: n, spec: null, module: null, symbols: [] });
      } else if (ts.isImportTypeNode(n)) {
        const a = n.argument;
        if (ts.isLiteralTypeNode(a) && ts.isStringLiteral(a.literal))
          add(n, a.literal, null);
        else out.push({ node: n, spec: null, module: null, symbols: [] });
      }
      ts.forEachChild(n, visit);
    };
    visit(s);
    return out;
  }

  target(edge: Edge): Target {
    const decl = edge.module?.declarations?.[0];
    const file = decl ? path.resolve(decl.getSourceFile().fileName) : '';
    if (under(file, WIDGETS)) return { kind: 'widget', key: widgetKey(file) };
    if (under(file, SRC)) return { kind: 'repo', key: srcKey(file) };
    if (file.includes(`${path.sep}node_modules${path.sep}`) || !decl)
      return { kind: 'package', name: packageName(edge.spec ?? '') };
    return { kind: 'outside', file };
  }

  /** The Nest decorator a class declaration carries (`Injectable`, `Controller`, `Module`), if any. */
  nestDecorator(decl: ts.Declaration): string | null {
    if (!ts.isClassDeclaration(decl)) return null;
    for (const d of ts.getDecorators(decl) ?? []) {
      const callee = ts.isCallExpression(d.expression)
        ? d.expression.expression
        : d.expression;
      const id = ts.isIdentifier(callee)
        ? callee
        : ts.isPropertyAccessExpression(callee)
          ? callee.name
          : null;
      if (!id) continue;
      const name =
        this.aliased(this.checker.getSymbolAtLocation(id))?.name ?? id.text;
      if (name === 'Injectable' || name === 'Controller' || name === 'Module')
        return name;
    }
    return null;
  }

  classKey(decl: ts.ClassDeclaration): string {
    const file = decl.getSourceFile().fileName;
    const key = under(file, WIDGETS) ? widgetKey(file) : srcKey(file);
    return `${key}#${decl.name?.text ?? 'default'}`;
  }

  /** The Prisma client member a symbol names, if it is one. */
  prismaMember(s: ts.Symbol | undefined): string | null {
    return s?.declarations?.some((d) => {
      const parent = d.parent;
      return (
        /[\\/]node_modules[\\/](?:\.prisma|@prisma)[\\/]client[\\/]/.test(
          d.getSourceFile().fileName,
        ) &&
        (ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent)) &&
        parent.name?.text === 'PrismaClient'
      );
    })
      ? s.name
      : null;
  }
}

const packageName = (spec: string): string =>
  spec.startsWith('@')
    ? spec.split('/').slice(0, 2).join('/')
    : spec.split('/')[0];

const isBoundaryFile = (key: string): boolean =>
  key.startsWith('owner-ports/') || key === 'projection/canonical-read.port.ts';

const MODELS = [
  ...fs
    .readFileSync(path.join(BE, 'prisma', 'schema.prisma'), 'utf8')
    .matchAll(/^model\s+(\w+)\s*\{/gm),
].map((m) => m[1]);
const DELEGATES = new Map(
  MODELS.map((m) => [m.charAt(0).toLowerCase() + m.slice(1), m]),
);

// ── the rules ────────────────────────────────────────────────────────────────────────────────────

interface Analysis {
  readonly violations: readonly Violation[];
  /** Each widget file's non-widget imports: repo module keys and package names. */
  readonly nonWidgetImports: ReadonlyMap<string, readonly string[]>;
  readonly gateFiles: readonly string[];
  readonly modules: ReadonlyMap<string, readonly string[]>;
}

const allowedFor = (importer: string, target: Target): Allowed | undefined => {
  let entry: Allowed | undefined;
  if (target.kind === 'package') entry = PACKAGES[target.name];
  if (target.kind === 'repo') {
    entry =
      NON_WIDGET_MODULES[target.key] ??
      (isBoundaryFile(importer) ? OWNER_PORT_MODULES[target.key] : undefined) ??
      Object.entries(NON_WIDGET_DIRECTORIES).find(([dir]) =>
        target.key.startsWith(dir),
      )?.[1];
  }
  return entry && (!entry.only || entry.only.includes(importer))
    ? entry
    : undefined;
};

/** The gate files: what a slot of the gateway's array calls into, and gate-named files. */
const gateFilesOf = (r: Reader): string[] => {
  const files = new Set<string>();
  const gateway = r
    .widgetFiles()
    .find((s) => widgetKey(s.fileName) === 'intent-gateway.service.ts');
  const visit = (n: ts.Node, inArray: boolean): void => {
    const array =
      inArray ||
      (ts.isPropertyDeclaration(n) &&
        n.name.getText() === 'gates' &&
        n.initializer !== undefined &&
        ts.isArrayLiteralExpression(n.initializer));
    if (array && ts.isIdentifier(n)) {
      const own = r.checker.getSymbolAtLocation(n);
      if (own && own.flags & ts.SymbolFlags.Alias)
        for (const d of r.aliased(own)?.declarations ?? [])
          if (isWidgetSource(d.getSourceFile().fileName))
            files.add(widgetKey(d.getSourceFile().fileName));
    }
    ts.forEachChild(n, (c) => visit(c, array));
  };
  if (gateway) visit(gateway, false);
  for (const s of r.widgetFiles()) {
    const key = widgetKey(s.fileName);
    if (
      key.startsWith('gates/') ||
      /(?:^|\/)gate[\w-]*\.ts$/.test(key) ||
      /\.gate\.ts$/.test(key)
    )
      files.add(key);
  }
  files.delete('intent-gateway.service.ts');
  return [...files].sort();
};

const analyse = (program: ts.Program): Analysis => {
  const r = new Reader(program);
  const violations: Violation[] = [];
  const push = (rule: RuleId, at: string, what: string): void => {
    violations.push({ rule, at, what });
  };
  const nonWidgetImports = new Map<string, string[]>();
  const gateFiles = gateFilesOf(r);
  const prismaUsers = new Map<string, string>();

  for (const s of r.widgetFiles()) {
    const key = widgetKey(s.fileName);
    const imports: string[] = [];
    nonWidgetImports.set(key, imports);

    for (const e of r.edges(s)) {
      const at = r.line(s, e.node);
      if (e.spec === null) {
        push(
          'UNREADABLE',
          at,
          'an import whose module is not a string literal',
        );
        continue;
      }
      if (e.module === null) {
        push('UNREADABLE', at, `'${e.spec}' does not resolve`);
        continue;
      }
      const target = r.target(e);
      if (target.kind === 'outside') {
        push('D6-CLOSED', at, `'${e.spec}' is outside src/`);
        continue;
      }
      if (target.kind !== 'widget') {
        const name = target.kind === 'repo' ? target.key : target.name;
        imports.push(name);
        if (!allowedFor(key, target))
          push(
            'D6-CLOSED',
            at,
            `${name} is not enumerated for ${key}` +
              (target.kind === 'repo' &&
              NON_WIDGET_MODULES[target.key]?.only !== undefined
                ? ` (only ${NON_WIDGET_MODULES[target.key].only?.join(', ')})`
                : ''),
          );
        if (
          key.startsWith('projection/') &&
          target.kind === 'repo' &&
          (target.key.startsWith('appointments/') ||
            target.key.startsWith('crm/') ||
            target.key === 'ai-tools/ai-tool-handler.service.ts')
        )
          push('ARCH-12-1', at, `the projection imports ${target.key}`);
      }
      for (const sym of e.symbols) {
        const name = sym.name;
        if (
          (name === 'unwrapHandle' || name === 'unwrapWitness') &&
          !key.startsWith('owner-ports/')
        )
          push('G11-UNWRAP', at, `${name} is imported outside owner-ports/`);
        for (const d of sym.declarations ?? []) {
          const kind = r.nestDecorator(d);
          if (
            !kind ||
            !ts.isClassDeclaration(d) ||
            isWidgetSource(d.getSourceFile().fileName)
          )
            continue;
          const cls = r.classKey(d);
          if (cls in STORE_CLIENT) {
            const only = STORE_CLIENT[cls];
            if (only !== null && only !== key)
              push(
                'D6-MODULE',
                at,
                `${cls} is imported by ${key}, not ${only}`,
              );
            if (gateFiles.includes(key))
              push('GATE-FILE', at, `the gate file ${key} imports ${cls}`);
            continue;
          }
          if (kind === 'Module') {
            if (!(
              key === PORTS_MODULE &&
              OWNER_MODULES.includes(cls) &&
              !NEVER_IMPORTED.includes(cls)
            ))
              push(
                'D6-MODULE',
                at,
                `${key} imports the non-widget module ${cls}`,
              );
          } else if (!(kind === 'Injectable' && isBoundaryFile(key)))
            push(
              'D6-SERVICE',
              at,
              `${key} imports the non-widget ${kind === 'Controller' ? 'controller' : 'service'} ${cls}`,
            );
        }
      }
    }

    // FR-1: the Prisma client members this file names.
    const visit = (n: ts.Node): void => {
      let member: string | null = null;
      if (ts.isPropertyAccessExpression(n))
        member = r.prismaMember(r.checker.getSymbolAtLocation(n.name));
      else if (
        ts.isElementAccessExpression(n) &&
        ts.isStringLiteralLike(n.argumentExpression)
      )
        member = r.prismaMember(
          r.checker.getSymbolAtLocation(n.argumentExpression),
        );
      else if (
        ts.isBindingElement(n) &&
        ts.isObjectBindingPattern(n.parent) &&
        !n.dotDotDotToken
      ) {
        const k = n.propertyName ?? n.name;
        const text =
          ts.isIdentifier(k) || ts.isStringLiteralLike(k) ? k.text : null;
        if (text !== null)
          member = r.prismaMember(
            r.checker.getTypeAtLocation(n.parent).getProperty(text),
          );
      }
      if (member !== null) {
        const at = r.line(s, n);
        prismaUsers.set(key, prismaUsers.get(key) ?? at);
        const model = DELEGATES.get(member);
        if (model !== undefined && !model.startsWith('Widget'))
          push('FR1-MODEL', at, `the ${model} delegate`);
        if (member === '$queryRawUnsafe' || member === '$executeRawUnsafe')
          push('FR1-MODEL', at, `${member}: a query no reader can see`);
        if (member === '$queryRaw' || member === '$executeRaw') {
          const tagged =
            ts.isTaggedTemplateExpression(n.parent) && n.parent.tag === n
              ? n.parent
              : null;
          if (!tagged)
            push('FR1-MODEL', at, `${member} is not a tagged template`);
          else
            for (const q of tagged.template
              .getText()
              .matchAll(/"([A-Za-z_]\w*)"/g))
              if (MODELS.includes(q[1]) && !q[1].startsWith('Widget'))
                push('FR1-MODEL', at, `${member} names "${q[1]}"`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(s);
  }

  for (const g of gateFiles)
    if (prismaUsers.has(g))
      push(
        'GATE-FILE',
        prismaUsers.get(g) ?? g,
        `the gate file ${g} references the Prisma client`,
      );

  // The widget @Modules: what each imports.
  const modules = new Map<string, string[]>();
  for (const s of r.widgetFiles()) {
    const key = widgetKey(s.fileName);
    const visit = (n: ts.Node): void => {
      if (ts.isClassDeclaration(n) && r.nestDecorator(n) === 'Module') {
        const d = (ts.getDecorators(n) ?? []).find((x) =>
          ts.isCallExpression(x.expression),
        );
        const arg =
          d && ts.isCallExpression(d.expression)
            ? d.expression.arguments[0]
            : undefined;
        const imports =
          arg && ts.isObjectLiteralExpression(arg)
            ? arg.properties.find(
                (p) =>
                  ts.isPropertyAssignment(p) && p.name.getText() === 'imports',
              )
            : undefined;
        const classes: string[] = [];
        modules.set(`${key}#${n.name?.text ?? 'default'}`, classes);
        if (!arg || !ts.isObjectLiteralExpression(arg))
          push('UNREADABLE', r.line(s, n), '@Module without an object literal');
        else if (
          imports &&
          !(
            ts.isPropertyAssignment(imports) &&
            ts.isArrayLiteralExpression(imports.initializer)
          )
        )
          push(
            'UNREADABLE',
            r.line(s, imports),
            'imports is not an array literal',
          );
        else if (imports && ts.isPropertyAssignment(imports))
          for (const el of (imports.initializer as ts.ArrayLiteralExpression)
            .elements) {
            let id: ts.Expression = el;
            if (ts.isCallExpression(el)) {
              const cb = el.arguments[0];
              if (
                ts.isIdentifier(el.expression) &&
                el.expression.text === 'forwardRef' &&
                cb &&
                ts.isArrowFunction(cb) &&
                !ts.isBlock(cb.body)
              )
                id = cb.body;
              else if (ts.isPropertyAccessExpression(el.expression))
                id = el.expression.expression;
            }
            const decl = ts.isIdentifier(id)
              ? r
                  .aliased(r.checker.getSymbolAtLocation(id))
                  ?.declarations?.find(ts.isClassDeclaration)
              : undefined;
            if (!decl) {
              push('UNREADABLE', r.line(s, el), `imports ${el.getText()}`);
              continue;
            }
            const cls = r.classKey(decl);
            classes.push(cls);
            const widget = isWidgetSource(decl.getSourceFile().fileName);
            const ok =
              key === WIDGETS_MODULE
                ? cls === BOUNDARY ||
                  cls === 'prisma/prisma.module.ts#PrismaModule' ||
                  cls === EMISSION_MODULE
                : key === PORTS_MODULE
                  ? !widget &&
                    OWNER_MODULES.includes(cls) &&
                    !NEVER_IMPORTED.includes(cls)
                  : widget;
            if (!ok)
              push(
                'D6-MODULE',
                r.line(s, el),
                `${key} imports ${cls} in @Module`,
              );
          }
      }
      ts.forEachChild(n, visit);
    };
    visit(s);
  }
  if (!modules.has(BOUNDARY))
    push(
      'D6-MODULE',
      PORTS_MODULE,
      'the owner-ports boundary module is missing',
    );

  return { violations, nonWidgetImports, gateFiles, modules };
};

const baseline = (() => {
  let cached: Analysis | undefined;
  return (): Analysis => (cached ??= analyse(programFor()));
})();

const readWidget = (rel: string): string =>
  fs.readFileSync(path.join(WIDGETS, rel), 'utf8');

// ── the tests ────────────────────────────────────────────────────────────────────────────────────

describe('D-6 — the union import-graph test: owners only through the owner-ports boundary', () => {
  it('reads the widget layer it guards: its files, its three modules, and the gate files the pipeline calls', () => {
    const a = baseline();
    expect(a.nonWidgetImports.size).toBeGreaterThan(40);
    expect([...a.modules.keys()].sort()).toEqual([
      EMISSION_MODULE,
      BOUNDARY,
      'widgets.module.ts#WidgetsModule',
    ]);
    expect(a.modules.get('widgets.module.ts#WidgetsModule')).toEqual([
      'prisma/prisma.module.ts#PrismaModule',
      BOUNDARY,
      EMISSION_MODULE,
    ]);
    expect(a.modules.get(EMISSION_MODULE)).toEqual([]);
    // P-PRINCIPAL binds the first port through the boundary: the two owner modules it needs, and no
    // more. The list is the same one `OWNER_MODULES` enumerates, read from the module itself.
    expect(a.modules.get(BOUNDARY)).toEqual([...OWNER_MODULES]);
    // Derived from the array, not listed: a slot's calls, including a helper that is not in gates/.
    expect(a.gateFiles).toEqual(
      expect.arrayContaining([
        'gates/gate5.ts',
        'gates/gate6.ts',
        'gates/gate7.ts',
        'gates/gate8r.ts',
        'gates/gate11.ts',
        'gates/gate13.ts',
        'token.util.ts',
      ]),
    );
    expect(a.gateFiles).not.toContain('stores/timeline.store.ts');
  }, 60_000);

  it('CONTROL: the widget layer as it stands breaks none of the rules', () => {
    expect(baseline().violations).toEqual([]);
  }, 60_000);

  it('the Prisma client delegates the widget layer uses are its own models, and the scan sees them', () => {
    // A scan that found no delegate at all would pass FR-1 vacuously, so the known uses must be seen.
    const program = programFor();
    const r = new Reader(program);
    const seen = new Set<string>();
    for (const s of r.widgetFiles()) {
      const visit = (n: ts.Node): void => {
        if (ts.isPropertyAccessExpression(n)) {
          const m = r.prismaMember(r.checker.getSymbolAtLocation(n.name));
          if (m) seen.add(`${widgetKey(s.fileName)}:${m}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(s);
    }
    expect([...seen]).toEqual(
      expect.arrayContaining([
        'intent-gateway.service.ts:widgetIntentRecord',
        'emission/emitter.service.ts:$transaction',
        'emission/emitter.service.ts:widgetEmission',
        'stores/timeline.store.ts:widgetTimelineTurn',
        'stores/timeline.store.ts:$executeRaw',
        'consent/erasure.job.ts:$transaction',
        'consent/erasure.job.ts:$executeRaw',
      ]),
    );
    expect(
      [...seen].every(
        (x) =>
          /:(?:widget\w+|\$transaction)$/.test(x) ||
          x === 'stores/timeline.store.ts:$executeRaw' ||
          x === 'consent/erasure.job.ts:$executeRaw',
      ),
    ).toBe(true);
  }, 60_000);

  it('CLOSED: every non-widget import is enumerated, and every enumerated entry is used', () => {
    const used = new Set([...baseline().nonWidgetImports.values()].flat());
    const enumerated = [
      ...Object.keys(NON_WIDGET_MODULES),
      ...Object.keys(PACKAGES),
    ];
    expect(enumerated.filter((e) => !used.has(e))).toEqual([]);
    expect(
      Object.keys(NON_WIDGET_DIRECTORIES).every((dir) =>
        [...used].some((u) => u.startsWith(dir)),
      ),
    ).toBe(true);
    expect(Object.keys(OWNER_PORT_MODULES)).toEqual([
      'ai-tools/ai-tools.module.ts',
      'ai-tools/ai-tool-runtime.service.ts',
      'measurement/measurement.module.ts',
      'valuation/c8.module.ts',
      'orchestration/c9.store.ts',
      'orchestration/c9.authority.ts',
      'orchestration/c9.identity.ts',
      'tenancy/memberships.service.ts',
      'orchestration/c9.module.ts',
      'tenancy/tenancy.module.ts',
      'tenancy/tenant-context.service.ts',
      'ai-tools/ai-tool-policy.service.ts',
      'entitlements/entitlements.service.ts',
      'ai-tools/ai-tool-policy.module.ts',
      'entitlements/entitlements.module.ts',
    ]);
  }, 60_000);

  it('DI-FREE: each enumerated non-widget module reaches no Nest DI class through its value imports', () => {
    const program = programFor();
    const r = new Reader(program);
    // Every enumerated module, and every contract module a widget file imports. The store client is
    // not DI-free by design; FR-1 fences it instead.
    const starts = [
      ...Object.keys(NON_WIDGET_MODULES).filter(
        (k) => !k.startsWith('prisma/'),
      ),
      ...new Set(
        [...baseline().nonWidgetImports.values()]
          .flat()
          .filter((k) =>
            Object.keys(NON_WIDGET_DIRECTORIES).some((d) => k.startsWith(d)),
          ),
      ),
    ];
    const found: string[] = [];
    const seen = new Set<string>();
    const queue = starts.map((k) => path.join(SRC, k));
    while (queue.length > 0) {
      const file = queue.shift() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      const s = program.getSourceFile(file);
      if (!s) {
        found.push(`${srcKey(file)} is not in the program`);
        continue;
      }
      ts.forEachChild(s, function visit(n: ts.Node): void {
        if (ts.isClassDeclaration(n) && r.nestDecorator(n))
          found.push(`${srcKey(file)}#${n.name?.text}`);
        ts.forEachChild(n, visit);
      });
      for (const st of s.statements) {
        const spec =
          ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)
            ? st.moduleSpecifier
            : ts.isExportDeclaration(st) &&
                st.moduleSpecifier &&
                ts.isStringLiteral(st.moduleSpecifier)
              ? st.moduleSpecifier
              : null;
        if (!spec) continue;
        const typeOnly = ts.isImportDeclaration(st)
          ? st.importClause !== undefined &&
            (st.importClause.isTypeOnly ||
              (st.importClause.name === undefined &&
                st.importClause.namedBindings !== undefined &&
                ts.isNamedImports(st.importClause.namedBindings) &&
                st.importClause.namedBindings.elements.length > 0 &&
                st.importClause.namedBindings.elements.every(
                  (e) => e.isTypeOnly,
                )))
          : (st as ts.ExportDeclaration).isTypeOnly;
        if (typeOnly) continue;
        const resolved = ts.resolveModuleName(
          spec.text,
          file,
          OPTIONS,
          ts.sys,
        ).resolvedModule;
        if (
          resolved &&
          !resolved.isExternalLibraryImport &&
          under(resolved.resolvedFileName, SRC)
        )
          queue.push(path.resolve(resolved.resolvedFileName));
      }
    }
    expect(seen.size).toBeGreaterThan(starts.length);
    expect(found).toEqual([]);
  }, 60_000);

  it('the enumerations are the ones k3 check 9 reads', () => {
    const script = fs.readFileSync(
      path.join(BE, 'scripts', 'k3-gateway-check.mjs'),
      'utf8',
    );
    const sf = ts.createSourceFile(
      'k3-gateway-check.mjs',
      script,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const values = new Map<string, string[]>();
    for (const st of sf.statements)
      if (ts.isVariableStatement(st))
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || !d.initializer) continue;
          const init = d.initializer;
          if (ts.isArrayLiteralExpression(init))
            values.set(
              d.name.text,
              init.elements.map((e) =>
                ts.isStringLiteralLike(e) ? e.text : `?${e.getText(sf)}`,
              ),
            );
          if (ts.isObjectLiteralExpression(init))
            values.set(
              d.name.text,
              init.properties.map(
                (p) =>
                  `${p.name && ts.isStringLiteralLike(p.name) ? p.name.text : '?'}=${ts.isPropertyAssignment(p) ? p.initializer.getText(sf) : '?'}`,
              ),
            );
        }
    expect(values.get('OWNER_MODULES')).toEqual([...OWNER_MODULES]);
    expect(values.get('NEVER_IMPORTED')).toEqual([...NEVER_IMPORTED]);
    expect(values.get('STORE_CLIENT')).toEqual(
      Object.entries(STORE_CLIENT).map(
        ([k, v]) =>
          `${k}=${v === null ? 'null' : v === WIDGETS_MODULE ? 'WIDGETS_MODULE' : `'${v}'`}`,
      ),
    );
    expect(values.get('BOUND_PORT_TOKENS')).toEqual([
      'CANONICAL_READ',
      'GATE6_OWNERS',
      'PRINCIPAL_RESOLVER',
      'TENANT_SCOPE',
    ]);
  });

  describe('each rule goes red on a planted violation (in memory; the repository is not edited)', () => {
    const W = 'src/widgets';
    const prepend = (rel: string, head: string): Overlay => ({
      [`${W}/${rel}`]: `${head}\n${readWidget(rel)}`,
    });
    const replace = (rel: string, from: string, to: string): Overlay => {
      const text = readWidget(rel);
      if (text.split(from).length !== 2)
        throw new Error(`${rel}: '${from}' is not unique`);
      return { [`${W}/${rel}`]: text.replace(from, to) };
    };
    const PORTS_IMPORT = "import { Module } from '@nestjs/common';";

    const mutants: ReadonlyArray<readonly [string, RuleId, () => Overlay]> = [
      [
        'a gate file imports an owner service',
        'D6-SERVICE',
        () =>
          prepend(
            'gates/gate5.ts',
            "import { MembershipsService } from '../../tenancy/memberships.service';\nexport type M = MembershipsService;",
          ),
      ],
      [
        'the gateway imports an owner service type-only',
        'D6-SERVICE',
        () =>
          prepend(
            'intent-gateway.service.ts',
            "import type { CrmService } from '../crm/crm.service';\nexport type C = CrmService;",
          ),
      ],
      [
        'a widget file re-exports an owner service',
        'D6-SERVICE',
        () => ({
          [`${W}/authority/owner-reexport.ts`]:
            "export { CrmService } from '../../crm/crm.service';\n",
        }),
      ],
      [
        'a namespace import of an owner service module',
        'D6-SERVICE',
        () =>
          prepend(
            'gates/gate7.ts',
            "import * as crm from '../../crm/crm.service';\nexport const owner = crm;",
          ),
      ],
      [
        'a dynamic import of an owner service module',
        'D6-SERVICE',
        () => ({
          [`${W}/routing/late-owner.ts`]:
            "export const late = () => import('../../crm/crm.service');\n",
        }),
      ],
      [
        'a require of an owner service module',
        'D6-SERVICE',
        () => ({
          [`${W}/routing/required-owner.ts`]:
            "export const owner: unknown = require('../../crm/crm.service');\n",
        }),
      ],
      [
        'an import type naming an owner service',
        'D6-SERVICE',
        () => ({
          [`${W}/gates/owner-type.ts`]:
            "export type Owner = import('../../crm/crm.service').CrmService;\n",
        }),
      ],
      [
        'a baseUrl specifier for an owner service',
        'D6-SERVICE',
        () =>
          prepend(
            'gates/gate11.ts',
            "import type { AppointmentsService } from 'src/appointments/appointments.service';\nexport type A = AppointmentsService;",
          ),
      ],
      [
        'a gate file imports a controller',
        'D6-SERVICE',
        () =>
          prepend(
            'gates/gate13.ts',
            "import type { AppController } from '../../app.controller';\nexport type K = AppController;",
          ),
      ],
      [
        'the owner-ports module imports an owner module it does not enumerate',
        'D6-MODULE',
        () =>
          replace(
            'owner-ports/widget-owner-ports.module.ts',
            `${PORTS_IMPORT}\n`,
            `${PORTS_IMPORT}\nimport { CrmModule } from '../../crm/crm.module';\n`,
          ),
      ],
      [
        'the owner-ports module imports the Action Engine module',
        'D6-MODULE',
        () => ({
          [`${W}/owner-ports/widget-owner-ports.module.ts`]: readWidget(
            'owner-ports/widget-owner-ports.module.ts',
          )
            .replace(
              `${PORTS_IMPORT}\n`,
              `${PORTS_IMPORT}\nimport { ActionEngineModule } from '../../action-engine/action-engine.module';\n`,
            )
            .replace('imports: [],', 'imports: [ActionEngineModule],'),
        }),
      ],
      [
        'the widget module imports an owner module through forwardRef',
        'D6-MODULE',
        () => ({
          [`${W}/widgets.module.ts`]: readWidget('widgets.module.ts')
            .replace(
              "import { Module } from '@nestjs/common';",
              "import { Module, forwardRef } from '@nestjs/common';\nimport { CrmModule } from '../crm/crm.module';",
            )
            .replace(
              'imports: [PrismaModule, WidgetOwnerPortsModule],',
              'imports: [PrismaModule, WidgetOwnerPortsModule, forwardRef(() => CrmModule)],',
            ),
        }),
      ],
      [
        'a second widget module imports an owner module, under an aliased decorator',
        'D6-MODULE',
        () => ({
          [`${W}/routing/widget-routing.module.ts`]:
            "import { Module as M } from '@nestjs/common';\nimport { C9Module } from '../../orchestration/c9.module';\n@M({ imports: [C9Module] })\nexport class WidgetRoutingModule {}\n",
        }),
      ],
      [
        'an owner-ports adapter imports an owner module',
        'D6-MODULE',
        () => ({
          [`${W}/owner-ports/crm.adapter.ts`]:
            "import { CrmModule } from '../../crm/crm.module';\nexport const m = CrmModule;\n",
        }),
      ],
      [
        'the store module imported outside the widget module',
        'D6-MODULE',
        () =>
          prepend(
            'stores/timeline.store.ts',
            "import { PrismaModule } from '../../prisma/prisma.module';\nexport const pm = PrismaModule;",
          ),
      ],
      [
        'a gate file imports a DI-free owner helper nobody enumerated',
        'D6-CLOSED',
        () =>
          prepend(
            'gates/gate6.ts',
            "import { maskPhone } from '../../common/phone.util';\nexport const mask = maskPhone;",
          ),
      ],
      [
        'a widget file imports a network client package',
        'D6-CLOSED',
        () => ({
          [`${W}/commerce/provider-call.ts`]:
            "import { request } from 'node:http';\nexport const call = request;\n",
        }),
      ],
      [
        'a controller-only decorator imported by a gate file',
        'D6-CLOSED',
        () =>
          prepend(
            'gates/gate8r.ts',
            "import { CurrentUser } from '../../decorators/current-user.decorator';\nexport const cu = CurrentUser;",
          ),
      ],
      [
        'an owner-ports adapter imports an owner service nobody enumerated (D-6 admits the service; the closed list does not)',
        'D6-CLOSED',
        () => ({
          [`${W}/owner-ports/crm.adapter.ts`]:
            "import { CrmService } from '../../crm/crm.service';\nexport type Crm = CrmService;\n",
        }),
      ],
      [
        'a store reads a canonical model through the client',
        'FR1-MODEL',
        () => ({
          [`${W}/stores/canonical-read.ts`]:
            "import type { PrismaService } from '../../prisma/prisma.service';\nexport const read = (p: PrismaService) => p.appointment.findMany();\n",
        }),
      ],
      [
        'a canonical delegate reached by element access on a transaction client',
        'FR1-MODEL',
        () => ({
          [`${W}/stores/tx-peek.ts`]:
            "import type { PrismaService } from '../../prisma/prisma.service';\nexport const peek = (p: PrismaService) => p.$transaction(async (tx) => tx['client'].findMany());\n",
        }),
      ],
      [
        'a canonical delegate destructured from the client',
        'FR1-MODEL',
        () =>
          replace(
            'intent-gateway.service.ts',
            'const row = await tx.widgetIntentRecord.findFirst({',
            'const { user } = this.prisma;\n    void user;\n    const row = await tx.widgetIntentRecord.findFirst({',
          ),
      ],
      [
        'an unsafe raw query',
        'FR1-MODEL',
        () =>
          replace(
            'intent-gateway.service.ts',
            'const row = await tx.widgetIntentRecord.findFirst({',
            "await this.prisma.$queryRawUnsafe('SELECT 1');\n    const row = await tx.widgetIntentRecord.findFirst({",
          ),
      ],
      [
        'a raw query naming a canonical table',
        'FR1-MODEL',
        () =>
          replace(
            'intent-gateway.service.ts',
            'const row = await tx.widgetIntentRecord.findFirst({',
            'await this.prisma.$queryRaw`SELECT * FROM "Appointment"`;\n    const row = await tx.widgetIntentRecord.findFirst({',
          ),
      ],
      [
        'a gate file imports the store client',
        'GATE-FILE',
        () =>
          prepend(
            'gates/gate5.ts',
            "import type { PrismaService } from '../../prisma/prisma.service';\nexport type P = PrismaService;",
          ),
      ],
      [
        'a module a slot calls into references the Prisma client',
        'GATE-FILE',
        () => ({
          [`${W}/token.util.ts`]: `${readWidget('token.util.ts')}\nimport type { PrismaService } from '../prisma/prisma.service';\nexport const peek = (p: PrismaService) => p.widgetIntentRecord;\n`,
        }),
      ],
      [
        'unwrapWitness imported outside owner-ports',
        'G11-UNWRAP',
        () => ({
          [`${W}/noun-resolution/noun-handles.ts`]:
            'export const unwrapWitness = (w: unknown): unknown => w;\n',
          [`${W}/gates/witness-peek.ts`]:
            "import { unwrapWitness } from '../noun-resolution/noun-handles';\nexport const peek = unwrapWitness;\n",
        }),
      ],
      [
        'the canonical-read port imports the CRM',
        'ARCH-12-1',
        () => ({
          [`${W}/projection/canonical-read.port.ts`]:
            "import type { CrmService } from '../../crm/crm.service';\nexport type Read = CrmService;\n",
        }),
      ],
      [
        'an import whose module is computed',
        'UNREADABLE',
        () => ({
          [`${W}/routing/computed-import.ts`]:
            "const where = '../../crm/crm.service';\nexport const late = () => import(where);\n",
        }),
      ],
      [
        // IR-K4K8-4: repointed from `gates/gate12.ts`, which IR-K4K8-1 deletes. `prepend` reads the
        // file off disk, so the old anchor would have thrown ENOENT and the case would have gone red
        // for the wrong reason — a mutant killed by a missing file proves nothing about the rule.
        'an import that does not resolve',
        'UNREADABLE',
        () =>
          prepend(
            'gates/gate11.ts',
            "import { gone } from './does-not-exist';\nexport const g = gone;",
          ),
      ],
    ];

    it.each(mutants)(
      'RED: %s -> %s',
      (_name, rule, overlay) => {
        const rules = analyse(programFor(overlay())).violations.map(
          (v) => v.rule,
        );
        expect(rules).toContain(rule);
        // Red for its own reason: a plant that stopped resolving would be red for the wrong one.
        if (rule !== 'UNREADABLE') expect(rules).not.toContain('UNREADABLE');
      },
      60_000,
    );

    it('an owner-ports adapter importing an owner service breaks D-6 only through the closed list, and canonical-read.port.ts is a boundary file too', () => {
      const adapter = analyse(
        programFor({
          [`${W}/owner-ports/crm.adapter.ts`]:
            "import { CrmService } from '../../crm/crm.service';\nexport type Crm = CrmService;\n",
          [`${W}/projection/canonical-read.port.ts`]:
            "import type { MeasurementReadService } from '../../measurement/measurement.read.service';\nexport type Read = MeasurementReadService;\n",
        }),
      ).violations.filter(
        (v) =>
          v.at.startsWith('owner-ports/crm.adapter.ts:') ||
          v.at.startsWith('projection/canonical-read.port.ts:'),
      );
      expect(adapter.map((v) => `${v.rule} ${v.at}`)).toEqual([
        'D6-CLOSED owner-ports/crm.adapter.ts:1',
        'D6-CLOSED projection/canonical-read.port.ts:1',
      ]);
    }, 60_000);
  });
});
