import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

type ApiResponse = {
  status: number;
  data: unknown;
};

const port = process.env.HTTP_SMOKE_PORT ?? '3101';
const apiBase =
  process.env.HTTP_SMOKE_BASE_URL ?? `http://127.0.0.1:${port}/api`;
const ownerEmail = process.env.SEED_PLATFORM_OWNER_EMAIL ?? 'owner@maya.local';
const ownerPassword =
  process.env.SEED_PLATFORM_OWNER_PASSWORD ?? 'ChangeMe123!';
const demoEmail =
  process.env.SEED_DEMO_TENANT_ADMIN_EMAIL ?? 'admin@demo-business.local';
const demoPassword =
  process.env.SEED_DEMO_TENANT_ADMIN_PASSWORD ?? 'ChangeMe123!';
const fixedPhoneCode = '123456';
const demoTenantSlug = 'demo-business';

function asRecord(value: unknown): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  assert(Array.isArray(value));
  return value;
}

function stringField(value: unknown, key: string): string {
  const field = asRecord(value)[key];
  assert(typeof field === 'string', `Expected string field ${key}`);
  return field;
}

function numberField(value: unknown, key: string): number {
  const field = asRecord(value)[key];
  assert(typeof field === 'number', `Expected number field ${key}`);
  return field;
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse> {
  const response = await fetch(`${apiBase}${path}`, init);
  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    // Some negative-path responses may intentionally have no JSON body.
  }

  return { status: response.status, data };
}

async function expectStatus(
  path: string,
  expectedStatus: number,
  init: RequestInit = {},
) {
  const response = await request(path, init);
  assert.equal(
    response.status,
    expectedStatus,
    `${init.method ?? 'GET'} ${path} returned ${response.status}`,
  );
  return response.data;
}

