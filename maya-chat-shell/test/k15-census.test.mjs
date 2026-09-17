// K15 — the bundle census counts storage and reflective reads by what the code MEANS, not only by its
// raw text (integration finding, boundary lens: `Reflect.get(w, 'local' + 'Storage')` and
// `el['coo' + 'kie']` were invisible to a raw `includes('localStorage')`).
//
//   node --test test/k15-census.test.mjs
//
// The census runs against a throw-away repository root (`--repo=`) holding only planted successor
// files, so a plant never touches the real tree; the real tree is then required to stay at zero.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CENSUS = path.resolve(HERE, '..', '..', 'docs', 'rebuild', 'evidence', 'maya-chat-first-ux', 'k15-bundle-census.mjs');

const census = (args) => {
  const r = spawnSync(process.execPath, [CENSUS, '--json', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

const plantedRepo = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-k15-census-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
};

test('folded storage names, a folded cookie key and reflective access are counted; a clean root counts 0', () => {
  const dirty = plantedRepo({
    'maya-chat-shell/src/dom/host.ts': "export const s = (w: object): unknown => Reflect.get(w, 'local' + 'Storage');\n",
    'maya-chat-shell/entry/main.ts': "export const c = (d: Record<string, string>): string | undefined => d[`coo${'kie'}`];\n",
    'maya-chat-shell/src/net/x.ts': "export const t = (w: { [k: string]: unknown }): unknown => w['session' + 'Storage'];\n",
  });
  const clean = plantedRepo({
    'maya-chat-shell/src/dom/host.ts': "export const label = 'Хранилище не используется';\n",
    'maya-chat-shell/entry/main.ts': "export const root = 'maya';\n",
  });
  try {
    const out = census([`--repo=${dirty}`]);
    assert.equal(out.storageScan, 'ast+text');
    const hits = out.successorReadsClientStorage.join(' | ');
    assert.match(hits, /localStorage/);
    assert.match(hits, /sessionStorage/);
    assert.match(hits, /cookie/);
    assert.ok(out.successorReflectiveAccess.some((h) => /Reflect/.test(h)), JSON.stringify(out.successorReflectiveAccess));
    assert.deepEqual(out.successorRoots.map((r) => [path.basename(r.root), r.present]), [['src', true], ['entry', true]]);

    const quiet = census([`--repo=${clean}`]);
    assert.deepEqual(quiet.successorReadsClientStorage, []);
    assert.deepEqual(quiet.successorReflectiveAccess, []);
  } finally {
    fs.rmSync(dirty, { recursive: true, force: true });
    fs.rmSync(clean, { recursive: true, force: true });
  }
});

test('the real successor (src + entry) reads no client storage and holds no reflective access', () => {
  const out = census([]);
  assert.equal(out.storageScan, 'ast+text');
  assert.deepEqual(out.successorReadsClientStorage, []);
  assert.deepEqual(out.successorReflectiveAccess, []);
  assert.equal(out.clientSideAuthorityValuesInSuccessor, 0);
  assert.ok(out.successorRoots.every((r) => r.present && r.files > 0), JSON.stringify(out.successorRoots));
});
