// K5 — the build's own tests (D4, D5, D8, V2-1, V2-4, V2-7, V2-15; SHELL-PLAN v2.1 §2.1).
//
// A gate nobody has seen refuse is a claim, and a gate that refuses everything is useless. So:
//   * every refuse fixture under test/fixtures/build/refuse/** is refused with exactly its named
//     rule(s), and every admit fixture under admit/** is admitted — both directions, every row;
//   * the harness itself is not vacuous: a planted violation in an admit fixture, an empty refuse
//     fixture and a misnamed rule each FAIL;
//   * the write guard refuses a path outside outDir, including a real tsc emit that resolves there;
//   * the emitted module graph imports in Node;
//   * the digests do not depend on the build machine's locale.
//
//   node --test test/build.selftest.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ROOT,
  FIXTURE_ROWS,
  codeUnitOrder,
  emitContract,
  listFixtures,
  loadTypeScript,
  runBuild,
  runFixture,
  selfTest,
  sharedDirs,
  writeGuardTest,
} from '../build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, '..', 'build.mjs');
const ts = loadTypeScript();

const withTmp = (fn) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-shell-selftest-'));
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

test('self-test: every refuse fixture refused with its named rule, every admit fixture admitted', () =>
  withTmp((tmp) => {
    const r = selfTest(ts, { tmp });
    const failures = [
      ...r.results.filter((x) => !x.ok).map((x) => `${x.id}: expected {${x.expected.join(', ')}} got {${x.got.join(', ')}}${x.detail}`),
      ...r.coverage.filter((c) => !c.ok).map((c) => c.name),
      ...r.guard.filter((g) => !g.ok).map((g) => g.name),
    ];
    assert.deepEqual(failures, []);
    // both directions exist for every required row, and the bypass renderer is refused 8/8
    for (const row of FIXTURE_ROWS) {
      assert.ok(r.results.some((x) => x.row === row && x.direction === 'refuse'), `refuse/${row}`);
      assert.ok(r.results.some((x) => x.row === row && x.direction === 'admit'), `admit/${row}`);
    }
    const bypass = r.results.find((x) => x.row === 'bypass');
    assert.ok(bypass && bypass.ok && /probes 8\/8 refused/.test(bypass.detail), 'bypass 8/8 refused');
    assert.equal(listFixtures().length, r.results.length);
  }));

test('self-test is not vacuous: a planted admit, an empty refuse and a misnamed rule each fail', () =>
  withTmp((tmp) => {
    const contract = emitContract(ts, tmp);
    const shared = sharedDirs(ts, contract);
    const fx = (direction, as, text, expect = []) => ({
      id: `vacuity/${direction}/${as}`,
      direction,
      row: 'vacuity',
      files: new Map([[as, text]]),
      expect: new Set(expect),
      probes: false,
      typecheck: null,
    });
    assert.equal(runFixture(ts, contract, fx('admit', 'src/dom/host.ts', "export const f = () => fetch('x');\n"), shared).ok, false);
    assert.equal(runFixture(ts, contract, fx('refuse', 'src/dom/host.ts', 'export const f = () => 1;\n', ['layer-global']), shared).ok, false);
    assert.equal(runFixture(ts, contract, fx('refuse', 'src/renderer/p.ts', 'export const t = () => Date.now();\n', ['literal-ban']), shared).ok, false);
    assert.equal(runFixture(ts, contract, fx('admit', 'src/shell/x.ts', "import { render } from '../renderer/render.ts';\nexport const r = render;\n"), shared).ok, false);
    assert.equal(runFixture(ts, contract, fx('admit', 'src/shell/x.ts', 'export const id = (): string => crypto.randomUUID();\n'), shared).ok, true);
  }));

test('a planted fetch in the renderer is refused while the baseline is live (the K5 mutation, on a virtual copy)', () =>
  withTmp((tmp) => {
    const contract = emitContract(ts, tmp);
    const shared = sharedDirs(ts, contract);
    const render = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'render.ts'), 'utf8');
    const files = new Map([['src/renderer/render.ts', `${render}\nexport const leak = async () => fetch("https://x");\n`]]);
    for (const name of ['renderer.json', 'routes.json']) {
      const abs = path.join(ROOT, 'build-baseline', name);
      if (fs.existsSync(abs) && name === 'renderer.json') files.set(`build-baseline/${name}`, fs.readFileSync(abs, 'utf8'));
    }
    const r = runFixture(ts, contract, { id: 'k5-mutation', direction: 'refuse', row: 'k5', files, expect: new Set(['layer-global', 'fetch-shape']), probes: false, typecheck: null }, shared);
    assert.ok(r.got.includes('layer-global') && r.got.includes('fetch-shape'), `got {${r.got.join(', ')}}`);
  }));

test('reflection cannot reach a sink, a page object or a store: the reflection row is required and refused 13/13 (integration finding: Reflect bypass)', () =>
  withTmp((tmp) => {
    assert.ok(FIXTURE_ROWS.includes('reflection'), 'the reflection row is a required fixture row');
    const contract = emitContract(ts, tmp);
    const shared = sharedDirs(ts, contract);
    const rows = listFixtures().filter((f) => f.row === 'reflection');
    const refuse = rows.filter((f) => f.direction === 'refuse');
    const admit = rows.filter((f) => f.direction === 'admit');
    assert.equal(refuse.length, 13);
    assert.ok(admit.length >= 3);
    const bad = [...refuse, ...admit].map((f) => runFixture(ts, contract, f, shared)).filter((r) => !r.ok).map((r) => `${r.id}: expected {${r.expected.join(', ')}} got {${r.got.join(', ')}}`);
    assert.deepEqual(bad, []);
  }));

