#!/usr/bin/env node
// K5 — the reproducible, refusing build (SHELL-PLAN v2.1 §2.1).
//
// Same sources in, byte-identical modules out, with digests anyone can recompute — and a build that
// REFUSES rather than emits whenever a boundary rule is broken. A rule that only runs in CI can be
// skipped; a build that refuses cannot.
//
//   node build.mjs                    gate, typecheck, emit dist/web, write dist/manifest.json
//   node build.mjs --check            the same into os.tmpdir(); fail if any digest or file hash moved
//   node build.mjs --self-test        every refuse fixture refused with its named rule, every admit
//                                     fixture admitted (test/fixtures/build/**), plus the write guard
//   node build.mjs --typecheck        steps 1-4 only
//   node build.mjs --dry-run          the whole pipeline into os.tmpdir(); print digests; write nothing
//   node build.mjs --target=capacitor emit dist/capacitor and run the three-part target proof (§1.10)
//   node build.mjs --no-baseline      additionally refuse while build-baseline/ exists (S8)
//
// Pipeline: 1 paths · 2 toolchain + contract declarations · 3 layered purity gate (a-m) ·
// 4 full typecheck · 5 guarded emit · 6 post-emit scan · 7 content addressing · 8 manifest ·
// 9 target · 10 no service worker (nothing here registers or emits one).
//
// index.html contract (entry/index.html): the module path is written with the literal placeholder
// `<webDigest16>` (e.g. `./m/<webDigest16>/entry/main.js`), and the meta CSP carries
// `connect-src 'self'` exactly once; the capacitor target substitutes that token.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── 1. paths ─────────────────────────────────────────────────────────────────────────────────────
// fileURLToPath, never URL.pathname: a percent-encoded pathname of a spaced or Cyrillic checkout is
// a different directory.
export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const CANON = path.resolve(ROOT, '..');
export const BE = path.join(CANON, 'maya-saas-backend');
export const TS_VERSION = '5.9.3';

/** Code-unit order. Never localeCompare: that made the digest depend on the build machine's LANG. */
export const codeUnitOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const posix = (p) => p.split(path.sep).join('/');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const isWithin = (dir, file) => {
  const r = path.relative(path.resolve(dir), path.resolve(file));
  return r !== '' && !r.startsWith('..') && !path.isAbsolute(r);
};

// ── rule tables (§1.2) ───────────────────────────────────────────────────────────────────────────

export const RULE_IDS = [
  'unknown-layer', // a file outside the known layers
  'literal-ban', // 3(a) N-1/N-2 literal values, after constant folding
  'identifier-ban', // 3(b) N-2 identifier and property names
  'property-ban', // 3(c) token-bearing property names in renderer/dom/routes (R-2)
  'type-assertion', // 3(c) no type assertion but `as const` in pure layers and dom
  'audience', // 3(d)
  'surface', // 3(e)
  'fetch-shape', // 3(f) N-1
  'layer-global', // 3(g) per-layer globals, entry document count, dom type/member/computed bans, H1
  'pure-typecheck', // 3(h) tsc -p tsconfig.pure.json (no DOM lib)
  'import-allowlist', // 3(i)
  'contract-collision', // 3(j) D8, V2-7
  'comment-lint', // 3(k)
  'k5-text', // 3(k) support: the words the K5 greps and the K15 census count, outside comments
  'dom-sink', // 3(l) N-3, V2-15
  'voice-capture', // V-1
  'baseline', // 3(m) V2-1
  'typecheck', // 4
  'program-files', // 4: nothing from maya-saas-backend/**/*.ts in the shell program
  'emit-guard', // 5
  'post-emit', // 6
  'target', // 7/9: index.html placeholders, endpoint substitution, capacitor proof
];

const LAYERS = ['routes', 'renderer', 'integrity', 'shell', 'net', 'voice', 'dom'];
const PURE_LAYERS = new Set(['routes', 'renderer', 'integrity', 'contract']);
const SPECIAL_MODULES = {
  'src/contract.ts': 'contract',
  'src/renderer/nodes.ts': 'renderer/nodes',
  'src/net/types.ts': 'net/types',
  'src/shell/ports.ts': 'shell/ports',
};

/**
 * 3(i). 'type' = only `import type {…}` / `export type {…} from` (clause level: an inline
 * `{ type X }` keeps a side-effect import under verbatimModuleSyntax).
 * Same-layer edges are admitted for every layer; they cannot cross a boundary.
 */
const IMPORT_ALLOW = {
  routes: { routes: 'any', contract: 'type' },
  integrity: { integrity: 'any', contract: 'type' },
  renderer: { renderer: 'any', 'renderer/nodes': 'any', routes: 'type', contract: 'type' },
  shell: {
    shell: 'any',
    'shell/ports': 'any',
    routes: 'any',
    'renderer/nodes': 'type',
    integrity: 'any',
    'net/types': 'type',
    contract: 'type',
  },
  net: { net: 'any', 'net/types': 'any', contract: 'type' },
  voice: { voice: 'any', 'shell/ports': 'type' },
  dom: { dom: 'any', 'renderer/nodes': 'type', routes: 'any', 'shell/ports': 'type' },
  entry: '*',
  contract: {},
};

/** 3(g). Beyond ES intrinsics. Pure layers additionally lose Date and Math.random. */
const GLOBAL_ALLOW = {
  routes: [],
  renderer: [],
  integrity: [],
  contract: [],
  net: ['fetch', 'AbortController', 'AbortSignal', 'Headers', 'setTimeout', 'clearTimeout'],
  voice: ['navigator', 'MediaRecorder', 'AudioContext', 'OfflineAudioContext', 'Blob', 'setTimeout', 'clearTimeout'],
  shell: ['crypto', 'setTimeout', 'clearTimeout'],
  dom: [],
  entry: ['document'],
};
// `Reflect` takes a property name as a VALUE, so no member, computed-key or sink rule below could see
// what it reaches (Reflect.get(el, 'owner' + 'Document'), Reflect.set(a, 'hr' + 'ef', u)). Nothing in
// the shell needs it; it is refused in every layer (integration finding, boundary lens).
const ALWAYS_REFUSED_GLOBALS = new Set(['globalThis', 'self', 'window', 'eval', 'Function', 'Reflect']);
/**
 * Reflective members of `Object` that hand out a property's getter/setter or rewrite a prototype. In
 * dom/ and entry/ they would reach a sink by a name no rule reads; elsewhere (net/, shell/) reading an
 * own data property of parsed JSON is legitimate and stays admitted.
 */
const REFLECTIVE_OBJECT_MEMBERS = new Set(['defineProperty', 'defineProperties', 'getOwnPropertyDescriptor', 'getOwnPropertyDescriptors', 'getPrototypeOf', 'setPrototypeOf']);

const RETIRED_VALUES = [
  'rt.malesthetic.pro',
  '/api/realtime',
  'api-proxy.php',
  '/ai/tools',
  '/ai/approvals',
  '/inbox',
  '__dev',
  'CHAT_PROXY',
  'transcribe_only',
  'X-Maya-Render-Profile',
  'X-Request-ID',
];
const ROUTE_FRAGMENTS = ['/api', '/ai/', '/auth/', '/widgets/'];
const BANNED_NAMES = new Set([
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'serviceWorker',
  'WebSocket',
  'EventSource',
  'speechSynthesis',
  'vmListen',
  'rtStart',
  'readback_ack',
  'sendBeacon',
  'cookie',
  // legacy accessor lookups: a setter reached by a string name (integration finding)
  '__lookupGetter__',
  '__lookupSetter__',
  '__defineGetter__',
  '__defineSetter__',
]);
const TOKEN_PROPERTIES = new Set([
  'intent_token',
  'token',
  'idempotency_key',
  'readback_ref',
  'envelope_seal',
  'principal_proof_hash',
  'tenant_id',
]);

/** N-1: the P1 allowlist. `/widgets/*` joins only with the unit that consumes R7-E1/E2 (B3). */
export const P1_PATHS = [
  '/auth/email/start',
  '/auth/email/verify',
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/ai/chat',
  '/ai/transcribe',
  '/widgets/intent',
  '/widgets/resolve',
];
export const TARGETS = {
  web: { apiBase: '/api', connectSrc: "'self'" },
  capacitor: { apiBase: 'https://mayaos.ru/api', connectSrc: "'self' https://mayaos.ru" },
};

const DOM_TAGS = new Set([
  'div', 'span', 'p', 'section', 'article', 'header', 'footer', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
  'button', 'textarea', 'label', 'nav', 'main', 'dialog', 'table', 'caption', 'thead', 'tbody', 'tr',
  'th', 'td', 'time', 'output', 'a',
]);
const DOM_INPUT_TYPES = new Set(['text', 'email', 'password']);
const DOM_SINKS = new Set(['src', 'srcset', 'href', 'action', 'formaction', 'poster', 'data', 'ping', 'background', 'xlink:href']);
const DOM_HTML_SINKS = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML']);
const DOM_STYLE_MEMBERS = new Set(['style', 'cssText', 'setProperty']);
const DOM_ACTIVATIONS = new Set(['click', 'submit', 'requestSubmit']);
// composedPath() ends at the Window for any event that reached the document (integration finding).
const DOM_BANNED_MEMBERS = new Set(['ownerDocument', 'defaultView', 'getRootNode', 'contentWindow', 'contentDocument', 'composedPath']);
const DOM_BANNED_TYPES = new Set([
  'Window', 'Document', 'Navigator', 'Location', 'History', 'Storage', 'XMLHttpRequest', 'WebSocket',
  'EventSource', 'ServiceWorkerContainer', 'CacheStorage',
]);

