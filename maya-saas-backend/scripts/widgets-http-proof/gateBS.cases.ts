import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../../test/widgets-live/support/http-proof-contract';
const object = (v: unknown): Record<string, unknown> => {
  assert(v !== null && typeof v === 'object' && !Array.isArray(v));
  return v as Record<string, unknown>;
};
const array = (v: unknown) => {
  assert(Array.isArray(v));
  return v.map(object);
};
export async function personalSource(
  ctx: HttpProofContext,
  authorizeWidgetRuntime?: (
    tenant: import('../../test/widgets-live/support/fixtures').TenantFixture,
  ) => Promise<void>,
) {
  const tenant = await ctx.fixtures.tenant(
    'BS canonical personal source',
    CalendarSource.INTERNAL,
  );
  const user = await ctx.fixtures.user(tenant, UserRole.CLIENT);
  await ctx.fixtures.bookingSource(tenant, user);
  for (const feature of [
    'ai.consultant',
    'booking',
    'booking.customer_app',
    'crm.integration',
    'widgets.runtime',
  ] as const)
    if (feature === 'widgets.runtime' && authorizeWidgetRuntime)
      await authorizeWidgetRuntime(tenant);
    else await ctx.fixtures.grantFeature(tenant, feature);
  const login = await ctx.request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantSlug: tenant.slug,
      email: user.email,
      password: user.password,
    }),
  });
  assert.equal(login.status, 201);
  const post = (route: string, body: unknown, trace = randomUUID()) =>
    ctx.request(route, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${String(object(login.body).access_token)}`,
        'x-request-id': trace,
      },
      body: JSON.stringify(body),
    });
  const read = async (name: string, trace = randomUUID()) => {
    const res = await post(
      `/ai/tools/${name}/execute`,
      { surface: 'web', arguments: {} },
      trace,
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return object(object(object(object(res.body).resolution).receipt).envelope);
  };
  const submit = async (
    envelope: Record<string, unknown>,
    intent: Record<string, unknown>,
    inputs: unknown = null,
  ) => {
    const res = await post('/widgets/intent', {
      contract: 'maya.widget.intent.submission/1',
      widget_id: envelope.widget_id,
      intent_token: intent.intent_token,
      inputs,
      client_nonce: randomUUID(),
      profile_id: 'pwa.v1',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const body = object(res.body);
    assert.equal(body.receipt_outcome, 'ACCEPTED', JSON.stringify(body));
    assert.equal(body.stopped_at_gate, '13');
    assert.equal(body.gates_run, 14);
    return body;
  };
  let envelope = await read('catalog.services.read');
  for (const [effect, field] of [
    ['REFINE', 'service_ref'],
    ['REFINE', 'staff_ref'],
    ['DRAFT', 'slot_ref'],
    ['COMMIT', null],
  ] as const) {
    if (effect === 'REFINE') {
      const rendered = await post('/widgets/resolve', {
        thread_page: { limit: 1 },
        rendered: {
          widget_id: envelope.widget_id,
          body_hash: object(envelope.integrity).body_hash,
          envelope_seal: object(envelope.integrity).envelope_seal,
        },
      });
      assert.equal(rendered.status, 200, 'L25 independent render observation');
    }
    const intent = array(envelope.intents).find((v) => v.effect === effect);
    assert(intent);
    const selected =
      field === null
        ? null
        : field === 'slot_ref'
          ? array(array(object(envelope.body).groups)[0].slots)[0].slot_ref
          : array(object(envelope.body).options)[0].option_id;
    const result = await submit(
      envelope,
      intent,
      field === null ? null : { [field]: selected },
    );
    if (field === null)
      assert.equal(object(result.owner_decision).state, 'SUCCEEDED');
    else envelope = object(result.next_envelope);
  }
  const before = await ctx.fixtures.bookingProofState(tenant);
  assert.equal(before.appointments.length, 1);
  for (const operation of ['reschedule', 'cancel'] as const) {
    const trace = randomUUID();
    const schedule = await read('appointments.own.list', trace);
    assert.equal(schedule.kind, 'SCHEDULE');
    assert.equal(
      object(schedule.provenance).source_capability,
      'appointments.own.list',
    );
    assert.equal(object(schedule.authority).pii_class, 'client_identified');
    const proposal = array(schedule.intents).find(
      (v) =>
        (v.capability === null ? null : object(v.capability).key) ===
        `appointments.own.${operation}`,
    );
    assert(proposal, JSON.stringify(schedule));
    const tokenHash = createHash('sha256')
      .update(proposal.intent_token as string)
      .digest('hex');
    assert(
      ctx
        .mintProvenance()
        .some(
          (v) =>
            v.intent_token_hash === tokenHash &&
            v.trigger === 'T-2b' &&
            v.request_id === trace,
        ),
    );
    const quoted = await submit(schedule, proposal);
    const confirmation = object(quoted.next_envelope);
    assert.equal(confirmation.kind, 'BOOKING_CONFIRMATION');
    assert.equal(object(confirmation.body).confirmation_subject, operation);
    const commit = array(confirmation.intents).find(
      (v) => v.effect === 'COMMIT',
    );
    assert(commit);
    assert.equal(
      object(commit.capability).key,
      `crm.appointment.${operation}.v1`,
    );
    const executed = await submit(confirmation, commit);
    assert.equal(object(executed.owner_decision).state, 'SUCCEEDED');
    const committedState = await ctx.fixtures.bookingProofState(tenant);
    const producer = committedState.records.find(
      (r) => r.intentTokenHash === tokenHash,
    );
    const commitHash = createHash('sha256')
      .update(commit.intent_token as string)
      .digest('hex');
    const committed = committedState.records.find(
      (r) => r.intentTokenHash === commitHash,
    );
    assert(producer && committed);
    assert.notEqual(producer.consumedAt, null);
    assert.notEqual(committed.consumedAt, null);
    assert.equal(committed.producedByIntentTokenHash, producer.intentTokenHash);
    assert.notEqual(committed.confirmationOfKind, 'draft');
    assert.equal(committed.confirmationOfRef, before.appointments[0].id);
    assert.equal(committed.capabilityKey, `crm.appointment.${operation}.v1`);
    const replay = await post('/widgets/intent', {
      contract: 'maya.widget.intent.submission/1',
      widget_id: confirmation.widget_id,
      intent_token: commit.intent_token,
      inputs: null,
      client_nonce: randomUUID(),
      profile_id: 'pwa.v1',
    });
    assert.equal(replay.status, 200);
    assert.notEqual(object(replay.body).receipt_outcome, 'ACCEPTED');
    assert.equal(
      (await ctx.fixtures.bookingProofState(tenant)).executions.length,
      committedState.executions.length,
    );
    if (operation === 'reschedule') {
      const changed = await ctx.fixtures.bookingProofState(tenant);
      assert.equal(changed.appointments[0].id, before.appointments[0].id);
      assert.notEqual(
        changed.appointments[0].startAt.getTime(),
        before.appointments[0].startAt.getTime(),
      );
    }
    ctx.evidence.record({
      testId: `BS-SOURCE-${operation.toUpperCase()}`,
      triggerTraceId: trace,
      recordHash: tokenHash,
      stoppedAtGate: '13',
      gatesRun: 14,
      labels: ['[E-MINT]'],
      clauses: ['G7-5', 'G7-BOOK1', 'G11-I9', 'G13-I3'],
      claim: 'L',
    });
  }
  const after = await ctx.fixtures.bookingProofState(tenant);
  assert.equal(after.appointments.length, 1);
  assert.equal(after.appointments[0].id, before.appointments[0].id);
  assert.equal(after.appointments[0].status, 'canceled');
  assert.equal(after.executions.length, 3);
}
export const cases: WidgetsHttpProofCase[] = [
  { id: 'BS-SOURCE', gate: '13', proofClass: 'L', run: personalSource },
];