// A raw NUL makes grep read the file as binary: the K5 SELFMOUNT/ROLESWITCH greps would then print
// "Binary file … matches" instead of the line, and on GNU grep ≥ 3.5 count nothing (integration finding).
const CONTROL_BYTES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

test('every shell source under src/ and entry/ is text: no NUL or other C0 control character', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (/\.(ts|html|css)$/.test(e.name)) {
        const text = fs.readFileSync(abs, 'utf8');
        const lines = text.split('\n').map((l, i) => (CONTROL_BYTES.test(l) ? i + 1 : 0)).filter(Boolean);
        if (lines.length) offenders.push(`${path.relative(ROOT, abs)}:${lines.join(',')}`);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  walk(path.join(ROOT, 'entry'));
  assert.deepEqual(offenders, []);
});

test('the build refuses a raw control character in a source (k5-text) and admits its escape', () =>
  withTmp((tmp) => {
    const contract = emitContract(ts, tmp);
    const shared = sharedDirs(ts, contract);
    const fx = (direction, text, expect = []) => ({ id: `nul/${direction}`, direction, row: 'nul', files: new Map([['src/dom/timeline.ts', text]]), expect: new Set(expect), probes: false, typecheck: null });
    const raw = `export const sep = ['a', 'b'].join('${String.fromCharCode(0)}');\n`;
    const escaped = "export const sep = ['a', 'b'].join('\\u0000');\n";
    assert.ok(raw.includes(String.fromCharCode(0)) && !escaped.includes(String.fromCharCode(0)));
    const refused = runFixture(ts, contract, fx('refuse', raw, ['k5-text']), shared);
    assert.ok(refused.ok, `raw NUL: got {${refused.got.join(', ')}}`);
    const admitted = runFixture(ts, contract, fx('admit', escaped), shared);
    assert.ok(admitted.ok, `escaped NUL: got {${admitted.got.join(', ')}}`);
  }));

test('write guard: nothing is written outside outDir, directly or by a tsc emit that resolves there', () =>
  withTmp((tmp) => {
    for (const g of writeGuardTest(ts, tmp)) assert.ok(g.ok, g.name);
  }));

test('the emitted module graph imports in Node (every module outside entry/)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-shell-graph-'));
  try {
    const result = runBuild(ts, { tmp });
    const out = path.join(tmp, 'graph', 'm', result.web.d16);
    for (const [rel, bytes] of result.web.files) {
      fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
      fs.writeFileSync(path.join(out, rel), bytes);
    }
    // Node must treat the emitted .js as ES modules.
    fs.writeFileSync(path.join(tmp, 'graph', 'package.json'), '{"type":"module"}\n');
    const imported = [];
    for (const rel of [...result.web.files.keys()].sort(codeUnitOrder)) {
      if (rel.startsWith('entry/')) continue;
      await import(pathToFileURL(path.join(out, rel)).href);
      imported.push(rel);
    }
    assert.ok(imported.length >= 7, `imported ${imported.length} modules`);
    const shell = await import(pathToFileURL(path.join(out, 'src/shell/shell.js')).href);
    assert.equal(shell.initialState().conversation, 'open');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

const localeRun = (locale, args) =>
  spawnSync(process.execPath, args, { cwd: path.join(HERE, '..'), env: { ...process.env, LANG: locale, LC_ALL: locale }, encoding: 'utf8' });

test('digests are identical under LANG=en_US.UTF-8 and LANG=et_EE.UTF-8, and the locale really differed', () => {
  // The matrix is only evidence if the two child processes collate differently.
  const probe = ['-e', "console.log(new Intl.Collator().resolvedOptions().locale, ['t','z','a','j','y','Z'].sort((a,b)=>a.localeCompare(b)).join(''))"];
  const en = localeRun('en_US.UTF-8', probe).stdout.trim();
  const et = localeRun('et_EE.UTF-8', probe).stdout.trim();
  assert.match(en, /^en-US /);
  assert.match(et, /^et-EE /, 'et_EE.UTF-8 was not applied — the locale matrix would pass vacuously');
  assert.notEqual(en.split(' ')[1], et.split(' ')[1]);

  // The build's own order ignores the locale.
  const order = ['-e', "import('./build.mjs').then((b) => console.log(['z.ts','t.ts','Z.ts','a.ts','j.ts','y.ts'].sort(b.codeUnitOrder).join(',')))"];
  assert.equal(localeRun('en_US.UTF-8', order).stdout, localeRun('et_EE.UTF-8', order).stdout);

  const digests = (locale) => {
    const r = localeRun(locale, [BUILD, '--dry-run']);
    assert.equal(r.status, 0, `${locale}: ${r.stderr}`);
    return r.stdout.split('\n').filter((l) => /^(digest|web) [0-9a-f]{64}/.test(l)).map((l) => l.split(' ').slice(0, 2).join(' '));
  };
  const a = digests('en_US.UTF-8');
  const b = digests('et_EE.UTF-8');
  assert.equal(a.length, 2);
  assert.deepEqual(a, b);
});

test('the build prints the live baseline count, and it never exceeds the eight admissible entries', () => {
  const r = localeRun('en_US.UTF-8', [BUILD, '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  const m = /baseline: (\d+) live entries/.exec(r.stdout);
  assert.ok(m, 'baseline count printed');
  let expected = 0;
  for (const name of ['routes.json', 'renderer.json']) {
    const abs = path.join(ROOT, 'build-baseline', name);
    if (fs.existsSync(abs)) expected += JSON.parse(fs.readFileSync(abs, 'utf8')).length;
  }
  assert.equal(Number(m[1]), expected);
  assert.ok(expected <= 8);
  // the digest the K5 gate greps is the first 64-hex token printed
  assert.match(r.stdout.split('\n')[0], /^digest [0-9a-f]{64}$/);
});