/** 3(k): the words the K5 greps and the K15 census read in raw text. */
const COMMENT_WORDS = [
  { re: /localStorage|sessionStorage|document\.cookie/, what: 'storage word' },
  { re: /me_is_staff|__meRole|__meIsStaff|__meIsMaster|__meIsFounder|__panelInfo/, what: 'K15 authority token' },
  { re: /isOwner|isStaff|roleMode|switchRole|__meCurMode/i, what: 'K5 role-mode word' },
  { re: /document\.(body|getElementById|querySelector)|appendChild\(|\.render\(document/, what: 'K5 self-mount pattern' },
];
const K5_TEXT_SRC = COMMENT_WORDS;
const K5_TEXT_ENTRY = COMMENT_WORDS.slice(0, 3);

/**
 * Names the certified contract text declares and the generated types do not yet export (R7-E1).
 * They AUGMENT the emitted export set, never replace it: a shell-local declaration would pre-empt
 * the erratum (D8).
 */
const CONTRACT_PENDING_NAMES = ['IntentReceipt'];

/**
 * 3(m). The ONLY admissible baseline entries. A baseline can shrink and never grow: an entry outside
 * this set, an entry in the wrong file, a stale entry and a duplicate are each a refusal.
 */
export const BASELINE_ADMISSIBLE = [
  { file: 'src/routes/registry.ts', rule: 'contract-collision', name: 'ShellRoute', removed_by: 'S1' },
  { file: 'src/routes/registry.ts', rule: 'type-assertion', name: 'ROUTES as Record<string, RouteDefinition | undefined>', removed_by: 'S1' },
  { file: 'src/renderer/render.ts', rule: 'contract-collision', name: 'A11yEnvironment', removed_by: 'S2' },
  { file: 'src/renderer/render.ts', rule: 'contract-collision', name: 'refKey', removed_by: 'S2' },
  { file: 'src/renderer/render.ts', rule: 'property-ban', name: 'RenderIntent.token', removed_by: 'S2' },
  { file: 'src/renderer/render.ts', rule: 'property-ban', name: 'RenderNode.token', removed_by: 'S2' },
  { file: 'src/renderer/render.ts', rule: 'property-ban', name: 'render.token', removed_by: 'S2' },
  { file: 'src/renderer/render.ts', rule: 'type-assertion', name: 'input.body as Record<string, unknown>', removed_by: 'S2' },
];
const BASELINE_FILES = {
  'build-baseline/routes.json': 'src/routes/registry.ts',
  'build-baseline/renderer.json': 'src/renderer/render.ts',
};
const BASELINE_RULES = new Set(['contract-collision', 'property-ban', 'type-assertion']);

// ── errors ───────────────────────────────────────────────────────────────────────────────────────

export class BuildRefused extends Error {
  constructor(refusals, log = []) {
    super(`build refused (${refusals.length})`);
    this.refusals = refusals;
    this.log = log;
  }
}
const refusal = (rule, file, line, name, message) => ({ rule, file, line, name, message });
export const formatRefusal = (r) => `${r.rule.padEnd(18)} ${r.file}${r.line ? `:${r.line}` : ''}  ${r.message}`;

// ── 2. toolchain and contract declarations ───────────────────────────────────────────────────────

export function loadTypeScript() {
  const dir = path.join(BE, 'node_modules', 'typescript');
  if (!fs.existsSync(path.join(dir, 'package.json')))
    throw new BuildRefused([refusal('typecheck', 'maya-saas-backend/node_modules/typescript', 0, '', 'TypeScript is not installed (npm --prefix maya-saas-backend ci)')]);
  const ts = createRequire(import.meta.url)(dir);
  if (ts.version !== TS_VERSION)
    throw new BuildRefused([refusal('typecheck', 'maya-saas-backend/node_modules/typescript', 0, '', `TypeScript ${ts.version}; the build requires exactly ${TS_VERSION}`)]);
  return ts;
}

/** A writeFile that refuses every path outside `outDir` (tsc once wrote 199 files into the backend). */
export function guardedWriter(outDir) {
  const root = path.resolve(outDir);
  const writes = [];
  const refused = [];
  const write = (fileName, data) => {
    const abs = path.resolve(fileName);
    if (!isWithin(root, abs)) {
      refused.push(abs);
      return;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
    writes.push(abs);
  };
  return { write, writes, refused };
}

/** Emit the certified contract's declarations into `tmp` and read its export names from them. */
export function emitContract(ts, tmp) {
  const configPath = path.join(BE, 'tsconfig.widget-contract.json');
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new BuildRefused([refusal('typecheck', 'maya-saas-backend/tsconfig.widget-contract.json', 0, '', ts.flattenDiagnosticMessageText(read.error.messageText, ' '))]);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, BE, undefined, configPath);
  const dir = fs.mkdtempSync(path.join(tmp, 'contract-'));
  const options = {
    ...parsed.options,
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    declarationMap: false,
    sourceMap: false,
    inlineSourceMap: false,
    incremental: false,
    composite: false,
    tsBuildInfoFile: undefined,
    declarationDir: undefined,
    outDir: dir,
    rootDir: path.join(BE, 'src'),
  };
  const program = ts.createProgram({ rootNames: parsed.fileNames, options });
  const guard = guardedWriter(dir);
  const result = program.emit(undefined, guard.write);
  const problems = [];
  for (const f of guard.refused) problems.push(refusal('emit-guard', f, 0, '', `contract declaration emit tried to write outside ${dir}`));
  for (const d of [...program.getSyntacticDiagnostics(), ...result.diagnostics])
    problems.push(refusal('typecheck', 'maya-saas-backend/src/widget-contract', 0, '', ts.flattenDiagnosticMessageText(d.messageText, ' ')));
  const index = path.join(dir, 'widget-contract', 'index.d.ts');
  if (!fs.existsSync(index)) problems.push(refusal('typecheck', 'maya-saas-backend/src/widget-contract', 0, '', 'no widget-contract/index.d.ts was emitted'));
  if (problems.length) throw new BuildRefused(problems);

  const lookup = ts.createProgram({ rootNames: [index], options: { noEmit: true, skipLibCheck: true, types: [], lib: ['lib.es2022.d.ts'] } });
  const checker = lookup.getTypeChecker();
  const exported = checker.getExportsOfModule(checker.getSymbolAtLocation(lookup.getSourceFile(index))).map((s) => s.name);
  const names = new Set([...exported, ...CONTRACT_PENDING_NAMES]);
  return { dir, index, names, exportCount: exported.length, writes: guard.writes.length };
}

// ── programs ─────────────────────────────────────────────────────────────────────────────────────

const sharedSourceFiles = new Map();

/**
 * A compiler host that never writes, shares parsed lib/contract files across programs, and can
 * overlay a virtual shell root (the self-test's fixtures; nothing of it exists on disk).
 */
function makeHost(ts, options, shared, virtual) {
  const host = ts.createCompilerHost(options, true);
  const base = {
    getSourceFile: host.getSourceFile.bind(host),
    fileExists: host.fileExists.bind(host),
    readFile: host.readFile.bind(host),
    directoryExists: host.directoryExists ? host.directoryExists.bind(host) : () => true,
  };
  const inVirtual = (f) => !!virtual && (path.resolve(f) === virtual.root || isWithin(virtual.root, f));
  const vget = (f) => virtual.files.get(path.resolve(f));
  host.fileExists = (f) => (inVirtual(f) ? vget(f) !== undefined : base.fileExists(f));
  host.readFile = (f) => (inVirtual(f) ? vget(f) : base.readFile(f));
  host.directoryExists = (d) => (inVirtual(d) ? [...virtual.files.keys()].some((k) => isWithin(d, k)) : base.directoryExists(d));
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    if (inVirtual(fileName)) {
      const text = vget(fileName);
      return text === undefined ? undefined : ts.createSourceFile(fileName, text, languageVersion, true);
    }
    const abs = path.resolve(fileName);
    if (!shared.some((dir) => isWithin(dir, abs))) return base.getSourceFile(fileName, languageVersion, onError, shouldCreate);
    const key = `${abs}\0${typeof languageVersion === 'object' ? JSON.stringify(languageVersion) : languageVersion}`;
    if (!sharedSourceFiles.has(key)) sharedSourceFiles.set(key, base.getSourceFile(fileName, languageVersion, onError, shouldCreate));
    return sharedSourceFiles.get(key);
  };
  host.writeFile = (f) => {
    throw new Error(`a gate or typecheck program attempted to write ${f}`);
  };
  return host;
}

function readTsconfig(ts, root, name) {
  const configPath = path.join(root, name);
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new BuildRefused([refusal('typecheck', name, 0, '', ts.flattenDiagnosticMessageText(read.error.messageText, ' '))]);
  return ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
}

/** tsconfig options + '#contract' mapped to the emitted declarations; hermetic (no @types). */
const shellOptions = (parsedOptions, contract) => ({ ...parsedOptions, noEmit: true, types: [], paths: { '#contract': [contract.index] } });
export const sharedDirs = (ts, contract) => [path.dirname(ts.getDefaultLibFilePath({ target: ts.ScriptTarget.ES2022 })), contract.dir];

// ── 3. the layered purity gate ───────────────────────────────────────────────────────────────────

export function layerOf(rel) {
  if (rel === 'src/contract.ts') return 'contract';
  if (rel.endsWith('.d.ts')) return null;
  const m = /^src\/([a-z]+)\/.+\.ts$/.exec(rel);
  if (m && LAYERS.includes(m[1])) return m[1];
  if (/^entry\/.+\.ts$/.test(rel)) return 'entry';
  return null;
}
const moduleKey = (rel) => SPECIAL_MODULES[rel] ?? layerOf(rel);

const skipOuter = (ts, n) => {
  let e = n;
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e))) e = e.expression;
  return e;
};

/** Constant-fold a `+` chain or template of string literals; null when any part is not a literal. */
export function foldString(ts, n) {
  if (!n) return null;
  if (ts.isParenthesizedExpression(n)) return foldString(ts, n.expression);
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = foldString(ts, n.left);
    const b = foldString(ts, n.right);
    return a === null || b === null ? null : a + b;
  }
  if (ts.isTemplateExpression(n)) {
    let s = n.head.text;
    for (const span of n.templateSpans) {
      const v = foldString(ts, span.expression);
      if (v === null) return null;
      s += v + span.literal.text;
    }
    return s;
  }
  return null;
}

/**
 * True when `node` (a member access) is written: the left side of any assignment operator, the operand
 * of ++/--, a for-in/of target, or an element or property value inside an array/object literal that is
 * itself an assignment target (`[a.href] = [u]`, `({ x: a.src } = o)`).
 */
export function isWriteTarget(ts, node) {
  let n = node;
  for (;;) {
    const p = n.parent;
    if (!p) return false;
    if (ts.isParenthesizedExpression(p) || ts.isNonNullExpression(p) || ts.isAsExpression(p) || ts.isSatisfiesExpression(p) || ts.isTypeAssertionExpression(p)) {
      n = p;
      continue;
    }
    if (ts.isBinaryExpression(p))
      return p.left === n && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
    if (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p))
      return p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken;
    if (ts.isForInStatement(p) || ts.isForOfStatement(p)) return p.initializer === n;
    if (ts.isArrayLiteralExpression(p) || ts.isSpreadElement(p) || ts.isSpreadAssignment(p)) {
      n = p;
      continue;
    }
    if (ts.isPropertyAssignment(p) && p.initializer === n && p.parent) {
      n = p.parent;
      continue;
    }
    return false;
  }
}

function propertyNameText(ts, name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) return foldString(ts, name.expression);
  return null;
}

function isModuleSpecifier(ts, node) {
  const p = node.parent;
  return (
    !!p &&
    (((ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) && p.moduleSpecifier === node) ||
      (ts.isExternalModuleReference(p) && p.expression === node) ||
      (ts.isLiteralTypeNode(p) && !!p.parent && ts.isImportTypeNode(p.parent)) ||
      (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword))
  );
}

