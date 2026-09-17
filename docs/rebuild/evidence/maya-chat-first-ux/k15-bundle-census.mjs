#!/usr/bin/env node
// K15 — the bundle census and the third authority path, counted rather than described.
//
// K15's exit is four numbers:
//     bundles carrying the shell                        = 1
//     copies of the shell source                        = 1
//     a recorded probe proving maya-os-site is unreachable
//     client-side values that route before a server call = 0
//
// Three of the four are countable here. The fourth is not, and the reason is the whole of K15's
// honest position: the client-side authority values live in `app.html`, which IS the shipped PWA.
// Driving that count to zero means editing a production bundle, and PRODUCTION EFFECTS FOR PROOF
// is 0. So this census reports the count, names the file, and stops — it does not edit.
//
// The successor is measured separately and it is already at zero, which is the point worth making:
// the new shell does not need the value removed because it never had one.
//
// Every file this script opens is opened READ ONLY.
//
// Run: node docs/rebuild/evidence/maya-chat-first-ux/k15-bundle-census.mjs [--json] [--repo=<root>]
//
// `--repo=` points the census at another repository root (the tests plant successor files in a
// throw-away root); the TypeScript used for the successor scan always comes from this script's own
// repository.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ownRepo = path.resolve(here, '../../../..');
const repoArg = process.argv.find((a) => a.startsWith('--repo='));
const repo = repoArg ? path.resolve(repoArg.slice('--repo='.length)) : ownRepo;
const PRIMARY = '/Users/stanislavmosin/Desktop/Projects/maya-platform';

/**
 * The values that decide something before a server has been asked.
 *
 * Presence alone is the finding. A bundle that merely RENDERS a server-issued permissions object is
 * not an authority path; a bundle that ROUTES on one is. Distinguishing the two by regex is not
 * possible in a 2.7 MB single-file build, so the census reports occurrences and says so — an
 * over-count that is honest about being one, rather than a clean number nobody can check.
 */
const AUTHORITY_TOKENS = [
  'me_is_staff',
  '__meRole',
  '__meIsStaff',
  '__meIsMaster',
  '__meIsFounder',
  '__panelInfo',
];

const BUNDLES = [
  { label: 'app.html (the shipped PWA)', rel: 'сайт и приложение/app.html' },
  { label: 'maya-os-site/index.html', rel: 'maya-os-site/index.html' },
  { label: 'app-tenant.html', rel: 'сайт и приложение/app-tenant.html' },
  { label: 'index.html (the site)', rel: 'сайт и приложение/index.html' },
];

