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
import { fileURLToPath } from 'node:url';
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
  const program = ts.createProgram({ rootNames: cfg.fileNames, options: cfg.options });
  const diags = ts.getPreEmitDiagnostics(program);
  if (diags.length) {
    for (const d of diags.slice(0, 20))
      console.error('  typecheck  ' + ts.formatDiagnostic(d, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => ROOT, getNewLine: () => '\n' }).trim());
    throw new R.CarrierRefused(diags.map(() => R.refusal('typecheck', 'src', 0, '', 'typecheck failed')));
  }
  console.log(`typecheck: PASS (${cfg.fileNames.length} files, ${ts.version})`);
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

if (!flags.has('--typecheck')) {
  const esbuild = (await import('esbuild')).default;
  const out = path.join(ROOT, 'dist');
  fs.rmSync(out, { recursive: true, force: true });
  const result = await esbuild.build({
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
  // The emitted bundle is scanned too, against the narrower BUNDLE_BANS: a dependency can carry
  // what a source file may not, and those names have no legitimate reason to exist in the artefact.
  const jsFiles = [];
  const collect = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p2 = path.join(dir, e.name);
      if (e.isDirectory()) collect(p2);
      else if (e.name.endsWith('.js')) jsFiles.push(p2);
    }
  };
  collect(out);
  const post = [];
  for (const abs of jsFiles) post.push(...R.scanBundle(path.relative(ROOT, abs).split(path.sep).join('/'), fs.readFileSync(abs, 'utf8')));
  report(post);
  const rel = jsFiles.length ? path.relative(out, jsFiles[0]).split(path.sep).join('/') : '';
  // The stylesheet is emitted beside the page and re-checked as EMITTED bytes, because that is what
  // a browser loads — the source check would miss anything the copy step could do.
  const cssText = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  fs.writeFileSync(path.join(out, 'styles.css'), cssText);
  report(R.checkCss('dist/styles.css', cssText));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('%MAIN%', './' + rel);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  report(R.checkHtml('dist/index.html', html));
  console.log(`built -> dist/${rel}  (${jsFiles.length} chunk(s), ${(fs.statSync(jsFiles[0]).size / 1024).toFixed(1)} KB)`);
}