async function waitForHealth(child: ChildProcess | null) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `Backend exited before health check (${child?.exitCode})`,
      );
    }

    try {
      const response = await fetch(`${apiBase}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The server may still be binding its port.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error('Backend did not become healthy within 15 seconds');
}

async function stopServer(child: ChildProcess | null) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

function startServer() {
  if (process.env.HTTP_SMOKE_EXTERNAL_SERVER === 'true') {
    return null;
  }

  return spawn(process.execPath, ['--enable-source-maps', 'dist/src/main'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      PHONE_AUTH_DEBUG: 'true',
      PHONE_AUTH_FIXED_CODE: fixedPhoneCode,
      PHONE_AUTH_PROVIDER: 'auto',
      PORT: port,
      SELF_SERVE_TRIAL_SIGNUP: 'true',
      SWAGGER_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function runSmoke() {
  const presetCatalog = asRecord(await expectStatus('/industry-presets', 200));
  const presetIds = asArray(presetCatalog.items).map((preset) =>
    stringField(preset, 'id'),
  );
  assert(presetIds.includes('general_service'));
  assert(presetIds.includes('dental_clinic'));
  assert(presetIds.includes('education'));

  const featureCatalog = asRecord(
    await expectStatus('/features/registry', 200),
  );
  assert.equal(featureCatalog.schema_version, 2);
  const registeredFeatures = asArray(featureCatalog.features).map(asRecord);
  const videoAnalytics = registeredFeatures.find(
    (feature) => feature.key === 'video_analytics',
  );
  const internalCalendar = registeredFeatures.find(
    (feature) => feature.key === 'calendar.internal',
  );
  assert.equal(videoAnalytics?.implementationStatus, 'planned');
  assert.equal(internalCalendar?.implementationStatus, 'platform_ready');

  const crmProviderCatalog = asRecord(
    await expectStatus('/crm/providers', 200),
  );
  assert.deepEqual(crmProviderCatalog.selectable_provider_keys, [
    'yclients',
    'altegio',
    'mock',
  ]);
  const crmProviders = asArray(crmProviderCatalog.providers).map(asRecord);
  const dikidi = crmProviders.find(
    (provider) => provider.provider === 'dikidi',
  );
  assert.equal(dikidi?.connectable, false);
  assert.equal(dikidi?.implementationStatus, 'planned');

  const onboardingTemplates = asRecord(
    await expectStatus('/onboarding/templates', 200),
  );
  assert.equal(onboardingTemplates.branding_mode, 'logo_only');
  const templateIds = asArray(onboardingTemplates.templates).map((template) =>
    stringField(template, 'id'),
  );
  assert(templateIds.includes('solo_specialist'));
  assert(templateIds.includes('barbershop'));
  assert(templateIds.includes('pet_services'));

  const ownerLogin = asRecord(
    await expectStatus('/auth/login', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        password: ownerPassword,
      }),
    }),
  );
  const ownerToken = stringField(ownerLogin, 'access_token');
  const analyticsBefore = asRecord(
    await expectStatus('/admin/analytics/trials', 200, {
      headers: authHeaders(ownerToken),
    }),
  );
  const totalsBefore = asRecord(analyticsBefore.totals);

  const trialActivation = asRecord(
    await expectStatus('/onboarding/trial-activations', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'maya_os' }),
    }),
  );
  const trialActivationToken = stringField(trialActivation, 'activation_token');
  assert.equal(trialActivation.trial_days, 10);
  assert.equal(trialActivation.counted_as_connected_business, false);

  const analyticsAfterSwipe = asRecord(
    await expectStatus('/admin/analytics/trials', 200, {
      headers: authHeaders(ownerToken),
    }),
  );
  const totalsAfterSwipe = asRecord(analyticsAfterSwipe.totals);
  assert.equal(
    numberField(totalsAfterSwipe, 'trial_swipes'),
    numberField(totalsBefore, 'trial_swipes') + 1,
  );
  assert.equal(
    numberField(totalsAfterSwipe, 'connected_businesses'),
    numberField(totalsBefore, 'connected_businesses'),
  );

  const aiSuffix = Date.now();
  const aiDraft = asRecord(
    await expectStatus('/onboarding/ai/drafts', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: `Я частный массажист, работаю один. Название AI Smoke ${aiSuffix}.`,
        trialActivationToken,
      }),
    }),
  );
  const aiDraftId = stringField(aiDraft, 'draft_id');
  const aiDraftToken = stringField(aiDraft, 'draft_token');
  assert(asArray(aiDraft.missing_fields).includes('services'));
  assert(Array.isArray(aiDraft.quick_replies));
  assert.equal(aiDraft.interpreter_source, 'safe_fallback');
  await expectStatus(`/onboarding/ai/drafts/${aiDraftId}/read`, 401, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ draftToken: 'x'.repeat(43) }),
  });

  const completedAiDraft = asRecord(
    await expectStatus(`/onboarding/ai/drafts/${aiDraftId}/messages`, 200, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftToken: aiDraftToken,
        message: 'Услуги: массаж 3000 руб 60 минут',
      }),
    }),
  );
  assert.deepEqual(completedAiDraft.missing_fields, []);

  await expectStatus(`/onboarding/ai/drafts/${aiDraftId}/confirm`, 400, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      draftToken: aiDraftToken,
      ownerEmail: `ai-smoke-${aiSuffix}@example.ru`,
      ownerPhone: `+7997${String(aiSuffix % 10_000_000).padStart(7, '0')}`,
    }),
  });

  await expectStatus(`/onboarding/ai/drafts/${aiDraftId}/confirm`, 400, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      draftToken: aiDraftToken,
      ownerEmail: `ai-smoke-${aiSuffix}@example.ru`,
      ownerName: 'AI Smoke Owner',
    }),
  });

  const missingTrialActivation = asRecord(
    await expectStatus(`/onboarding/ai/drafts/${aiDraftId}/confirm`, 400, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftToken: aiDraftToken,
        ownerEmail: `ai-smoke-${aiSuffix}@example.ru`,
        ownerName: 'AI Smoke Owner',
        ownerPhone: `+7997${String(aiSuffix % 10_000_000).padStart(7, '0')}`,
      }),
    }),
  );
  assert.equal(
    asRecord(missingTrialActivation.error).code,
    'trial_activation_token_required',
  );

  const confirmedAiSignup = asRecord(
    await expectStatus(`/onboarding/ai/drafts/${aiDraftId}/confirm`, 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftToken: aiDraftToken,
        trialActivationToken,
        ownerEmail: `ai-smoke-${aiSuffix}@example.ru`,
        ownerName: 'AI Smoke Owner',
        ownerPhone: `+7997${String(aiSuffix % 10_000_000).padStart(7, '0')}`,
      }),
    }),
  );
  assert.equal(confirmedAiSignup.branding_mode, 'logo_only');
  assert.equal(confirmedAiSignup.next_step, 'upload_logo_or_open_app');
  assert.equal(asRecord(confirmedAiSignup.trial).days, 10);
  assert.equal(asRecord(confirmedAiSignup.trial).full_access, true);
  assert.equal(
    asRecord(confirmedAiSignup.trial_activation).counted_as_connected_business,
    true,
  );
  const aiTenant = asRecord(confirmedAiSignup.tenant);
  const aiTenantId = stringField(aiTenant, 'id');
  const aiTenantSlug = stringField(aiTenant, 'slug');

  const analyticsAfterRegistration = asRecord(
    await expectStatus('/admin/analytics/trials', 200, {
      headers: authHeaders(ownerToken),
    }),
  );
  const totalsAfterRegistration = asRecord(analyticsAfterRegistration.totals);
  assert.equal(
    numberField(totalsAfterRegistration, 'connected_businesses'),
    numberField(totalsBefore, 'connected_businesses') + 1,
  );
  await expectStatus('/onboarding/trial-activations', 201, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'maya_os' }),
  });
  const analyticsWithAbandonedSwipe = asRecord(
    await expectStatus('/admin/analytics/trials', 200, {
      headers: authHeaders(ownerToken),
    }),
  );
  const totalsWithAbandonedSwipe = asRecord(analyticsWithAbandonedSwipe.totals);
  assert.equal(
    numberField(totalsWithAbandonedSwipe, 'trial_swipes'),
    numberField(totalsBefore, 'trial_swipes') + 2,
  );
  assert.equal(
    numberField(totalsWithAbandonedSwipe, 'connected_businesses'),
    numberField(totalsBefore, 'connected_businesses') + 1,
  );
  assert(numberField(totalsWithAbandonedSwipe, 'pending_registrations') >= 1);

  const aiSignupToken = stringField(confirmedAiSignup, 'access_token');
  const aiCalendarSetup = asRecord(
    await expectStatus('/internal-calendar/setup', 200, {
      headers: authHeaders(aiSignupToken),
    }),
  );
  assert.equal(aiCalendarSetup.ready, true);
  assert.equal(asArray(aiCalendarSetup.providers).length, 1);
  assert.equal(asArray(aiCalendarSetup.services).length, 1);
  const confirmedDraft = asRecord(
    await expectStatus(`/onboarding/ai/drafts/${aiDraftId}/read`, 200, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftToken: aiDraftToken }),
    }),
  );
  assert.equal(confirmedDraft.status, 'confirmed');

  await expectStatus(`/admin/tenants/${aiTenantId}`, 200, {
    method: 'PATCH',
    headers: {
      ...authHeaders(ownerToken),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      trialEndsAt: new Date(Date.now() - 60_000).toISOString(),
    }),
  });
  const expiredAiConfig = asRecord(
    await expectStatus(`/mobile/config/${aiTenantSlug}`, 200),
  );
  assert.equal(expiredAiConfig.access_state, 'subscription_required');
  assert.equal(expiredAiConfig.subscription_required, true);
  assert.equal(expiredAiConfig.active, false);
  const blockedAfterTrial = asRecord(
    await expectStatus('/internal-calendar/setup', 402, {
      headers: authHeaders(aiSignupToken),
    }),
  );
  assert.equal(asRecord(blockedAfterTrial.error).code, 'subscription_required');
  assert(asArray(await expectStatus('/billing/plans', 200)).length > 0);
  await expectStatus(`/admin/tenants/${aiTenantId}`, 200, {
    headers: authHeaders(aiSignupToken),
  });

  const demoConfig = asRecord(
    await expectStatus(`/mobile/config/${demoTenantSlug}`, 200),
  );
  const mayaConfig = asRecord(
    await expectStatus('/mobile/config/malesthetic', 200),
  );
  assert.equal(demoConfig.slug, demoTenantSlug);
  assert.equal(asRecord(demoConfig.industry_preset).id, 'general_service');
  assert.equal(mayaConfig.slug, 'malesthetic');
  assert.notEqual(demoConfig.slug, mayaConfig.slug);

  const demoLogin = asRecord(
    await expectStatus('/auth/login', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: demoTenantSlug,
        email: demoEmail,
        password: demoPassword,
      }),
    }),
  );
  const demoToken = stringField(demoLogin, 'access_token');
  const demoRefreshToken = stringField(demoLogin, 'refresh_token');
  const demoUser = asRecord(demoLogin.user);
  const demoTenantId = stringField(demoUser, 'tenant_id');

  const branches = asArray(
    await expectStatus('/branches', 200, {
      headers: authHeaders(demoToken),
    }),
  );
  const services = asArray(
    await expectStatus('/services', 200, {
      headers: authHeaders(demoToken),
    }),
  );
  const staff = asArray(
    await expectStatus('/staff', 200, {
      headers: authHeaders(demoToken),
    }),
  );
  assert(branches.length > 0);
  assert(services.length > 0);
  assert(staff.length > 0);
  await expectStatus('/features/effective', 200, {
    headers: authHeaders(demoToken),
  });
  await expectStatus('/auth/sessions', 200, {
    headers: authHeaders(demoToken),
  });

  const tenants = asArray(
    await expectStatus('/admin/tenants', 200, {
      headers: authHeaders(ownerToken),
    }),
  ).map(asRecord);
  const otherTenant = tenants.find((tenant) => tenant.id !== demoTenantId);
  assert(otherTenant, 'Expected a second tenant for isolation verification');
  await expectStatus(`/admin/tenants/${demoTenantId}`, 200, {
    headers: authHeaders(demoToken),
  });
  await expectStatus(`/admin/tenants/${stringField(otherTenant, 'id')}`, 403, {
    headers: authHeaders(demoToken),
  });

  const phoneSuffix = String(Date.now() % 10_000_000).padStart(7, '0');
  const phone = `+7999${phoneSuffix}`;
  const phoneStart = asRecord(
    await expectStatus('/auth/phone/start', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantSlug: demoTenantSlug, phone }),
    }),
  );
  assert.equal(phoneStart.delivery, 'debug');
  const phoneLogin = asRecord(
    await expectStatus('/auth/phone/verify', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: demoTenantSlug,
        phone,
        code: fixedPhoneCode,
      }),
    }),
  );
  const clientToken = stringField(phoneLogin, 'access_token');
  const clientAiTools = asArray(
    asRecord(
      await expectStatus('/ai/tools?surface=web', 200, {
        headers: authHeaders(clientToken),
      }),
    ).tools,
  ).map(asRecord);
  assert(clientAiTools.some((tool) => tool.name === 'appointments.own.cancel'));
  assert(
    !clientAiTools.some((tool) => tool.name === 'analytics.business.read'),
  );
  const aiCatalogResult = asRecord(
    await expectStatus('/ai/tools/catalog.services.read/execute', 201, {
      method: 'POST',
      headers: {
        ...authHeaders(clientToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ arguments: {}, surface: 'web' }),
    }),
  );
  assert.equal(aiCatalogResult.status, 'completed');
  assert(asArray(asRecord(aiCatalogResult.result).services).length > 0);
  const profile = asRecord(
    await expectStatus('/me', 200, {
      headers: authHeaders(clientToken),
    }),
  );
  assert.equal(profile.tenant_id, demoTenantId);
  await expectStatus('/me', 200, {
    method: 'PATCH',
    headers: {
      ...authHeaders(clientToken),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: 'Smoke Client' }),
  });

  const branchId = stringField(asRecord(branches[0]), 'id');
  const serviceId = stringField(asRecord(services[0]), 'id');
  const staffId = stringField(asRecord(staff[0]), 'id');
  const futureDay = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const slots = asArray(
    await expectStatus(
      `/available-slots?date=${futureDay}T00%3A00%3A00.000Z&staffId=${staffId}&branchId=${branchId}&serviceIds=${serviceId}`,
      200,
      { headers: authHeaders(clientToken) },
    ),
  );
  assert(slots.length > 0);
  const selectedStart = stringField(asRecord(slots[0]), 'start');
  const appointmentPayload = {
    staffId,
    serviceIds: [serviceId],
    start: selectedStart,
    branchId,
  };
  const preview = asRecord(
    await expectStatus('/appointments/preview', 201, {
      method: 'POST',
      headers: {
        ...authHeaders(clientToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify(appointmentPayload),
    }),
  );
  assert.equal(preview.preview, true);
  const blockedLive = asRecord(
    await expectStatus('/appointments', 403, {
      method: 'POST',
      headers: {
        ...authHeaders(clientToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify(appointmentPayload),
    }),
  );
  assert.equal(asRecord(blockedLive.error).code, 'live_booking_disabled');

  const trialSlug = `smoke-${Date.now()}`;
  const trial = asRecord(
    await expectStatus('/onboarding/trial', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Tenant',
        slug: trialSlug,
        ownerEmail: `${trialSlug}@example.test`,
        ownerName: 'Smoke Owner',
        industryPresetId: 'education',
        password: 'StrongPass123!',
        branchName: 'Smoke Branch',
        branchTimezone: 'Europe/Moscow',
      }),
    }),
  );
  assert.equal(asRecord(trial.tenant).status, 'trial');
  assert.equal(trial.booking_mode, 'preview');
  const trialConfig = asRecord(
    await expectStatus(`/mobile/config/${trialSlug}`, 200),
  );
  assert.equal(trialConfig.client_registration_enabled, false);
  assert.equal(asRecord(trialConfig.industry_preset).id, 'education');
  const blockedRegistration = asRecord(
    await expectStatus('/auth/register', 403, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: trialSlug,
        name: 'Blocked Client',
        email: `client-${trialSlug}@example.test`,
        password: 'ClientPass123!',
      }),
    }),
  );
  assert.equal(
    asRecord(blockedRegistration.error).code,
    'trial_client_registration_disabled',
  );

  const soloSlug = `solo-${Date.now()}`;
  const soloSignup = asRecord(
    await expectStatus('/onboarding/trial', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Solo Specialist',
        slug: soloSlug,
        ownerEmail: `${soloSlug}@example.test`,
        ownerName: 'Smoke Specialist',
        ownerPhone: `+7998${String(Date.now() % 10_000_000).padStart(7, '0')}`,
        industryPresetId: 'solo_specialist',
        calendarSource: 'internal',
        password: 'StrongPass123!',
        branchName: 'Private Studio',
        branchTimezone: 'Europe/Moscow',
      }),
    }),
  );
  const soloToken = stringField(soloSignup, 'access_token');
  const soloTenant = asRecord(soloSignup.tenant);
  const soloTenantId = stringField(soloTenant, 'id');
  assert.equal(soloSignup.calendar_source, 'internal');
  assert.equal(soloTenant.calendar_source, 'internal');

  const initialSoloSetup = asRecord(
    await expectStatus('/internal-calendar/setup', 200, {
      headers: authHeaders(soloToken),
    }),
  );
  const soloProviders = asArray(initialSoloSetup.providers);
  assert.equal(soloProviders.length, 1);
  assert.equal(initialSoloSetup.ready, false);
  const soloProviderId = stringField(asRecord(soloProviders[0]), 'id');

  const soloService = asRecord(
    await expectStatus('/internal-calendar/services', 201, {
      method: 'POST',
      headers: {
        ...authHeaders(soloToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Individual Consultation',
        price: 3000,
        durationMinutes: 60,
        bufferAfterMinutes: 15,
      }),
    }),
  );
  const soloServiceId = stringField(soloService, 'id');
  await expectStatus(
    `/internal-calendar/providers/${soloProviderId}/schedule`,
    200,
    {
      method: 'PUT',
      headers: {
        ...authHeaders(soloToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        rules: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          startTime: '09:00',
          endTime: '18:00',
        })),
      }),
    },
  );
  const readySoloSetup = asRecord(
    await expectStatus('/internal-calendar/setup', 200, {
      headers: authHeaders(soloToken),
    }),
  );
  assert.equal(readySoloSetup.ready, true);

  await expectStatus(`/admin/tenants/${soloTenantId}`, 200, {
    method: 'PATCH',
    headers: {
      ...authHeaders(ownerToken),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      status: 'active',
      bookingMode: 'live',
      allowSelfRegistration: true,
    }),
  });
  const soloConfig = asRecord(
    await expectStatus(`/mobile/config/${soloSlug}`, 200),
  );
  assert.equal(soloConfig.calendar_source, 'internal');
  assert.equal(soloConfig.booking_live_enabled, true);
  assert.equal(soloConfig.client_registration_enabled, true);

  const soloClientPhone = `+7997${String(Date.now() % 10_000_000).padStart(7, '0')}`;
  await expectStatus('/auth/phone/start', 201, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug: soloSlug, phone: soloClientPhone }),
  });
  const soloClientLogin = asRecord(
    await expectStatus('/auth/phone/verify', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: soloSlug,
        phone: soloClientPhone,
        code: fixedPhoneCode,
      }),
    }),
  );
  const soloClientToken = stringField(soloClientLogin, 'access_token');
  await expectStatus('/me', 200, {
    method: 'PATCH',
    headers: {
      ...authHeaders(soloClientToken),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: 'Solo Smoke Client' }),
  });

  const soloServices = asArray(
    await expectStatus('/services', 200, {
      headers: authHeaders(soloClientToken),
    }),
  );
  const soloStaff = asArray(
    await expectStatus('/staff', 200, {
      headers: authHeaders(soloClientToken),
    }),
  );
  assert.equal(stringField(asRecord(soloServices[0]), 'id'), soloServiceId);
  assert.equal(stringField(asRecord(soloStaff[0]), 'id'), soloProviderId);

  const soloBookingDay = new Date(Date.now() + 8 * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const soloSlots = asArray(
    await expectStatus(
      `/available-slots?date=${soloBookingDay}T00%3A00%3A00.000Z&staffId=${soloProviderId}&serviceIds=${soloServiceId}`,
      200,
      { headers: authHeaders(soloClientToken) },
    ),
  );
  assert(soloSlots.length > 1);
  const soloFirstStart = stringField(asRecord(soloSlots[0]), 'start');
  const soloAppointmentPayload = {
    staffId: soloProviderId,
    serviceIds: [soloServiceId],
    start: soloFirstStart,
  };
  const soloAppointment = asRecord(
    await expectStatus('/appointments', 201, {
      method: 'POST',
      headers: {
        ...authHeaders(soloClientToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify(soloAppointmentPayload),
    }),
  );
  assert.equal(soloAppointment.source, 'internal');
  assert.equal(soloAppointment.crm_external_id, null);
  const soloAppointmentId = stringField(soloAppointment, 'id');
  await expectStatus('/appointments', 400, {
    method: 'POST',
    headers: {
      ...authHeaders(soloClientToken),
      'content-type': 'application/json',
    },
    body: JSON.stringify(soloAppointmentPayload),
  });

  const soloRemainingSlots = asArray(
    await expectStatus(
      `/available-slots?date=${soloBookingDay}T00%3A00%3A00.000Z&staffId=${soloProviderId}&serviceIds=${soloServiceId}`,
      200,
      { headers: authHeaders(soloClientToken) },
    ),
  );
  const soloNextStart = stringField(asRecord(soloRemainingSlots[0]), 'start');
  const soloNextEnd = stringField(asRecord(soloRemainingSlots[0]), 'end');
  const rescheduledSolo = asRecord(
    await expectStatus(`/appointments/${soloAppointmentId}/reschedule`, 201, {
      method: 'POST',
      headers: {
        ...authHeaders(soloClientToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ start: soloNextStart }),
    }),
  );
  assert.equal(asRecord(rescheduledSolo.appointment).source, 'internal');
  const aiCancelRequest = asRecord(
    await expectStatus('/ai/tools/appointments.own.cancel/execute', 201, {
      method: 'POST',
      headers: {
        ...authHeaders(soloClientToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        arguments: { appointment_id: soloAppointmentId },
        surface: 'native',
        idempotencyKey: randomUUID(),
      }),
    }),
  );
  assert.equal(aiCancelRequest.status, 'approval_required');
  const aiCancelApproval = asRecord(aiCancelRequest.approval);
  const aiCancelApprovalId = stringField(aiCancelApproval, 'id');
  const aiCancelPayloadHash = stringField(aiCancelApproval, 'payload_hash');
  const appointmentsBeforeApproval = asArray(
    await expectStatus('/appointments/my', 200, {
      headers: authHeaders(soloClientToken),
    }),
  ).map(asRecord);
  assert.equal(
    appointmentsBeforeApproval.find(
      (appointment) => appointment.id === soloAppointmentId,
    )?.status,
    'confirmed',
  );
  const aiCancelResult = asRecord(
    await expectStatus(`/ai/approvals/${aiCancelApprovalId}/approve`, 201, {
      method: 'POST',
      headers: {
        ...authHeaders(soloClientToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ payloadHash: aiCancelPayloadHash }),
    }),
  );
  assert.equal(aiCancelResult.status, 'completed');
  assert.equal(asRecord(aiCancelResult.result).status, 'canceled');
  const replayedAiCancel = asRecord(
    await expectStatus(`/ai/approvals/${aiCancelApprovalId}/approve`, 201, {
      method: 'POST',
      headers: {
        ...authHeaders(soloClientToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ payloadHash: aiCancelPayloadHash }),
    }),
  );
  assert.equal(replayedAiCancel.replayed, true);
  await expectStatus(`/appointments/${soloAppointmentId}/cancel`, 409, {
    method: 'POST',
    headers: authHeaders(soloClientToken),
  });
  await expectStatus(
    `/internal-calendar/providers/${soloProviderId}/time-off`,
    201,
    {
      method: 'POST',
      headers: {
        ...authHeaders(soloToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        startAt: soloNextStart,
        endAt: soloNextEnd,
        note: 'Smoke time off',
      }),
    },
  );
  const slotsAfterTimeOff = asArray(
    await expectStatus(
      `/available-slots?date=${soloBookingDay}T00%3A00%3A00.000Z&staffId=${soloProviderId}&serviceIds=${soloServiceId}`,
      200,
      { headers: authHeaders(soloClientToken) },
    ),
  );
  assert(
    !slotsAfterTimeOff.some(
      (slot) => stringField(asRecord(slot), 'start') === soloNextStart,
    ),
  );
  await expectStatus('/internal-calendar/setup', 409, {
    headers: authHeaders(demoToken),
  });

  await expectStatus('/auth/refresh', 201, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: demoRefreshToken }),
  });
  await expectStatus('/auth/refresh', 401, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: demoRefreshToken }),
  });

  console.log(
    'HTTP smoke passed: verified trial funnel, AI onboarding/tools/approval, tenant fence, auth rotation, CRM preview and internal calendar booking',
  );
}

async function main() {
  const child = startServer();
  const serverOutput: string[] = [];

  child?.stdout?.on('data', (chunk: Buffer) => {
    serverOutput.push(chunk.toString());
  });
  child?.stderr?.on('data', (chunk: Buffer) => {
    serverOutput.push(chunk.toString());
  });

  try {
    await waitForHealth(child);
    await runSmoke();
  } catch (error) {
    const tail = serverOutput.join('').split('\n').slice(-40).join('\n');
    if (tail.trim()) {
      console.error(tail);
    }
    throw error;
  } finally {
    await stopServer(child);
  }
}

void main();