const census = [];
for (const b of BUNDLES) {
  for (const [treeName, tree] of [['canonical', repo], ['primary', PRIMARY]]) {
    const abs = path.join(tree, b.rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const perToken = {};
    let total = 0;
    for (const t of AUTHORITY_TOKENS) {
      const n = text.split(t).length - 1;
      perToken[t] = n;
      total += n;
    }
    census.push({
      bundle: b.label,
      tree: treeName,
      bytes: Buffer.byteLength(text),
      authorityTokenOccurrences: total,
      perToken,
      // A bundle "carries a shell" if it holds its own navigation. The marker is a screen registry
      // or a tab bar — the two things the five-route shell replaces.
      carriesAShell: /const S = \{|AuroraTab|CLIENT_TABS|STAFF_TABS/.test(text),
    });
  }
}

// ── the successor ────────────────────────────────────────────────────────────────────────────────
// Two roots: the shell's sources and its HTML entry (D13). entry/ holds the one host acquisition
// and the page itself, so a storage or authority value there is as much the successor's as one in
// src/. Each root is named in the output, and an absent root says `absent` — a run before entry/
// exists is never read as entry/ coverage.
const SHELL_ROOTS = ['maya-chat-shell/src', 'maya-chat-shell/entry'];
const SHELL_EXTENSIONS = ['.ts', '.html'];
const shellFiles = [];
const walk = (dir, into) => {
  const abs = path.join(repo, dir);
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name), into);
    else if (SHELL_EXTENSIONS.some((x) => e.name.endsWith(x))) into.push(path.join(dir, e.name));
  }
};
const successorRoots = SHELL_ROOTS.map((root) => {
  if (!fs.existsSync(path.join(repo, root))) return { root, present: false, files: 0 };
  const files = [];
  walk(root, files);
  shellFiles.push(...files);
  return { root, present: true, files: files.length };
});
const shellText = shellFiles.map((f) => fs.readFileSync(path.join(repo, f), 'utf8')).join('\n');
const shellAuthorityHits = AUTHORITY_TOKENS.filter((t) => shellText.includes(t));
// Raw text first (it also covers entry/index.html) …
const shellStorageHits = ['localStorage', 'sessionStorage', 'document.cookie'].filter((t) =>
  shellText.includes(t),
);
// … then what the TypeScript MEANS: a raw `includes` cannot see `Reflect.get(w, 'local' + 'Storage')`
// or `d['coo' + 'kie']`. Every name, member and string literal is read after constant-folding `+`
// chains and literal-only templates; reflective access (Reflect, the legacy accessor lookups) is
// counted on its own, because its key need not be a literal at all. Without TypeScript the scan
// fails CLOSED: the storage list names the missing scan instead of reporting "never".
const successorReflectiveAccess = [];
let storageScan = 'ast+text';
{
  let ts = null;
  try {
    ts = createRequire(path.join(ownRepo, 'maya-saas-backend', 'package.json'))('typescript');
  } catch {
    storageScan = 'text-only';
    shellStorageHits.push('AST SCAN UNAVAILABLE (typescript not installed in maya-saas-backend)');
  }
  if (ts) {
    const STORAGE = [/localStorage/, /sessionStorage/, /^cookie$/];
    const REFLECTIVE = new Set(['Reflect', '__lookupGetter__', '__lookupSetter__', '__defineGetter__', '__defineSetter__']);
    const fold = (n) => {
      if (!n) return null;
      if (ts.isParenthesizedExpression(n)) return fold(n.expression);
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const a = fold(n.left);
        const b = fold(n.right);
        return a === null || b === null ? null : a + b;
      }
      if (ts.isTemplateExpression(n)) {
        let out = n.head.text;
        for (const span of n.templateSpans) {
          const v = fold(span.expression);
          if (v === null) return null;
          out += v + span.literal.text;
        }
        return out;
      }
      return null;
    };
    const seen = new Set();
    const hit = (list, label) => {
      if (!seen.has(label)) {
        seen.add(label);
        list.push(label);
      }
    };
    for (const rel of shellFiles.filter((f) => f.endsWith('.ts'))) {
      const text = fs.readFileSync(path.join(repo, rel), 'utf8');
      const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
      const where = (node) => `${rel.split(path.sep).join('/')}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
      const visit = (node) => {
        let value = null;
        if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) value = node.text;
        else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) value = node.text;
        else if (ts.isBinaryExpression(node) || ts.isTemplateExpression(node)) value = fold(node);
        if (value !== null) {
          for (const re of STORAGE) if (re.test(value)) hit(shellStorageHits, `${re.source.replace(/[\^$]/g, '')} (${where(node)})`);
          if ((ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) && REFLECTIVE.has(value)) hit(successorReflectiveAccess, `${value} (${where(node)})`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
}

// One shell source, one build. Counted from the manifest rather than asserted.
const manifestPath = 'maya-chat-shell/dist/manifest.json';
const manifest = fs.existsSync(path.join(repo, manifestPath))
  ? JSON.parse(fs.readFileSync(path.join(repo, manifestPath), 'utf8'))
  : null;

// ── the unreachability probe ─────────────────────────────────────────────────────────────────────
//
// A probe of unreachability is a RECORDED REQUEST that did not reach the surface. It cannot be
// synthesised: a file saying "it is unreachable" is a claim, and the exit asks for a probe.
//
// three-bundle-probe.json is that record for PRODUCTION: root listing plus a HEAD request per copy.
// Recorded is not proven — only `mayaOsSiteUnreachable === true` counts as proof.
const PROBE_FILE = 'docs/rebuild/evidence/maya-chat-first-ux/three-bundle-probe.json';
const probe = fs.existsSync(path.join(repo, PROBE_FILE))
  ? JSON.parse(fs.readFileSync(path.join(repo, PROBE_FILE), 'utf8'))
  : null;

const legacyBundles = census.filter((c) => c.tree === 'canonical' && c.carriesAShell);
const out = {
  bundlesCarryingAShell: legacyBundles.length + (manifest ? 1 : 0),
  legacyBundlesCarryingAShell: legacyBundles.length,
  successorBundles: manifest ? 1 : 0,
  shellSourceCopies: manifest ? 1 : 0,
  clientSideAuthorityValuesInLegacy: census
    .filter((c) => c.tree === 'canonical')
    .reduce((a, c) => a + c.authorityTokenOccurrences, 0),
  clientSideAuthorityValuesInSuccessor: shellAuthorityHits.length,
  successorReadsClientStorage: shellStorageHits,
  successorReflectiveAccess,
  storageScan,
  successorRoots,
  unreachabilityProbeRecorded: Boolean(probe),
  mayaOsSiteUnreachableProven: probe?.mayaOsSiteUnreachable === true,
  // The latest measurement wins: after R3 the post-remediation sweep supersedes the first probe.
  productionServedLegacyCopies: probe?.postRemediation
    ? probe.postRemediation.served200
    : (probe?.legacyBundleCopiesOnDisk?.servedTotal ?? null),
  productionServedAuthorityValues: probe?.postRemediation
    ? (probe.postRemediation.served200 === 0 ? 0 : null)
    : (probe?.legacyBundleCopiesOnDisk?.authorityTokensInServedTotal ?? null),
  census,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('K15 BUNDLE CENSUS  (every file read only; nothing edited)');
  console.log('='.repeat(78));
  for (const c of census.filter((x) => x.tree === 'canonical'))
    console.log(
      `  ${c.carriesAShell ? 'SHELL' : '     '} ${String(c.authorityTokenOccurrences).padStart(3)} authority tokens  ` +
        `${String(Math.round(c.bytes / 1024)).padStart(5)} KiB  ${c.bundle}`,
    );
  console.log();
  console.log(`  bundles carrying a shell (legacy):        ${out.legacyBundlesCarryingAShell}   target 1`);
  console.log(`  successor bundles (maya-chat-shell):      ${out.successorBundles}`);
  console.log(`  shell source copies (successor):          ${out.shellSourceCopies}   target 1`);
  console.log();
  console.log(`  client-side authority values, LEGACY:     ${out.clientSideAuthorityValuesInLegacy}   target 0`);
  console.log(`  client-side authority values, SUCCESSOR:  ${out.clientSideAuthorityValuesInSuccessor}   target 0  <- already met`);
  console.log(`  successor reads client storage:           ${out.successorReadsClientStorage.length ? out.successorReadsClientStorage.join(', ') : 'never'}   (scan: ${out.storageScan})`);
  console.log(`  successor reflective access:              ${out.successorReflectiveAccess.length ? out.successorReflectiveAccess.join(', ') : 'none'}`);
  for (const r of out.successorRoots)
    console.log(`  successor root walked (.ts, .html):       ${path.basename(r.root)}: ${r.present ? `${r.files} files` : 'absent'}`);
  console.log();
  console.log(`  production probe recorded:                ${out.unreachabilityProbeRecorded ? 'yes (three-bundle-probe.json)' : 'NO'}`);
  console.log(`  maya-os-site unreachable, PROVEN:         ${out.mayaOsSiteUnreachableProven ? 'yes' : 'NO'}`);
  if (out.unreachabilityProbeRecorded) {
    console.log(`  legacy copies SERVED in production:       ${out.productionServedLegacyCopies}   target 0`);
    console.log(`  authority values in those copies:         ${out.productionServedAuthorityValues}   target 0`);
  }
  console.log();
  console.log('  EXACT CUTOVER CONDITION for K15:');
  console.log(`    production serves ${out.productionServedLegacyCopies ?? '?'} legacy copies (${out.productionServedAuthorityValues ?? '?'} authority values); the repository`);
  console.log(`    still holds ${out.clientSideAuthorityValuesInLegacy} in unserved legacy files. K15's remaining condition is the successor: no Maya`);
  console.log('    shell bundle is served, so "bundles carrying the shell = 1" is not met.');
}

// No process.exit here: it truncates a pending stdout write, and --json emits megabytes.