/** True when an identifier is a value reference (not a declaration name, a member name or a type). */
export function isValueReference(ts, id) {
  const p = id.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isQualifiedName(p)) return false;
  if (
    (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) ||
      ts.isMethodSignature(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isEnumMember(p)) &&
    p.name === id
  )
    return false;
  if (ts.isBindingElement(p) && (p.propertyName === id || p.name === id)) return false;
  if (
    (ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) ||
      ts.isClassExpression(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isParameter(p) ||
      ts.isTypeParameterDeclaration(p) || ts.isEnumDeclaration(p) || ts.isModuleDeclaration(p) || ts.isImportClause(p) ||
      ts.isNamespaceImport(p) || ts.isImportEqualsDeclaration(p) || ts.isNamespaceExport(p)) &&
    p.name === id
  )
    return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p) || ts.isMetaProperty(p)) return false;
  for (let n = p; n; n = n.parent) {
    if (ts.isTypeNode(n)) {
      const classExtends = ts.isExpressionWithTypeArguments(n) && !!n.parent && ts.isHeritageClause(n.parent) &&
        n.parent.token === ts.SyntaxKind.ExtendsKeyword && !!n.parent.parent && ts.isClassLike(n.parent.parent);
      if (classExtends) break;
      return false;
    }
    if (ts.isStatement(n) || ts.isSourceFile(n) || ts.isFunctionLike(n)) break;
  }
  return true;
}

function topLevelName(ts, node) {
  let n = node;
  while (n.parent && !ts.isSourceFile(n.parent)) n = n.parent;
  if (ts.isVariableStatement(n)) {
    const ds = n.declarationList.declarations;
    const d = ds.find((x) => node.pos >= x.pos && node.end <= x.end) ?? ds[0];
    return d && ts.isIdentifier(d.name) ? d.name.text : '<module>';
  }
  if ((ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) ||
      ts.isEnumDeclaration(n) || ts.isModuleDeclaration(n)) && n.name) return n.name.text;
  return '<module>';
}

function collectComments(ts, sf) {
  const text = sf.getFullText();
  const seen = new Set();
  const out = [];
  const add = (ranges) => {
    for (const r of ranges ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      out.push({ pos: r.pos, end: r.end, text: text.slice(r.pos, r.end) });
    }
  };
  const visit = (n) => {
    add(ts.getLeadingCommentRanges(text, n.pos));
    add(ts.getTrailingCommentRanges(text, n.end));
    for (const c of n.getChildren(sf)) visit(c);
  };
  visit(sf);
  return out.sort((a, b) => a.pos - b.pos);
}

function bannedTypeName(type, isLibDecl, depth = 0) {
  if (!type || depth > 4) return null;
  if (type.isUnionOrIntersection())
    for (const t of type.types) {
      const r = bannedTypeName(t, isLibDecl, depth + 1);
      if (r) return r;
    }
  for (const s of [type.aliasSymbol, type.getSymbol()])
    if (s && DOM_BANNED_TYPES.has(s.getName()) && (s.declarations ?? []).some(isLibDecl)) return s.getName();
  return null;
}

/**
 * Run 3(a)-(g), 3(i)-(m) and V-1 over `files` (root-relative posix paths) of `program`.
 * ctx = { root, files, contract: {dir, names}, baseline: {entries, problems} }.
 * Returns { refusals, suppressed } — `suppressed` counts the sites the live baseline admitted.
 */
