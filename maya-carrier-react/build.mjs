// maya-carrier-react — the presentation carrier build.
//
//   node build.mjs              gate, typecheck, bundle into dist/
//   node build.mjs --typecheck  gate and typecheck only
//   node build.mjs --self-test  every ratchet refused by a fixture, and admitted by its opposite
//
// The build REFUSES rather than emits. That is carried over deliberately from the minimal
// renderer's build: a check that only runs in CI can be skipped; a build that refuses cannot.
// Nothing is written to dist/ until every ratchet has passed.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as R from './tools/ratchets.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.join(ROOT, '..', 'maya-chat-shell');
/** The one module allowed to write an href, and only after a scheme check (see the shell's isReplyHref). */
const HREF_OWNER = 'src/reply-link.tsx';

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(path.relative(ROOT, p).split(path.sep).join('/'));
  }
  return out;
};

export function gate(root = ROOT, shell = SHELL) {
  const rels = walk(path.join(root, 'src'));
  const files = rels.map((rel) => [rel, fs.readFileSync(path.join(root, rel), 'utf8')]);
  const refusals = [];
  for (const [rel, text] of files) {
    refusals.push(...R.scanNames(rel, text));
    refusals.push(...R.scanJsx(rel, text, { hrefAllowed: rel === HREF_OWNER }));
  }
  refusals.push(...R.checkRuntimeImports(root, shell, files));
  refusals.push(...R.checkVoiceBoundary(files));
  const css = path.join(root, 'src', 'styles.css');
  if (fs.existsSync(css)) refusals.push(...R.checkCss('src/styles.css', fs.readFileSync(css, 'utf8')));
  const html = path.join(root, 'index.html');
  if (fs.existsSync(html)) refusals.push(...R.checkHtml('index.html', fs.readFileSync(html, 'utf8')));
  return { files: rels, refusals };
}

function report(refusals) {
  if (!refusals.length) return;
  console.error(`BUILD REFUSED — ${refusals.length} refusal(s):`);
  for (const r of refusals.slice(0, 40))
    console.error(`  ${r.rule.padEnd(26)} ${r.file}:${r.line}  ${r.name}  — ${r.message}`);
  throw new R.CarrierRefused(refusals);
}

