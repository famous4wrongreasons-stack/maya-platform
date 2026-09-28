// K5 — what covers brand/, stated plainly, and enforced where a gate can honestly reach it.
//
//   node --test test/brand.test.mjs
//
// brand/ is NOT part of the shell that ships. It is a build-time generator (`brand/make-icons.mjs`)
// and its four committed PNGs, which step 9(b) of the build reads and emits as PWA assets. That means
// the gates written for the shipped shell do not walk it, and saying so is part of the contract:
//
//   * `node build.mjs --typecheck` does NOT typecheck it — it is JavaScript, not TypeScript, and it is
//     not in the emitted module graph. Nothing in brand/ reaches a browser.
//   * the build's layered purity gate (the banned literals, identifiers and layer table) does NOT scan
//     it: `listShellFiles` walks src/ and entry/ only, and a file outside those layers is refused as an
//     unknown layer rather than scanned. So the ban is applied here instead, as a TEXT scan, and this
//     test says out loud that a text scan is weaker than the build's AST gate.
//   * k5-exit-gate.sh and k15-bundle-census.mjs walk `maya-chat-shell/src` and `maya-chat-shell/entry`
//     by design — they count what the successor bundle DOES — and are not changed to walk a build tool.
//
// What genuinely covers brand/, and is asserted below or named here:
//   1. `node brand/make-icons.mjs --check` — the committed bytes are a fresh generation, on this
//      runtime (asserted below, and a step of the CI job on both Node 22 and Node 24).
//   2. the build's own `pngProbe` — signature, IHDR, a whole chunk walk, an IDAT that inflates, and
//      width = height = the declared size, for every icon it emits (build.mjs step 9(b)).
//   3. `dist/manifest.json` records each icon's sha256 and size, and `node build.mjs --check` compares
//      them file by file, so a changed byte fails the reproducibility gate.
//   4. the text scan below: no network, no storage, no service worker, no dependency, and no write
//      outside brand/icons.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { pngProbe } from '../build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.join(HERE, '..');
const BRAND = path.join(SH, 'brand');

const brandFiles = (dir = BRAND, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) brandFiles(abs, out);
    else out.push(path.relative(SH, abs).split(path.sep).join('/'));
  }
  return out.sort();
};

test('brand/: the committed icons are a fresh generation of the generator (node brand/make-icons.mjs --check)', () => {
  const r = spawnSync(process.execPath, [path.join(BRAND, 'make-icons.mjs'), '--check'], { encoding: 'utf8', cwd: SH });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /icons: PASS \(committed bytes equal a fresh generation\)/);
  // Four PASS rows, one per icon, each with the sha256 the build records.
  assert.equal((r.stdout.match(/^PASS {2}maya-/gm) ?? []).length, 4, r.stdout);
});

test('brand/: exactly the four files the build reads, each a whole decodable PNG at its declared size', () => {
  assert.deepEqual(brandFiles(), [
    'brand/icons/maya-192.png',
    'brand/icons/maya-512-maskable.png',
    'brand/icons/maya-512.png',
    'brand/icons/maya-apple-180.png',
    'brand/make-icons.mjs',
  ]);
  for (const [name, size] of [
    ['maya-192.png', 192],
    ['maya-512.png', 512],
    ['maya-512-maskable.png', 512],
    ['maya-apple-180.png', 180],
  ]) {
    const probe = pngProbe(fs.readFileSync(path.join(BRAND, 'icons', name)));
    assert.ok(probe !== null, name);
    assert.deepEqual([probe.width, probe.height], [size, size], name);
  }
});

test('brand/: the generator reaches nothing — no network, no storage, no worker, no dependency (TEXT scan, weaker than the build gate that does not walk here)', () => {
  const sources = brandFiles().filter((rel) => rel.endsWith('.mjs'));
  assert.ok(sources.length > 0);
  for (const rel of sources) {
    const text = fs.readFileSync(path.join(SH, rel), 'utf8');
    // The words the shipped shell bans by name, banned here by text as well.
    for (const banned of ['serviceWorker', 'caches', 'localStorage', 'sessionStorage', 'indexedDB', 'importScripts', 'SharedWorker']) {
      const code = text
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
        .join('\n');
      assert.ok(!new RegExp(`\\b${banned}\\b`).test(code), `${rel} names ${banned}`);
    }
    // Nothing that reaches off this machine, and no timing or randomness (the bytes must be stable).
    for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /https?:\/\//, /node:https?\b/, /node:net\b/, /child_process/, /Math\.random/, /Date\.now|new Date\b/]) {
      const code = text
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
        .join('\n');
      assert.ok(!re.test(code), `${rel} matches ${re}`);
    }
    // No dependency: only the node: builtins it declares.
    const imports = [...text.matchAll(/^import[^;]*?from '([^']+)';/gm)].map((m) => m[1]);
    assert.deepEqual(
      imports.filter((m) => !['node:fs', 'node:path', 'node:zlib', 'node:crypto', 'node:url'].includes(m)),
      [],
      `${rel} imports something outside the declared builtins`,
    );
    // Every write goes to the generator's own icons directory.
    assert.deepEqual([...text.matchAll(/fs\.(writeFileSync|mkdirSync|rmSync|appendFileSync)\(([^,)]+)/g)].map((m) => m[2].trim()).filter((arg) => !/^(abs|OUT_DIR)$/.test(arg)), []);
  }
});
