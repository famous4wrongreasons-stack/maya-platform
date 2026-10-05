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
//   node build.mjs --serve-path=/x/   additionally refuse if THAT deploy path is unsafe: the retired
//                                     PWA's service worker is live at /app/ and its scope is /app/, so
//                                     a shell served at or under /app/ would be controlled by a worker
//                                     this build never wrote (PWA_SERVING; printed by every build and
//                                     recorded in dist/manifest.json, which --check compares)
//
// Pipeline: 1 paths · 2 toolchain + contract declarations · 3 layered purity gate (a-m) ·
// 4 full typecheck · 5 guarded emit · 6 post-emit scan · 7 content addressing · 8 manifest ·
// 9 target · 9(b) the PWA identity · 10 no service worker (nothing here registers or emits one).
//
// index.html contract (entry/index.html): the module path is written with the literal placeholder
// `<webDigest16>` (e.g. `./m/<webDigest16>/entry/main.js`), and the meta CSP carries
// `connect-src 'self'` exactly once; the capacitor target substitutes that token. Its head also
// carries the installable identity — the manifest link, the apple-touch icon and the three metas
// iOS and Android read — and step 9(b) refuses the build unless every one of them is intact.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
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
  'src/shell/dom-port.ts': 'shell/dom-port',
};

/**
 * 3(i). 'type' = only `import type {…}` / `export type {…} from` (clause level: an inline
 * `{ type X }` keeps a side-effect import under verbatimModuleSyntax).
 * Same-layer edges are admitted for every layer; they cannot cross a boundary.
 */
/**
 * 3(h): the layers type-checked a SECOND time with `lib: ES2022` and NO DOM lib, so a DOM type
 * cannot re-enter them. This is the ratchet that keeps the runtime headless — and it is the one the
 * React presentation carrier will depend on, because once the view layer is React the only thing
 * standing between `document` and the runtime is this list.
 *
 * `voice/` is deliberately NOT here: `MediaRecorder`, `AudioContext` and `MediaStream` are DOM-lib
 * types it legitimately needs. `dom/` and `entry/` are the presentation and own the document.
 *
 * `tsconfig.pure.json` holds the same set; step 3(h) asserts the two agree, because the tsconfig is
 * what a person running tsc by hand reads and a silent disagreement would make that reading a lie.
 *
 * NOT to be confused with PURE_LAYERS above, which is a different and stricter rule: those layers
 * may touch NO host global and no clock at all. `shell/` and `net/` legitimately use crypto,
 * timers and fetch — they are headless, not pure.
 */
const NO_DOM_LAYERS = ['shell', 'net'];
/**
 * 3(m): the layers that constitute the headless runtime package the React presentation carrier
 * consumes. It is the union of the two typechecked-without-DOM sets plus `contract`, which is types
 * only. `dom/` and `entry/` are the presentation and are deliberately absent.
 */
const RUNTIME_LAYERS = ['contract', 'integrity', 'net', 'renderer', 'routes', 'shell'];
/** The one file in those layers that may name a DOM type, because it IS the DOM boundary. */
const DOM_BOUNDARY = 'src/shell/dom-port.ts';

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
  dom: { dom: 'any', 'renderer/nodes': 'type', routes: 'any', 'shell/ports': 'type', 'shell/dom-port': 'type' },
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

/**
 * N-1: the P1 allowlist. `/widgets/*` joins only with the unit that consumes R7-E1/E2 (B3).
 * `/auth/oauth/telegram/complete` joined when the landing unit arrived: the shell now both starts
 * the hand-off and lands it.
 */
export const P1_PATHS = [
  '/auth/email/start',
  '/auth/email/verify',
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/oauth/telegram/start',
  '/auth/oauth/telegram/complete',
  '/ai/chat',
  '/ai/transcribe',
  '/mobile/pwa/search',
  '/widgets/intent',
  '/widgets/resolve',
];
export const TARGETS = {
  web: { apiBase: '/api', connectSrc: "'self'" },
  capacitor: { apiBase: 'https://mayaos.ru/api', connectSrc: "'self' https://mayaos.ru" },
};

// ── 9(b) the PWA identity ────────────────────────────────────────────────────────────────────────
// The installable identity of the SHARED shell: one manifest and one icon set, emitted for BOTH
// targets from the same bytes, so an installable PWA and the Capacitor carrier can never drift.
//
// `id` is the load-bearing member. An install is identified by (origin, manifest id), and the
// retired PWA still served at /app/ declares id "/app/" — a manifest resolving to that id would
// silently UPDATE the owner's existing install instead of installing beside it. The id below is
// origin-relative and fixed, so it cannot become "/app/" by being deployed under that path, and
// `pwaContract` refuses any id that could.
//
// The artwork is a placeholder: `brand/make-icons.mjs` generates it from a description, and its
// --check proves the committed bytes are a fresh generation. The build takes it as given and checks
// only what a phone needs — a whole PNG, square, at the declared size.
const PWA_MANIFEST = 'manifest.webmanifest';
const PWA_ICON_DIR = 'icons';
const PWA_ICON_SOURCE = 'brand/icons';
const LEGACY_PWA_ID = '/app/';
/**
 * WHERE THIS TREE MAY BE SERVED — the one identity rule the build cannot check for itself.
 *
 * `scope` and `start_url` are "./": the shell is the same bytes wherever it is served, and its install
 * identity is fixed by the absolute `id` regardless. What is NOT indifferent to the path is the RETIRED
 * PWA's service worker, which is still live at /app/service-worker.js with max-age=604800 (phase 2, E8).
 * A worker's scope is its own directory, so a shell served at or under /app/ would be CONTROLLED by a
 * worker this build never wrote, could be pinned to a stale cache, and could not be told to let go.
 *
 * The build cannot know the deploy path, so it does three things instead of guessing: it prints this
 * constraint on every run, it records it in dist/manifest.json so it travels with the tree (and
 * --check compares it, so it cannot be dropped quietly), and `node build.mjs --serve-path=<path>`
 * refuses an unsafe path when a deployer names one.
 */
export const PWA_SERVING = Object.freeze({
  mustNotBeServedAtOrUnder: LEGACY_PWA_ID,
  why: `the retired PWA's service worker is still live at ${LEGACY_PWA_ID}service-worker.js (max-age=604800) and its scope is ${LEGACY_PWA_ID}; a shell served there would be controlled by a worker this build never wrote`,
  check: 'node build.mjs --serve-path=<the path this tree will be served from>',
});

/** Is this deploy path safe? The one configuration the build can refuse without guessing. */
export function servingRefusals(servePath) {
  if (servePath === null || servePath === undefined) return [];
  const raw = String(servePath);
  if (!raw.startsWith('/')) return [refusal('target', `entry/${PWA_MANIFEST}`, 0, '', `--serve-path must be an origin-relative path beginning with "/" (got ${JSON.stringify(raw)})`)];
  const norm = raw.endsWith('/') ? raw : `${raw}/`;
  if (norm === LEGACY_PWA_ID || norm.startsWith(LEGACY_PWA_ID))
    return [refusal('target', `entry/${PWA_MANIFEST}`, 0, '', `this tree may not be served from ${JSON.stringify(raw)}: ${PWA_SERVING.why}`)];
  return [];
}
const PWA_ICONS = [
  { name: 'maya-192.png', size: 192, purpose: 'any' },
  { name: 'maya-512.png', size: 512, purpose: 'any' },
  { name: 'maya-512-maskable.png', size: 512, purpose: 'maskable' },
];
const APPLE_TOUCH_ICON = { name: 'maya-apple-180.png', size: 180 };
const APPLE_STATUS_BAR_STYLES = new Set(['default', 'black', 'black-translucent']);