async function typecheck() {
  const require = createRequire(import.meta.url);
  const ts = require(path.join(SHELL, '..', 'maya-saas-backend', 'node_modules', 'typescript'));
  const cfgPath = path.join(ROOT, 'tsconfig.json');
  const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, ROOT);

  // The moment a carrier file imports a runtime module, the program follows the graph into the
  // shell's `src/contract.ts`, which ends `} from '#contract';`. That specifier is not on disk and
  // never was: the shell's own build emits the certified widget-contract declarations into a temp
  // directory and maps `#contract` at them in memory (maya-chat-shell/build.mjs:476). Without the
  // same mapping the carrier's typecheck fails on an unresolved module — while esbuild, which
  // strips `export type … from`, emits a perfectly good bundle. A green bundle would not have been
  // a green wiring. So the carrier resolves `#contract` exactly as the shell does, from the same
  // certified source, rather than suppressing the error or stubbing the types.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-carrier-'));
  try {
    const shellBuild = await import(pathToFileURL(path.join(SHELL, 'build.mjs')).href);
    const contract = shellBuild.emitContract(ts, tmp);
    const options = { ...cfg.options, paths: { '#contract': [contract.index] } };
    const program = ts.createProgram({ rootNames: cfg.fileNames, options });
    const diags = ts.getPreEmitDiagnostics(program);
    if (diags.length) {
      for (const d of diags.slice(0, 20))
        console.error('  typecheck  ' + ts.formatDiagnostic(d, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => ROOT, getNewLine: () => '\n' }).trim());
      throw new R.CarrierRefused(diags.map(() => R.refusal('typecheck', 'src', 0, '', 'typecheck failed')));
    }
    const shellFiles = program.getSourceFiles().filter((f) => f.fileName.includes('maya-chat-shell/src/')).length;
    console.log(`typecheck: PASS (${cfg.fileNames.length} carrier files + ${shellFiles} runtime modules, contract ${contract.exportCount} exports, ${ts.version})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const flags = new Set(process.argv.slice(2));

if (flags.has('--self-test')) {
  const { selfTest } = await import('./tools/ratchets.selftest.mjs');
  process.exit(selfTest() ? 0 : 1);
}

const g = gate();
report(g.refusals);
console.log(`gate: PASS (${g.files.length} source files, 0 refusals)`);
await typecheck();

/**
 * The two carriers, from one presentation.
 *
 * Carried over from the shell's own target table. `web` is same-origin; the iOS app runs under
 * Capacitor with `server.hostname: mayaos.ru` and `iosScheme: https`, so it is a real https origin
 * and `connect-src` must name it. Exactly ONE string in the bundle names an origin, and
 * `--target=capacitor` substitutes that one string — so the proof below can assert that the two
 * artefacts are otherwise byte-identical.
 */
export const TARGETS = {
  web: { apiBase: '/api', connectSrc: "'self'" },
  capacitor: { apiBase: 'https://mayaos.ru/api', connectSrc: "'self' https://mayaos.ru" },
};

const API_NEEDLE = (base) => `API_BASE = "${base}"`;

/**
 * The origins the artefact is allowed to name, and why. Everything here is either the canonical
 * endpoint, a navigation target the runtime itself allowlists, or a string in a dependency's error
 * message. None of them is reachable by `connect-src 'self'` except the first.
 */
const ORIGIN_ALLOW = {
  'https://mayaos.ru': 'the canonical endpoint, substituted into the capacitor target',
  'https://oauth.telegram.org':
    'the sign-in hand-off. net/project.ts:81 checks a server-supplied auth_url against this prefix before the shell navigates to it, so that no response can redirect the sign-in somewhere else — a navigation, not a fetch',
  'https://react.dev': "React's own error-message link; a string, never requested",
  'https://reactjs.org': 'as above',
  'https://github.com': 'as above',
  'http://www.w3.org': 'the XML namespace constant; a string, never requested',
};

/**
 * §1.10 for the carrier: the capacitor artefact differs from the web artefact in exactly the one
 * endpoint string, and index.html differs only in the digest path and `connect-src`.
 *
 * The substantive assertion is the last one. `endpoint.ts` claims "nothing else in the bundle names
 * an origin"; a bundled React app is exactly where that claim quietly stops being true, so it is
 * checked against the emitted bytes rather than trusted.
 */
function targetProof(webJs, capJs, webHtml, capHtml, webCss, capCss) {
  const out = [];
  const webHits = webJs.split(API_NEEDLE(TARGETS.web.apiBase)).length - 1;
  const capHits = capJs.split(API_NEEDLE(TARGETS.capacitor.apiBase)).length - 1;
  if (webHits !== 1)
    out.push(R.refusal('target', 'main.js', 0, 'API_BASE', `the web bundle must name the endpoint exactly once (found ${webHits})`));
  if (capHits !== 1)
    out.push(R.refusal('target', 'main.js', 0, 'API_BASE', `the capacitor bundle must name the endpoint exactly once (found ${capHits})`));
  if (capJs.split(API_NEEDLE(TARGETS.web.apiBase)).length - 1 !== 0)
    out.push(R.refusal('target', 'main.js', 0, 'API_BASE', 'the capacitor bundle still carries the web endpoint'));
  if (webJs.replace(API_NEEDLE(TARGETS.web.apiBase), API_NEEDLE(TARGETS.capacitor.apiBase)) !== capJs)
    out.push(R.refusal('target', 'main.js', 0, '', 'the two bundles differ by more than the endpoint string'));
  if (webCss !== capCss) out.push(R.refusal('target', 'styles.css', 0, '', 'styles.css differs between targets'));

  const norm = (html, name) =>
    html.replace(/m\/[A-Za-z0-9_-]+\/main\.js/g, 'm/<D>/main.js').replace(`connect-src ${TARGETS[name].connectSrc}`, 'connect-src <C>');
  if (norm(webHtml, 'web') !== norm(capHtml, 'capacitor'))
    out.push(R.refusal('target', 'index.html', 0, '', 'index.html differs beyond the digest path and connect-src'));

  // Every absolute origin the artefact names, in either target, pinned with a reason each. This is
  // the check that keeps `endpoint.ts`'s claim — "nothing else in the bundle names an origin" —
  // true in a bundled React app, which is exactly where it quietly stops being true. A new origin
  // refuses the build and has to be explained here before it can ship.
  const origins = new Set();
  for (const text of [webJs, capJs])
    for (const m of text.matchAll(/https?:\/\/[A-Za-z0-9.-]+/g)) origins.add(m[0]);
  for (const origin of origins)
    if (!(origin in ORIGIN_ALLOW))
      out.push(R.refusal('target', 'main.js', 0, origin, 'an origin in the artefact that is not accounted for'));
  return out;
}

if (!flags.has('--typecheck')) {
  const esbuild = (await import('esbuild')).default;
  const targetArg = [...flags].find((f) => f.startsWith('--target='));
  const target = targetArg ? targetArg.slice('--target='.length) : 'web';
  if (!(target in TARGETS)) {
    console.error(`unknown target ${target} (web | capacitor)`);
    process.exit(2);
  }
  const dist = path.join(ROOT, 'dist');
  const out = path.join(dist, target);
  fs.rmSync(out, { recursive: true, force: true });
  const built = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'main.tsx')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    outdir: out,
    entryNames: 'm/[hash]/main',
    assetNames: 'a/[hash]/[name]',
    metafile: true,
    minify: false,
    sourcemap: false,
    legalComments: 'none',
  });
  void built;
  const jsFiles = [];
  const collect = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p2 = path.join(dir, e.name);
      if (e.isDirectory()) collect(p2);
      else if (e.name.endsWith('.js')) jsFiles.push(p2);
    }
  };
  collect(out);

  // The endpoint substitution: one string, on the emitted bytes, so nothing else in the tree has to
  // know which carrier it is running on.
  let mainJs = jsFiles[0];
  const webJs = fs.readFileSync(mainJs, 'utf8');
  const capJs = webJs.replace(API_NEEDLE(TARGETS.web.apiBase), API_NEEDLE(TARGETS.capacitor.apiBase));
  if (target === 'capacitor') {
    fs.writeFileSync(mainJs, capJs);
    // RE-ADDRESS after substituting. esbuild hashed the pre-substitution bytes, so without this the
    // two targets would sit at the SAME content address with DIFFERENT payloads — which is the one
    // thing a content-addressed path must never do.
    const digest = createHash('sha256').update(capJs).digest('hex').slice(0, 16);
    const oldDir = path.dirname(mainJs);
    const newDir = path.join(path.dirname(oldDir), digest);
    fs.renameSync(oldDir, newDir);
    mainJs = path.join(newDir, path.basename(mainJs));
    jsFiles[0] = mainJs;
  }

  // The emitted bundle is scanned too, against the narrower BUNDLE_BANS: a dependency can carry
  // what a source file may not, and those names have no legitimate reason to exist in the artefact.
  const post = [];
  for (const abs of jsFiles) post.push(...R.scanBundle(path.relative(ROOT, abs).split(path.sep).join('/'), fs.readFileSync(abs, 'utf8')));
  report(post);

  const rel = jsFiles.length ? path.relative(out, jsFiles[0]).split(path.sep).join('/') : '';
  // The stylesheet is emitted beside the page and re-checked as EMITTED bytes, because that is what
  // a browser loads — the source check would miss anything the copy step could do.
  const cssText = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  fs.writeFileSync(path.join(out, 'styles.css'), cssText);
  report(R.checkCss(`dist/${target}/styles.css`, cssText));

  const template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const html = template
    .replace('%MAIN%', './' + rel)
    .replace(`connect-src ${TARGETS.web.connectSrc}`, `connect-src ${TARGETS[target].connectSrc}`);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  report(R.checkHtml(`dist/${target}/index.html`, html));

  if (target === 'capacitor') {
    const webHtml = template.replace('%MAIN%', './' + rel);
    report(targetProof(webJs, capJs, webHtml, html, cssText, cssText));
    console.log('capacitor proof: PASS (one endpoint string differs; index.html differs only in digest path and connect-src; styles.css identical; no other origin in the artefact)');
  }
  console.log(`built -> dist/${target}/${rel}  (${jsFiles.length} chunk(s), ${(fs.statSync(jsFiles[0]).size / 1024).toFixed(1)} KB)`);
}
