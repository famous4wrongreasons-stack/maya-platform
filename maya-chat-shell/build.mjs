#!/usr/bin/env node
// K5 — the reproducible build.
//
// "The build that does not exist today" is the mapping's phrase, and it is literal: `app.html` is a
// 2.7 MB emitted artefact whose Aurora sources are gone (CLAUDE.md gotcha #2), so the current front
// end cannot be rebuilt from anything. That is the condition this file ends.
//
// Reproducible means: same sources in, byte-identical bundle out, with a manifest digest anyone can
// recompute. No timestamps, no build ids, no ordering that depends on a filesystem's mood — because
// a build whose output differs run to run cannot be diffed, and a bundle that cannot be diffed is
// one nobody can review.
//
//   node build.mjs           emit dist/ and print the digest
//   node build.mjs --check   emit to a temp dir and fail if the digest moved

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.join(ROOT, 'src');
const CHECK = process.argv.includes('--check');
const OUT = path.join(ROOT, CHECK ? '.build-check' : 'dist');

/** Sorted, always. A bundle whose module order depends on readdir order is not reproducible. */
const sources = () => {
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) found.push(p);
    }
  };
  walk(SRC);
  return found;
};

// ── the property the exit checks: the renderer reaches nothing ───────────────────────────────
// Checked HERE, at build time, not only in a test — so a bundle that violates it cannot be emitted
// at all. A check that only runs in CI can be skipped; a build that refuses cannot.
const FORBIDDEN_IN_RENDERER = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'navigator.sendBeacon',
  'import(',
];

/**
 * Comments and string literals are stripped before the audit runs.
 *
 * The first version scanned raw text and refused the build because the renderer's own header
 * comment says it has no `WebSocket`. An audit that punishes DOCUMENTING the rule teaches people to
 * stop documenting it, which costs more than it saves. The rule is about what the code can DO.
 */
const codeOnly = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')  // line comments, without eating a protocol-relative URL
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''") // single-quoted strings
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""') // double-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');   // template literals

const auditRenderer = (files) => {
  const offences = [];
  for (const f of files.filter((f) => f.includes(`${path.sep}renderer${path.sep}`))) {
    const code = codeOnly(fs.readFileSync(f, 'utf8'));
    for (const needle of FORBIDDEN_IN_RENDERER)
      if (code.includes(needle)) offences.push(`${path.relative(ROOT, f)}: ${needle}`);
  }
  return offences;
};

const files = sources();
const offences = auditRenderer(files);
if (offences.length) {
  console.error('BUILD REFUSED — the renderer may reach nothing:\n  ' + offences.join('\n  '));
  process.exit(1);
}

// ── emit ─────────────────────────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const parts = [];
for (const f of files) {
  const rel = path.relative(SRC, f);
  parts.push(`// ── ${rel} ${'─'.repeat(Math.max(0, 70 - rel.length))}`);
  parts.push(fs.readFileSync(f, 'utf8').trimEnd());
  parts.push('');
}
const bundle = parts.join('\n');
fs.writeFileSync(path.join(OUT, 'maya-chat-shell.ts'), bundle);

const digest = createHash('sha256').update(bundle, 'utf8').digest('hex');
const manifest = {
  // No timestamp and no build id, deliberately: either would make two identical builds differ.
  name: 'maya-chat-shell',
  sources: files.map((f) => path.relative(ROOT, f)),
  bytes: Buffer.byteLength(bundle, 'utf8'),
  digest,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

if (CHECK) {
  const prior = path.join(ROOT, 'dist', 'manifest.json');
  if (fs.existsSync(prior)) {
    const was = JSON.parse(fs.readFileSync(prior, 'utf8')).digest;
    fs.rmSync(OUT, { recursive: true, force: true });
    if (was !== digest) {
      console.error(`NOT REPRODUCIBLE: dist digest ${was} but a fresh build gives ${digest}`);
      process.exit(1);
    }
    console.log(`reproducible: ${digest}`);
    process.exit(0);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  console.error('no dist/manifest.json to compare against — run the build first');
  process.exit(1);
}

console.log(`built ${files.length} sources -> ${manifest.bytes} bytes`);
console.log(`digest ${digest}`);
