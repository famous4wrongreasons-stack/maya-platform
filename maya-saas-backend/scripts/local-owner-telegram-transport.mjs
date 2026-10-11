import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { TELEGRAM_LIMITS, telegramProviderRoute } from './local-owner-telegram-policy.mjs';

// Reuses the real adapter and cryptographic verifier. Only tests inject wire
// replies. Only closed route/stage/status codes enter diagnostics; no body,
// header, provider error text or token payload is retained or interpreted here.
export function createOwnerTelegramTransport({ nativeFetch, clientId, companyId, assertCurrent, verifyCurrent, clock = Date.now, trace }) {
  const context = new AsyncLocalStorage(), counters = { calls: 0, refused: 0, routes: {} };
  let busy = false, closed = false; const active = new Set();
  const refusal = () => { throw new Error('local_telegram_transport_refused'); };
  const check = op => {
    assertCurrent();
    if (closed || !op?.active || op.poisoned || op.signal?.aborted || clock() >= op.deadline) refusal();
  };
  return {
    counters,
    operation: () => context.getStore(),
    async run(operation, fn) {
      assertCurrent(); assert.ok(!busy && !closed, 'local_telegram_operation_busy');
      busy = true;
      const op = { ...operation, active: true, poisoned: false, deadline: clock() + TELEGRAM_LIMITS.operationMs,
        controller: new AbortController(), registryPage: 0, tokenSent: false };
      active.add(op);
      const timer = setTimeout(() => { op.active = false; op.controller.abort(); }, TELEGRAM_LIMITS.operationMs);
      try { return await context.run(op, fn); }
      finally { clearTimeout(timer); op.active = false; op.controller.abort(); active.delete(op); busy = false; }
    },
    stop() { closed = true; for (const op of active) { op.active = false; op.controller.abort(); } },
    async fetch(raw, init) {
      const op = context.getStore();
      let diagnosticRoute = null;
      const emit = (stage, status, code) => {
        if (!diagnosticRoute) return;
        try { trace?.({ surface: 'provider', route: diagnosticRoute, method: diagnosticRoute === 'telegram_token' ? 'POST' : 'GET', stage, status, code }); }
        catch { /* Observation cannot change a response, guard or retry policy. */ }
      };
      try {
        check(op); await verifyCurrent(); check(op);
        const route = telegramProviderRoute(raw, init, op, clientId, companyId);
        if (!route || counters.calls >= TELEGRAM_LIMITS.calls) refusal();
        if (route === 'telegram_token') { if (op.tokenSent) refusal(); op.tokenSent = true; }
        if (route === 'client_registry') {
          const page = JSON.parse(init.body).page;
          if (page !== op.registryPage + 1) refusal(); op.registryPage = page;
        }
        counters.calls++; counters.routes[route] = (counters.routes[route] ?? 0) + 1;
        if (route === 'telegram_token' || route === 'telegram_jwks') diagnosticRoute = route;
        emit('entered', null, null);
        const signal = AbortSignal.any([op.controller.signal, ...(op.signal ? [op.signal] : []),
          AbortSignal.timeout(Math.max(1, Math.min(TELEGRAM_LIMITS.fetchMs, op.deadline - clock()))), ...(init?.signal ? [init.signal] : [])]);
        const response = await nativeFetch(raw, { ...init, redirect: 'error', signal });
        check(op);
        if (response.redirected || (response.url && response.url !== String(raw))) { await response.body?.cancel(); refusal(); }
        if (!response.ok) { await response.body?.cancel(); emit('refused', response.status, 'provider_http_error'); return new Response('{}', { status: response.status >= 400 && response.status <= 599 ? response.status : 502 }); }
        const reader = response.body?.getReader(); if (!reader) refusal();
        const chunks = []; let bytes = 0;
        try {
          for (;;) {
            const part = await reader.read(); check(op);
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > (route === 'client_registry' ? TELEGRAM_LIMITS.responseBytes : 65536)) refusal();
            chunks.push(Buffer.from(part.value));
          }
          await verifyCurrent(); check(op);
          const body = Buffer.concat(chunks);
          try { JSON.parse(body.toString('utf8')); const accepted = new Response(body, { status: response.status, headers: { 'content-type': 'application/json' } }); emit('completed', response.status, 'provider_response_read'); return accepted; }
          finally { body.fill(0); }
        } finally { await reader.cancel().catch(() => {}); for (const c of chunks) c.fill(0); }
      } catch { emit('refused', null, 'provider_transport_unavailable'); counters.refused++; if (op) op.poisoned = true; refusal(); }
    },
  };
}