export function runGates(ts, program, ctx) {
  const { root, files, contract } = ctx;
  const checker = program.getTypeChecker();
  const out = [];
  const relOf = (fileName) => (isWithin(root, fileName) ? posix(path.relative(root, path.resolve(fileName))) : null);
  const isLibDecl = (d) => program.isSourceFileDefaultLibrary(d.getSourceFile());
  const isContractDecl = (d) => isWithin(contract.dir, d.getSourceFile().fileName);
  const esLib = (d) => /^lib\.(es\d|es20|esnext|decorators)/.test(path.basename(d.getSourceFile().fileName));
  const aliasTarget = (s) => (s && s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s);
  const entryDocumentRefs = [];
  let entryTsFiles = 0;
  const fetchSites = [];
  const present = new Set(files);

  for (const rel of files) {
    const sf = program.getSourceFile(path.join(root, rel));
    const layer = layerOf(rel);
    if (!layer) {
      out.push(refusal('unknown-layer', rel, 0, '', 'not a file of any known layer (src/<routes|renderer|integrity|shell|net|voice|dom>/**, src/contract.ts, entry/**)'));
      continue;
    }
    if (!sf) {
      out.push(refusal('typecheck', rel, 0, '', 'not part of the program'));
      continue;
    }
    if (layer === 'entry') entryTsFiles += 1;
    const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const refuse = (rule, node, name, message) => out.push(refusal(rule, rel, node ? lineOf(node) : 0, name, message));
    const isPure = PURE_LAYERS.has(layer);
    // The K5 greps read raw text; a raw control character makes grep treat the whole file as binary
    // and print "Binary file … matches" instead of the line (integration finding). Write it as an escape.
    sf.getFullText().split('\n').forEach((ln, i) => {
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(ln))
        out.push(refusal('k5-text', rel, i + 1, '', 'a raw control character (NUL, …) makes grep read this file as binary, so the K5 greps would not see its lines; write it as an escape'));
    });
    const inReplyLink = (node) => {
      if (rel !== 'src/dom/timeline.ts') return false;
      for (let n = node.parent; n; n = n.parent)
        if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isVariableDeclaration(n)) && n.name && ts.isIdentifier(n.name) && n.name.text === 'renderReplyLink') return true;
      return false;
    };

    // 3(i) the contract module holds only `export type {…} from '#contract'`
    if (layer === 'contract')
      for (const st of sf.statements) {
        const ok = ts.isExportDeclaration(st) && st.isTypeOnly && !!st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) &&
          st.moduleSpecifier.text === '#contract' && !!st.exportClause && ts.isNamedExports(st.exportClause) &&
          st.exportClause.elements.every((e) => !e.propertyName);
        if (!ok) refuse('import-allowlist', st, '', "src/contract.ts may hold only `export type { … } from '#contract'` (no alias)");
      }

    // 3(k) comments; and the same K5/K15 words outside comments
    const comments = collectComments(ts, sf);
    for (const c of comments)
      for (const w of COMMENT_WORDS)
        if (w.re.test(c.text)) out.push(refusal('comment-lint', rel, sf.getLineAndCharacterOfPosition(c.pos).line + 1, '', `a comment names a ${w.what} that the K5 greps / K15 census count`));
    {
      const full = sf.getFullText();
      let code = '';
      let at = 0;
      for (const c of comments) {
        code += full.slice(at, c.pos) + full.slice(c.pos, c.end).replace(/[^\n]/g, ' ');
        at = c.end;
      }
      code += full.slice(at);
      const words = layer === 'entry' ? K5_TEXT_ENTRY : K5_TEXT_SRC;
      code.split('\n').forEach((ln, i) => {
        for (const w of words) if (w.re.test(ln)) out.push(refusal('k5-text', rel, i + 1, '', `code names a ${w.what} that the K5 greps / K15 census count`));
      });
    }

    const checkValue = (value, at, exempt) => {
      for (const bad of RETIRED_VALUES)
        if (value.toLowerCase().includes(bad.toLowerCase())) refuse('literal-ban', at, bad, `retired value "${bad}" (N-2)`);
      if (!exempt)
        for (const frag of ROUTE_FRAGMENTS)
          if (value.includes(frag)) refuse('literal-ban', at, frag, `"${frag}" outside API_BASE (net/endpoint.ts) and PATHS (net/client.ts) (N-1)`);
    };
    const routeExempt = (lit) => {
      const p = lit.parent;
      if (rel === 'src/net/endpoint.ts' && p && ts.isVariableDeclaration(p) && p.initializer === lit && ts.isIdentifier(p.name) && p.name.text === 'API_BASE') return true;
      if (rel === 'src/net/client.ts' && p && ts.isPropertyAssignment(p) && p.initializer === lit) {
        const o = p.parent;
        let d = o?.parent;
        while (d && (ts.isAsExpression(d) || ts.isSatisfiesExpression(d) || ts.isParenthesizedExpression(d))) d = d.parent;
        if (o && ts.isObjectLiteralExpression(o) && d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.name.text === 'PATHS') return true;
      }
      return false;
    };

    const visit = (node) => {
      // ── 3(a) literal values ──────────────────────────────────────────────────────────────
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isModuleSpecifier(ts, node)) checkValue(node.text, node, routeExempt(node));
      if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) checkValue(node.text, node, false);
      if ((ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) || ts.isTemplateExpression(node)) {
        let up = node.parent;
        while (up && ts.isParenthesizedExpression(up)) up = up.parent;
        const nested = !!up && ts.isBinaryExpression(up) && up.operatorToken.kind === ts.SyntaxKind.PlusToken;
        if (!nested) {
          const folded = foldString(ts, node);
          if (folded !== null) checkValue(folded, node, false);
        }
      }

      // ── 3(b) identifier and property-name bans ───────────────────────────────────────────
      if ((ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) && BANNED_NAMES.has(node.text)) refuse('identifier-ban', node, node.text, `"${node.text}" is banned in the bundle (N-2)`);
      if (ts.isStringLiteral(node) && BANNED_NAMES.has(node.text) && node.parent) {
        const p = node.parent;
        const asName = ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === node) ||
          (ts.isElementAccessExpression(p) && p.argumentExpression === node) || ts.isComputedPropertyName(p) ||
          (ts.isBindingElement(p) && p.propertyName === node) || (ts.isLiteralTypeNode(p) && !!p.parent && ts.isIndexedAccessTypeNode(p.parent));
        if (asName) refuse('identifier-ban', node, node.text, `"${node.text}" is banned as a property name (N-2)`);
      }
      if (ts.isElementAccessExpression(node) && !ts.isStringLiteral(node.argumentExpression)) {
        const k = foldString(ts, node.argumentExpression);
        if (k !== null && BANNED_NAMES.has(k)) refuse('identifier-ban', node, k, `"${k}" is banned as a computed property name (N-2)`);
      }

      // ── 3(c) token-bearing property names; type assertions ───────────────────────────────
      if (layer === 'renderer' || layer === 'dom' || layer === 'routes') {
        let prop = null;
        if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node) || ts.isMethodSignature(node) ||
            ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) prop = propertyNameText(ts, node.name);
        else if (ts.isShorthandPropertyAssignment(node)) prop = node.name.text;
        else if (ts.isBindingElement(node) && node.parent && ts.isObjectBindingPattern(node.parent))
          prop = node.propertyName ? propertyNameText(ts, node.propertyName) : ts.isIdentifier(node.name) ? node.name.text : null;
        if (prop !== null && TOKEN_PROPERTIES.has(prop)) {
          const site = `${topLevelName(ts, node)}.${prop}`;
          refuse('property-ban', node, site, `token-bearing property "${prop}" in ${layer}/ (R-2, D1) [${site}]`);
        }
      }
      if (isPure || layer === 'dom') {
        if (ts.isAsExpression(node)) {
          const t = node.type;
          const isConst = ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && t.typeName.text === 'const';
          if (!isConst) {
            const site = node.getText(sf).replace(/\s+/g, ' ');
            refuse('type-assertion', node, site, `type assertion in ${layer}/ (only \`as const\`): ${site}`);
          }
        }
        if (ts.isTypeAssertionExpression(node)) {
          const site = node.getText(sf).replace(/\s+/g, ' ');
          refuse('type-assertion', node, site, `type assertion in ${layer}/: ${site}`);
        }
      }

      // ── 3(d) audience ────────────────────────────────────────────────────────────────────
      if (layer === 'net' || layer === 'shell' || layer === 'voice' || layer === 'entry') {
        if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && propertyNameText(ts, node.name) === 'audience')
          refuse('audience', node, 'audience', 'object-literal key "audience" (D4, N-2)');
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === 'audience' && !isModuleSpecifier(ts, node))
          refuse('audience', node, 'audience', "literal 'audience' (D4, N-2)");
      }

      // ── 3(e) surface ─────────────────────────────────────────────────────────────────────
      if (layer === 'net') {
        if (ts.isPropertyAssignment(node) && propertyNameText(ts, node.name) === 'surface') {
          const init = skipOuter(ts, node.initializer);
          if (!((ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) && init.text === 'web'))
            refuse('surface', node, 'surface', "`surface` must be exactly the literal 'web' (NT3)");
        }
        if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'surface')
          refuse('surface', node, 'surface', "`surface` must be exactly the literal 'web' (NT3)");
      }

      // ── 3(g) globals; 3(f) fetch call sites ──────────────────────────────────────────────
      if (ts.isIdentifier(node) && isValueReference(ts, node)) {
        const p = node.parent;
        const sym = ts.isShorthandPropertyAssignment(p) && p.name === node ? checker.getShorthandAssignmentValueSymbol(p) : checker.getSymbolAtLocation(node);
        const name = node.text;
        const decls = sym?.declarations ?? [];
        const local = (!!sym && (sym.flags & ts.SymbolFlags.Alias) !== 0) || decls.some((d) => !isLibDecl(d));
        if (!local && (decls.length > 0 || ALWAYS_REFUSED_GLOBALS.has(name))) {
          const isES = decls.length > 0 && decls.some(esLib);
          if (ALWAYS_REFUSED_GLOBALS.has(name)) refuse('layer-global', node, name, `"${name}" is refused in every layer`);
          else if (isPure) {
            if (!isES) refuse('layer-global', node, name, `host global "${name}" in pure layer ${layer}/ (R-1)`);
            else if (name === 'Date') refuse('layer-global', node, name, `clock "Date" in pure layer ${layer}/ (R-1)`);
            else if (name === 'Math' && ts.isPropertyAccessExpression(p) && p.expression === node && p.name.text === 'random')
              refuse('layer-global', node, 'Math.random', `entropy "Math.random" in pure layer ${layer}/ (R-1)`);
          } else if (!isES && !GLOBAL_ALLOW[layer].includes(name)) {
            refuse('layer-global', node, name, `global "${name}" is not allowed in ${layer}/ (D5)`);
          } else if (name === 'document' && layer === 'entry') {
            entryDocumentRefs.push({ rel, line: lineOf(node) });
          } else if (name === 'navigator' && layer === 'voice') {
            const okPath = ts.isPropertyAccessExpression(p) && p.expression === node && p.name.text === 'mediaDevices' &&
              (!ts.isPropertyAccessExpression(p.parent) || p.parent.expression !== p || p.parent.name.text === 'getUserMedia');
            if (!okPath) refuse('layer-global', node, name, 'voice/ reaches navigator only as navigator.mediaDevices[.getUserMedia] (V-1)');
          } else if (name === 'crypto' && layer === 'shell') {
            const okPath = ts.isPropertyAccessExpression(p) && p.expression === node && p.name.text === 'randomUUID';
            if (!okPath) refuse('layer-global', node, name, 'shell/ reaches crypto only as crypto.randomUUID');
          }
          if (name === 'fetch') {
            const called = ts.isCallExpression(p) && p.expression === node;
            if (rel !== 'src/net/client.ts') refuse('fetch-shape', node, 'fetch', 'fetch is called only in src/net/client.ts (N-1)');
            else if (!called) refuse('fetch-shape', node, 'fetch', 'fetch may only be called, never passed or aliased (N-1)');
            else fetchSites.push(p);
          }
        }
      }

      // H1: src/** never appends by itself
      if (rel.startsWith('src/') && ts.isPropertyAccessExpression(node) && node.name.text === 'appendChild')
        refuse('layer-global', node, 'appendChild', 'src/** never names appendChild (H1)');

      // dom/: member, computed-access and type bans (D5)
      if (layer === 'dom') {
        let memberName = null;
        if (ts.isPropertyAccessExpression(node)) memberName = node.name.text;
        else if (ts.isElementAccessExpression(node)) memberName = foldString(ts, node.argumentExpression);
        else if (ts.isBindingElement(node) && node.parent && ts.isObjectBindingPattern(node.parent)) memberName = propertyNameText(ts, node.propertyName ?? node.name);
        if (memberName !== null && DOM_BANNED_MEMBERS.has(memberName)) refuse('layer-global', node, memberName, `dom/ may not reach "${memberName}" (D5)`);
        if (memberName !== null && REFLECTIVE_OBJECT_MEMBERS.has(memberName)) refuse('layer-global', node, memberName, `dom/ may not use "${memberName}": it reaches a property by a name no rule reads`);
        if (ts.isPropertyAccessExpression(node) && node.name.text === 'view') {
          const s = checker.getSymbolAtLocation(node.name);
          if (s && (s.declarations ?? []).some(isLibDecl)) refuse('layer-global', node, 'view', 'dom/ may not reach an event\'s "view" (D5)');
        }
        if (ts.isElementAccessExpression(node)) {
          const a = node.argumentExpression;
          if (!(ts.isStringLiteral(a) || ts.isNumericLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)))
            refuse('layer-global', node, 'computed', 'dom/ may not use a computed element access with a non-literal key (D5)');
        }
        if ((ts.isIdentifier(node) && isValueReference(ts, node)) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node)) {
          const banned = bannedTypeName(checker.getTypeAtLocation(node), isLibDecl);
          if (banned) refuse('layer-global', node, banned, `dom/ may not hold an expression typed ${banned} (D5)`);
        }
      }

      // ── 3(i) imports ─────────────────────────────────────────────────────────────────────
      const checkEdge = (spec, typeOnly, at) => {
        if (spec === '#contract') {
          if (rel !== 'src/contract.ts') refuse('import-allowlist', at, spec, "only src/contract.ts may name '#contract' (D8)");
          return;
        }
        if (rel === 'src/contract.ts') return refuse('import-allowlist', at, spec, "src/contract.ts re-exports '#contract' only");
        if (!spec.startsWith('./') && !spec.startsWith('../')) return refuse('import-allowlist', at, spec, `non-relative import "${spec}" (the shell has no dependencies)`);
        if (!spec.endsWith('.ts') || spec.endsWith('.d.ts')) return refuse('import-allowlist', at, spec, `relative import "${spec}" must name a .ts module`);
        const targetAbs = path.resolve(path.dirname(path.join(root, rel)), spec);
        const target = isWithin(root, targetAbs) ? posix(path.relative(root, targetAbs)) : null;
        const key = target ? moduleKey(target) : null;
        if (!key) return refuse('import-allowlist', at, spec, `"${spec}" leaves the shell's layers`);
        const allow = IMPORT_ALLOW[layer];
        if (allow === '*') return;
        const mode = allow[key] ?? allow[key.split('/')[0]];
        if (!mode) refuse('import-allowlist', at, spec, `${layer}/ may not import ${key} (§1.2)`);
        else if (mode === 'type' && !typeOnly) refuse('import-allowlist', at, spec, `${layer}/ may import ${key} for types only (clause-level \`import type\`)`);
      };
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) checkEdge(node.moduleSpecifier.text, !!node.importClause?.isTypeOnly, node);
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && rel !== 'src/contract.ts')
        checkEdge(node.moduleSpecifier.text, node.isTypeOnly, node);
      if (ts.isImportEqualsDeclaration(node)) refuse('import-allowlist', node, '', 'import = require is refused');
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) refuse('import-allowlist', node, 'import()', 'dynamic import() is refused (R-1)');
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') refuse('import-allowlist', node, 'require', 'require() is refused');
      if (ts.isImportTypeNode(node)) refuse('import-allowlist', node, '', 'import("…") types are refused; use import type');

      // ── 3(j) contract-name collisions (types and values) ────────────────────────────────
      const collide = (id, what) => {
        if (id && ts.isIdentifier(id) && contract.names.has(id.text)) refuse('contract-collision', id, id.text, `${what} "${id.text}" collides with a contract export (D8, V2-7)`);
      };
      if (ts.isInterfaceDeclaration(node)) collide(node.name, 'interface');
      if (ts.isTypeAliasDeclaration(node)) collide(node.name, 'type');
      if (ts.isClassDeclaration(node)) collide(node.name, 'class');
      if (ts.isEnumDeclaration(node)) collide(node.name, 'enum');
      if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) collide(node.name, 'namespace');
      if (ts.isFunctionDeclaration(node)) collide(node.name, 'function');
      if ((ts.isVariableDeclaration(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name)) collide(node.name, 'binding');
      const fromContract = (s, spec) =>
        !!s && (aliasTarget(s)?.declarations ?? []).some(isContractDecl) && (!spec.propertyName || propertyNameText(ts, spec.propertyName) === spec.name.text);
      if (ts.isExportSpecifier(node) && contract.names.has(node.name.text) && rel !== 'src/contract.ts' && !fromContract(checker.getExportSpecifierLocalTargetSymbol(node), node))
        refuse('contract-collision', node, node.name.text, `export name "${node.name.text}" collides with a contract export (V2-7)`);
      if (ts.isImportSpecifier(node) && contract.names.has(node.name.text) && !fromContract(checker.getSymbolAtLocation(node.name), node))
        refuse('contract-collision', node, node.name.text, `import binding "${node.name.text}" collides with a contract export (V2-7)`);

      // ── V-1 getUserMedia ─────────────────────────────────────────────────────────────────
      if ((ts.isIdentifier(node) && node.text === 'getUserMedia') || (ts.isStringLiteral(node) && node.text === 'getUserMedia')) {
        const pa = node.parent;
        const shapeOk = ts.isIdentifier(node) && !!pa && ts.isPropertyAccessExpression(pa) && pa.name === node &&
          ts.isPropertyAccessExpression(pa.expression) && pa.expression.name.text === 'mediaDevices' &&
          ts.isIdentifier(pa.expression.expression) && pa.expression.expression.text === 'navigator';
        let gestured = false;
        for (let n = node.parent; n; n = n.parent)
          if (ts.isFunctionLike(n)) {
            gestured = n.parameters.some((prm) => {
              if (!prm.type) return false;
              const t = checker.getTypeFromTypeNode(prm.type);
              const s = t.aliasSymbol ?? t.getSymbol();
              return !!s && s.getName() === 'GestureProof' && (s.declarations ?? []).some((d) => relOf(d.getSourceFile().fileName) === 'src/shell/ports.ts');
            });
            break;
          }
        if (!(rel === 'src/voice/capture.ts' && shapeOk && gestured))
          refuse('voice-capture', node, 'getUserMedia', 'getUserMedia only as navigator.mediaDevices.getUserMedia in src/voice/capture.ts, inside a function taking a GestureProof (V-1, V7)');
      }

      // ── 3(l) DOM request sinks ───────────────────────────────────────────────────────────
      // dom/ gets the whole of N-3. entry/ builds the ports and legitimately holds the page, so it keeps
      // its reads (location.href) and its style custom property, but it may not WRITE a request sink, use
      // an HTML sink, activate an element, or reach a property reflectively either (integration finding:
      // `page.createElement('img').src = u`, `Reflect.get(w, 'local' + 'Storage')` were admitted there).
      if (layer === 'dom' || layer === 'entry') {
        const where = `${layer}/`;
        if (layer === 'dom' && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['create', 'createInput'].includes(node.expression.name.text)) {
          const decls = checker.getSymbolAtLocation(node.expression.name)?.declarations ?? [];
          const isFactory = decls.some((d) => ts.isMethodSignature(d) && ts.isInterfaceDeclaration(d.parent) && d.parent.name.text === 'DomFactory');
          if (isFactory || decls.length === 0) {
            const which = node.expression.name.text;
            const arg = node.arguments[0];
            const set = which === 'create' ? DOM_TAGS : DOM_INPUT_TYPES;
            if (!arg || !(ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)))
              refuse('dom-sink', node, which, `DomFactory.${which} takes a literal from the closed set (N-3)`);
            else if (!set.has(arg.text)) refuse('dom-sink', node, arg.text, `"${arg.text}" is not in the closed DomFactory.${which} set (N-3)`);
          }
        }
        const member = ts.isPropertyAccessExpression(node) ? node.name.text : ts.isElementAccessExpression(node) ? foldString(ts, node.argumentExpression) : null;
        if (member !== null && DOM_SINKS.has(member.toLowerCase()) && !(member === 'href' && inReplyLink(node))) {
          // dom/ has no business with a sink member at all: any access, read or write, plain or
          // destructuring (`[a.href] = [u]`). entry/ may read one (location.href) and never write it.
          if (layer === 'dom') refuse('dom-sink', node, member, `request sink member "${member}" in dom/ (N-3)`);
          else if (isWriteTarget(ts, node)) refuse('dom-sink', node, member, `write to request sink "${member}" in entry/ (N-3)`);
        }
        // attribute maps: any object literal naming a request or HTML sink — handed to a call
        // (Object.assign(el, {…})) or kept in a variable first
        if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) &&
            node.parent && ts.isObjectLiteralExpression(node.parent)) {
          const k = propertyNameText(ts, node.name);
          if (k !== null && (DOM_SINKS.has(k.toLowerCase()) || DOM_HTML_SINKS.has(k)) && !(k === 'href' && inReplyLink(node)))
            refuse('dom-sink', node, k, `object literal names sink "${k}" in ${where} (N-3)`);
        }
        if (member !== null && DOM_HTML_SINKS.has(member)) refuse('dom-sink', node, member, `"${member}" is refused in ${where} (N-3)`);
        if (layer === 'dom' && member !== null && DOM_STYLE_MEMBERS.has(member)) refuse('dom-sink', node, member, `style surface "${member}" in dom/ — classList only (N-3)`);
        if (layer === 'entry') {
          let name = member;
          if (name === null && ts.isBindingElement(node) && node.parent && ts.isObjectBindingPattern(node.parent)) name = propertyNameText(ts, node.propertyName ?? node.name);
          if (name !== null && REFLECTIVE_OBJECT_MEMBERS.has(name)) refuse('layer-global', node, name, `entry/ may not use "${name}": it reaches a property by a name no rule reads`);
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const callee = node.expression.name.text;
          if (DOM_ACTIVATIONS.has(callee)) refuse('dom-sink', node, callee, `${callee}() is refused in ${where} (N-3)`);
          if (callee === 'setAttribute' || callee === 'setAttributeNS' || callee === 'toggleAttribute') {
            const v = foldString(ts, node.arguments[callee === 'setAttributeNS' ? 1 : 0]);
            if (v === null) refuse('dom-sink', node, callee, `${callee} with a non-literal attribute name (N-3)`);
            else {
              const low = v.toLowerCase();
              if ((DOM_SINKS.has(low) || low === 'style' || /^on[a-z]/.test(low)) && !(low === 'href' && inReplyLink(node)))
                refuse('dom-sink', node, low, `${callee}("${v}") names a request sink (N-3)`);
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  // entry/: exactly one document reference (H1, D13)
  if (entryTsFiles > 0 && entryDocumentRefs.length !== 1) {
    if (entryDocumentRefs.length === 0)
      out.push(refusal('layer-global', files.find((f) => f.startsWith('entry/')), 0, 'document', 'entry/** must reference document exactly once (found 0)'));
    for (const ref of entryDocumentRefs.slice(1))
      out.push(refusal('layer-global', ref.rel, ref.line, 'document', `entry/** must reference document exactly once (found ${entryDocumentRefs.length})`));
  }

  // 3(f) the one fetch call site, PATHS, API_BASE
  if (present.has('src/net/client.ts')) {
    const sf = program.getSourceFile(path.join(root, 'src/net/client.ts'));
    const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (fetchSites.length !== 1)
      out.push(refusal('fetch-shape', 'src/net/client.ts', fetchSites[1] ? lineOf(fetchSites[1]) : 0, 'fetch', `exactly one fetch call site is required in src/net/client.ts (found ${fetchSites.length})`));
    let pathsDecl = null;
    const findPaths = (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'PATHS') pathsDecl = n;
      ts.forEachChild(n, findPaths);
    };
    findPaths(sf);
    const obj = pathsDecl?.initializer ? skipOuter(ts, pathsDecl.initializer) : null;
    const values = [];
    let objOk = !!obj && ts.isObjectLiteralExpression(obj) && ts.isVariableDeclarationList(pathsDecl.parent) && (pathsDecl.parent.flags & ts.NodeFlags.Const) !== 0;
    if (objOk)
      for (const p of obj.properties) {
        if (!ts.isPropertyAssignment(p) || ts.isComputedPropertyName(p.name) || !(ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))) objOk = false;
        else values.push(p.initializer.text);
      }
    const allow = new Set(P1_PATHS);
    const same = objOk && values.length === allow.size && new Set(values).size === values.length && values.every((v) => allow.has(v));
    if (!same)
      out.push(refusal('fetch-shape', 'src/net/client.ts', pathsDecl ? lineOf(pathsDecl) : 0, 'PATHS', `const PATHS must be an object literal whose values are exactly: ${P1_PATHS.join(', ')} (N-1)`));
    for (const call of fetchSites) {
      const a = call.arguments[0] ? skipOuter(ts, call.arguments[0]) : null;
      let ok = !!a && ts.isBinaryExpression(a) && a.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isIdentifier(a.left) && a.left.text === 'API_BASE';
      if (ok) ok = (aliasTarget(checker.getSymbolAtLocation(a.left))?.declarations ?? []).some((d) => ts.isVariableDeclaration(d) && relOf(d.getSourceFile().fileName) === 'src/net/endpoint.ts');
      if (ok) {
        const r = a.right;
        const shapeOk = ((ts.isPropertyAccessExpression(r) || ts.isElementAccessExpression(r)) && ts.isIdentifier(r.expression) && r.expression.text === 'PATHS') || ts.isIdentifier(r);
        const type = checker.getTypeAtLocation(r);
        const parts = type.isUnion() ? type.types : [type];
        ok = shapeOk && parts.length > 0 && parts.every((t) => t.isStringLiteral() && allow.has(t.value));
      }
      if (!ok) out.push(refusal('fetch-shape', 'src/net/client.ts', lineOf(call), 'fetch', 'the fetch URL must be API_BASE + PATHS.<member>, typed as allowlisted path literals (N-1)'));
    }
  }
  if (present.has('src/net/endpoint.ts')) {
    const sf = program.getSourceFile(path.join(root, 'src/net/endpoint.ts'));
    let ok = false;
    for (const st of sf.statements)
      if (ts.isVariableStatement(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) && (st.declarationList.flags & ts.NodeFlags.Const) !== 0)
        for (const d of st.declarationList.declarations)
          if (ts.isIdentifier(d.name) && d.name.text === 'API_BASE' && d.initializer && ts.isStringLiteral(d.initializer) && d.initializer.text === TARGETS.web.apiBase) ok = true;
    if (!ok) out.push(refusal('fetch-shape', 'src/net/endpoint.ts', 0, 'API_BASE', `src/net/endpoint.ts must declare \`export const API_BASE = '${TARGETS.web.apiBase}'\``));
  }

  return applyBaseline(out, ctx.baseline ?? { entries: [], problems: [] });
}

