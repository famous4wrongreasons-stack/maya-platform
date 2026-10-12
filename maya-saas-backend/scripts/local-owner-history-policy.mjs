// H-1 Option A. Local qualification bounds only; never booking/Client authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertOwnerChatScope } from './local-owner-scope.mjs';
import { exactObject, assertTelegramOrigin } from './local-owner-telegram-policy.mjs';
import { ingressDecision } from './local-onboarding-profile.mjs';
export const OWNER_HISTORY_PROFILE = 'owner_salon_history_14d_v1';
export const OWNER_HISTORY_ADMISSION = 'explicit_owner_local_salon_journal_14d';
export const HISTORY_LIMITS = Object.freeze({ sessionMs: 1800000, operationMs: 240000, fetchMs: 20000,
  pages: 25, rows: 200, catalogueRows: 2000, calls: 40, responseBytes: 2097152, totalBytes: 16777216 });
const digest = v => createHash('sha256').update(v).digest('hex');
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0,10) === v;
export function historyDates(day) {
  assert.ok(date(day), 'history_calendar_day');
  const shift = n => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0,10);
  return { startDate: shift(-7), endDate: shift(6), exclusiveDate: shift(7) };
}
export function assertOwnerHistoryPlan(p, source, approvalRef, now = Date.now()) {
  assert.ok(exactObject(p, ['contract','candidateCommit','sourceSha256','scope','origin','day','timezone','notBefore','expiresAt','ownerApprovalRef']), 'history_plan_shape');
  assert.ok(p.contract === OWNER_HISTORY_PROFILE && /^[a-f0-9]{40}$/.test(p.candidateCommit)
    && p.candidateCommit === source.head && p.sourceSha256 === digest(JSON.stringify(source)), 'history_source_pin');
  assertOwnerChatScope(p.scope); assertTelegramOrigin(p.origin); historyDates(p.day);
  assert.ok(typeof p.timezone === 'string' && p.timezone.trim() === p.timezone && p.timezone.length <= 80, 'history_timezone');
  new Intl.DateTimeFormat('en', { timeZone: p.timezone });
  assert.ok(typeof approvalRef === 'string' && /^[A-Za-z0-9_.:/-]{8,200}$/.test(approvalRef) && p.ownerApprovalRef === approvalRef, 'history_execution_approval_required');
  const start = Date.parse(p.notBefore), end = Date.parse(p.expiresAt);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end
    && end > start && end - start <= HISTORY_LIMITS.sessionMs, 'history_execution_window');
}
export function ownerHistoryIngress(method, route, headers, body, origin, scope) {
  assertOwnerChatScope(scope); assertTelegramOrigin(origin);
  if (headers.origin && headers.origin !== origin) return 'local_history_origin_refused';
  if (method === 'GET' && ['/api/health','/api/health/ready','/api/branches','/api/ai/conversation',
    '/api/auth/identities','/api/client-channel/profile','/api/client-channel/appointments','/api/client-channel/status',
    '/api/governed-settings/tenant/client_capabilities'].includes(route)) return null;
  if (method !== 'POST') return 'local_history_route_refused';
  if (route === '/api/auth/login' && body?.tenantSlug === scope.tenantSlug) return ingressDecision(method, route, headers.origin, origin, body);
  if (route === '/api/auth/logout' && exactObject(body, [])) return null;
  if (route === '/api/client-channel/consent' && exactObject(body, ['privacy','marketing','idempotencyKey'])
    && body.privacy === true && body.marketing === false && typeof body.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(body.idempotencyKey)) return null;
  if (route === '/api/governed-settings/tenant' && exactObject(body, ['confirmed','namespace','expectedRevision','previousRevisionId','content'])
    && body.confirmed === true && body.namespace === 'client_capabilities' && Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 0
    && (body.previousRevisionId === null || typeof body.previousRevisionId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.previousRevisionId))
    && exactObject(body.content, ['client_self_visit_history']) && body.content.client_self_visit_history === true
    && typeof headers['idempotency-key'] === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(headers['idempotency-key'])) return null;
  return 'local_history_route_refused';
}
export function historyProviderRoute(raw, init, plan, purpose) {
  if (!(typeof raw === 'string' || raw instanceof URL) || (init?.method ?? 'GET') !== 'GET' || init?.body != null) return null;
  let u; try { u = new URL(String(raw)); } catch { return null; }
  if (u.origin !== 'https://api.yclients.com' || u.username || u.password || u.hash || /[%\\]/.test(String(raw)) || !['journal','labels'].includes(purpose)) return null;
  const company = plan.scope.companyId;
  if (u.pathname === `/api/v1/records/${company}` && purpose === 'journal') {
    const dates = historyDates(plan.day), q = u.searchParams;
    if ([...q.keys()].sort().join(',') !== 'count,end_date,page,start_date,with_deleted'
      || q.get('start_date') !== dates.startDate || q.get('end_date') !== dates.endDate || q.get('count') !== '200'
      || q.get('with_deleted') !== '1' || !/^(?:[1-9]|1\d|2[0-5])$/.test(q.get('page'))) return null;
    return 'history_records';
  }
  if (u.search) return null;
  return new Map([
    [`/api/v1/company/${company}/staff`, 'team'], [`/api/v1/staff/${company}`, 'team'], [`/api/v1/book_staff/${company}`, 'team'],
    [`/api/v1/book_services/${company}`, 'book_services'], [`/api/v1/services/${company}`, 'services'],
    [`/api/v1/service_categories/${company}`, 'categories'],
  ]).get(u.pathname) ?? null;
}
export function historyResultProjection(result) {
  if (result?.status === 'already_running') return { status: 'already_running' };
  if (result?.status !== 'ran' || !['complete','truncated'].includes(result.completeness)) return { status: 'failed' };
  const keys = ['windows','fetched','complete_windows','truncated_windows','created','updated','unchanged','events_emitted','duplicate_events','skipped'];
  if (keys.some(k => !Number.isSafeInteger(result[k]) || result[k] < 0)) return { status: 'failed' };
  return { status: 'ran', completeness: result.completeness, ...Object.fromEntries(keys.map(k => [k,result[k]])) };
}
