// Every ratchet, exercised in BOTH directions.
//
// A rule with no refusing fixture is a rule nobody has proved works; a rule with no admitting
// fixture is a rule that may be refusing everything. Both directions, or the row does not count.

import * as R from './ratchets.mjs';

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
  ['no-network-in-presentation', `await fetch('/api/ai/chat');`, `await port.submitUserTurn(text);`],
  ['no-network-in-presentation', `new WebSocket('wss://x');`, `const w = null;`],
  ['closed-tag-set', `<img src="a.png" />`, `<div className="a" />`],
  ['closed-tag-set', `<svg><path /></svg>`, `<span />`],
  ['closed-tag-set', `<form onSubmit={f} />`, `<button type="button" />`],
  ['request-sink', `<a href={url}>x</a>`, `<a>x</a>`],
  ['no-inline-style', `<div style={{ color: 'red' }} />`, `<div className="red" />`],
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
