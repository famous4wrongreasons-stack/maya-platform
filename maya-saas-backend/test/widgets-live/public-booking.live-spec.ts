/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- HTTP JSON is asserted at the boundary; CRM is an explicitly synthetic transport. */
import {
  CanonicalActionPolicyResolver,
  ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
} from '../../src/action-engine/action-engine.policy-resolver';
import { ActionEngineRuntimeService } from '../../src/action-engine';
/** Actual AppModule HTTP + isolated PostgreSQL + AE; synthetic CRM transport only. */
import request from 'supertest';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { EncryptionService } from '../../src/encryption/encryption.service';
import { CalendarSource } from '../../src/common/domain.enums';
import { CrmOutcomeUnknownError } from '../../src/crm/crm-request.errors';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

describe('Guest website booking [HTTP] [PostgreSQL] [synthetic CRM]', () => {
  let db: FixtureContext,
    http: HttpHarness,
    fx: Fixtures,
    tenantId: string,
    branchId: string;
  let cookie: string, csrf: string;
  let rejectedCookie: string;
  const origin = 'https://guest.widgets-live.test';
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const start = `${tomorrow}T12:00:00+03:00`,
    end = `${tomorrow}T12:30:00+03:00`;
  const runtimeErrors: string[] = [];
  let price = 1500;
  const create = jest.fn();
  const adapter = {
    getStaff: jest.fn(async () => [{ id: '101', name: 'Synthetic master' }]),
    getPublicBookingServices: jest.fn(async () => [
      {
        id: '201',
        name: 'Synthetic service',
        duration_minutes: 30,
        price,
        currency: 'RUB',
      },
    ]),
    getAvailableSlots: jest.fn(async () => [
      { start, end, staff_id: '101', branch_id: branchId },
    ]),
    createAppointment: create,
    findPublicBookingByRequestId: jest.fn().mockResolvedValue(null),
    getClientAppointments: jest.fn(async () => []),
  };
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    const runtime = http.app.get(ActionEngineRuntimeService);
    const execute = runtime.executeWithReceipt.bind(runtime);
    jest
      .spyOn(runtime, 'executeWithReceipt')
      .mockImplementation(async (...args) => {
        try {
          return await execute(...args);
        } catch (error) {
          runtimeErrors.push((error as Error).message);
          throw error;
        }
      });
    const tenant = await fx.tenant('public-booking', CalendarSource.EXTERNAL);
    tenantId = tenant.id;
    branchId = (
      await db.prisma.branch.create({
        data: { tenantId, name: 'Synthetic branch', timezone: 'Europe/Moscow' },
      })
    ).id;
    await db.prisma.tenant.update({
      where: { id: tenantId },
      data: { defaultTimezone: 'Europe/Moscow' },
    });
    await db.prisma.brandingSettings.create({
      data: { tenantId, themeJson: { booking: { mode: 'live' } } },
    });
    await db.prisma.crmIntegration.create({
      data: {
        tenantId,
        provider: 'yclients',
        status: 'active',
        encryptedApiToken: http.app
          .get(EncryptionService)
          .encrypt('synthetic-only-no-live-token'),
        settingsJson: { companyId: 123 },
      },
    });
    for (const feature of [
      'booking',
      'booking.public',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    http.app.get(ConfigService).set(
      'PUBLIC_BOOKING_SITES',
      JSON.stringify([
        {
          siteKey: 'proof-site',
          tenantId,
          branchId,
          origins: [origin],
          consentVersion: 'proof-v1',
          consentUrl: '/privacy',
        },
      ]),
    );
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockReturnValue(adapter as never);
    create.mockImplementation(async () => ({
      external_id: 'synthetic-record-1',
      start,
      end,
      staff_id: '101',
      service_ids: ['201'],
      status: 'confirmed',
    }));
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (tenantId) {
      await db.prisma.$executeRaw(
        Prisma.sql`DELETE FROM "PublicBookingAttempt" WHERE "tenantId"=${tenantId}`,
      );
      await db.prisma.$executeRaw(
        Prisma.sql`DELETE FROM "PublicBookingQuote" WHERE "tenantId"=${tenantId}`,
      );
      await db.prisma.$executeRaw(
        Prisma.sql`DELETE FROM "PublicBookingSession" WHERE "tenantId"=${tenantId}`,
      );
    }
    await fx?.teardown();
    await http?.close();
    await db?.close();
  });
  const post = (path: string, body: unknown, nonce?: string) => {
    const r = request(http.app.getHttpServer())
      .post(`/api/public-booking/${path}`)
      .set('Origin', origin)
      .set('Cookie', cookie || '')
      .set('X-CSRF-Token', csrf || '');
    if (nonce) r.set('Idempotency-Key', nonce);
    return r.send(body);
  };
  async function open() {
    const r = await post('sessions', { siteKey: 'proof-site' });
    expect({
      status: r.status,
      body: r.status === 201 ? null : r.body,
    }).toEqual({ status: 201, body: null });
    cookie = r.headers['set-cookie'][0].split(';')[0];
    csrf = r.body.csrfToken;
    expect(r.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(r.headers['set-cookie'][0]).toContain('Secure');
    return r.body;
  }
  async function quote() {
    const session = await open();
    const staffRef = session.staff[0].staffRef;
    const services = await request(http.app.getHttpServer())
      .get('/api/public-booking/services')
      .query({ staffRef })
      .set('Origin', origin)
      .set('Cookie', cookie);
    expect(services.status).toBe(200);
    const availability = await post('availability', {
      staffRef,
      serviceRefs: [services.body.services[0].serviceRef],
      localDate: tomorrow,
    });
    expect(availability.status).toBe(201);
    const q = await post('quotes', {
      slotRef: availability.body.slots[0].slotRef,
    });
    expect(q.status).toBe(201);
    return q.body;
  }
  const confirmation = (quoteRef: string) => ({
    quoteRef,
    contact: { name: 'Synthetic guest', phone: '+79990000000' },
    consent: { accepted: true, documentVersion: 'proof-v1' },
  });
  it('concurrent identical confirmation causes one AE/provider effect, status survives rebootstrap, no User/Client/link', async () => {
    const q = await quote();
    const key = randomUUID();
    const body = confirmation(q.quoteRef);
    const responses = await Promise.all([
      post('attempts', body, key),
      post('attempts', body, key),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(runtimeErrors).toEqual([]);
    expect(create).toHaveBeenCalledTimes(1);
    await open();
    const r = await request(http.app.getHttpServer())
      .get(`/api/public-booking/attempts/${key}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
    expect(r.body.state).toBe('SUCCEEDED');
    expect(r.body.booking.receiptLabel).toEqual(expect.any(String));
    expect(r.body.booking).not.toHaveProperty('external_id');
    expect(await db.prisma.user.count({ where: { tenantId } })).toBe(0);
    expect(await db.prisma.client.count({ where: { tenantId } })).toBe(0);
    expect(
      await db.prisma.clientChannelLink.count({ where: { tenantId } }),
    ).toBe(0);
    const conflict = await post(
      'attempts',
      { ...body, contact: { name: 'changed', phone: '+79990000000' } },
      key,
    );
    expect(conflict.status).toBe(409);
  });
  it('stale quote has durable pre-dispatch refusal and zero additional effects', async () => {
    const q = await quote();
    rejectedCookie = cookie;
    price = 1700;
    const r = await post(
      'attempts',
      {
        ...confirmation(q.quoteRef),
        contact: { name: 'Synthetic guest', phone: '+79990000001' },
      },
      randomUUID(),
    );
    expect(r.body).toMatchObject({
      state: 'FAILED',
      code: 'REJECTED_BEFORE_DISPATCH',
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('lost provider response stays UNKNOWN and cannot redispatch on replay or new nonce', async () => {
    const q = await quote();
    const key = randomUUID();
    const body = {
      ...confirmation(q.quoteRef),
      contact: { name: 'Synthetic guest', phone: '+79990000002' },
    };
    create.mockRejectedValueOnce(
      new CrmOutcomeUnknownError('synthetic lost reply'),
    );
    const r = await post('attempts', body, key);
    expect(r.body.state).toBe('UNKNOWN');
    await post('attempts', body, key);
    const freshQuote = await quote();
    const duplicate = await post(
      'attempts',
      { ...body, quoteRef: freshQuote.quoteRef },
      randomUUID(),
    );
    expect(duplicate.status).toBe(409);
    expect(create).toHaveBeenCalledTimes(2);
    expect(adapter.getClientAppointments).not.toHaveBeenCalled();
    // Restart the real AppModule; only durable DB evidence/session survives.
    const mapping = http.app
      .get(ConfigService)
      .get<string>('PUBLIC_BOOKING_SITES');
    await http.close();
    http = await bootHttp();
    http.app.get(ConfigService).set('PUBLIC_BOOKING_SITES', mapping);
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockReturnValue(adapter as never);
    const unresolved = await request(http.app.getHttpServer())
      .get(`/api/public-booking/attempts/${key}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
    expect(unresolved.body.state).toBe('UNKNOWN');
    adapter.findPublicBookingByRequestId.mockResolvedValueOnce({
      external_id: 'synthetic-recovered',
      status: 'confirmed',
      start,
      end,
      staff_id: '101',
      service_ids: ['201'],
      branch_id: branchId,
    });
    const recovered = await request(http.app.getHttpServer())
      .get(`/api/public-booking/attempts/${key}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
    expect(recovered.body.state).toBe('SUCCEEDED');
    expect(recovered.body.booking.receiptLabel).toEqual(expect.any(String));
    expect(create).toHaveBeenCalledTimes(2);
    const calls = adapter.findPublicBookingByRequestId.mock.calls;
    expect(calls[0][0].requestId).toMatch(/^maya-guest-[a-f0-9]{64}$/);
    expect(calls[1][0].requestId).toBe(calls[0][0].requestId);
    const action = await db.prisma.actionExecution.findFirstOrThrow({
      where: { tenantId, finalOutcomeCode: 'reconciled_succeeded' },
    });
    expect(action.executionAttemptCount).toBe(1);
    expect(action.reconciliationState).toBe('RESOLVED');
    expect(action.safeResultSummaryJson).toMatchObject({
      publicBookingReadback: {
        contract: 'maya.public-booking-readback/1',
        requestId: calls[0][0].requestId,
        companyId: '123',
        source: 'records-and-record',
      },
    });
    expect(action.actorUserId).toBeNull();
  });
  it('rejects foreign refs, origin, CSRF, unknown keys and missing attempt without inventing failure', async () => {
    const q = await quote();
    const oldCookie = cookie;
    cookie = '';
    await open();
    const r = await post('attempts', confirmation(q.quoteRef), randomUUID());
    expect(r.body.state).toBe('FAILED');
    expect(create).toHaveBeenCalledTimes(2);
    const badOrigin = await request(http.app.getHttpServer())
      .post('/api/public-booking/sessions')
      .set('Origin', 'https://evil.test')
      .send({ siteKey: 'proof-site' });
    expect(badOrigin.status).toBe(403);
    const badCsrf = await request(http.app.getHttpServer())
      .post('/api/public-booking/quotes')
      .set('Origin', origin)
      .set('Cookie', oldCookie)
      .send({ slotRef: 'x' });
    expect(badCsrf.status).toBe(403);
    const unknown = await post('sessions', { siteKey: 'proof-site', tenantId });
    expect(unknown.status).toBe(400);
    const missing = await request(http.app.getHttpServer())
      .get(`/api/public-booking/attempts/${randomUUID()}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
    expect(missing.status).toBe(404);
    expect(missing.body.state).toBeUndefined();
  });
  it('explicit reset after durable pre-dispatch refusal permits corrected new quote', async () => {
    cookie = rejectedCookie;
    const q = await quote();
    const r = await post(
      'attempts',
      {
        ...confirmation(q.quoteRef),
        contact: { name: 'Synthetic guest', phone: '+79990000001' },
      },
      randomUUID(),
    );
    expect(r.body.state).toBe('SUCCEEDED');
    expect(create).toHaveBeenCalledTimes(3);
  });
  it('generic error after provider entry remains UNKNOWN, not FAILED', async () => {
    cookie = '';
    const q = await quote();
    create.mockRejectedValueOnce(
      new Error('synthetic malformed provider response'),
    );
    const r = await post(
      'attempts',
      {
        ...confirmation(q.quoteRef),
        contact: { name: 'Synthetic guest', phone: '+79990000003' },
      },
      randomUUID(),
    );
    expect(r.body.state).toBe('UNKNOWN');
    expect(create).toHaveBeenCalledTimes(4);
    adapter.findPublicBookingByRequestId.mockResolvedValue({
      external_id: 'synthetic-recovered-concurrent',
      status: 'confirmed',
      start,
      end,
      staff_id: '101',
      service_ids: ['201'],
      branch_id: branchId,
    });
    const poll = () =>
      request(http.app.getHttpServer())
        .get(`/api/public-booking/attempts/${r.body.attemptRef}`)
        .set('Origin', origin)
        .set('Cookie', cookie);
    const polls = await Promise.all([poll(), poll()]);
    expect(polls.some((reply) => reply.body.state === 'SUCCEEDED')).toBe(true);
    expect((await poll()).body.state).toBe('SUCCEEDED');
    expect(create).toHaveBeenCalledTimes(4);
    const settled = await db.prisma.actionExecution.findMany({
      where: { tenantId, finalOutcomeCode: 'reconciled_succeeded' },
    });
    expect(settled).toHaveLength(2);
    expect(
      settled.every((execution) => execution.executionAttemptCount === 1),
    ).toBe(true);
    const attempts = await db.prisma.$queryRaw<Array<{ value: unknown }>>(
      Prisma.sql`SELECT to_jsonb(a) AS value FROM "PublicBookingAttempt" a WHERE "tenantId"=${tenantId}`,
    );
    expect(JSON.stringify(attempts)).not.toContain('799900000');
    expect(JSON.stringify(attempts)).not.toContain('Synthetic guest');
    await expect(
      db.prisma.$executeRaw(
        Prisma.sql`UPDATE "PublicBookingAttempt" SET "requestHash"='tampered' WHERE "tenantId"=${tenantId}`,
      ),
    ).rejects.toThrow('immutable public booking attempt');
  });
  it('canonical policy rejects unbound guest source and every non-create capability', async () => {
    const policy = http.app.get(CanonicalActionPolicyResolver);
    const request = {
      contract:
        ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT as typeof ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT,
      tenantId,
      capability: 'crm.appointment.create.v1',
      sourceType: 'public_booking' as const,
      sourceRef: randomUUID(),
      targetRef: 'create/synthetic-unbound',
      normalizedInputHash: 'a'.repeat(64),
    };
    await expect(policy.resolve(request)).rejects.toThrow(
      'Active bound public booking intent required',
    );
    await expect(
      policy.resolve({ ...request, capability: 'crm.appointment.cancel.v1' }),
    ).rejects.toThrow('Source type is not allowed');
    expect(create).toHaveBeenCalledTimes(4);
  });
});
