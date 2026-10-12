// One explicit IPC operator invocation around the existing reconciliation owner.
// HTTP login/GET never imports; no alternate Appointment or consent writer.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertOwnerChatActor, verifyOwnerChatDatabase } from './local-owner-scope.mjs';
import { createOwnerHistoryTransport } from './local-owner-history-transport.mjs';
import { historyDates, historyResultProjection } from './local-owner-history-policy.mjs';
export async function installOwnerHistory({ app, prisma, require, backend, launch, nativeFetch }) {
  const plan = launch.plan, scope = plan.scope, undo = [];
  const load = p => require(path.join(backend, 'dist/src', p));
  const { ForbiddenException } = require('@nestjs/common');
  const { AuthService } = load('auth/auth.service.js');
  const { AuthSessionService } = load('auth/auth-session.service.js');
  const { AppointmentReconciliationService } = load('crm/appointment-reconciliation.service.js');
  const { AppointmentObservationService } = load('crm/appointment-observation.service.js');
  const { AppointmentChangeService } = load('crm/appointment-change.service.js');
  const { ClientAppointmentReadService } = load('crm/client-appointment-read.service.js');
  const { CrmService } = load('crm/crm.service.js');
  const { TenantContextService } = load('tenancy/tenant-context.service.js');
  const { canonicalAppointmentInstant } = load('crm/appointment-time.utils.js');
  const { resolveSalonTimezone } = load('tenants/salon-timezone.js');
  const { ActionEngineRuntimeService } = load('action-engine/action-engine.runtime.js');
  const auth = app.get(AuthService), sessions = app.get(AuthSessionService), crm = app.get(CrmService);
  const reconciliation = app.get(AppointmentReconciliationService), context = app.get(TenantContextService);
  let stopped = false, sourcePin;
  const permitCurrent = launch.assertPermitCurrent ?? launch.assertCurrent;
  const refuse = () => { throw new ForbiddenException({ error: { code: 'local_owner_history_scope_refused' } }); };
  const current = async () => {
    if (stopped) return refuse();
    try {
      permitCurrent(); await verifyOwnerChatDatabase(prisma, scope);
      const [tenant, branch, integration] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { defaultTimezone: true, calendarSource: true } }),
        prisma.branch.findUnique({ where: { id: scope.branchId }, select: { timezone: true } }),
        prisma.crmIntegration.findUnique({ where: { tenantId: scope.tenantId }, select: { provider: true, status: true, baseUrl: true, settingsJson: true, verifiedAt: true, encryptedApiToken: true } }),
      ]);
      // The current journal uses tenant timezone. Never reinterpret its dates
      // in a divergent branch timezone or silently modify either source.
      assert.ok(tenant?.calendarSource === 'external'
        && resolveSalonTimezone({ branchTimezone: branch?.timezone, tenantTimezone: tenant?.defaultTimezone }) === plan.timezone
        && resolveSalonTimezone({ tenantTimezone: tenant?.defaultTimezone }) === plan.timezone, 'history_canonical_timezone_changed');
      const pin = createHash('sha256').update(JSON.stringify({ tenant, branch, integration })).digest('hex');
      if (sourcePin === undefined) sourcePin = pin;
      assert.ok(sourcePin === pin, 'history_source_changed');
      permitCurrent(); if (stopped) return refuse();
    } catch { return refuse(); }
  };
  launch.assertCurrent(); await current();
  const transport = createOwnerHistoryTransport({ plan, nativeFetch, assertCurrent: permitCurrent, assertSource: launch.assertCurrent, verifyCurrent: current });
  const patch = (object, method, wrapper) => {
    assert.equal(typeof object[method], 'function', 'history_canonical_owner_required');
    const original = object[method]; object[method] = wrapper(original.bind(object)); undo.push(() => { object[method] = original; });
  };
  const dates = historyDates(plan.day);
  const from = canonicalAppointmentInstant(dates.startDate + 'T00:00:00', plan.timezone);
  const to = canonicalAppointmentInstant(dates.exclusiveDate + 'T00:00:00', plan.timezone);
  let importing = false;
  try {
    patch(auth, 'login', original => async (dto, ...rest) => {
      await current();
      const user = await prisma.user.findUnique({ where: { id: scope.userId }, select: { email: true } });
      if (dto.tenantSlug !== scope.tenantSlug || typeof dto.email !== 'string'
        || dto.email.trim().toLowerCase() !== user?.email?.trim().toLowerCase()) return refuse();
      return original(dto, ...rest);
    });
    patch(sessions, 'issueSession', original => async (user, ...rest) => {
      await current();
      if (user?.id !== scope.userId || user.tenantId !== scope.tenantId || user.role !== 'tenant_owner' || user.status !== 'active') return refuse();
      return original(user, ...rest);
    });
    app.useGlobalInterceptors({ async intercept(execution, next) {
      await current(); const req = execution.switchToHttp().getRequest();
      if (!['/api/health','/api/health/ready','/api/auth/login'].includes(req.originalUrl)) {
        try { assertOwnerChatActor(req.user, scope); } catch { return refuse(); }
      }
      return next.handle();
    } });
    patch(crm, 'getJournal', original => async (tenant, query, options) => {
      await transport.current();
      if (!importing || tenant !== scope.tenantId || query.from !== from || query.to !== to || query.providerId !== undefined
        || options?.includeCanceled !== true || options.source !== undefined) return refuse();
      const result = await original(tenant, query, options); await transport.current();
      if (result.timezone !== plan.timezone || !Array.isArray(result.appointments)
        || result.appointments.length > 5000 || result.appointments.some(row =>
          !Number.isFinite(Date.parse(row.start_at)) || Date.parse(row.start_at) < Date.parse(from) || Date.parse(row.start_at) >= Date.parse(to))) return refuse();
      return result;
    });
    // Re-check restrictions before every canonical local write. Partial failure
    // stays a failed ReconciliationRun; no absence deletion or fabricated closure.
    patch(app.get(AppointmentObservationService), 'fromSourceShape', original => async (...args) => {
      await transport.current(); if (!importing || args[0] !== scope.tenantId) return refuse(); return original(...args);
    });
    patch(app.get(AppointmentChangeService), 'applyObservation', original => async (input) => {
      await transport.current(); if (!importing || input.tenantId !== scope.tenantId || input.ingestionMethod !== 'reconciliation') return refuse();
      return original(input);
    });
    // Full committed-source proof at completion, before the canonical success
    // write. Per-row checks still reread the permit, tenant/source and identity
    // owner. Do not re-hash thousands of loaded source files for every row.
    patch(prisma.reconciliationRun, 'update', original => async input => {
      if (input.data?.finishedAt) {
        await transport.current(); launch.assertCurrent();
        if (!importing) return refuse();
      }
      return original(input); // Canonical failure/lease cleanup remains available.
    });
    // Public labels may be fetched only within the canonical private reader.
    const appointments = app.get(ClientAppointmentReadService);
    for (const name of ['forAccount','forChannel']) patch(appointments, name, original => async (...args) => {
      await current(); return transport.run('labels', () => original(...args));
    });
    for (const name of ['execute','executeWithReceipt']) patch(app.get(ActionEngineRuntimeService), name, () => refuse);
    return {
      fetch: transport.fetch, counters: transport.counters,
      runRequest(_request, _response, next) { next(); },
      async importOnce() {
        try {
          await current();
          return await transport.run('journal', async () => {
            importing = true;
            try {
              const result = await context.runAsSystemTenant(scope.tenantId, () => reconciliation.run({
                tenantId: scope.tenantId, from: new Date(from), to: new Date(to), holder: 'local-owner-history-14d',
              }));
              await transport.current(); return historyResultProjection(result);
            } finally { importing = false; }
          });
        } catch { return { status: 'failed' }; }
      },
      // Keep refusal wrappers installed until this AppModule is destroyed: restoring
      // them during an in-flight write would let the next row bypass cancellation.
      stop() { stopped = true; transport.stop(); },
    };
  } catch (error) { stopped = true; transport.stop(); for (const restore of undo.reverse()) restore(); throw error; }
}
