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

/** The voice boundary, in both directions. The real capture file is the strongest admit case. */
function voiceBoundaryCases() {
  const CAP = R.CAPTURE_FILE;
  const armed = `async arm(proof: GestureProof): Promise<Armed> {\n  const s = await navigator.mediaDevices.getUserMedia(C);\n  return s;\n}`;
  const MUST_REFUSE = [
    ['a capture API in an ordinary component', [['src/chat/ChatScreen.tsx', `const s = await navigator.mediaDevices.getUserMedia({});`]]],
    ['MediaRecorder outside the capture file', [['src/widgets/WidgetCard.tsx', `const r = new MediaRecorder(stream);`]]],
    ['AudioContext outside the capture file', [['src/App.tsx', `const ctx = new AudioContext();`]]],
    ['the microphone at top level', [[CAP, `const s = navigator.mediaDevices.getUserMedia(C);`]]],
    ['the microphone behind no gesture', [[CAP, `async function start(options: Options) {\n  return navigator.mediaDevices.getUserMedia(C);\n}`]]],
    ['two microphone sites', [[CAP, `${armed}\nasync function again(proof: GestureProof) { return navigator.mediaDevices.getUserMedia(C); }`]]],
    ['logging in the capture layer', [[CAP, `${armed}\nconsole.log('armed');`]]],
    ['a network call in the capture layer', [[CAP, `${armed}\nawait fetch('/api/ai/transcribe');`]]],
    ['an object URL in the capture layer', [[CAP, `${armed}\nconst u = URL.createObjectURL(blob);`]]],
    ['postMessage in the capture layer', [[CAP, `${armed}\nworker.postMessage(clip);`]]],
  ];
  const MUST_ADMIT = [
    ['the microphone inside a GestureProof-taking function', [[CAP, armed]]],
    ['an ordinary component', [['src/App.tsx', `const t = tokens(true);`]]],
    ['the capture API named only in a comment', [['src/App.tsx', `// getUserMedia lives in the voice layer\nconst x = 1;`]]],
  ];
  return { MUST_REFUSE, MUST_ADMIT };
}

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
  // Only this one literal, bounded file picker is an upload capability.
  {
    const picker = '<input type="file" accept="image/png,image/jpeg,image/webp" onChange={select} />';
    const cases = [
      [R.GOODS_PHOTO_PICKER, picker, false],
      ['src/chat/ChatScreen.tsx', picker, true],
      [R.GOODS_PHOTO_PICKER, '<input type="file" accept="*/*" />', true],
      [R.GOODS_PHOTO_PICKER, picker.replace('onChange', 'multiple onChange'), true],
      [R.GOODS_PHOTO_PICKER, picker.replace('onChange', 'webkitdirectory onChange'), true],
      [R.GOODS_PHOTO_PICKER, picker.replace('onChange', '{...props} onChange'), true],
      [R.GOODS_PHOTO_PICKER, picker.replace('type="file"', 'type={kind}'), true],
      [R.GOODS_PHOTO_PICKER, '<input type="image" />', true],
      [R.GOODS_PHOTO_PICKER, picker + picker, true],
      [R.GOODS_PHOTO_PICKER, `<input type="file" accept={mime} onChange={() => { const note = ' accept="image/png,image/jpeg,image/webp" '; }} />`, true],
      [R.GOODS_PHOTO_PICKER, `<input type={kind} accept="image/png,image/jpeg,image/webp" onChange={() => { const note = ' type="file" '; }} />`, true],
      [R.GOODS_PHOTO_PICKER, '<input type="file" type="image" accept="image/png,image/jpeg,image/webp" />', true],
    ];
    for (const [file, source, mustRefuse] of cases) {
      const hit = R.scanJsx(file, source).some(r => r.rule === 'input-type');
      if (hit === mustRefuse) {
        if (mustRefuse) refused++; else admitted++;
        console.log(`  PASS  ${mustRefuse ? 'refuse' : 'admit '} goods-photo-picker          ${source.slice(0, 44)}`);
      } else {
        failed++;
        console.log(`  FAIL  goods-photo-picker ${file}: ${source}`);
      }
    }
  }
  // Native timezone/consent stay confined to signup; navigation remains refused.
  {
    const checkbox = '<input type="checkbox" name="confirmed" checked={confirmed} />';
    const select = '<select name="branchTimezone"><option value="UTC">UTC</option></select>';
    for (const [file, source, mustRefuse] of [
      [R.STANDARD_ONBOARDING, checkbox, false], [R.STANDARD_ONBOARDING, select, false],
      ['src/other.tsx', checkbox, true], ['src/other.tsx', select, true],
      [R.STANDARD_ONBOARDING, checkbox + checkbox, true],
      [R.STANDARD_ONBOARDING, checkbox.replace('name="confirmed"', 'name="other"'), true],
      [R.STANDARD_ONBOARDING, checkbox.replace('type="checkbox"', 'type={kind}'), true],
      [R.STANDARD_ONBOARDING, checkbox.replace('checked=', '{...props} checked='), true],
      [R.STANDARD_ONBOARDING, select.replace('name="branchTimezone"', 'name="other"'), true],
      [R.STANDARD_ONBOARDING, select.replace('value="UTC"', '{...props}'), true],
      [R.STANDARD_ONBOARDING, '<form onSubmit={f} />', true],
      [R.STANDARD_ONBOARDING, '<select name="branchTimezone" formAction="/outside" />', true],
      [R.STANDARD_ONBOARDING, "React.createElement('select', { name: 'branchTimezone' })", true],
    ]) {
      const hit = R.scanJsx(file, source).length > 0;
      if (hit === mustRefuse) { if (mustRefuse) refused++; else admitted++; }
      else { failed++; console.log(`  FAIL signup controls: ${file}: ${source}`); }
    }
    console.log('  checked 13 signup control boundary fixtures');
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

  {
    const { MUST_REFUSE, MUST_ADMIT } = voiceBoundaryCases();
    for (const [why, files] of MUST_REFUSE) {
      if (R.checkVoiceBoundary(files).length) { refused++; console.log(`  PASS  refuse voice-boundary              ${why}`); }
      else { failed++; console.log(`  FAIL  refuse voice-boundary              NOT refused: ${why}`); }
    }
    for (const [why, files] of MUST_ADMIT) {
      const hits = R.checkVoiceBoundary(files);
      if (!hits.length) { admitted++; console.log(`  PASS  admit  voice-boundary              ${why}`); }
      else { failed++; console.log(`  FAIL  admit  voice-boundary              wrongly refused: ${why} — ${hits[0].message}`); }
    }
    // The real file on disk must pass its own rule.
    const capturePath = path.join(HERE, R.CAPTURE_FILE);
    if (fs.existsSync(capturePath)) {
      const hits = R.checkVoiceBoundary([[R.CAPTURE_FILE, fs.readFileSync(capturePath, 'utf8')]]);
      if (!hits.length) { admitted++; console.log('  PASS  admit  voice-boundary              the real src/voice/capture.ts'); }
      else { failed++; console.log(`  FAIL  admit  voice-boundary              the real capture file was refused: ${hits[0].message}`); }
    }
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
