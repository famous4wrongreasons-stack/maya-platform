import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(here, '.consents-'));
let m;
try {
  const bundle = path.join(scratch, 'presentation.mjs');
  await esbuild.build({ stdin: { contents: `export { OwnConsentsPanel } from '../src/chat/OwnConsentsPanel.tsx'; export { tokens } from '../src/identity/tokens.ts'; export { renderToStaticMarkup } from 'react-dom/server';`, resolveDir: here, loader: 'tsx' }, bundle: true, format: 'esm', platform: 'node', target: 'node22', jsx: 'automatic', outfile: bundle, logLevel: 'warning', external: ['react', 'react-dom/server', 'react/jsx-runtime'] });
  m = await import(pathToFileURL(bundle).href);
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
const row = { kind: 'privacy', state: 'GRANTED', invalidated: false, recordedAt: '2026-10-21T10:00:00.000Z', effectiveAt: '2026-10-21T10:00:00.000Z' };
const view = (phase, patch = {}) => ({ phase, consents: [row], asOf: row.recordedAt, notice: '', retryAt: null, ...patch });
test('current source facts are visible but rendering never grants, exports or sends anything', () => {
  let calls = 0;
  const tree = m.OwnConsentsPanel({ view: view('ready'), t: m.tokens(true), refresh: () => calls++ });
  const html = m.renderToStaticMarkup(tree);
  assert.match(html, /Согласие действует/); assert.match(html, /Выгрузка реестра пока недоступна/);
  assert.doesNotMatch(html, /<a |<input |<select |<form /);
  assert.equal((html.match(/<button /g) ?? []).length, 1); assert.equal(calls, 0);
  const button = tree.props.children.find(child => child?.type === 'button');
  button.props.onClick({ clientId: 'forged' }); assert.equal(calls, 1);
});
test('loading, failed, closed and expired views never show old consent facts', () => {
  for (const phase of ['loading', 'failed', 'closed', 'expired']) {
    const html = m.renderToStaticMarkup(m.OwnConsentsPanel({ view: view(phase), t: m.tokens(false), refresh() {} }));
    assert.doesNotMatch(html, /Согласие действует/);
  }
  const html = m.renderToStaticMarkup(m.OwnConsentsPanel({ view: view('ready', { consents: [{ ...row, state: 'NOT_GRANTED', invalidated: true, effectiveAt: null }] }), t: m.tokens(true), refresh() {} }));
  assert.match(html, /основание подтверждения отозвано/);
});