// ── 3(m) the expiring baseline ───────────────────────────────────────────────────────────────────

export function loadBaseline(readFile, listNames) {
  const entries = [];
  const problems = [];
  const counts = {};
  for (const name of listNames()) {
    const rel = `build-baseline/${name}`;
    if (!(rel in BASELINE_FILES)) {
      problems.push(refusal('baseline', rel, 0, name, 'build-baseline/ may hold only routes.json and renderer.json (V2-1)'));
      continue;
    }
    let list;
    try {
      list = JSON.parse(readFile(rel));
    } catch (e) {
      problems.push(refusal('baseline', rel, 0, name, `unreadable baseline: ${e.message}`));
      continue;
    }
    if (!Array.isArray(list)) {
      problems.push(refusal('baseline', rel, 0, name, 'a baseline is a JSON array of {file, rule, name, removed_by}'));
      continue;
    }
    counts[rel] = list.length;
    const seen = new Set();
    for (const e of list) {
      const key = JSON.stringify([e?.file, e?.rule, e?.name, e?.removed_by]);
      const admissible = BASELINE_ADMISSIBLE.some((a) => a.file === e?.file && a.rule === e?.rule && a.name === e?.name && a.removed_by === e?.removed_by);
      if (!admissible) problems.push(refusal('baseline', rel, 0, String(e?.name), `entry ${key} is outside the embedded admissible set — a baseline never grows (V2-1)`));
      else if (e.file !== BASELINE_FILES[rel]) problems.push(refusal('baseline', rel, 0, e.name, `an entry for ${e.file} does not belong in ${rel}`));
      else if (seen.has(key)) problems.push(refusal('baseline', rel, 0, e.name, `duplicate entry ${key}`));
      else entries.push({ ...e, source: rel });
      seen.add(key);
    }
  }
  return { entries, problems, counts };
}

