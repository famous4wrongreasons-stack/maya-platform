import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { HISTORY_LIMITS as L, historyProviderRoute } from './local-owner-history-policy.mjs';
// Preserves adapter responses. All diagnostics are counts, never provider bodies.
export function createOwnerHistoryTransport({ plan, nativeFetch, assertCurrent, verifyCurrent, clock = Date.now }) {
  const context = new AsyncLocalStorage(), active = new Set(), seen = new Set();
  const counters = { calls: 0, refused: 0, routes: {} };
  let closed = false, used = false, page = 0, totalBytes = 0, poisoned = false;
  const refuse = () => { throw Error('local_history_transport_refused'); };
  const check = op => {
    assertCurrent();
    if (closed || poisoned || !op?.active || clock() >= op.deadline || op.controller.signal.aborted) refuse();
  };
  return {
    counters,
    current: async () => { const op = context.getStore(); check(op); await verifyCurrent(); check(op); },
    async run(purpose, fn) {
      assertCurrent(); assert.ok(!closed && !poisoned && ['journal','labels'].includes(purpose), 'history_operation_refused');
      if (purpose === 'journal') { assert.ok(!used, 'history_single_run'); used = true; }
      const op = { purpose, active: true, deadline: clock() + L.operationMs, controller: new AbortController() };
      active.add(op); const timer = setTimeout(() => op.controller.abort(), L.operationMs);
      try { const value = await context.run(op, fn); check(op); return value; }
      finally { clearTimeout(timer); op.active = false; op.controller.abort(); active.delete(op); }
    },
    stop() { closed = true; for (const op of active) { op.active = false; op.controller.abort(); } },
    async fetch(raw, init) {
      const op = context.getStore(); let reader; const chunks = [];
      try {
        check(op); await verifyCurrent(); check(op);
        const route = historyProviderRoute(raw, init, plan, op.purpose);
        if (!route || counters.calls >= L.calls || seen.has(String(raw))) refuse();
        if (route === 'history_records') {
          const next = Number(new URL(String(raw)).searchParams.get('page'));
          if (next !== page + 1) refuse(); page = next;
        }
        seen.add(String(raw)); counters.calls++; counters.routes[route] = (counters.routes[route] ?? 0) + 1;
        const signal = AbortSignal.any([op.controller.signal, AbortSignal.timeout(L.fetchMs), ...(init?.signal ? [init.signal] : [])]);
        const response = await nativeFetch(raw, { ...init, redirect: 'error', signal }); check(op);
        if (response.redirected || (response.url && response.url !== String(raw))) { await response.body?.cancel(); refuse(); }
        if (!response.ok) { await response.body?.cancel(); return new Response('{}', { status: response.status >= 400 && response.status <= 599 ? response.status : 502 }); }
        reader = response.body?.getReader(); if (!reader) refuse();
        let bytes = 0;
        for (;;) {
          const part = await reader.read(); check(op); if (part.done) break;
          bytes += part.value.byteLength; totalBytes += part.value.byteLength;
          if (bytes > L.responseBytes || totalBytes > L.totalBytes) refuse();
          chunks.push(Buffer.from(part.value));
        }
        await verifyCurrent(); check(op);
        const body = Buffer.concat(chunks);
        try {
          const parsed = JSON.parse(body.toString('utf8'));
          const rows = route === 'book_services' ? parsed?.data?.services : parsed?.data;
          if (!Array.isArray(rows) || rows.length > (route === 'history_records' ? L.rows : L.catalogueRows)
            || rows.some(row => row?.company_id !== undefined && String(row.company_id) !== plan.scope.companyId)) refuse();
          return new Response(body, { status: response.status, headers: { 'content-type': 'application/json' } });
        } finally { body.fill(0); }
      } catch { poisoned = true; counters.refused++; if (op) op.controller.abort(); refuse(); }
      finally { await reader?.cancel().catch(() => {}); for (const chunk of chunks) chunk.fill(0); }
    },
  };
}
