// Every ratchet, exercised in BOTH directions.
//
// A rule with no refusing fixture is a rule nobody has proved works; a rule with no admitting
// fixture is a rule that may be refusing everything. Both directions, or the row does not count.

import * as R from './ratchets.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SHELL = path.join(HERE, '..', 'maya-chat-shell');

/**
 * The runtime allowlist, in both directions.
 *
 * This rule shipped DEAD: it scanned `codeOnly(text)`, which blanks string bodies, so the specifier
 * it tried to read was always a run of spaces and it refused nothing — not `src/dom/`, not the DOM
 * boundary. It had no fixture in either direction, which is exactly how a rule dies unnoticed. The
 * hash branch had never executed either, so it gets a fixture of its own against a synthetic shell.
 */
function runtimeAllowlistCases() {
  const one = (src) => R.checkRuntimeImports(HERE, SHELL, [['src/probe.ts', src]]);
  const MUST_REFUSE = [
    ['the DOM boundary', "import type { DomPort } from '../../maya-chat-shell/src/shell/dom-port.ts';"],
    ['a non-member (dom/)', "import { h } from '../../maya-chat-shell/src/dom/host.ts';"],
    ['a non-member, double-quoted', 'import { h } from "../../maya-chat-shell/src/dom/host.ts";'],
    ['a non-member, dynamic import', "const m = await import('../../maya-chat-shell/src/dom/host.ts');"],
    ['a non-member, side-effect import', "import '../../maya-chat-shell/src/dom/host.ts';"],
    ['the voice layer (outside the package)', "import { createCapture } from '../../maya-chat-shell/src/voice/capture.ts';"],
  ];
  const MUST_ADMIT = [
    ['a published member', "import { createNet } from '../../maya-chat-shell/src/net/session.ts';"],
    ['a published member, type-only', "import type { ConversationView } from '../../maya-chat-shell/src/shell/ports.ts';"],
    ['a path merely mentioned in a string', "const note = 'maya-chat-shell/src/dom/host.ts is off limits';"],
    ['a path merely mentioned in a comment', '// maya-chat-shell/src/dom/host.ts is off limits\nconst x = 1;'],
    ['an ordinary relative import', "import { tokens } from './identity/tokens.ts';"],
  ];
  return { one, MUST_REFUSE, MUST_ADMIT };
}

/** The hash branch, against a synthetic shell whose manifest disagrees with its own bytes. */
function runtimeDriftCase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carrier-drift-'));
  const shell = path.join(root, 'maya-chat-shell');
  const carrier = path.join(root, 'maya-carrier-react');
  fs.mkdirSync(path.join(shell, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(shell, 'src', 'shell'), { recursive: true });
  fs.mkdirSync(path.join(carrier, 'src'), { recursive: true });
  fs.writeFileSync(path.join(shell, 'src', 'shell', 'ports.ts'), 'export type A = 1;\n');
  fs.writeFileSync(path.join(shell, 'dist', 'manifest.json'), JSON.stringify({
    runtime: { domBoundary: 'src/shell/dom-port.ts', modules: [{ path: 'src/shell/ports.ts', sha256: 'f'.repeat(64) }] },
  }));
  const hits = R.checkRuntimeImports(carrier, shell, [['src/probe.ts', "import type { A } from '../../maya-chat-shell/src/shell/ports.ts';"]]);
  fs.rmSync(root, { recursive: true, force: true });
  return hits;
}

const CASES = [
  // [rule id, source that MUST refuse, source that MUST pass]
  ['no-storage', `const t = localStorage.getItem('x');`, `const t = view.token;`],
  ['no-storage', `document.cookie = 'a=b';`, `const c = props.cookieless;`],
  ['no-eval', `const f = new Function('return 1');`, `const f = () => 1;`],
  ['no-eval', `globalThis.x = 1;`, `const x = 1;`],
  ['no-html-sink', `el.innerHTML = reply;`, `el.textContent = reply;`],
  ['no-html-sink', `<div dangerouslySetInnerHTML={{__html: s}} />`, `<div>{s}</div>`],
  ['no-service-worker', `navigator.serviceWorker.register('/sw.js');`, `const n = 1;`],
  ['no-capability-decision', `if (isOwner(user)) show();`, `if (view.canClear) show();`],
  ['no-capability-decision', `const r = useRole();`, `const r = props.display;`],
  ['no-legacy-transport', `const P = 'https://malesthetic.pro/app/api-proxy.php';`, `const P = '/api';`],
  ['no-outcome-invention', `if (line.outcome === 'CONFIRMED') tick();`, `if (item.display === 'terminal') quiet();`],
  ['no-outcome-invention', `show(receipt.action_receipt_ref);`, `show(item.sentence);`],
  ['no-outcome-invention', `const lines: TerminalLine[] = [];`, `const lines: string[] = [];`],
  // Admitted on purpose: these two are LifecycleState members the RenderResult really carries.
  ['no-outcome-invention', `const o = 'EXPIRED_UNUSED';`, `if (result.lifecycle.state === 'SUPERSEDED') collapse();`],
  ['no-network-in-presentation', `await fetch('/api/ai/chat');`, `await port.submitUserTurn(text);`],
  ['no-network-in-presentation', `new WebSocket('wss://x');`, `const w = null;`],
  ['closed-tag-set', `<img src="a.png" />`, `<div className="a" />`],
  ['closed-tag-set', `<svg><path /></svg>`, `<span />`],
  ['closed-tag-set', `<form onSubmit={f} />`, `<button type="button" />`],
  ['request-sink', `<a href={url}>x</a>`, `<a>x</a>`],
  ['inline-style-shape', `<div style={theme.box} />`, `<div style={{ color: 'red' }} />`],
  ['style-url', `<div style={{ backgroundImage: 'url(https://x/y.png)' }} />`, `<div style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")' }} />`],
  ['closed-tag-set', `React.createElement('img', { src: 'x' })`, `React.createElement('div', null)`],
  ['input-type', `<input />`, `<input type="text" />`],
  ['input-type', `<input type="image" />`, `<input type="email" />`],
  ['input-type', `<input type={kind} onChange={(e) => set(e)} />`, `<input type="password" onChange={(e) => set(e)} />`],
  ['input-type', `React.createElement('input', { type: 'text' })`, `<input type="text" value={v} />`],
  ['style-url', `<div style={{ background: "url('//evil/x')" }} />`, `<div style={{ filter: "url(%23n)" }} />`],
];