function applyBaseline(refusals, baseline) {
  const used = new Set();
  const kept = [];
  let suppressed = 0;
  for (const r of refusals) {
    const i = BASELINE_RULES.has(r.rule) ? baseline.entries.findIndex((e) => e.file === r.file && e.rule === r.rule && e.name === r.name) : -1;
    if (i >= 0) {
      used.add(i);
      suppressed += 1;
    } else kept.push(r);
  }
  baseline.entries.forEach((e, i) => {
    if (!used.has(i)) kept.push(refusal('baseline', e.source, 0, e.name, `stale entry: ${e.file} has no ${e.rule} site "${e.name}" — delete the entry (V2-1)`));
  });
  return { refusals: [...baseline.problems, ...kept], suppressed };
}

// ── 4-8. the build ───────────────────────────────────────────────────────────────────────────────

export function listShellFiles(root) {
  const out = [];
  const walk = (relDir) => {
    const abs = path.join(root, relDir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const rel = `${relDir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else out.push(rel);
    }
  };
  walk('src');
  walk('entry');
  return out.sort(codeUnitOrder);
}

function diagnosticsToRefusals(ts, rule, root, diags) {
  return diags.map((d) => {
    const file = d.file ? posix(path.relative(root, d.file.fileName)) : '(program)';
    const line = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
    return refusal(rule, file, line, '', ts.flattenDiagnosticMessageText(d.messageText, ' '));
  });
}

/**
 * The whole pipeline, writing only into `tmp`. Returns the artefacts; the caller decides whether to
 * copy them into dist/ (build), compare them (check) or print them (dry-run).
 */
export function runBuild(ts, { root = ROOT, tmp, target = 'web', typecheckOnly = false, noBaseline = false } = {}) {
  const log = [];
  const refusals = [];
  const all = listShellFiles(root);
  for (const rel of all)
    if (layerOf(rel) === null && rel !== 'entry/index.html' && rel !== 'entry/styles.css')
      refusals.push(refusal('unknown-layer', rel, 0, '', 'not a shell source (src/<layer>/**/*.ts, src/contract.ts, entry/**/*.ts, entry/index.html, entry/styles.css)'));
  const tsFiles = all.filter((r) => layerOf(r) !== null);

  // 2. toolchain + contract declarations
  const contract = emitContract(ts, tmp);
  log.push(`contract: #contract -> ${contract.writes} declarations in os.tmpdir(); ${contract.exportCount} exports (+${CONTRACT_PENDING_NAMES.length} pending name) in the collision set`);

  const baselineDir = path.join(root, 'build-baseline');
  const baseline = loadBaseline(
    (rel) => fs.readFileSync(path.join(root, rel), 'utf8'),
    () => (fs.existsSync(baselineDir) ? fs.readdirSync(baselineDir).filter((n) => !n.startsWith('.')).sort(codeUnitOrder) : []),
  );
  if (noBaseline && fs.existsSync(baselineDir)) refusals.push(refusal('baseline', 'build-baseline/', 0, '', '--no-baseline: build-baseline/ must be absent (S8)'));

  // 3. the gate runs on the full tsconfig.json program (DOM lib, checker)
  const full = readTsconfig(ts, root, 'tsconfig.json');
  const fullOptions = shellOptions(full.options, contract);
  const shared = sharedDirs(ts, contract);
  const rootNames = tsFiles.map((r) => path.join(root, r));
  const program = ts.createProgram({ rootNames, options: fullOptions, host: makeHost(ts, fullOptions, shared, null) });
  const gate = runGates(ts, program, { root, files: tsFiles, contract, baseline });
  refusals.push(...gate.refusals);
  const baselineLine = `baseline: ${baseline.entries.length} live entries (${Object.keys(BASELINE_FILES).map((f) => `${f} ${baseline.counts[f] ?? 'absent'}`).join(', ')}); ${gate.suppressed} refused sites admitted by it`;
  log.push(baselineLine);

  // 3(h) the no-DOM typecheck of the pure layers
  const pureFiles = tsFiles.filter((r) => ['routes', 'renderer', 'integrity'].includes(layerOf(r)));
  if (pureFiles.length) {
    const pureOptions = shellOptions(readTsconfig(ts, root, 'tsconfig.pure.json').options, contract);
    const pureProgram = ts.createProgram({ rootNames: pureFiles.map((r) => path.join(root, r)), options: pureOptions, host: makeHost(ts, pureOptions, shared, null) });
    refusals.push(...diagnosticsToRefusals(ts, 'pure-typecheck', root, ts.getPreEmitDiagnostics(pureProgram)));
  }

  // 4. full typecheck; nothing from the backend in the program
  refusals.push(...diagnosticsToRefusals(ts, 'typecheck', root, ts.getPreEmitDiagnostics(program)));
  for (const sf of program.getSourceFiles()) {
    const f = path.resolve(sf.fileName);
    const ok = program.isSourceFileDefaultLibrary(sf) || isWithin(contract.dir, f) || isWithin(path.join(root, 'src'), f) || isWithin(path.join(root, 'entry'), f);
    if (!ok) refusals.push(refusal('program-files', f, 0, '', 'the shell program may contain only src/**, entry/**, the emitted contract declarations and TS libs'));
  }
  const presence = {
    entry: tsFiles.some((r) => r.startsWith('entry/')) ? 'present' : 'absent',
    client: tsFiles.includes('src/net/client.ts') ? 'present' : 'absent',
  };
  if (refusals.length) throw new BuildRefused(refusals, log);
  if (typecheckOnly) return { log, presence };

  // 5. guarded emit
  const emitDir = path.join(tmp, 'emit');
  const emitOptions = {
    ...fullOptions,
    noEmit: false,
    outDir: emitDir,
    rootDir: root,
    rewriteRelativeImportExtensions: true,
    removeComments: true,
    newLine: ts.NewLineKind.LineFeed,
    noEmitOnError: true,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    inlineSourceMap: false,
    incremental: false,
    tsBuildInfoFile: undefined,
  };
  const emitHost = makeHost(ts, emitOptions, shared, null);
  const guard = guardedWriter(emitDir);
  emitHost.writeFile = guard.write;
  const emitProgram = ts.createProgram({ rootNames, options: emitOptions, host: emitHost });
  const emitted = emitProgram.emit();
  for (const f of guard.refused) refusals.push(refusal('emit-guard', f, 0, '', `emit tried to write outside ${emitDir}`));
  if (emitted.emitSkipped) refusals.push(...diagnosticsToRefusals(ts, 'typecheck', root, emitted.diagnostics), refusal('emit-guard', '(emit)', 0, '', 'emit skipped'));
  if (refusals.length) throw new BuildRefused(refusals, log);

  const modules = new Map();
  for (const abs of [...guard.writes].sort(codeUnitOrder)) {
    const rel = posix(path.relative(emitDir, abs));
    if (!rel.endsWith('.js') || !tsFiles.includes(rel.replace(/\.js$/, '.ts'))) refusals.push(refusal('post-emit', rel, 0, '', 'an emitted file with no .ts source'));
    modules.set(rel, fs.readFileSync(abs));
  }
  for (const rel of tsFiles) if (!modules.has(rel.replace(/\.ts$/, '.js'))) refusals.push(refusal('post-emit', rel, 0, '', 'source emitted no module'));

  // 6. post-emit scan
  refusals.push(...postEmitScan(ts, modules));
  if (refusals.length) throw new BuildRefused(refusals, log);

  // 7. content addressing, per target
  const stylesPath = path.join(root, 'entry', 'styles.css');
  const styles = fs.existsSync(stylesPath) ? fs.readFileSync(stylesPath) : null;
  const indexPath = path.join(root, 'entry', 'index.html');
  const indexTemplate = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null;
  const web = addressTarget('web', modules, styles, indexTemplate);
  refusals.push(...web.refusals);
  let capacitor = null;
  if (target === 'capacitor') {
    capacitor = addressTarget('capacitor', modules, styles, indexTemplate);
    refusals.push(...capacitor.refusals);
    if (!capacitor.refusals.length && !web.refusals.length) refusals.push(...capacitorProof(web, capacitor));
  }
  if (refusals.length) throw new BuildRefused(refusals, log);

  // 8. manifest — the joined-source digest stays, and is printed first (k5-exit-gate.sh:17)
  const parts = [];
  for (const rel of all) {
    parts.push(`// ── ${rel} ${'─'.repeat(Math.max(0, 70 - rel.length))}`);
    parts.push(fs.readFileSync(path.join(root, rel), 'utf8').trimEnd());
    parts.push('');
  }
  const joined = parts.join('\n');
  const manifest = {
    name: 'maya-chat-shell',
    sources: all,
    bytes: Buffer.byteLength(joined, 'utf8'),
    digest: sha256(Buffer.from(joined, 'utf8')),
    toolchain: { typescript: ts.version, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' },
    web: web.manifest,
    targets: TARGETS,
  };
  return { log, presence, manifest, joined, web, capacitor };
}

function addressTarget(name, modules, styles, indexTemplate) {
  const refusals = [];
  const files = new Map(modules);
  if (name === 'capacitor') {
    const rel = 'src/net/endpoint.js';
    const needle = `export const API_BASE = '${TARGETS.web.apiBase}';`;
    const text = files.get(rel)?.toString('utf8');
    if (text === undefined || text.split(needle).length !== 2) refusals.push(refusal('target', rel, 0, '', `the capacitor target needs exactly one \`${needle}\` in the emitted endpoint module`));
    else files.set(rel, Buffer.from(text.replace(needle, `export const API_BASE = '${TARGETS.capacitor.apiBase}';`), 'utf8'));
  }
  const input = [...files.entries()];
  if (styles) input.push(['styles.css', styles]);
  input.sort((a, b) => codeUnitOrder(a[0], b[0]));
  const h = createHash('sha256');
  for (const [rel, bytes] of input) {
    h.update(rel, 'utf8');
    h.update('\0');
    h.update(bytes);
    h.update('\0');
  }
  const digest = h.digest('hex');
  const d16 = digest.slice(0, 16);
  let index = null;
  if (indexTemplate !== null) {
    if (!indexTemplate.includes('<webDigest16>')) refusals.push(refusal('target', 'entry/index.html', 0, '', 'index.html must name the module path through the literal placeholder <webDigest16>'));
    const token = `connect-src ${TARGETS.web.connectSrc}`;
    let html = indexTemplate.split('<webDigest16>').join(d16);
    if (html.split(token).length !== 2) refusals.push(refusal('target', 'entry/index.html', 0, '', `index.html must carry "${token}" exactly once (meta CSP)`));
    if (name === 'capacitor') html = html.replace(token, `connect-src ${TARGETS.capacitor.connectSrc}`);
    index = Buffer.from(html, 'utf8');
  }
  const manifestFiles = [...files.entries()].sort((a, b) => codeUnitOrder(a[0], b[0])).map(([rel, bytes]) => ({ path: rel, sha256: sha256(bytes), bytes: bytes.length }));
  return {
    name,
    digest,
    d16,
    files,
    styles,
    index,
    refusals,
    manifest: {
      digest,
      modulePath: `m/${d16}/`,
      files: manifestFiles,
      styles: styles ? { sha256: sha256(styles), bytes: styles.length } : null,
      index: index ? { sha256: sha256(index), bytes: index.length } : null,
    },
  };
}

/** §1.10: only net/endpoint.js differs per file; index.html differs only in digest and connect-src; styles identical. */
function capacitorProof(web, cap) {
  const out = [];
  for (const [rel, bytes] of web.files) {
    const other = cap.files.get(rel);
    const same = !!other && Buffer.compare(bytes, other) === 0;
    if (rel === 'src/net/endpoint.js' ? same : !same)
      out.push(refusal('target', rel, 0, '', rel === 'src/net/endpoint.js' ? 'the capacitor endpoint module did not change' : 'module bytes differ between targets'));
  }
  if (web.index && cap.index) {
    const norm = (b, t) => b.toString('utf8').split(t.d16).join('<D>').replace(`connect-src ${TARGETS[t.name].connectSrc}`, 'connect-src <C>');
    if (norm(web.index, web) !== norm(cap.index, cap)) out.push(refusal('target', 'index.html', 0, '', 'index.html differs beyond the digest path and connect-src'));
  } else out.push(refusal('target', 'entry/index.html', 0, '', 'the capacitor proof needs entry/index.html'));
  if ((web.styles === null) !== (cap.styles === null) || (web.styles && Buffer.compare(web.styles, cap.styles) !== 0))
    out.push(refusal('target', 'styles.css', 0, '', 'styles.css differs between targets'));
  return out;
}

/** 6. The emitted graph's runtime imports against the layer table; needles in modules that reach nothing. */
export function postEmitScan(ts, modules) {
  const out = [];
  const PURE_NEEDLES = new Set([
    'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'navigator',
    'document', 'window', 'globalThis', 'self', 'eval', 'Function', 'Date', 'performance', 'crypto', 'setTimeout', 'setInterval',
    'requestAnimationFrame', 'Image', 'Worker', 'SharedWorker', 'importScripts', 'location', 'history', 'open', 'postMessage',
    'console', 'Request', 'Response', 'Headers', 'URL', 'Blob', 'FileReader', 'MediaRecorder', 'AudioContext',
  ]);
  const DOM_NEEDLES = new Set([...PURE_NEEDLES].filter((n) => n !== 'Date'));
  for (const [rel, bytes] of modules) {
    const sf = ts.createSourceFile(rel, bytes.toString('utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const layer = layerOf(rel.replace(/\.js$/, '.ts'));
    const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    const declared = new Set();
    const declare = (name) => {
      if (!name) return;
      if (ts.isIdentifier(name)) declared.add(name.text);
      else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) for (const e of name.elements) if (!ts.isOmittedExpression(e)) declare(e.name);
    };
    const refs = [];
    const scanLiterals = ['dom', 'renderer', 'integrity', 'routes'].includes(layer);
    const walk = (n) => {
      if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) declare(n.name);
      if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isClassDeclaration(n) || ts.isClassExpression(n)) && n.name) declared.add(n.name.text);
      if ((ts.isImportClause(n) || ts.isImportSpecifier(n) || ts.isNamespaceImport(n)) && n.name) declared.add(n.name.text);
      if (ts.isIdentifier(n) && isValueReference(ts, n)) refs.push(n);
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        const target = posix(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
        const key = spec.startsWith('.') && spec.endsWith('.js') && modules.has(target) ? moduleKey(target.replace(/\.js$/, '.ts')) : null;
        const allow = IMPORT_ALLOW[layer];
        const mode = !key ? null : allow === '*' ? 'any' : allow[key] ?? allow[key.split('/')[0]];
        if (mode !== 'any') out.push(refusal('post-emit', rel, lineOf(n), spec, `emitted runtime import "${spec}" is not an allowed value edge for ${layer}/`));
      }
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) out.push(refusal('post-emit', rel, lineOf(n), 'import()', 'dynamic import() in the emitted graph'));
      if (scanLiterals && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && !isModuleSpecifier(ts, n))
        for (const bad of [...RETIRED_VALUES, ...ROUTE_FRAGMENTS])
          if (n.text.toLowerCase().includes(bad.toLowerCase())) out.push(refusal('post-emit', rel, lineOf(n), bad, `emitted literal names "${bad}"`));
      ts.forEachChild(n, walk);
    };
    walk(sf);
    const needles = layer === 'dom' ? DOM_NEEDLES : ['renderer', 'integrity', 'routes'].includes(layer) ? PURE_NEEDLES : null;
    if (needles)
      for (const id of refs)
        if (needles.has(id.text) && !declared.has(id.text)) out.push(refusal('post-emit', rel, lineOf(id), id.text, `emitted ${layer}/ module reaches "${id.text}"`));
  }
  return out;
}

