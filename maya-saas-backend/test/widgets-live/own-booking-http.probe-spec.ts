// Narrow ordinary REST proof: real AppModule/auth/PG and INTERNAL calendar.
// Synthetic verified Client fixture only; no AI/widget runtime grant or provider.
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { localCalendarDate } from '../../src/owner-reports/owner-reports.time';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import { bootHttp, fixturesForHttp, type HttpHarness } from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

const out = process.env.JEST_OWN_BOOKING_OUTPUT!;
describe('Own booking phone REST flows', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  let fetchCalls = 0;
  const nativeFetch = globalThis.fetch;
  const observations: Record<string, unknown>[] = [];
  const save = () => writeFileSync(path.join(out, 'observations.json'), JSON.stringify({
    observations, unexpectedFetchCalls: fetchCalls,
    ordinaryAppModule: true, calendar: 'internal',
    aiOrWidgetRuntimeGrants: false, productionEffects: 0,
  }, null, 2) + '\n');

  beforeAll(async () => {
    expect(path.isAbsolute(out)).toBe(true);
    globalThis.fetch = () => {
      fetchCalls++;
      return Promise.reject(new Error('No provider/model/OTP in own-booking HTTP proof'));
    };
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterAll(async () => {
    save();
    globalThis.fetch = nativeFetch;
    await http?.close();
    await db?.close();
    // Outer runner stops this fresh owned cluster; no shared fixture teardown.
  });

  it('owner creates once, moves same record and cancels only own appointment through actual HTTP routes', async () => {
    const tenant = await fx.tenant('own phone REST', CalendarSource.INTERNAL);
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    const source = await fx.bookingSource(tenant, owner, true);
    for (const feature of ['booking', 'booking.customer_app', 'crm.integration'] as const)
      await fx.grantFeature(tenant, feature);
    const token = await http.login(tenant.slug, owner.email, owner.password);
    const ownerBefore = await db.prisma.user.findUniqueOrThrow({ where: { id: owner.id }, select: { role: true } });
    const membershipBefore = await db.prisma.membership.findFirstOrThrow({
      where: { tenantId: tenant.id, userId: owner.id }, select: { id: true, role: true, status: true },
    });
    const date = localCalendarDate('Europe/Moscow', new Date(Date.now() + 2 * 86400000));
    const dto = { staffId: source.staffId, serviceIds: [source.serviceId], start: date + 'T12:00:00+03:00' };
    const post = (route: string, body: object, key: string, personal = true) => {
      const req = request(http.app.getHttpServer()).post('/api/personal-client/' + route)
        .set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key);
      if (personal) req.set('X-Maya-Authority-Context', 'personal_client');
      return req.send(body);
    };
    const getOwn = (personal = true) => {
      const req = request(http.app.getHttpServer()).get('/api/personal-client/appointments/my')
        .set('Authorization', 'Bearer ' + token);
      if (personal) req.set('X-Maya-Authority-Context', 'personal_client');
      return req;
    };
    expect((await getOwn(false)).status).toBe(403);
    expect((await post('appointments', dto, 'no-context', false)).status).toBe(403);

    const preview = await post('appointments/preview', dto, 'preview');
    expect(preview.status).toBe(201);
    expect(preview.body.availability).toBe('available_at_read');
    expect(preview.body.factsHash).toMatch(/^[a-f0-9]{64}$/);
    const confirmed = { ...dto, previewFactsHash: preview.body.factsHash };
    const created = await post('appointments', confirmed, 'own-create-once');
    if (created.status !== 201) throw new Error('create HTTP ' + created.status + ': ' + JSON.stringify(created.body));
    expect(typeof created.body.id).toBe('string');
    const ownId = created.body.id as string;
    const ownOriginal = await db.prisma.appointment.findUniqueOrThrow({ where: { id: ownId } });
    const replay = await post('appointments', confirmed, 'own-create-once');
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(ownId);
    const initial = await fx.bookingProofState(tenant);
    expect(initial.appointments).toHaveLength(1);
    expect(initial.executions).toHaveLength(1);
    expect(initial.executions[0].state).toBe('SUCCEEDED');
    expect(initial.executions[0].evidenceRefsJson).toEqual(expect.arrayContaining([
      'personal-context:v1:personal_client', 'personal-actor-role:v1:tenant_owner',
    ]));
    observations.push({ case: 'create-and-repeat-tap', status: 201, appointments: 1, executions: 1, sameId: true });
    save();

    const other = await fx.user(tenant, UserRole.CLIENT);
    const otherClient = await fx.client(tenant, other);
    const foreignStart = new Date(date + 'T14:00:00+03:00');
    const foreignEnd = new Date(foreignStart.getTime() + 1800000);
    const foreign = await db.prisma.appointment.create({ data: {
      ...ownOriginal, id: randomUUID(), clientId: other.id, mayaClientId: otherClient.clientId,
      startAt: foreignStart, endAt: foreignEnd, blockedStartAt: foreignStart, blockedEndAt: foreignEnd,
    } });
    const listed = await getOwn();
    expect(listed.status).toBe(200);
    expect(listed.body.map((row: { id: string }) => row.id)).toEqual([ownId]);
    const move = { appointmentId: ownId, start: date + 'T13:00:00+03:00' };
    expect((await post('appointments/reschedule', move, 'no-move-context', false)).status).toBe(403);
    expect((await post('appointments/cancel', { appointmentId: ownId }, 'no-cancel-context', false)).status).toBe(403);
    const foreignMove = await post('appointments/reschedule', { ...move, appointmentId: foreign.id }, 'foreign-move');
    const foreignCancel = await post('appointments/cancel', { appointmentId: foreign.id }, 'foreign-cancel');
    expect(foreignMove.status).toBe(404);
    expect(foreignCancel.status).toBe(404);
    expect(await db.prisma.appointment.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign);
    expect((await fx.bookingProofState(tenant)).executions).toHaveLength(1);
    observations.push({ case: 'own-list-and-foreign-refusal', listedOwnOnly: true, foreignMove: 404, foreignCancel: 404, foreignUnchanged: true });
    save();

    const mark = http.recorder.mark();
    const moved = await post('appointments/reschedule', move, 'own-move-once');
    if (moved.status !== 201) throw new Error('move HTTP ' + moved.status + ': ' + JSON.stringify(moved.body));
    expect(moved.body.appointment.id).toBe(ownId);
    const ownMoved = await db.prisma.appointment.findUniqueOrThrow({ where: { id: ownId } });
    expect(ownMoved.startAt).toEqual(new Date(move.start));
    expect(ownMoved.createdAt).toEqual(ownOriginal.createdAt);
    expect(ownMoved.mayaClientId).toBe(ownOriginal.mayaClientId);
    const rowMutations = http.recorder.since(mark).filter(op => op.model === 'Appointment' && op.write);
    expect(rowMutations.some(op => ['create', 'createMany', 'delete', 'deleteMany', 'upsert'].includes(op.operation))).toBe(false);
    expect(await db.prisma.appointment.count({ where: { tenantId: tenant.id } })).toBe(2);
    expect(await db.prisma.appointment.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign);
    observations.push({ case: 'move', status: 201, sameId: true, sameCreatedAt: true, deleteCreate: false, foreignUnchanged: true });
    save();

    const cancelled = await post('appointments/cancel', { appointmentId: ownId }, 'own-cancel-once');
    if (cancelled.status !== 201) throw new Error('cancel HTTP ' + cancelled.status + ': ' + JSON.stringify(cancelled.body));
    expect(cancelled.body.appointment.id).toBe(ownId);
    const ownCancelled = await db.prisma.appointment.findUniqueOrThrow({ where: { id: ownId } });
    expect(['canceled', 'cancelled']).toContain(ownCancelled.status);
    expect(ownCancelled.startAt).toEqual(ownMoved.startAt);
    expect(ownCancelled.createdAt).toEqual(ownOriginal.createdAt);
    expect(await db.prisma.appointment.count({ where: { tenantId: tenant.id } })).toBe(2);
    expect(await db.prisma.appointment.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign);
    expect(await db.prisma.user.findUniqueOrThrow({ where: { id: owner.id }, select: { role: true } })).toEqual(ownerBefore);
    expect(await db.prisma.membership.findUniqueOrThrow({
      where: { id: membershipBefore.id }, select: { id: true, role: true, status: true },
    })).toEqual(membershipBefore);
    expect(ownerBefore.role).toBe('tenant_owner');
    expect(await db.prisma.tenantEntitlement.count({ where: { featureKey: 'widgets.runtime' } })).toBe(0);
    expect(await db.prisma.widgetIntentRecord.count()).toBe(0);
    expect(await db.prisma.widgetEmission.count()).toBe(0);
    expect(fetchCalls).toBe(0);
    const final = await fx.bookingProofState(tenant);
    expect(final.executions).toHaveLength(3);
    expect(final.executions.every(row => row.state === 'SUCCEEDED')).toBe(true);
    observations.push({ case: 'cancel', status: 201, ownCancelled: true, foreignUnchanged: true, ownerRoleUnchanged: true, actionExecutions: 3, widgetRuntimeGrants: 0, fetchCalls });
    save();
  }, 120000);
});