/** The non-TypeScript sources under entry/: the page, its stylesheet and its web app manifest. */
const ENTRY_ASSETS = new Set(['entry/index.html', 'entry/styles.css', `entry/${PWA_MANIFEST}`]);

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
  // React AChat is the release payload and pins the same compiler. A clean carrier checkout
  // must not need the entire backend dependency tree merely to package PWA and Capacitor.
  const carrier = path.join(ROOT, '..', 'maya-carrier-react', 'node_modules', 'typescript');
  const backend = path.join(BE, 'node_modules', 'typescript');
  const dir = fs.existsSync(path.join(carrier, 'package.json')) ? carrier : backend;
  if (!fs.existsSync(path.join(dir, 'package.json')))
    throw new BuildRefused([refusal('typecheck', 'typescript', 0, '', 'TypeScript is not installed (npm --prefix maya-carrier-react ci)')]);
  const ts = createRequire(import.meta.url)(dir);
  if (ts.version !== TS_VERSION)
    throw new BuildRefused([refusal('typecheck', dir, 0, '', `TypeScript ${ts.version}; the build requires exactly ${TS_VERSION}`)]);
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
    // N-1: the public business finder is a GET that carries its term in the query string, so the URL
    // is `API_BASE + PATHS.<member>` followed by ONE more term — and that term is admitted only in
    // this shape: a template opening with '?' whose every substitution is an `encodeURIComponent()`
    // call, or such a template chosen against '' by a conditional.
    //
    // This EXTENDS the allowlist rather than opening it. Every character of the query's literal text
    // is authored in `client.ts` and read here; every variable part is percent-encoded, so a value
    // cannot contain '?', '#', '/', '&' or '=' and therefore cannot re-open the path, cannot reach
    // another origin, and cannot add a parameter that is not written above. The invariant the rule
    // exists to hold — every request goes to an allowlisted path and nowhere else — is unchanged.
    // A bare identifier, a concatenation, a `String()` or a raw interpolation is refused.
    const declaredQuery = (n) => {
      const q = skipOuter(ts, n);
      if (ts.isStringLiteral(q) || ts.isNoSubstitutionTemplateLiteral(q)) return q.text === '';
      if (ts.isConditionalExpression(q)) return declaredQuery(q.whenTrue) && declaredQuery(q.whenFalse);
      if (!ts.isTemplateExpression(q) || !q.head.text.startsWith('?') || q.templateSpans.length === 0) return false;
      return q.templateSpans.every((span) => {
        const e = skipOuter(ts, span.expression);
        return ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'encodeURIComponent' && e.arguments.length === 1;
      });
    };
    for (const call of fetchSites) {
      let a = call.arguments[0] ? skipOuter(ts, call.arguments[0]) : null;
      let queryOk = true;
      if (a && ts.isBinaryExpression(a) && a.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isBinaryExpression(skipOuter(ts, a.left))) {
        queryOk = declaredQuery(a.right);
        a = skipOuter(ts, a.left);
      }
      let ok = queryOk && !!a && ts.isBinaryExpression(a) && a.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isIdentifier(a.left) && a.left.text === 'API_BASE';
      if (ok) ok = (aliasTarget(checker.getSymbolAtLocation(a.left))?.declarations ?? []).some((d) => ts.isVariableDeclaration(d) && relOf(d.getSourceFile().fileName) === 'src/net/endpoint.ts');
      if (ok) {
        const r = a.right;
        const shapeOk = ((ts.isPropertyAccessExpression(r) || ts.isElementAccessExpression(r)) && ts.isIdentifier(r.expression) && r.expression.text === 'PATHS') || ts.isIdentifier(r);
        const type = checker.getTypeAtLocation(r);
        const parts = type.isUnion() ? type.types : [type];
        ok = shapeOk && parts.length > 0 && parts.every((t) => t.isStringLiteral() && allow.has(t.value));
      }
      if (!ok) out.push(refusal('fetch-shape', 'src/net/client.ts', lineOf(call), 'fetch', 'the fetch URL must be API_BASE + PATHS.<member>, typed as allowlisted path literals, optionally + a declared query (a template opening "?" whose substitutions are all encodeURIComponent calls) (N-1)'));
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
export function runBuild(ts, { root = ROOT, tmp, target = 'web', typecheckOnly = false, noBaseline = false, servePath = null } = {}) {
  const log = [];
  const refusals = [];
  const all = listShellFiles(root);
  for (const rel of all)
    if (layerOf(rel) === null && !ENTRY_ASSETS.has(rel))
      refusals.push(refusal('unknown-layer', rel, 0, '', `not a shell source (src/<layer>/**/*.ts, src/contract.ts, entry/**/*.ts, ${[...ENTRY_ASSETS].join(', ')})`));
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
  const pureFiles = tsFiles.filter((r) => PURE_LAYERS.has(layerOf(r)) && layerOf(r) !== 'contract');
  if (pureFiles.length) {
    const pureOptions = shellOptions(readTsconfig(ts, root, 'tsconfig.pure.json').options, contract);
    // The tsconfig is what a person running tsc by hand reads; a silent disagreement with
    // NO_DOM_LAYERS would make that reading a lie, so the two are compared rather than assumed.
    const declaredPure = (JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.headless.json'), 'utf8')).include ?? [])
      .map((g) => /^src\/([^/]+)\//.exec(g)?.[1])
      .filter((x) => typeof x === 'string')
      .sort();
    if (declaredPure.join(',') !== [...NO_DOM_LAYERS].sort().join(','))
      refusals.push(refusal('pure-typecheck', 'tsconfig.headless.json', 0, 'include', `tsconfig.headless.json includes ${declaredPure.join(', ') || '(none)'} but the build checks ${[...NO_DOM_LAYERS].sort().join(', ')} (3(h))`));

    // 3(h) part two — the HEADLESS pass. `shell/` and `net/` are checked with ES2022 + WebWorker:
    // every platform global they legitimately use (fetch, AbortSignal, crypto, timers) is present,
    // and no DOM UI type is. A `HTMLElement` anywhere in the runtime is a build error from here on.
    const headlessFiles = tsFiles.filter((r) => NO_DOM_LAYERS.includes(layerOf(r)) && r !== DOM_BOUNDARY);
    if (headlessFiles.length) {
      const headlessOptions = shellOptions(readTsconfig(ts, root, 'tsconfig.headless.json').options, contract);
      const headlessProgram = ts.createProgram({ rootNames: headlessFiles.map((r) => path.join(root, r)), options: headlessOptions, host: makeHost(ts, headlessOptions, shared, null) });
      refusals.push(...diagnosticsToRefusals(ts, 'pure-typecheck', root, ts.getPreEmitDiagnostics(headlessProgram)));
    }
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

  // 9(b). the PWA identity — refuse before addressing, so a broken identity is never emitted
  const pwaInputs = readPwaInputs(root);
  const pwaRefusals = pwaContract(pwaInputs);
  refusals.push(...pwaRefusals);
  refusals.push(...servingRefusals(servePath));
  if (refusals.length) throw new BuildRefused(refusals, log);
  const assets = pwaAssets(pwaInputs);
  const pwa = { id: JSON.parse(pwaInputs.manifestText).id, assets: assets.size };
  log.push(`pwa: ${PWA_MANIFEST} id ${pwa.id}, start_url ./, standalone portrait; ${PWA_ICONS.length} manifest icons + 1 apple-touch icon; no service worker`);
  // Printed on every build because it is the one identity rule nothing here can check by itself.
  log.push(`serving: do NOT serve this tree at or under ${PWA_SERVING.mustNotBeServedAtOrUnder} — ${PWA_SERVING.why}. Check a path with: ${PWA_SERVING.check}${servePath === null ? '' : ` (checked: ${servePath})`}`);

  const web = addressTarget('web', modules, styles, indexTemplate, assets);
  refusals.push(...web.refusals);
  let capacitor = null;
  if (target === 'capacitor') {
    capacitor = addressTarget('capacitor', modules, styles, indexTemplate, assets);
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
  // M2 — the runtime package boundary, machine-readable and DERIVED, never hand-listed.
  //
  // The React presentation carrier is a separate build. This block is the contract between the two:
  // it names every module that constitutes the headless runtime, with its hash, so the carrier's own
  // build can assert it imports nothing else and that what it imported has not drifted.
  //
  // `dom-port.ts` is excluded by name: it lives in shell/ but IS the DOM boundary, and a carrier
  // that imported it would be importing the thing the split exists to isolate.
  const runtimeModules = all
    .filter((rel) => RUNTIME_LAYERS.includes(layerOf(rel)) && rel !== DOM_BOUNDARY)
    .map((rel) => ({ path: rel, sha256: sha256(fs.readFileSync(path.join(root, rel))) }));
  if (!runtimeModules.length) throw new BuildRefused([refusal('layer', 'dist/manifest.json', 0, 'runtime', 'the runtime package is empty (3(m))')]);
  if (runtimeModules.some((m) => m.path === DOM_BOUNDARY))
    throw new BuildRefused([refusal('layer', DOM_BOUNDARY, 0, 'runtime', `${DOM_BOUNDARY} is the DOM boundary and may not be part of the runtime package (3(m))`)]);

  const manifest = {
    name: 'maya-chat-shell',
    sources: all,
    runtime: {
      package: '@maya/runtime',
      layers: [...RUNTIME_LAYERS],
      domBoundary: DOM_BOUNDARY,
      modules: runtimeModules,
    },
    bytes: Buffer.byteLength(joined, 'utf8'),
    digest: sha256(Buffer.from(joined, 'utf8')),
    toolchain: { typescript: ts.version, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' },
    web: web.manifest,
    targets: TARGETS,
    // The constraint travels with the artefact, and compareManifest diffs it: a build that stops
    // carrying it fails --check instead of losing it quietly.
    serving: PWA_SERVING,
  };
  return { log, presence, manifest, joined, web, capacitor, pwa };
}

function addressTarget(name, modules, styles, indexTemplate, assets = new Map()) {
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
  const record = (entries) => entries.sort((a, b) => codeUnitOrder(a[0], b[0])).map(([rel, bytes]) => ({ path: rel, sha256: sha256(bytes), bytes: bytes.length }));
  const manifestFiles = record([...files.entries()]);
  // The PWA assets are addressed by their own recorded hashes rather than folded into `digest`:
  // `digest` is the address of the EXECUTABLE graph, and the module URLs it names should not churn
  // because the owner replaced a placeholder icon. --check compares these hashes file by file.
  const manifestAssets = record([...assets.entries()]);
  return {
    name,
    digest,
    d16,
    files,
    styles,
    index,
    assets,
    refusals,
    manifest: {
      digest,
      modulePath: `m/${d16}/`,
      files: manifestFiles,
      styles: styles ? { sha256: sha256(styles), bytes: styles.length } : null,
      index: index ? { sha256: sha256(index), bytes: index.length } : null,
      assets: manifestAssets,
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
  // 9(b): the installable identity is the SHARED shell's, so it is the same bytes on both carriers.
  for (const [rel, bytes] of web.assets) {
    const other = cap.assets.get(rel);
    if (!other || Buffer.compare(bytes, other) !== 0) out.push(refusal('target', rel, 0, '', 'a PWA asset differs between targets'));
  }
  for (const rel of cap.assets.keys()) if (!web.assets.has(rel)) out.push(refusal('target', rel, 0, '', 'the capacitor target emits a PWA asset the web target does not'));
  return out;
}

// ── 9(b). the PWA identity: the manifest, the head that links it, the icons ──────────────────────

/**
 * Every `:root` declaration block, split into the two scopes the schemes are read from: the top level
 * (what a light-scheme window paints) and the body of `@media (prefers-color-scheme: dark)`. Both are
 * lists, in source order, because a stylesheet may carry more than one `:root` per scope and the
 * cascade resolves that by ORDER — see `schemeToken`. Declaration blocks in entry/styles.css nest no
 * braces, so one `}` closes one block; the at-rule depth is tracked for the scopes themselves.
 */
function rootBlocks(css) {
  const DARK = '@media (prefers-color-scheme: dark)';
  const light = [];
  const dark = [];
  let depth = 0;
  let darkDepth = -1;
  let at = 0;
  while (at < css.length) {
    if (css.startsWith(DARK, at)) {
      darkDepth = depth + 1;
      at += DARK.length;
      continue;
    }
    if (css.startsWith(':root', at)) {
      const open = css.indexOf('{', at);
      const close = open < 0 ? -1 : css.indexOf('}', open);
      if (open < 0 || close < 0) break;
      if (depth === 0) light.push(css.slice(open + 1, close));
      else if (depth === darkDepth) dark.push(css.slice(open + 1, close));
      at = close + 1; // both braces consumed, so `depth` is unchanged
      continue;
    }
    if (css[at] === '{') depth += 1;
    else if (css[at] === '}') {
      if (depth === darkDepth) darkDepth = -1;
      depth -= 1;
    }
    at += 1;
  }
  return { light, dark };
}

/**
 * One stylesheet token in both schemes. A manifest colour or a theme-color meta that does not equal
 * the token the page actually paints is the seam every PWA shows at the top of a standalone window.
 *
 * The LAST declaration is the one read, in both senses — the last `--name` inside a block and the last
 * `:root` block of the scope — because that is what CSS paints: among declarations of equal
 * specificity the later one wins. Reading the FIRST was a hole in exactly the direction that matters:
 * a second `--bg` appended to `:root` repainted the page while this reader still returned the value
 * nothing paints, so the manifest's two colours and both theme-color metas kept matching a dead token
 * and the build stayed green with a chrome that no longer equals the page. Measured: a doubled `--bg`
 * put the painted body background at `rgb(255, 0, 0)` with the theme-color meta still saying #f6f5f2.
 */
export function schemeToken(css, name) {
  if (typeof css !== 'string') return { light: null, dark: null };
  const blocks = rootBlocks(css);
  const read = (scope) => {
    let value = null;
    for (const block of scope)
      for (const m of block.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, 'g'))) value = m[1].trim();
    return value;
  };
  return { light: read(blocks.light), dark: read(blocks.dark) };
}

/**
 * A PNG read as a phone reads it: the signature, a 13-byte IHDR, a whole chunk walk ending at IEND,
 * and IDAT that actually inflates. Nothing here assumes the colour type or bit depth, so replacing
 * the placeholder artwork with anything a browser can decode keeps the build green.
 */
export function pngProbe(bytes) {
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 45) return null;
  if (Buffer.compare(bytes.subarray(0, 8), SIGNATURE) !== 0) return null;
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const idat = [];
  let at = 8;
  let end = false;
  while (at + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const next = at + 12 + length;
    if (length > bytes.length || next > bytes.length) return null;
    if (type === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === 'IEND') {
      end = next === bytes.length;
      break;
    }
    at = next;
  }
  if (!end || idat.length === 0) return null;
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  return width > 0 && height > 0 && raw.length >= height ? { width, height, pixelBytes: raw.length } : null;
}

/** The sources 9(b) reads: the manifest, the icon bytes, the head template and the stylesheet. */
export function readPwaInputs(root) {
  const read = (rel) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel)) : null);
  const icons = new Map();
  for (const icon of [...PWA_ICONS, APPLE_TOUCH_ICON]) icons.set(icon.name, read(`${PWA_ICON_SOURCE}/${icon.name}`));
  const manifest = read(`entry/${PWA_MANIFEST}`);
  const index = read('entry/index.html');
  const css = read('entry/styles.css');
  return {
    manifestText: manifest === null ? null : manifest.toString('utf8'),
    index: index === null ? null : index.toString('utf8'),
    css: css === null ? null : css.toString('utf8'),
    icons,
  };
}

/**
 * Every <base>, <link> and <meta> the document really has, in tree order, with its attributes parsed:
 * attribute order, quoting and letter case are the author's business, and a browser does not care
 * about any of them. This is what makes the head contract a count of what the page HAS rather than a
 * count of the literal the build hoped to find. The whole document is scanned, not the head alone —
 * Chrome honours a `<base href>` wherever it is parsed, and a tag in the body is no less real.
 */
export function headTags(html) {
  const out = [];
  for (const tag of html.matchAll(/<(base|link|meta)\b([^>]*)>/gi)) {
    const attrs = new Map();
    for (const a of tag[2].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))
      if (!attrs.has(a[1].toLowerCase())) attrs.set(a[1].toLowerCase(), (a[2] ?? a[3] ?? a[4] ?? '').trim());
    out.push({ tag: tag[1].toLowerCase(), attrs, raw: tag[0] });
  }
  return out;
}
const attrOf = (tag, name) => tag.attrs.get(name) ?? '';
/** `rel` is a space-separated, case-insensitive token list — `REL=manifest` is the same role. */
const relTokens = (tag) => attrOf(tag, 'rel').toLowerCase().split(/\s+/).filter((t) => t !== '');
/** One CSP policy string as a browser reads it: directive name → its value tokens. */
const cspDirectives = (policy) => {
  const out = new Map();
  for (const part of String(policy).split(';')) {
    const tokens = part.trim().split(/\s+/).filter((t) => t !== '');
    if (tokens.length && !out.has(tokens[0].toLowerCase())) out.set(tokens[0].toLowerCase(), tokens.slice(1));
  }
  return out;
};
/**
 * The `content` of a `<meta name="viewport">` as a comma-separated key=value list, whitespace around
 * the `=` removed, so `viewport-fit = cover` and `viewport-fit=cover` are the same token.
 */
const viewportTokens = (tag) =>
  attrOf(tag, 'content')
    .split(',')
    .map((t) => t.trim().replace(/\s*=\s*/, '=').toLowerCase())
    .filter((t) => t !== '');
/**
 * The viewport the whole mobile layout is written against. `viewport-fit=cover` is what makes
 * `env(safe-area-inset-*)` non-zero, so without it every `--safe-*` token in entry/styles.css is 0px
 * and the notch and the home indicator paint over the shell; `interactive-widget=resizes-content` is
 * what makes Chrome shrink the layout viewport for the on-screen keyboard, which is the behaviour the
 * composer's keyboard inset is built on. Neither is decorative and neither is visible in a test that
 * only reads the stylesheet, so both are pinned here.
 */
const VIEWPORT_TOKENS = Object.freeze(['width=device-width', 'initial-scale=1', 'viewport-fit=cover', 'interactive-widget=resizes-content']);
/**
 * Tokens that forbid scaling. `user-scalable=no` and a `maximum-scale`/`minimum-scale` pin are the
 * three ways a viewport meta takes zoom away, and every one of them breaks the large-text reflow the
 * mobile probe measures. They are refused rather than merely absent, because a later edit that adds
 * one would pass a presence-only check.
 */
const VIEWPORT_FORBIDDEN = Object.freeze(['user-scalable', 'maximum-scale', 'minimum-scale']);

/**
 * The manifest members this shell admits, and nothing else. An open set is not a contract: a member
 * the build never looked at can override one it checked. `display_override` is the case that matters
 * — a browser that understands it takes it INSTEAD of `display`, so `display_override: ["browser"]`
 * turns the standalone window this layout is built for back into a tab while every checked member
 * still reads as it should. The others (share_target, protocol_handlers, file_handlers,
 * launch_handler, scope_extensions, prefer_related_applications, shortcuts, …) each hand the OS a way
 * into the app that no part of this shell was designed for, so they are refused by name rather than
 * by being unlisted.
 */
const PWA_MANIFEST_MEMBERS = Object.freeze([
  'id', 'name', 'short_name', 'lang', 'dir', 'start_url', 'scope', 'display', 'orientation',
  'theme_color', 'background_color', 'icons',
]);

/**
 * Everything a phone needs before it will install this shell, checked as a contract rather than
 * described in a document: the identity that must never collide with the retired install, a
 * start_url that opens the chat rather than restoring a route, colours that equal the stylesheet's
 * own tokens in both schemes, the head tags iOS and Android read, and icons that decode.
 *
 * Refusals carry the `target` rule — step 9's rule — because this is the same class of failure:
 * an emitted page that does not match the contract its carriers were promised.
 */
export function pwaContract({ manifestText, index, css, icons }) {
  const out = [];
  const MF = `entry/${PWA_MANIFEST}`;
  const say = (file, message) => out.push(refusal('target', file, 0, '', message));
  const bg = schemeToken(css, 'bg');
  if (bg.light === null || bg.dark === null) say('entry/styles.css', 'entry/styles.css must declare --bg in :root and in the dark scheme — the PWA colours are read from it');

  // ── the manifest ──
  let manifest = null;
  if (manifestText === null) say(MF, 'the shell has no web app manifest, so it cannot be installed');
  else if (manifestText.charCodeAt(0) === 0xfeff) say(MF, 'the manifest starts with a byte-order mark');
  else {
    try {
      manifest = JSON.parse(manifestText);
    } catch (e) {
      say(MF, `the manifest is not JSON: ${e.message}`);
    }
    if (manifest !== null && (typeof manifest !== 'object' || Array.isArray(manifest))) {
      say(MF, 'the manifest must be a JSON object');
      manifest = null;
    }
    if (manifest !== null && `${JSON.stringify(manifest, null, 2)}\n` !== manifestText)
      say(MF, 'the manifest must be written in canonical form (JSON.stringify with two-space indent, one trailing newline) so its emitted bytes are predictable');
    if (/service.?worker/i.test(manifestText)) say(MF, 'the manifest names a service worker; the shell deliberately has none (the build bans the name)');
  }
  if (manifest !== null) {
    const m = manifest;
    const admitted = new Set(PWA_MANIFEST_MEMBERS);
    for (const key of Object.keys(m))
      if (!admitted.has(key))
        say(
          MF,
          key === 'display_override'
            ? 'the manifest declares display_override, which a browser takes INSTEAD of display: it can put the installed app back in a tab while `display: "standalone"` still reads correctly. The admitted members are exactly ' +
                `${PWA_MANIFEST_MEMBERS.join(', ')}`
            : `the manifest declares "${key}", which is not one of the admitted members (${PWA_MANIFEST_MEMBERS.join(', ')}) — an unchecked member can override a checked one, so the set is closed`,
        );
    for (const key of ['id', 'name', 'short_name', 'lang', 'dir', 'start_url', 'scope', 'display', 'orientation', 'theme_color', 'background_color', 'icons'])
      if (!(key in m)) say(MF, `the manifest has no ${key}`);
    const id = m.id;
    if (typeof id !== 'string' || !id.startsWith('/'))
      say(MF, 'the manifest id must be an origin-relative path, so the identity cannot change with the directory the shell is deployed under');
    else if (id === LEGACY_PWA_ID || id === LEGACY_PWA_ID.replace(/\/$/, '') || id.startsWith(LEGACY_PWA_ID))
      say(MF, `the manifest id is "${id}" — the retired PWA's install id is "${LEGACY_PWA_ID}", and an install is (origin, id): this would update the owner's legacy install instead of installing beside it`);
    if (typeof m.start_url === 'string' && m.start_url.includes('#'))
      say(MF, 'start_url carries a fragment; the shell reads its route from the fragment, so a launch would restore a stored route instead of opening the chat');
    else if (m.start_url !== './')
      say(MF, `start_url must be "./" (got ${JSON.stringify(m.start_url ?? null)}) so a launch opens the chat at the shell's own directory`);
    if (m.scope !== './') say(MF, `scope must be "./" (got ${JSON.stringify(m.scope ?? null)})`);
    if (m.display !== 'standalone') say(MF, `display must be "standalone" (got ${JSON.stringify(m.display ?? null)})`);
    if (m.orientation !== 'portrait') say(MF, `orientation must be "portrait" (got ${JSON.stringify(m.orientation ?? null)})`);
    if (m.lang !== 'ru') say(MF, `lang must be "ru" (got ${JSON.stringify(m.lang ?? null)}) — it is the language of the page it installs`);
    if (typeof m.name !== 'string' || m.name.trim() === '') say(MF, 'name must be a non-empty string');
    if (typeof m.short_name !== 'string' || m.short_name.trim() === '') say(MF, 'short_name must be a non-empty string');
    else if (m.short_name.length > 12) say(MF, `short_name is ${m.short_name.length} characters; a home screen truncates past about 12`);
    for (const key of ['theme_color', 'background_color'])
      if (m[key] !== bg.light)
        say(MF, `${key} is ${JSON.stringify(m[key] ?? null)} but the stylesheet's light --bg is ${JSON.stringify(bg.light)}; a window whose chrome does not equal the page's own background shows a seam`);
    const want = PWA_ICONS.map((i) => ({ src: `./${PWA_ICON_DIR}/${i.name}`, sizes: `${i.size}x${i.size}`, type: 'image/png', purpose: i.purpose }));
    const got = Array.isArray(m.icons) ? m.icons : null;
    if (got === null) say(MF, 'icons must be an array');
    else if (`${JSON.stringify(got)}` !== `${JSON.stringify(want)}`)
      say(MF, `icons must be exactly ${JSON.stringify(want)} — the rows the build emits, at 192, 512 and a maskable 512`);
  }

  // ── the head that links it ──
  // Counted structurally, never by matching an expected literal. A browser reads the HEAD, not the
  // bytes this build hoped for, and for the manifest it uses the FIRST `<link rel=manifest>` in tree
  // order. A literal count therefore admitted a SECOND link in another spelling placed before the
  // canonical one, and Chrome's own Page.getAppId then answered the retired install's id while this
  // build printed the canonical one. So: parse every base, link and meta the head really has, group
  // them by the role the browser reads them for, and refuse anything but exactly one of each role.
  if (index === null) say('entry/index.html', 'the PWA head contract needs entry/index.html');
  else {
    const tags = headTags(index);
    const links = (token) => tags.filter((t) => t.tag === 'link' && relTokens(t).includes(token));
    const metas = (name) => tags.filter((t) => t.tag === 'meta' && attrOf(t, 'name').toLowerCase() === name);
    const seen = (found) => found.map((t) => JSON.stringify(t.raw)).join(', ');
    /** Exactly one tag in this role, and it is the canonical spelling. */
    const onlyOne = (found, what, canonical) => {
      if (found.length !== 1) {
        say('entry/index.html', `${what} must appear exactly once in the head — a browser uses the FIRST tag in this role in tree order, whatever its spelling (found ${found.length}${found.length ? `: ${seen(found)}` : ''})`);
        return null;
      }
      if (canonical !== null && found[0].raw !== canonical) {
        say('entry/index.html', `${what} must be written exactly \`${canonical}\` (found ${JSON.stringify(found[0].raw)})`);
        return null;
      }
      return found[0];
    };

    onlyOne(links('manifest'), `the manifest link \`<link rel="manifest" href="./${PWA_MANIFEST}">\``, `<link rel="manifest" href="./${PWA_MANIFEST}">`);

    // ── the base URL every relative URL in the page resolves against ──
    // Both halves of this are MEASURED, not reasoned, because the obvious reading of the meta CSP is
    // wrong. `base-uri 'none'` in a META policy fences a `<base>` only when the `<base>` is parsed
    // AFTER the meta, since a meta-delivered policy governs what follows it in the document. Served
    // with no CSP header, Chrome 154 honoured a `<base href="/app/">` planted as the FIRST tag of this
    // very head WITH the token intact: document.baseURI became http://…/app/, the manifest was fetched
    // from /app/manifest.webmanifest instead of the shell's own, and Page.getAppId answered
    // http://…/app/ — the retired install's identity, which is the one thing the absolute `id` exists
    // to keep apart. The same tag placed after the meta was inert. So neither clause below is
    // redundant: the element is the only thing that covers the before-the-meta position, and the token
    // covers the after-the-meta one and does not depend on the deploy host sending a header CSP (the
    // shell's own dev server does send one, and it made all four planted variants inert — which is
    // exactly why the meta cannot be checked by serving it there).
    const bases = tags.filter((t) => t.tag === 'base');
    if (bases.length)
      say('entry/index.html', `the page declares a <base> element, which moves the base URL every relative URL resolves against — including ./${PWA_MANIFEST}, so the install identity becomes whatever manifest lives at the new base. Measured in Chrome: a <base href="${LEGACY_PWA_ID}"> placed before the meta CSP is honoured DESPITE base-uri 'none' in it, and Page.getAppId then answered the retired install's id. The shell has no <base> and must not acquire one (found ${seen(bases)})`);
    const csps = tags.filter((t) => t.tag === 'meta' && attrOf(t, 'http-equiv').toLowerCase() === 'content-security-policy');
    if (csps.length !== 1)
      say('entry/index.html', `the head must carry exactly one meta Content-Security-Policy — a browser enforces the INTERSECTION of every policy it is given, so a second one silently narrows or widens nothing predictably (found ${csps.length}${csps.length ? `: ${seen(csps)}` : ''})`);
    else {
      const baseUri = cspDirectives(attrOf(csps[0], 'content')).get('base-uri') ?? null;
      if (baseUri === null || baseUri.join(' ') !== "'none'")
        say('entry/index.html', `the meta CSP must carry base-uri 'none' — it is what makes a <base> element parsed after it inert, and it is the only such fence on a host that serves this tree without a CSP header (found ${JSON.stringify(baseUri === null ? null : baseUri.join(' '))})`);
    }

    // ── the viewport ──
    // A browser uses the FIRST viewport meta, so a second one in any spelling decides the layout.
    const viewports = metas('viewport');
    if (viewports.length !== 1)
      say('entry/index.html', `the viewport meta must appear exactly once in the head — a browser uses the FIRST one in tree order, whatever its spelling (found ${viewports.length}${viewports.length ? `: ${seen(viewports)}` : ''})`);
    else {
      const got = viewportTokens(viewports[0]);
      for (const token of VIEWPORT_TOKENS)
        if (!got.includes(token))
          say(
            'entry/index.html',
            `the viewport meta must carry ${token} — ${
              token === 'viewport-fit=cover'
                ? 'without it every env(safe-area-inset-*) is 0px, so the --safe-* tokens the whole shell pads from collapse and the notch and the home indicator paint over it'
                : token === 'interactive-widget=resizes-content'
                  ? "without it Chrome leaves the layout viewport at full height when the keyboard opens, so the composer's keyboard inset never has a smaller viewport to react to"
                  : 'the layout is written against it'
            } (found ${JSON.stringify(attrOf(viewports[0], 'content'))})`,
          );
      // Presence of the four is not enough: a token that FORBIDS scaling defeats the reflow this shell
      // is measured at. test/mobile-probe.mjs gates every control at a 2x text scale, and a pinch-zoom
      // ban is an accessibility failure the build must not be able to ship quietly.
      for (const token of got)
        if (VIEWPORT_FORBIDDEN.some((f) => token === f || token.startsWith(`${f}=`)))
          say(
            'entry/index.html',
            `the viewport meta carries ${token}, which stops the page being scaled — the shell is built to reflow and the mobile probe gates every control at a 2x text scale, so zoom may not be forbidden (found ${JSON.stringify(attrOf(viewports[0], 'content'))})`,
          );
    }
    onlyOne(
      links('apple-touch-icon'),
      'the apple-touch-icon link (iOS reads no manifest icon when it is added to the home screen)',
      `<link rel="apple-touch-icon" sizes="${APPLE_TOUCH_ICON.size}x${APPLE_TOUCH_ICON.size}" href="./${PWA_ICON_DIR}/${APPLE_TOUCH_ICON.name}">`,
    );
    // iOS prefers `apple-touch-icon-precomposed` over `apple-touch-icon`, so one of those would decide
    // the home-screen artwork without the checked link ever being read.
    const precomposed = links('apple-touch-icon-precomposed');
    if (precomposed.length) say('entry/index.html', `the head declares apple-touch-icon-precomposed, which iOS prefers over the apple-touch-icon link this build checks (found ${seen(precomposed)})`);

    const capable = metas('apple-mobile-web-app-capable');
    if (capable.length !== 1 || attrOf(capable[0], 'content') !== 'yes')
      say('entry/index.html', `apple-mobile-web-app-capable must appear exactly once with content="yes" (found ${capable.length}${capable.length ? `: ${seen(capable)}` : ''})`);
    const bars = metas('apple-mobile-web-app-status-bar-style');
    if (bars.length !== 1 || !APPLE_STATUS_BAR_STYLES.has(attrOf(bars[0], 'content')))
      say('entry/index.html', `apple-mobile-web-app-status-bar-style must appear exactly once with one of ${[...APPLE_STATUS_BAR_STYLES].join(', ')} (found ${bars.length}${bars.length ? `: ${seen(bars)}` : ''})`);

    // A browser paints the chrome from the FIRST theme-color whose media query matches, so a third
    // meta in any spelling decides it. Exactly two, one per scheme, each equal to that scheme's token.
    const themes = metas('theme-color');
    if (themes.length !== 2)
      say('entry/index.html', `the head must carry exactly two theme-color metas, one per prefers-color-scheme — a browser paints from the first that matches, so an unscoped or extra one paints the wrong chrome (found ${themes.length}${themes.length ? `: ${seen(themes)}` : ''})`);
    else {
      const byScheme = new Map();
      for (const t of themes) {
        const media = attrOf(t, 'media').replace(/\s+/g, ' ').trim();
        const m = /^\(prefers-color-scheme: (light|dark)\)$/.exec(media);
        if (m === null) say('entry/index.html', `every theme-color meta must be scoped to one prefers-color-scheme (found media=${JSON.stringify(media)} in ${JSON.stringify(t.raw)})`);
        else if (byScheme.has(m[1])) say('entry/index.html', `two theme-color metas claim the ${m[1]} scheme`);
        else byScheme.set(m[1], attrOf(t, 'content'));
      }
      for (const scheme of ['light', 'dark']) {
        if (!byScheme.has(scheme)) say('entry/index.html', `the head has no theme-color meta for the ${scheme} scheme`);
        else if (byScheme.get(scheme) !== bg[scheme])
          say('entry/index.html', `the ${scheme} theme-color is ${JSON.stringify(byScheme.get(scheme))} but the stylesheet's ${scheme} --bg is ${JSON.stringify(bg[scheme])}`);
      }
    }
    if (/service.?worker/i.test(index)) say('entry/index.html', 'the page names a service worker; the shell deliberately has none');
  }

  // ── the icons ──
  for (const icon of [...PWA_ICONS, APPLE_TOUCH_ICON]) {
    const rel = `${PWA_ICON_SOURCE}/${icon.name}`;
    const bytes = icons.get(icon.name) ?? null;
    if (bytes === null) {
      say(rel, `the icon is missing — regenerate the set with \`node ${PWA_ICON_SOURCE.replace(/\/icons$/, '')}/make-icons.mjs\``);
      continue;
    }
    const probe = pngProbe(bytes);
    if (probe === null) say(rel, 'the icon is not a whole, decodable PNG (signature, IHDR, an IDAT that inflates, IEND)');
    else if (probe.width !== icon.size || probe.height !== icon.size)
      say(rel, `the icon is ${probe.width}x${probe.height} but is declared ${icon.size}x${icon.size}`);
  }
  return out;
}

/** The manifest and icon bytes as they are emitted, keyed by their path inside the target. */
export function pwaAssets(inputs) {
  const assets = new Map();
  if (inputs.manifestText !== null) assets.set(PWA_MANIFEST, Buffer.from(inputs.manifestText, 'utf8'));
  for (const icon of [...PWA_ICONS, APPLE_TOUCH_ICON]) {
    const bytes = inputs.icons.get(icon.name) ?? null;
    if (bytes !== null) assets.set(`${PWA_ICON_DIR}/${icon.name}`, bytes);
  }
  return assets;
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
    const pureFiles = fixtureTs.filter((r) => PURE_LAYERS.has(layerOf(r)) && layerOf(r) !== 'contract');
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

/**
 * 9(b) proven the way the gate rows are: against the REAL committed manifest, head and icons, and
 * then once per mutation that a phone would feel — each of which must be refused by a named clause,
 * not merely by "some refusal happened".
 *
 * The TypeScript fixtures under test/fixtures/build/** cannot carry these: they are compiled from a
 * virtual root through `runGates`, and nothing in them is HTML, JSON or PNG. So the identity gets a
 * table here, next to the write guard, which is the other rule that is proven by execution.
 */
export function pwaContractTest(root = ROOT) {
  const base = readPwaInputs(root);
  const rows = [];
  const clone = () => ({ manifestText: base.manifestText, index: base.index, css: base.css, icons: new Map(base.icons) });
  const canonical = (m) => `${JSON.stringify(m, null, 2)}\n`;
  const parsed = () => JSON.parse(base.manifestText);
  const row = (name, input, needle) => {
    const refusals = pwaContract(input);
    const hit = needle === null ? refusals.length === 0 : refusals.some((r) => r.message.includes(needle));
    rows.push({
      name: `pwa: ${name}`,
      ok: hit && (needle === null || refusals.length > 0),
      detail: needle === null && refusals.length ? ` — ${refusals.map((r) => `${r.file}: ${r.message}`).join(' | ')}` : '',
    });
  };
  const withManifest = (name, needle, mutate) => {
    const input = clone();
    const m = parsed();
    mutate(m);
    input.manifestText = canonical(m);
    row(name, input, needle);
  };
  const withIndex = (name, needle, mutate) => {
    const input = clone();
    input.index = mutate(base.index);
    row(name, input, needle);
  };
  const withIcon = (name, needle, icon, bytes) => {
    const input = clone();
    input.icons.set(icon, bytes);
    row(name, input, needle);
  };

  row('the committed manifest, head and icons are admitted', clone(), null);
  withManifest('an id equal to the retired install is refused', 'update the owner\'s legacy install', (m) => { m.id = LEGACY_PWA_ID; });
  withManifest('an id under the retired install is refused', 'update the owner\'s legacy install', (m) => { m.id = '/app/maya'; });
  withManifest('a relative id is refused', 'origin-relative path', (m) => { m.id = './'; });
  withManifest('a start_url with a fragment is refused', 'restore a stored route', (m) => { m.start_url = './#fs.history'; });
  withManifest('a start_url outside the shell directory is refused', 'start_url must be "./"', (m) => { m.start_url = '/app/'; });
  withManifest('a scope other than ./ is refused', 'scope must be', (m) => { m.scope = '/'; });
  withManifest('display browser is refused', 'display must be', (m) => { m.display = 'browser'; });
  withManifest('a free orientation is refused', 'orientation must be', (m) => { m.orientation = 'any'; });
  withManifest('the wrong lang is refused', 'lang must be', (m) => { m.lang = 'en'; });
  withManifest('an empty short_name is refused', 'short_name must be', (m) => { m.short_name = ''; });
  withManifest('a theme_color that is not the stylesheet token is refused', 'shows a seam', (m) => { m.theme_color = '#000000'; });
  withManifest('a background_color that is not the stylesheet token is refused', 'shows a seam', (m) => { m.background_color = '#ffffff'; });
  withManifest('a missing icon row is refused', 'icons must be exactly', (m) => { m.icons = m.icons.slice(1); });
  withManifest('an icon row of the wrong size is refused', 'icons must be exactly', (m) => { m.icons[0].sizes = '144x144'; });
  withManifest('a manifest that names a service worker is refused', 'names a service worker', (m) => { m.serviceworker = { src: './sw.js' }; });
  {
    const input = clone();
    input.manifestText = `${JSON.stringify(parsed(), null, 4)}\n`;
    row('a manifest that is not in canonical form is refused', input, 'canonical form');
  }
  {
    const input = clone();
    input.manifestText = null;
    row('no manifest at all is refused', input, 'cannot be installed');
  }
  withIndex('a head without the manifest link is refused', 'must appear exactly once', (h) => h.replace(`<link rel="manifest" href="./${PWA_MANIFEST}">\n`, ''));
  withIndex('a head without the apple-touch icon is refused', 'apple-touch-icon link', (h) => h.replace(/<link rel="apple-touch-icon"[^>]*>\n/, ''));
  withIndex('a head without apple-mobile-web-app-capable is refused', 'apple-mobile-web-app-capable', (h) => h.replace(/<meta name="apple-mobile-web-app-capable"[^>]*>\n/, ''));
  withIndex('an unknown status bar style is refused', 'status-bar-style must appear exactly once with one of', (h) => h.replace(/content="(default|black|black-translucent)">/, 'content="translucent">'));
  withIndex('a single unscoped theme-color is refused', 'exactly two theme-color metas', (h) => h.replace(/<meta name="theme-color"[^>]*>\n<meta name="theme-color"[^>]*>\n/, '<meta name="theme-color" content="#f6f5f2">\n'));
  // The wrong value has to be wrong. It used to be #000000, which stopped mutating anything the day
  // the dark --bg became #000000 — a mutation that does not mutate proves the rule is checked when it
  // proves nothing at all. #123456 is no scheme's token and never will be.
  withIndex('a theme-color that is not the dark token is refused', 'dark --bg is', (h) => h.replace(/(<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content=")[^"]*/, '$1#123456'));
  withIndex('a page that registers a service worker is refused', 'names a service worker', (h) => h.replace('</head>', '<link rel="serviceworker" href="./sw.js">\n</head>'));

  // ── the bypasses a literal count admitted: a second tag in the same ROLE, in another spelling ──
  // The first of these was measured in a browser, not argued: with the planted link in place, Chrome's
  // Page.getAppManifest fetched ./legacy.webmanifest and Page.getAppId answered the retired install's
  // id, while `node build.mjs` printed `id /maya-chat-shell/` and exited 0.
  withIndex(
    'a SECOND manifest link, differently spelled, placed BEFORE the canonical one is refused (the browser uses the first)',
    'must appear exactly once in the head',
    (h) => h.replace(`<link rel="manifest" href="./${PWA_MANIFEST}">`, `<link href='./legacy.webmanifest' REL=manifest>\n<link rel="manifest" href="./${PWA_MANIFEST}">`),
  );
  withIndex(
    'a manifest link with its attributes reordered is refused (one spelling, so the emitted bytes are predictable)',
    'must be written exactly',
    (h) => h.replace(`<link rel="manifest" href="./${PWA_MANIFEST}">`, `<link href="./${PWA_MANIFEST}" rel="manifest">`),
  );
  withIndex(
    'a second apple-touch-icon link before the canonical one is refused',
    'apple-touch-icon link',
    (h) => h.replace('<link rel="apple-touch-icon"', '<link rel="APPLE-TOUCH-ICON" sizes="180x180" href="./icons/other.png">\n<link rel="apple-touch-icon"'),
  );
  withIndex(
    'an apple-touch-icon-precomposed link is refused (iOS prefers it over the checked one)',
    'apple-touch-icon-precomposed',
    (h) => h.replace('</head>', '<link rel="apple-touch-icon-precomposed" sizes="180x180" href="./icons/other.png">\n</head>'),
  );
  withIndex(
    'a THIRD theme-color meta, differently spelled, is refused',
    'exactly two theme-color metas',
    (h) => h.replace('<meta name="theme-color"', '<meta content=#000000 NAME=theme-color>\n<meta name="theme-color"'),
  );
  withIndex(
    'a second apple-mobile-web-app-capable meta is refused',
    'apple-mobile-web-app-capable must appear exactly once',
    (h) => h.replace('</head>', "<meta name='APPLE-MOBILE-WEB-APP-CAPABLE' content=yes>\n</head>"),
  );
  withIndex(
    'a theme-color scoped to something other than a colour scheme is refused',
    'scoped to one prefers-color-scheme',
    (h) => h.replace('media="(prefers-color-scheme: light)"', 'media="(min-width: 1px)"'),
  );

  // ── the base URL, both halves, each measured in a browser before it was pinned ──
  // Dropping the token: a <base> parsed after the meta goes from inert to honoured.
  // Planting the element: honoured even WITH the token, because it is parsed before the policy exists.
  // In both cases Chrome's Page.getAppId answered http://…/app/ — the retired install's identity.
  withIndex(
    "a meta CSP that has lost base-uri 'none' is refused (measured: the same planted <base> goes from inert to honoured, and Page.getAppId becomes the retired install's id)",
    "must carry base-uri 'none'",
    (h) => h.replace("base-uri 'none'; ", ''),
  );
  withIndex(
    'a planted <base href="/app/"> is refused (measured: honoured DESPITE the meta token, because a meta policy governs only what follows it)',
    'declares a <base> element',
    (h) => h.replace('<head>', '<head>\n<base href="/app/">'),
  );

  // ── the viewport the mobile layout is written against ──
  withIndex(
    'a viewport meta without viewport-fit=cover is refused (every env(safe-area-inset-*) would be 0px)',
    'must carry viewport-fit=cover',
    (h) => h.replace(', viewport-fit=cover', ''),
  );
  withIndex(
    'a SECOND viewport meta, differently spelled, placed BEFORE the canonical one is refused (the browser uses the first)',
    'viewport meta must appear exactly once',
    (h) => h.replace('<meta name="viewport"', "<meta NAME=VIEWPORT content='width=device-width, initial-scale=1'>\n<meta name=\"viewport\""),
  );

  // ── the manifest is a CLOSED set: an unchecked member can override a checked one ──
  withManifest('display_override is refused by name — a browser takes it INSTEAD of display', 'display_override', (m) => { m.display_override = ['browser']; });
  withManifest('an unknown member (share_target) is refused', 'not one of the admitted members', (m) => { m.share_target = { action: './', method: 'POST', enctype: 'multipart/form-data', params: { title: 'title' } }; });
  withManifest('an unknown member (scope_extensions) is refused', 'not one of the admitted members', (m) => { m.scope_extensions = [{ origin: 'https://example.invalid' }]; });
  withManifest('an unknown member (protocol_handlers) is refused', 'not one of the admitted members', (m) => { m.protocol_handlers = [{ protocol: 'web+maya', url: './?x=%s' }]; });
  withManifest('an unknown member (launch_handler) is refused', 'not one of the admitted members', (m) => { m.launch_handler = { client_mode: 'navigate-new' }; });
  withManifest('an unknown member (file_handlers) is refused', 'not one of the admitted members', (m) => { m.file_handlers = [{ action: './', accept: { 'text/plain': ['.txt'] } }]; });
  withManifest('an unknown member (prefer_related_applications) is refused', 'not one of the admitted members', (m) => { m.prefer_related_applications = true; });
  withManifest('an unknown member (shortcuts) is refused', 'not one of the admitted members', (m) => { m.shortcuts = [{ name: 'История', url: './#fs.history' }]; });
  withManifest('a manifest missing an admitted member is refused', 'the manifest has no dir', (m) => { delete m.dir; });
  withIcon('an icon at the wrong pixel size is refused', 'but is declared', PWA_ICONS[0].name, base.icons.get(APPLE_TOUCH_ICON.name));
  withIcon('a truncated icon is refused', 'whole, decodable PNG', PWA_ICONS[1].name, base.icons.get(PWA_ICONS[1].name).subarray(0, 60));
  withIcon('an icon whose deflate stream is corrupted is refused', 'whole, decodable PNG', PWA_ICONS[2].name, (() => {
    const bytes = Buffer.from(base.icons.get(PWA_ICONS[2].name));
    bytes[bytes.length - 20] ^= 0xff; // inside IDAT: the stream no longer inflates cleanly
    return bytes;
  })());
  withIcon('a missing icon is refused', 'the icon is missing', APPLE_TOUCH_ICON.name, null);
  {
    const input = clone();
    input.css = (input.css ?? '').replace(/--bg:[^;]*;/g, '');
    row('a stylesheet with no --bg token is refused', input, 'must declare --bg');
  }
  {
    // The reader takes the LAST declaration because that is the one CSS paints. Measured in Chrome
    // with this exact mutation: the painted body background was rgb(255, 0, 0) while the theme-color
    // meta still said #f6f5f2. Reading the first left the whole colour clause green over a page that
    // paints something else, so the mutation must now be refused by the colour clauses themselves.
    const input = clone();
    const first = /--bg:[^;]*;/.exec(input.css ?? '');
    input.css = (input.css ?? '').replace(first[0], `${first[0]}\n  --bg: #ff0000;`);
    row('a SECOND --bg appended to :root is read as CSS paints it — the last — so the manifest and meta colours no longer match', input, 'light --bg is "#ff0000"');
  }
  return rows;
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
  const pwa = pwaContractTest();
  const ok = results.every((r) => r.ok) && coverage.every((c) => c.ok) && guard.every((g) => g.ok) && pwa.every((p) => p.ok);
  return { ok, results, coverage, guard, pwa };
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
  for (const [rel, bytes] of t.assets) guard.write(path.join(outDir, ...rel.split('/')), bytes);
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
  // 9(b): the PWA assets are not part of `digest`, so they are compared here by name and hash.
  const priorAssets = new Map((prior.web?.assets ?? []).map((f) => [f.path, f.sha256]));
  const freshAssets = new Map(fresh.web.assets.map((f) => [f.path, f.sha256]));
  for (const [p, h] of freshAssets) if (priorAssets.get(p) !== h) diffs.push(`${p}: ${priorAssets.get(p) ?? 'absent'} != fresh ${h}`);
  for (const p of priorAssets.keys()) if (!freshAssets.has(p)) diffs.push(`${p}: no longer emitted`);
  for (const k of ['styles', 'index'])
    if ((prior.web?.[k]?.sha256 ?? null) !== (fresh.web[k]?.sha256 ?? null)) diffs.push(`${k}: ${prior.web?.[k]?.sha256 ?? 'absent'} != fresh ${fresh.web[k]?.sha256 ?? 'absent'}`);
  if (JSON.stringify(prior.serving ?? null) !== JSON.stringify(fresh.serving))
    diffs.push(`serving: ${JSON.stringify(prior.serving ?? null)} != fresh ${JSON.stringify(fresh.serving)}`);
  return diffs;
}

export async function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.includes('=')));
  const targetArg = argv.find((a) => a.startsWith('--target='));
  const target = targetArg ? targetArg.slice('--target='.length) : 'web';
  const servePathArg = argv.find((a) => a.startsWith('--serve-path='));
  const servePath = servePathArg ? servePathArg.slice('--serve-path='.length) : null;
  const known = new Set(['--check', '--self-test', '--typecheck', '--dry-run', '--no-baseline']);
  const knownValued = new Set(['--target', '--serve-path']);
  for (const f of flags)
    if (!known.has(f)) {
      console.error(`unknown flag ${f}`);
      return 2;
    }
  for (const a of argv)
    if (a.startsWith('--') && a.includes('=') && !knownValued.has(a.slice(0, a.indexOf('=')))) {
      console.error(`unknown flag ${a.slice(0, a.indexOf('='))}`);
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
      for (const c of [...r.coverage, ...r.guard, ...r.pwa]) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ?? ''}`);
      const refuse = r.results.filter((x) => x.direction === 'refuse');
      const admit = r.results.filter((x) => x.direction === 'admit');
      const bypass = r.results.find((x) => x.row === 'bypass');
      console.log(`self-test: refuse ${refuse.filter((x) => x.ok).length}/${refuse.length} refused with the named rule, admit ${admit.filter((x) => x.ok).length}/${admit.length} admitted, coverage ${r.coverage.filter((c) => c.ok).length}/${r.coverage.length}, write guard ${r.guard.filter((g) => g.ok).length}/${r.guard.length}, pwa contract ${r.pwa.filter((p) => p.ok).length}/${r.pwa.length}${bypass ? `, bypass${bypass.detail}` : ''}`);
      console.log(`self-test: ${r.ok ? 'PASS' : 'FAIL'}`);
      return r.ok ? 0 : 1;
    }
    const result = runBuild(ts, { tmp, target, typecheckOnly: flags.has('--typecheck'), noBaseline: flags.has('--no-baseline'), servePath });
    if (flags.has('--typecheck')) {
      for (const l of result.log) console.log(l);
      console.log('typecheck: PASS');
      return 0;
    }
    // The joined-source digest is the FIRST 64-hex token printed (k5-exit-gate.sh:17).
    console.log(`digest ${result.manifest.digest}`);
    const t = target === 'capacitor' ? result.capacitor : result.web;
    console.log(`web ${t.digest} (${target}; ${t.files.size} modules; styles.css ${t.styles ? 'present' : 'absent'}; index.html ${t.index ? 'present' : 'absent'}; ${t.assets.size} pwa assets)`);
    for (const l of result.log) console.log(l);
    console.log(`entry: ${result.presence.entry}`);
    console.log(`net/client.ts: ${result.presence.client}`);
    if (target === 'capacitor') console.log('capacitor proof: PASS (only net/endpoint.js differs; index.html differs only in digest path and connect-src; styles.css and every PWA asset identical)');
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
