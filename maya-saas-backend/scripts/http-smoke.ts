import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
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
  process.env.SEED_DEMO_TENANT_ADMIN_EMAIL ?? 'admin@demo-salon.local';
const demoPassword =
  process.env.SEED_DEMO_TENANT_ADMIN_PASSWORD ?? 'ChangeMe123!';
const fixedPhoneCode = '123456';

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
    if (child?.exitCode !== null) {
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
  const demoConfig = asRecord(
    await expectStatus('/mobile/config/demo-salon', 200),
  );
  const mayaConfig = asRecord(
    await expectStatus('/mobile/config/malesthetic', 200),
  );
  assert.equal(demoConfig.slug, 'demo-salon');
  assert.equal(mayaConfig.slug, 'malesthetic');
  assert.notEqual(demoConfig.slug, mayaConfig.slug);

  const demoLogin = asRecord(
    await expectStatus('/auth/login', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: 'demo-salon',
        email: demoEmail,
        password: demoPassword,
      }),
    }),
  );
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
  const demoToken = stringField(demoLogin, 'access_token');
  const demoRefreshToken = stringField(demoLogin, 'refresh_token');
  const ownerToken = stringField(ownerLogin, 'access_token');
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
      body: JSON.stringify({ tenantSlug: 'demo-salon', phone }),
    }),
  );
  assert.equal(phoneStart.delivery, 'debug');
  const phoneLogin = asRecord(
    await expectStatus('/auth/phone/verify', 201, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: 'demo-salon',
        phone,
        code: fixedPhoneCode,
      }),
    }),
  );
  const clientToken = stringField(phoneLogin, 'access_token');
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
    'HTTP smoke passed: tenant fence, auth rotation, preview booking and trial safety',
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
