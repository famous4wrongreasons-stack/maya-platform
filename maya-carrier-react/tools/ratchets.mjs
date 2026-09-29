// The carrier's ratchets.
//
// Every rule here replaces a property the minimal renderer used to enforce structurally. The
// minimal renderer could ban `<img>` because it owned a closed element factory; React cannot, so
// each property is re-established as something that RUNS and REFUSES.
//
// The meta-rule, carried over deliberately from maya-chat-shell/build.mjs: a check that only runs
// in CI can be skipped, a build that refuses cannot. Everything here throws `CarrierRefused` from
// inside the build, before any artefact is written.
//
// Each rule has an id, a property it protects, and — in tools/ratchets.selftest.mjs — a fixture in
// BOTH directions. A rule with no refusing fixture is a rule nobody has proved works.

import fs from 'node:fs';
import path from 'node:path';

export class CarrierRefused extends Error {
  constructor(refusals) {
    super(`BUILD REFUSED — ${refusals.length} refusal(s)`);
    this.name = 'CarrierRefused';
    this.refusals = refusals;
  }
}

export const refusal = (rule, file, line, name, message) => ({ rule, file, line, name, message });

/** Strip comments and string/template literals so a rule never fires on prose or on its own name. */
const codeOnly = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => "'" + ' '.repeat(Math.max(0, m.length - 2)) + "'")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"')
    .replace(/`(?:[^`\\]|\\.)*`/g, (m) => '`' + m.slice(1, -1).replace(/[^\n]/g, ' ') + '`');

const linesOf = (text) => text.split('\n');
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

// ── the banned-name rules ──────────────────────────────────────────────────────────────────────

/**
 * Each row: the property, and every spelling the same mistake would use. The React-era spellings
 * matter as much as the originals — `useRole` and `hasPermission` are how a capability decision
 * comes back in a codebase that has hooks.
 */
export const NAME_RULES = [
  {
    id: 'no-storage',
    property: 'No auth or authority at rest. A bearer in web storage is readable by any script that ever runs in the origin, and it survives the tab. The session is memory-only by design.',
    names: ['localStorage', 'sessionStorage', 'indexedDB', 'openDatabase'],
    members: [['document', 'cookie'], ['window', 'localStorage'], ['window', 'sessionStorage'], ['globalThis', 'localStorage']],
  },
  {
    id: 'no-eval',
    property: 'The closure of every other rule: these are the names by which a name can be hidden.',
    names: ['eval', 'Function', 'globalThis', 'self'],
    members: [],
  },
  {
    id: 'no-html-sink',
    property: 'DOM-XSS. The carrier renders server text it does not control; an HTML sink turns a reply into script in an authenticated origin.',
    names: ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'dangerouslySetInnerHTML'],
    members: [],
  },
  {
    id: 'no-service-worker',
    property: 'A service worker is persistent, origin-scoped, attacker-durable code that can cache authenticated responses and serve a stale shell after a fix.',
    names: ['serviceWorker'],
    members: [['navigator', 'serviceWorker']],
  },
  {
    id: 'no-capability-decision',
    property: 'A client that decides what a user may do is a client that can be told to decide differently. Capability comes from the server or it does not exist.',
    names: ['hasPermission', 'useRole', 'isStaff', 'isOwner', 'isFounder', 'isMaster', 'meRole', '__meRole', '__meIsStaff', 'meIsLegacy', 'meCab'],
    members: [],
  },
  {
    id: 'no-legacy-transport',
    property: 'The legacy salon proxy and every direct CRM URL. Business effect leaves through the canonical backend or not at all.',
    names: ['api-proxy', 'CHAT_PROXY', 'BF_PROXY', 'SS_PROXY', 'CM_PROXY', '__ME_SAAS_CTX', '__meSaasAuthedFetch'],
    members: [],
    alsoInStrings: true,
  },
];

/**
 * What must be zero in the SHIPPED BYTES, not merely in first-party source.
 *
 * Deliberately narrower than NAME_RULES. React's own bundle legitimately contains `Function`,
 * `globalThis` and `self`, so scanning the bundle for those would refuse every build and teach
 * everyone to disable the scan — the worst outcome available. These names, by contrast, have no
 * legitimate reason to exist anywhere in the artefact, including inside a dependency: if one
 * appears, either a component smuggled it in or a dependency is doing something it must not.
 */
export const BUNDLE_BANS = [
  ['localStorage', 'no auth or authority at rest, and no dependency may open web storage on our origin'],
  ['sessionStorage', 'as above'],
  ['indexedDB', 'as above'],
  ['api-proxy', 'the legacy salon proxy must not be reachable from the shipped bytes'],
  ['CHAT_PROXY', 'as above'],
  ['malesthetic.pro', 'a direct legacy origin in the artefact is business egress outside the canonical backend'],
  ['__ME_SAAS_CTX', 'the legacy global context is not part of this product'],
  ['serviceWorker', 'no persistent origin-scoped code'],
];

export function scanBundle(rel, text) {
  const out = [];
  for (const [name, why] of BUNDLE_BANS) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    for (const m of text.matchAll(re)) out.push(refusal('bundle-ban', rel, lineAt(text, m.index), name, why));
  }
  return out;
}

/** Network egress belongs to the runtime's one client, never to a component. */
export const NETWORK_NAMES = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon'];

export function scanNames(rel, text, { allowNetwork = false } = {}) {
  const out = [];
  const code = codeOnly(text);
  for (const rule of NAME_RULES) {
    const haystack = rule.alsoInStrings ? text : code;
    for (const name of rule.names) {
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      for (const m of haystack.matchAll(re)) out.push(refusal(rule.id, rel, lineAt(haystack, m.index), name, rule.property));
    }
    for (const [obj, member] of rule.members) {
      const re = new RegExp(`\\b${obj}\\s*\\.\\s*${member}\\b`, 'g');
      for (const m of code.matchAll(re)) out.push(refusal(rule.id, rel, lineAt(code, m.index), `${obj}.${member}`, rule.property));
    }
  }
  if (!allowNetwork)
    for (const name of NETWORK_NAMES) {
      const re = new RegExp(`\\b${name}\\s*\\(`, 'g');
      for (const m of code.matchAll(re))
        out.push(refusal('no-network-in-presentation', rel, lineAt(code, m.index), name,
          'Egress belongs to the runtime’s one client. A component that can call out can be made to call out somewhere else.'));
    }
  return out;
}

// ── JSX rules ──────────────────────────────────────────────────────────────────────────────────

/** The closed tag set, carried over verbatim from the minimal renderer's DomTag. */
export const CLOSED_TAGS = new Set([
  'div', 'span', 'p', 'section', 'article', 'header', 'footer', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
  'button', 'textarea', 'label', 'nav', 'main', 'dialog', 'table', 'caption', 'thead', 'tbody', 'tr',
  'th', 'td', 'time', 'output', 'a',
]);

/** Attributes that make a browser issue a request or navigate. */
const REQUEST_SINKS = ['src', 'srcSet', 'href', 'action', 'formAction', 'poster', 'ping', 'data', 'background'];

export function scanJsx(rel, text, { hrefAllowed = false } = {}) {
  const out = [];
  const code = codeOnly(text);
  // Both spellings. The owner's canonical source is pre-compiled React.createElement, and a
  // component that used it instead of JSX would otherwise walk straight through the closed set.
  const tagSites = [
    ...code.matchAll(/<([a-z][a-zA-Z0-9-]*)[\s/>]/g),
    ...text.matchAll(/createElement\(\s*['"]([a-z][a-zA-Z0-9-]*)['"]/g),
  ];
  for (const m of tagSites) {
    const tag = m[1];
    if (!CLOSED_TAGS.has(tag))
      out.push(refusal('closed-tag-set', rel, lineAt(text, m.index), tag,
        `<${tag}> is outside the closed set. The exclusions are a capability-denial list: img/video/audio/object/embed/iframe are outbound-request sinks, form navigates, svg/math carry their own script surface.`));
  }
  for (const sink of REQUEST_SINKS) {
    if (sink === 'href' && hrefAllowed) continue;
    const re = new RegExp(`\\b${sink}\\s*=`, 'g');
    for (const m of code.matchAll(re))
      out.push(refusal('request-sink', rel, lineAt(code, m.index), sink,
        'A server-supplied string reaching a request sink is exfiltration. One allowlisted module writes href, scheme-checked.'));
  }
  // 🔴 CONSTRAINT RELAXED, deliberately, and narrowed rather than dropped.
  //
  // WHY THE BAN EXISTED: the minimal renderer forbade `style` in dom/ because an attacker-influenced
  // style is an exfiltration sink (`background:url(<attacker>)`) and a clickjacking sink
  // (`position:fixed;opacity:0`), and because a markup `style=` attribute needs 'unsafe-inline'.
  //
  // WHY IT CANNOT STAND AS WRITTEN: the owner's canonical design is authored ENTIRELY in inline
  // style objects — 3,461 of them against 15 className sites. Banning them outright would force
  // every component to be re-authored as CSS, which is precisely the "new CSS по мотивам" the owner
  // forbade. The ban would not protect the property; it would destroy the source of truth.
  //
  // WHAT REPLACES IT, and it keeps the property: an inline style must be an OBJECT LITERAL, so its
  // every value is reviewable at the call site; a whole object arriving through an identifier is
  // refused, because that is the unreviewable form; and no style object may contain `url(` unless it
  // is an inline `data:image/svg+xml` — bytes in the file, never a fetch. The CSP property is
  // untouched: React writes CSSOM properties, not a `style=` attribute, so `style-src-attr 'none'`
  // still holds and is still asserted on the emitted page.
  for (const m of code.matchAll(/\bstyle\s*=\s*\{/g)) {
    const at = m.index + m[0].length;
    if (code[at] !== '{')
      out.push(refusal('inline-style-shape', rel, lineAt(code, m.index), 'style',
        'an inline style must be an object literal written here, not an object arriving through an identifier — the indirect form cannot be reviewed at the call site'));
  }
  // `url(` is read from the ORIGINAL text: codeOnly() blanks string bodies, and a style URL lives
  // inside one. Two forms are admitted, and both by shape rather than by trust:
  //   * an inline `data:image/svg+xml` — bytes in this file, never a fetch;
  //   * a FRAGMENT reference, `url(#id)` or its encoded `url(%23id)` — an SVG names its own filters
  //     and gradients that way, and a fragment points inside the same document, so it cannot issue
  //     a request. (The shell's stylesheet test needed the same correction, for the same reason.)
  for (const m of text.matchAll(/url\((?!["']?(?:data:image\/svg\+xml,|%23|#))/g))
    out.push(refusal('style-url', rel, lineAt(text, m.index), 'url(',
      'a style-borne URL is the exfiltration vector the inline-style ban existed to stop; only an inline data:image/svg+xml is admitted'));
  return out;
}

// ── the runtime import allowlist ───────────────────────────────────────────────────────────────

/**
 * The carrier may import the headless runtime and nothing else of the shell. The shell publishes
 * the set with hashes (dist/manifest.json `runtime`), so this checks BOTH that every import is a
 * member and that the member still hashes to what was published.
 */
export function checkRuntimeImports(carrierRoot, shellRoot, files) {
  const out = [];
  const manifestPath = path.join(shellRoot, 'dist', 'manifest.json');
  if (!fs.existsSync(manifestPath))
    return [refusal('runtime-allowlist', 'maya-chat-shell/dist/manifest.json', 0, '', 'the shell has not been built, so its runtime boundary is unknown (run node build.mjs there first)')];
  const runtime = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).runtime;
  if (!runtime) return [refusal('runtime-allowlist', 'maya-chat-shell/dist/manifest.json', 0, 'runtime', 'the shell manifest declares no runtime package')];
  const allowed = new Map(runtime.modules.map((m) => [m.path, m.sha256]));

  for (const [rel, text] of files) {
    for (const m of codeOnly(text).matchAll(/from\s+'([^']+)'/g)) {
      const spec = m[1];
      if (!spec.includes('maya-chat-shell')) continue;
      const abs = path.resolve(path.dirname(path.join(carrierRoot, rel)), spec);
      const shellRel = path.relative(shellRoot, abs).split(path.sep).join('/');
      if (!allowed.has(shellRel)) {
        out.push(refusal('runtime-allowlist', rel, lineAt(text, m.index), shellRel,
          shellRel === runtime.domBoundary
            ? 'that is the DOM boundary, the one shell module the carrier may never import'
            : 'not a member of the published @maya/runtime package'));
        continue;
      }
      const onDisk = fs.existsSync(abs) ? crypto_sha256(fs.readFileSync(abs)) : null;
      if (onDisk !== allowed.get(shellRel))
        out.push(refusal('runtime-allowlist', rel, lineAt(text, m.index), shellRel,
          'the imported runtime module has drifted from the hash the shell published'));
    }
  }
  return out;
}

import { createHash } from 'node:crypto';
const crypto_sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ── emitted-artefact rules ─────────────────────────────────────────────────────────────────────

export function checkCss(rel, css) {
  const out = [];
  // An inline SVG data: URI is bytes in this file, not a fetch — admitted by shape, as in the shell.
  const outside = css.replace(/url\("data:image\/svg\+xml,[^"]*"\)/g, 'INLINE_SVG');
  for (const [re, name, why] of [
    [/url\(/g, 'url(', 'no external resource: a font, icon or image from a third party leaks the visit, the Referer and the IP of every salon client (152-FZ contour)'],
    [/@import/g, '@import', 'no external resource'],
    [/https?:/g, 'http(s):', 'no external resource'],
    [/@font-face/g, '@font-face', 'a web font is the most likely way an external resource returns'],
  ])
    for (const m of outside.matchAll(re)) out.push(refusal('no-external-resource', rel, lineAt(outside, m.index), name, why));
  return out;
}

const REQUIRED_CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "connect-src 'self'",
  "object-src 'none'", "base-uri 'none'", "require-trusted-types-for 'script'",
];

export function checkHtml(rel, html) {
  const out = [];
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  if (!csp) return [refusal('csp', rel, 1, 'Content-Security-Policy', 'the page carries no meta CSP')];
  for (const directive of REQUIRED_CSP)
    if (!csp[1].includes(directive))
      out.push(refusal('csp', rel, lineAt(html, csp.index), directive, `the CSP must carry "${directive}"`));
  if (/style-src-attr/.test(csp[1]) === false)
    out.push(refusal('csp', rel, lineAt(html, csp.index), 'style-src-attr', "style-src-attr 'none' must be explicit rather than left to the style-src fallback"));
  for (const m of html.matchAll(/<script\b([^>]*)>/g))
    if (!/\bsrc=/.test(m[1]))
      out.push(refusal('csp', rel, lineAt(html, m.index), '<script>', 'an inline script cannot run under script-src self, so one here is a build that will silently not work'));
  if (/<base\b/.test(html)) out.push(refusal('csp', rel, lineAt(html, html.indexOf('<base')), '<base>', 'a <base> element re-targets every relative URL'));
  return out;
}