// ── --self-test ──────────────────────────────────────────────────────────────────────────────────

/** Rows that must have fixtures in BOTH directions (§2.1 step 3, minimum set, plus two extra rows). */
export const FIXTURE_ROWS = [
  'retired-paths', 'surface', 'audience', 'dom-network', 'renderer', 'voice', 'entry', 'contract-collision',
  'routes-import', 'dom-sinks', 'baseline', 'comments', 'fetch-shape', 'pure-typecheck', 'reflection',
];
const SUPPORT_FILES = ['src/contract.ts', 'src/renderer/nodes.ts', 'src/net/types.ts', 'src/shell/ports.ts'];
const FIXTURE_BASE = path.join(ROOT, 'test', 'fixtures', 'build');

function readFixture(abs, direction, row) {
  const id = posix(path.relative(FIXTURE_BASE, abs));
  const files = new Map();
  let meta = {};
  if (fs.statSync(abs).isDirectory()) {
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => codeUnitOrder(a.name, b.name))) {
        if (e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === 'fixture.json' && dir === abs) meta = JSON.parse(fs.readFileSync(p, 'utf8'));
        else files.set(posix(path.relative(abs, p)), fs.readFileSync(p, 'utf8'));
      }
    };
    walk(abs);
  } else {
    const text = fs.readFileSync(abs, 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\/\/ @([a-z-]+)(?::\s*(.*))?$/.exec(line.trim());
      if (m) meta[m[1]] = (m[2] ?? '').trim();
      else if (line.trim() !== '') break;
    }
    if (!meta.as) throw new Error(`fixture ${id} has no // @as: directive`);
    files.set(meta.as, text);
    meta.expect = meta.expect ? meta.expect.split(',').map((s) => s.trim()).filter(Boolean) : [];
    meta.probes = 'probes' in meta;
  }
  return { id, direction, row, files, expect: new Set(meta.expect ?? []), probes: !!meta.probes, typecheck: meta.typecheck ?? null };
}

export function listFixtures(base = FIXTURE_BASE) {
  const out = [];
  for (const direction of ['refuse', 'admit']) {
    const dDir = path.join(base, direction);
    if (!fs.existsSync(dDir)) continue;
    for (const row of fs.readdirSync(dDir).filter((n) => !n.startsWith('.')).sort(codeUnitOrder)) {
      const rDir = path.join(dDir, row);
      if (!fs.statSync(rDir).isDirectory()) continue;
      for (const f of fs.readdirSync(rDir).filter((n) => !n.startsWith('.')).sort(codeUnitOrder)) {
        const abs = path.join(rDir, f);
        if (fs.statSync(abs).isDirectory() || f.endsWith('.ts')) out.push(readFixture(abs, direction, row));
      }
    }
  }
  return out;
}