const CSS_CASES = [
  [`.a { background-image: url("https://x/y.png"); }`, `.a { background: var(--bg); }`],
  [`@import "other.css";`, `.a { color: var(--text); }`],
  [`@font-face { src: url("f.woff2"); }`, `.a { font-family: var(--font); }`],
];

/** Admitted BY SHAPE and checked on its own: bytes in the stylesheet are not a fetch. */
const INLINE_SVG_CSS = `.a { background-image: url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E"); }`;

const HTML_CASES = [
  [`<meta http-equiv="Content-Security-Policy" content="default-src 'self'"><script>x()</script>`, 'incomplete CSP + inline script'],
  [`<html><body></body></html>`, 'no CSP at all'],
];

export function selfTest() {
  let refused = 0, admitted = 0, failed = 0;
  const scan = (src) => [...R.scanNames('f.tsx', src), ...R.scanJsx('f.tsx', src)];

  for (const [rule, bad, good] of CASES) {
    const hitsBad = scan(bad).filter((r) => r.rule === rule);
    if (hitsBad.length) { refused++; console.log(`  PASS  refuse ${rule.padEnd(28)} ${bad.slice(0, 44)}`); }
    else { failed++; console.log(`  FAIL  refuse ${rule.padEnd(28)} NOT refused: ${bad}`); }
    const hitsGood = scan(good).filter((r) => r.rule === rule);
    if (!hitsGood.length) { admitted++; console.log(`  PASS  admit  ${rule.padEnd(28)} ${good.slice(0, 44)}`); }
    else { failed++; console.log(`  FAIL  admit  ${rule.padEnd(28)} wrongly refused: ${good}`); }
  }
  for (const [bad, good] of CSS_CASES) {
    if (R.checkCss('x.css', bad).length) { refused++; console.log(`  PASS  refuse no-external-resource       ${bad.slice(0, 40)}`); }
    else { failed++; console.log(`  FAIL  refuse no-external-resource       NOT refused: ${bad}`); }
    if (good === null) continue;
    if (!R.checkCss('x.css', good).length) { admitted++; console.log(`  PASS  admit  no-external-resource       ${good.slice(0, 40)}`); }
    else { failed++; console.log(`  FAIL  admit  no-external-resource       wrongly refused: ${good}`); }
  }
  // the inline-SVG shape must be ADMITTED — it is bytes in the file, not a fetch
  if (!R.checkCss('x.css', INLINE_SVG_CSS).length) { admitted++; console.log('  PASS  admit  no-external-resource       inline data:image/svg+xml'); }
  else { failed++; console.log('  FAIL  admit  no-external-resource       inline SVG wrongly refused'); }

  {
    const { one, MUST_REFUSE, MUST_ADMIT } = runtimeAllowlistCases();
    for (const [why, src] of MUST_REFUSE) {
      if (one(src).length) { refused++; console.log(`  PASS  refuse runtime-allowlist           ${why}`); }
      else { failed++; console.log(`  FAIL  refuse runtime-allowlist           NOT refused: ${why}`); }
    }
    for (const [why, src] of MUST_ADMIT) {
      const hits = one(src);
      if (!hits.length) { admitted++; console.log(`  PASS  admit  runtime-allowlist           ${why}`); }
      else { failed++; console.log(`  FAIL  admit  runtime-allowlist           wrongly refused: ${why} — ${hits[0].message}`); }
    }
    const drift = runtimeDriftCase();
    if (drift.length && /drifted/.test(drift[0].message)) { refused++; console.log('  PASS  refuse runtime-allowlist           a member whose bytes drifted from the published hash'); }
    else { failed++; console.log('  FAIL  refuse runtime-allowlist           drift NOT refused'); }
  }

  for (const [bad, why] of HTML_CASES) {
    if (R.checkHtml('x.html', bad).length) { refused++; console.log(`  PASS  refuse csp                        ${why}`); }
    else { failed++; console.log(`  FAIL  refuse csp                        NOT refused: ${why}`); }
  }
  const goodHtml = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'none'; connect-src 'self'; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'"><script src="./m/x/main.js"></script>`;
  if (!R.checkHtml('x.html', goodHtml).length) { admitted++; console.log('  PASS  admit  csp                        the carrier’s own policy'); }
  else { failed++; console.log('  FAIL  admit  csp                        the real policy was refused:', JSON.stringify(R.checkHtml('x.html', goodHtml))); }

  console.log(`\nself-test: refuse ${refused}, admit ${admitted}, failures ${failed}`);
  console.log(failed === 0 ? 'self-test: PASS' : 'self-test: FAIL');
  return failed === 0;
}
