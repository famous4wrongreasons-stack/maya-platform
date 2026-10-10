// Transparent finite guard around native adapter fetch, not a provider simulator.
// Only the test supplies a synthetic nativeFetch. Runtime captures real fetch once.
import { AsyncLocalStorage } from 'node:async_hooks';
import { companyId, loginShape } from './local-yclients-read-profile.mjs';
import { TEAM_ISSUES } from './local-yclients-read-status.mjs';

export const READ_LIMITS = Object.freeze({ requestCalls: 64, sessionCalls: 256, requestMs: 120000, fetchMs: 20000, responseBytes: 2 * 1024 * 1024, teamMembers: 50 });
const fail = reason => { const error = new Error('Local YCLIENTS read refused: ' + reason); error.code = 'LOCAL_YCLIENTS_READ_REFUSED'; throw error; };
export function admittedProviderRead(raw, init, selectedCompany, allowUserAuth = false) {
  if (!(typeof raw === 'string' || raw instanceof URL)) return null;
  let url; try { url = new URL(String(raw)); } catch { return null; }
  if (url.origin !== 'https://api.yclients.com' || url.username || url.password || url.hash || /[\\%]/.test(String(raw))) return null;
  if (!companyId(selectedCompany)) return null;
  if (allowUserAuth === true && url.pathname === '/api/v1/auth' && !url.search && init?.method === 'POST' && typeof init.body === 'string') return 'auth';
  if ((init?.method ?? 'GET') !== 'GET' || init?.body != null) return null;
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
// Called only AFTER the unchanged validator refuses. Diagnose all applicable
// checks in one attempt, without retaining any provider values or personal data.
export function teamRefusalIssues(payload, headers, selectedCompany) {
  const issues = new Set();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ['payload_shape'];
  if (payload.success !== true) issues.add('success_unconfirmed');
  const data = payload.data;
  if (!Array.isArray(data)) issues.add('data_shape');
  else if (data.length > READ_LIMITS.teamMembers) issues.add('member_limit');
  if (headers?.get('link') || headers?.get('content-range') || Object.hasOwn(payload, 'pagination')) issues.add('pagination_present');
  const meta = payload.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) issues.add('meta_shape');
  else {
    if (Object.keys(meta).some(key => !['total_count', 'count', 'page'].includes(key))) issues.add('unknown_meta_fields');
    if (!Number.isSafeInteger(meta.total_count)) issues.add('total_count_type');
    else if (Array.isArray(data) && meta.total_count !== data.length) issues.add('total_count_mismatch');
    if (meta.count !== undefined && Array.isArray(data) && meta.count !== data.length) issues.add('count_mismatch');
    if (meta.page !== undefined && meta.page !== 1) issues.add('page_not_first');
  }
  if (Array.isArray(data) && data.length <= READ_LIMITS.teamMembers) {
    if (data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) issues.add('row_shape');
    const ids = data.map(row => row?.id);
    if (ids.some(id => !companyId(id))) issues.add('invalid_staff_id');
    if (new Set(ids.map(String)).size !== ids.length) issues.add('duplicate_staff_id');
    if (!companyId(selectedCompany) || data.some(row => row && Object.hasOwn(row, 'company_id') && String(row.company_id) !== String(selectedCompany))) issues.add('foreign_company');
  }
  return TEAM_ISSUES.filter(issue => issues.has(issue));
}
export function createReadTransport(nativeFetch, resolveCompany, clock = Date.now, trace = () => {}, { allowUserAuth = false } = {}) {
  const context = new AsyncLocalStorage();
  const counters = { calls: 0, refused: 0, routes: {} };
  function run(request, response, next) {
    const controller = new AbortController();
    const scope = { request, active: true, calls: 0, deadline: clock() + READ_LIMITS.requestMs, poisoned: false, authenticated: false, selected: null, controller };
    const close = () => {
      scope.active = false; controller.abort();
      if (request.body?.yclientsLogin && typeof request.body.yclientsLogin === 'object') { request.body.yclientsLogin.login = ''; request.body.yclientsLogin.password = ''; delete request.body.yclientsLogin; }
    };
    response.once('finish', close); response.once('close', close);
    return context.run(scope, next);
  }
  async function guardedFetch(raw, init) {
    const scope = context.getStore();
    let route = 'unlisted', status = null, teamIssues = null;
    const method = init?.method === undefined ? 'GET' : ['GET', 'POST'].includes(init.method) ? init.method : 'OTHER';
    const emit = (stage, code = null) => { try { trace({ surface: 'provider', route, method, stage, status, code, ...(stage === 'refused' && code === 'provider_scope_refused' && teamIssues?.length ? { teamIssues } : {}) }); } catch { /* Diagnostics never change transport behavior. */ } };
    try {
      if (!scope?.active || scope.poisoned || clock() >= scope.deadline || !['/api/integrations/crm/connect', '/api/integrations/crm/activate'].includes(scope.request.originalUrl) || scope.request.method !== 'POST') fail('explicit_request_required');
      // request.user is populated by the real Nest auth guards before any domain call.
      if (!scope.request.user?.tenantId || !scope.request.user?.userId || scope.request.user.membershipStatus !== 'active') fail('current_actor_required');
      const selected = await resolveCompany(scope.request);
      if (!scope.active || clock() >= scope.deadline) fail('request_finished');
      if (!companyId(selected) || (scope.selected !== null && String(selected) !== scope.selected)) fail('company_changed');
      scope.selected = String(selected);
      route = admittedProviderRead(raw, init, selected, allowUserAuth) ?? 'unlisted';
      if (route === 'unlisted' || scope.calls >= READ_LIMITS.requestCalls || counters.calls >= READ_LIMITS.sessionCalls) fail('scope_or_budget');
      if (route === 'auth') {
        const login = scope.request.body?.yclientsLogin;
        let outgoing; try { outgoing = JSON.parse(init.body); } catch { fail('auth_body'); }
        if (scope.request.originalUrl !== '/api/integrations/crm/connect' || !loginShape(login) || !loginShape(outgoing) || outgoing.login !== login.login.trim() || outgoing.password !== login.password || scope.authenticated || (counters.routes.auth ?? 0) >= 3) fail('explicit_single_auth_required');
        scope.authenticated = true;
      }
      scope.calls++; counters.calls++; counters.routes[route] = (counters.routes[route] ?? 0) + 1;
      const remaining = Math.min(READ_LIMITS.fetchMs, scope.deadline - clock());
      const signals = [scope.controller.signal, AbortSignal.timeout(Math.max(1, remaining))];
      if (init?.signal) signals.push(init.signal);
      emit('entered');
      const response = await nativeFetch(raw, { ...init, redirect: 'error', signal: AbortSignal.any(signals) });
      status = response.status;
      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel();
        emit('refused', 'provider_http_error');
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
          if (bytes > (route === 'auth' ? 65536 : READ_LIMITS.responseBytes) || !scope.active || clock() >= scope.deadline) fail('response_bound');
          chunks.push(part.value);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let payload; try { payload = JSON.parse(rawBody); } catch { fail('response_json'); }
      if (payload?.success === false) { emit('refused', 'provider_rejected'); return new Response('{"success":false}', { status: 200 }); }
      if (route === 'team') {
        try { validateTeamResponse(payload, response.headers, selected); }
        catch (error) {
          try { teamIssues = teamRefusalIssues(payload, response.headers, selected); } catch { /* Keep the original refusal even if diagnosis fails. */ }
          throw error;
        }
      }
      // Parsed bounded wire only; selected-company and A17 validation happen later.
      emit('completed', 'provider_response_read');
      return new Response(rawBody, { status: response.status, headers: { 'content-type': 'application/json' } });
    } catch (error) {
      emit('refused', error?.code === 'LOCAL_YCLIENTS_READ_REFUSED' ? 'provider_scope_refused' : 'provider_transport_unavailable');
      counters.refused++;
      // Incomplete management staff must never fall through to a partial book_staff list.
      if (scope && error?.code === 'LOCAL_YCLIENTS_READ_REFUSED') scope.poisoned = true;
      fail(error?.code === 'LOCAL_YCLIENTS_READ_REFUSED' ? 'scope_or_completeness' : 'transport_unavailable');
    }
  }
  return { run, fetch: guardedFetch, counters };
}
