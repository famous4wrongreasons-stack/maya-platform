// Transparent finite guard around native adapter fetch, not a provider simulator.
// Only the test supplies a synthetic nativeFetch. Runtime captures real fetch once.
import { AsyncLocalStorage } from 'node:async_hooks';
import { companyId } from './local-yclients-read-profile.mjs';

export const READ_LIMITS = Object.freeze({ requestCalls: 64, sessionCalls: 256, requestMs: 120000, fetchMs: 20000, responseBytes: 2 * 1024 * 1024, teamMembers: 50 });
const fail = reason => { const error = new Error('Local YCLIENTS read refused: ' + reason); error.code = 'LOCAL_YCLIENTS_READ_REFUSED'; throw error; };
export function admittedProviderRead(raw, init, selectedCompany) {
  if (!(typeof raw === 'string' || raw instanceof URL)) return null;
  let url; try { url = new URL(String(raw)); } catch { return null; }
  if (url.origin !== 'https://api.yclients.com' || url.username || url.password || url.hash || /[\\%]/.test(String(raw)) || (init?.method ?? 'GET') !== 'GET' || init?.body != null) return null;
  if (!companyId(selectedCompany)) return null;
  if (url.pathname === '/api/v1/companies' && url.search === '?my=1') return 'companies';
  if (url.search) return null;
  const id = String(selectedCompany);
  const routes = new Map([
    [`/api/v1/company/${id}`, 'company'], [`/api/v1/book_services/${id}`, 'book_services'],
    [`/api/v1/services/${id}`, 'services'], [`/api/v1/service_categories/${id}`, 'categories'],
    [`/api/v1/company/${id}/staff`, 'team'], [`/api/v1/staff/${id}`, 'team'],
  ]);
  // book_staff is a bookable subset, not evidence of the complete team imported by A17.
  return routes.get(url.pathname) ?? null;
}
export function validateTeamResponse(payload, headers, selectedCompany) {
  if (!payload || typeof payload !== 'object' || payload.success !== true || !Array.isArray(payload.data) || payload.data.length > READ_LIMITS.teamMembers) fail('incomplete_team');
  if (headers?.get('link') || headers?.get('content-range') || Object.hasOwn(payload, 'pagination')) fail('incomplete_team');
  const meta = payload.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) fail('incomplete_team');
  const names = Object.keys(meta);
  if (names.some(key => !['total_count', 'count', 'page'].includes(key)) || !Number.isSafeInteger(meta.total_count) || meta.total_count !== payload.data.length || (meta.count !== undefined && meta.count !== payload.data.length) || (meta.page !== undefined && meta.page !== 1)) fail('incomplete_team');
  const ids = payload.data.map(item => item?.id);
  if (ids.some(id => !companyId(id)) || new Set(ids.map(String)).size !== ids.length) fail('incomplete_team');
  if (!companyId(selectedCompany) || payload.data.some(item => Object.hasOwn(item, 'company_id') && String(item.company_id) !== String(selectedCompany))) fail('foreign_company_team');
}
export function createReadTransport(nativeFetch, resolveCompany, clock = Date.now) {
  const context = new AsyncLocalStorage();
  const counters = { calls: 0, refused: 0, routes: {} };
  function run(request, response, next) {
    const controller = new AbortController();
    const scope = { request, active: true, calls: 0, deadline: clock() + READ_LIMITS.requestMs, poisoned: false, selected: null, controller };
    const close = () => { scope.active = false; controller.abort(); };
    response.once('finish', close); response.once('close', close);
    return context.run(scope, next);
  }
  async function guardedFetch(raw, init) {
    const scope = context.getStore();
    try {
      if (!scope?.active || scope.poisoned || clock() >= scope.deadline || !['/api/integrations/crm/connect', '/api/integrations/crm/activate'].includes(scope.request.originalUrl) || scope.request.method !== 'POST') fail('explicit_request_required');
      // request.user is populated by the real Nest auth guards before any domain call.
      if (!scope.request.user?.tenantId || !scope.request.user?.userId || scope.request.user.membershipStatus !== 'active') fail('current_actor_required');
      const selected = await resolveCompany(scope.request);
      if (!scope.active || clock() >= scope.deadline) fail('request_finished');
      if (!companyId(selected) || (scope.selected !== null && String(selected) !== scope.selected)) fail('company_changed');
      scope.selected = String(selected);
      const route = admittedProviderRead(raw, init, selected);
      if (!route || scope.calls >= READ_LIMITS.requestCalls || counters.calls >= READ_LIMITS.sessionCalls) fail('scope_or_budget');
      scope.calls++; counters.calls++; counters.routes[route] = (counters.routes[route] ?? 0) + 1;
      const remaining = Math.min(READ_LIMITS.fetchMs, scope.deadline - clock());
      const signals = [scope.controller.signal, AbortSignal.timeout(Math.max(1, remaining))];
      if (init?.signal) signals.push(init.signal);
      const response = await nativeFetch(raw, { ...init, redirect: 'error', signal: AbortSignal.any(signals) });
      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel();
        // No provider text can enter normal error messages, logs or AE evidence.
        return new Response('{}', { status: response.status >= 400 && response.status <= 599 ? response.status : 502 });
      }
      const reader = response.body?.getReader();
      if (!reader) fail('response_body_missing');
      const chunks = []; let bytes = 0;
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > READ_LIMITS.responseBytes || !scope.active || clock() >= scope.deadline) fail('response_bound');
          chunks.push(part.value);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let payload; try { payload = JSON.parse(rawBody); } catch { fail('response_json'); }
      if (payload?.success === false) return new Response('{"success":false}', { status: 200 });
      if (route === 'team') validateTeamResponse(payload, response.headers, selected);
      return new Response(rawBody, { status: response.status, headers: { 'content-type': 'application/json' } });
    } catch (error) {
      counters.refused++;
      // Incomplete management staff must never fall through to a partial book_staff list.
      if (scope && error?.code === 'LOCAL_YCLIENTS_READ_REFUSED') scope.poisoned = true;
      fail(error?.code === 'LOCAL_YCLIENTS_READ_REFUSED' ? 'scope_or_completeness' : 'transport_unavailable');
    }
  }
  return { run, fetch: guardedFetch, counters };
}
