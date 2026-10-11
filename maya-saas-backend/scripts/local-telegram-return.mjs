// Static return document only. This admits no API, provider request or identity
// write. The original pending-state/runtime/backend owners still decide login.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { localBrowserBoundary } from './local-onboarding-profile.mjs';

const route = '/oauth-callback.html';
const file = new URL('../deploy/platform/beget-edge/oauth-callback.html', import.meta.url);

export function createLocalTelegramReturn() {
  const stat = fs.lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16384, 'canonical_callback_required');
  const bytes = fs.readFileSync(file), html = bytes.toString('utf8');
  const sources = tag => {
    const matches = [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))];
    assert.equal(matches.length, 1, 'canonical_callback_block_required');
    return "'sha256-" + createHash('sha256').update(matches[0][1]).digest('base64') + "'";
  };
  const headers = Object.freeze({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `default-src 'none'; script-src ${sources('script')}; style-src ${sources('style')}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'microphone=(), camera=(), geolocation=()',
  });
  return (request, response, origin) => {
    const raw = request.url;
    if (typeof raw !== 'string' || !(raw === route || raw.startsWith(route + '?'))) return false;
    const h = request.headers, host = new URL(origin).host;
    // An OAuth redirect is a top-level document navigation from the provider.
    // This exception cannot reach the relay, another static file or a subframe.
    const externalDocument = h.host === host && h.origin === undefined
      && h['sec-fetch-site'] === 'cross-site' && h['sec-fetch-mode'] === 'navigate'
      && h['sec-fetch-dest'] === 'document';
    const ordinary = localBrowserBoundary(h, origin, host);
    const refused = request.method !== 'GET' || raw.length > 8192 || /[\r\n\0#\\]/.test(raw)
      || (!ordinary && !externalDocument)
      || ['authorization', 'cookie', 'x-session-token', 'x-telegram-initdata'].some(key => h[key] !== undefined)
      || (h['sec-fetch-dest'] !== undefined && h['sec-fetch-dest'] !== 'document')
      || (h['sec-fetch-mode'] !== undefined && h['sec-fetch-mode'] !== 'navigate');
    if (refused) {
      response.writeHead(403, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Local callback request refused');
    } else {
      // No templating/reflection, query logging, parsing of identity or forwarding.
      // Malformed/unsolicited callbacks receive the same canonical query eraser.
      response.writeHead(200, headers);
      response.end(bytes);
    }
    return true;
  };
}