/** Run one fixture through the gates on a virtual root that never touches the disk. */
export function runFixture(ts, contract, fixture, shared) {
  const vroot = path.join(os.tmpdir(), `maya-shell-selftest-virtual-${process.pid}`, fixture.id.replace(/[^A-Za-z0-9_-]/g, '_'));
  const vfiles = new Map();
  for (const rel of SUPPORT_FILES) vfiles.set(path.join(vroot, rel), fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  for (const [rel, text] of fixture.files) vfiles.set(path.join(vroot, rel), text);
  const fixtureTs = [...fixture.files.keys()].filter((r) => r.endsWith('.ts')).sort(codeUnitOrder);
  const baselineNames = [...fixture.files.keys()].filter((r) => r.startsWith('build-baseline/')).map((r) => r.slice('build-baseline/'.length));
  const baseline = loadBaseline((rel) => fixture.files.get(rel), () => baselineNames);
  const options = shellOptions(readTsconfig(ts, ROOT, 'tsconfig.json').options, contract);
  const allTs = [...new Set([...SUPPORT_FILES, ...fixtureTs])];
  const host = makeHost(ts, options, shared, { root: vroot, files: vfiles });
  const program = ts.createProgram({ rootNames: allTs.map((r) => path.join(vroot, r)), options, host });
  const gate = runGates(ts, program, { root: vroot, files: fixtureTs, contract, baseline });
  const refusals = gate.refusals.filter((r) => !SUPPORT_FILES.includes(r.file) || fixture.files.has(r.file));
  if (fixture.typecheck === 'pure') {
    const pureOptions = shellOptions(readTsconfig(ts, ROOT, 'tsconfig.pure.json').options, contract);
    const pureFiles = fixtureTs.filter((r) => ['routes', 'renderer', 'integrity'].includes(layerOf(r)));
    const pp = ts.createProgram({ rootNames: pureFiles.map((r) => path.join(vroot, r)), options: pureOptions, host: makeHost(ts, pureOptions, shared, { root: vroot, files: vfiles }) });
    refusals.push(...diagnosticsToRefusals(ts, 'pure-typecheck', vroot, ts.getPreEmitDiagnostics(pp)).filter((r) => fixture.files.has(r.file)));
  }
  const got = new Set(refusals.map((r) => r.rule));
  let ok;
  let detail = '';
  if (fixture.direction === 'admit') ok = refusals.length === 0;
  else {
    ok = fixture.expect.size > 0 && got.size === fixture.expect.size && [...got].every((r) => fixture.expect.has(r));
    if (fixture.probes) {
      const [rel, text] = [...fixture.files.entries()][0];
      const probeLines = text.split('\n').map((l, i) => (/\/\/ probe\s*$/.test(l) ? i + 1 : 0)).filter(Boolean);
      const hit = probeLines.filter((ln) => refusals.some((r) => r.file === rel && r.line === ln));
      const stray = refusals.filter((r) => !(r.file === rel && probeLines.includes(r.line)));
      detail = `; probes ${hit.length}/${probeLines.length} refused, ${stray.length} refusals off probe lines`;
      ok = ok && probeLines.length > 0 && hit.length === probeLines.length && stray.length === 0;
    }
  }
  return { id: fixture.id, direction: fixture.direction, row: fixture.row, ok, expected: [...fixture.expect].sort(codeUnitOrder), got: [...got].sort(codeUnitOrder), refusals, detail };
}

/** The write guard, proven twice: directly, and against a real tsc emit whose output leaves outDir. */
export function writeGuardTest(ts, tmp) {
  const results = [];
  const out = fs.mkdtempSync(path.join(tmp, 'guard-'));
  const g = guardedWriter(path.join(out, 'out'));
  g.write(path.join(out, 'out', '..', 'escape.js'), 'x');
  g.write(path.join(out, 'out', 'inside.js'), 'x');
  results.push({
    name: 'write guard: a direct write outside outDir is refused, one inside is kept',
    ok: g.refused.length === 1 && !fs.existsSync(path.join(out, 'escape.js')) && fs.existsSync(path.join(out, 'out', 'inside.js')),
  });
  // rootDir does not contain the source: tsc reports TS6059 and still computes an output path
  // outside outDir — the incident that wrote 199 .js files into maya-saas-backend/src.
  const vroot = path.join(out, 'virtual');
  const src = path.join(vroot, 'b', 'x.ts');
  const emitDir = path.join(out, 'emit');
  const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, outDir: emitDir, rootDir: path.join(vroot, 'a'), types: [], noEmitOnError: false };
  const host = makeHost(ts, options, [], { root: vroot, files: new Map([[src, 'export const x = 1;\n']]) });
  const g2 = guardedWriter(emitDir);
  host.writeFile = g2.write;
  ts.createProgram({ rootNames: [src], options, host }).emit();
  results.push({
    name: `write guard: a tsc emit that resolves outside outDir is refused (${g2.refused.map((f) => posix(path.relative(out, f))).join(', ') || 'nothing attempted'})`,
    ok: g2.refused.length === 1 && g2.writes.length === 0 && !fs.existsSync(g2.refused[0] ?? path.join(out, 'none')) && !isWithin(emitDir, g2.refused[0] ?? emitDir),
  });
  return results;
}

export function selfTest(ts, { tmp, base = FIXTURE_BASE } = {}) {
  const contract = emitContract(ts, tmp);
  const shared = sharedDirs(ts, contract);
  const fixtures = listFixtures(base);
  const results = fixtures.map((f) => runFixture(ts, contract, f, shared));
  const coverage = [];
  for (const row of FIXTURE_ROWS)
    for (const direction of ['refuse', 'admit'])
      coverage.push({ name: `coverage: ${direction}/${row}`, ok: fixtures.some((f) => f.row === row && f.direction === direction) });
  coverage.push({ name: 'coverage: refuse/bypass', ok: fixtures.some((f) => f.row === 'bypass' && f.direction === 'refuse' && f.probes) });
  for (const f of fixtures)
    for (const r of f.expect) if (!RULE_IDS.includes(r)) coverage.push({ name: `coverage: ${f.id} names an unknown rule "${r}"`, ok: false });
  const guard = writeGuardTest(ts, tmp);
  const ok = results.every((r) => r.ok) && coverage.every((c) => c.ok) && guard.every((g) => g.ok);
  return { ok, results, coverage, guard };
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────

function writeDist(result, target) {
  const dist = path.join(ROOT, 'dist');
  const guard = guardedWriter(dist);
  const t = target === 'capacitor' ? result.capacitor : result.web;
  const outDir = path.join(dist, target);
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const [rel, bytes] of t.files) guard.write(path.join(outDir, 'm', t.d16, rel), bytes);
  if (t.styles) guard.write(path.join(outDir, 'styles.css'), t.styles);
  if (t.index) guard.write(path.join(outDir, 'index.html'), t.index);
  if (target === 'web') {
    guard.write(path.join(dist, 'maya-chat-shell.ts'), result.joined);
    guard.write(path.join(dist, 'manifest.json'), `${JSON.stringify(result.manifest, null, 2)}\n`);
  }
  if (guard.refused.length) throw new BuildRefused(guard.refused.map((f) => refusal('emit-guard', f, 0, '', 'a dist write outside dist/')));
}

export function compareManifest(fresh, prior) {
  const diffs = [];
  if (prior.digest !== fresh.digest) diffs.push(`digest ${prior.digest} != fresh ${fresh.digest}`);
  if (prior.web?.digest !== fresh.web.digest) diffs.push(`web digest ${prior.web?.digest} != fresh ${fresh.web.digest}`);
  const priorFiles = new Map((prior.web?.files ?? []).map((f) => [f.path, f.sha256]));
  const freshFiles = new Map(fresh.web.files.map((f) => [f.path, f.sha256]));
  for (const [p, h] of freshFiles) if (priorFiles.get(p) !== h) diffs.push(`${p}: ${priorFiles.get(p) ?? 'absent'} != fresh ${h}`);
  for (const p of priorFiles.keys()) if (!freshFiles.has(p)) diffs.push(`${p}: no longer emitted`);
  for (const k of ['styles', 'index'])
    if ((prior.web?.[k]?.sha256 ?? null) !== (fresh.web[k]?.sha256 ?? null)) diffs.push(`${k}: ${prior.web?.[k]?.sha256 ?? 'absent'} != fresh ${fresh.web[k]?.sha256 ?? 'absent'}`);
  return diffs;
}

export async function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.includes('=')));
  const targetArg = argv.find((a) => a.startsWith('--target='));
  const target = targetArg ? targetArg.slice('--target='.length) : 'web';
  const known = new Set(['--check', '--self-test', '--typecheck', '--dry-run', '--no-baseline']);
  for (const f of flags)
    if (!known.has(f)) {
      console.error(`unknown flag ${f}`);
      return 2;
    }
  if (!(target in TARGETS)) {
    console.error(`unknown target ${target} (web | capacitor)`);
    return 2;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-shell-build-'));
  try {
    const ts = loadTypeScript();
    if (flags.has('--self-test')) {
      const r = selfTest(ts, { tmp });
      for (const x of r.results) {
        const what = x.direction === 'refuse' ? `expected {${x.expected.join(', ')}} got {${x.got.join(', ')}}` : `${x.refusals.length} refusals`;
        console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id}  ${what}${x.detail}`);
        if (!x.ok) for (const rf of x.refusals) console.log(`        ${formatRefusal(rf)}`);
      }
      for (const c of [...r.coverage, ...r.guard]) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
      const refuse = r.results.filter((x) => x.direction === 'refuse');
      const admit = r.results.filter((x) => x.direction === 'admit');
      const bypass = r.results.find((x) => x.row === 'bypass');
      console.log(`self-test: refuse ${refuse.filter((x) => x.ok).length}/${refuse.length} refused with the named rule, admit ${admit.filter((x) => x.ok).length}/${admit.length} admitted, coverage ${r.coverage.filter((c) => c.ok).length}/${r.coverage.length}, write guard ${r.guard.filter((g) => g.ok).length}/${r.guard.length}${bypass ? `, bypass${bypass.detail}` : ''}`);
      console.log(`self-test: ${r.ok ? 'PASS' : 'FAIL'}`);
      return r.ok ? 0 : 1;
    }
    const result = runBuild(ts, { tmp, target, typecheckOnly: flags.has('--typecheck'), noBaseline: flags.has('--no-baseline') });
    if (flags.has('--typecheck')) {
      for (const l of result.log) console.log(l);
      console.log('typecheck: PASS');
      return 0;
    }
    // The joined-source digest is the FIRST 64-hex token printed (k5-exit-gate.sh:17).
    console.log(`digest ${result.manifest.digest}`);
    const t = target === 'capacitor' ? result.capacitor : result.web;
    console.log(`web ${t.digest} (${target}; ${t.files.size} modules; styles.css ${t.styles ? 'present' : 'absent'}; index.html ${t.index ? 'present' : 'absent'})`);
    for (const l of result.log) console.log(l);
    console.log(`entry: ${result.presence.entry}`);
    console.log(`net/client.ts: ${result.presence.client}`);
    if (target === 'capacitor') console.log('capacitor proof: PASS (only net/endpoint.js differs; index.html differs only in digest path and connect-src; styles.css identical)');
    if (flags.has('--check')) {
      const priorPath = path.join(ROOT, 'dist', 'manifest.json');
      if (!fs.existsSync(priorPath)) {
        console.error('no dist/manifest.json to compare against — run the build first');
        return 1;
      }
      const diffs = compareManifest(result.manifest, JSON.parse(fs.readFileSync(priorPath, 'utf8')));
      if (diffs.length) {
        console.error(`NOT REPRODUCIBLE:\n  ${diffs.join('\n  ')}`);
        return 1;
      }
      console.log(`reproducible: ${result.manifest.digest}`);
      console.log(`web reproducible: ${result.web.digest} (${result.web.manifest.files.length} per-file hashes equal)`);
      return 0;
    }
    if (flags.has('--dry-run')) {
      console.log('dry-run: nothing written');
      return 0;
    }
    writeDist(result, target);
    console.log(`built ${result.manifest.sources.length} sources -> dist/${target}/m/${t.d16}/`);
    return 0;
  } catch (e) {
    if (e instanceof BuildRefused) {
      for (const l of e.log ?? []) console.error(l);
      console.error(`BUILD REFUSED — ${e.refusals.length} refusal(s):`);
      for (const r of e.refusals) console.error(`  ${formatRefusal(r)}`);
      return 1;
    }
    throw e;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2));
}
