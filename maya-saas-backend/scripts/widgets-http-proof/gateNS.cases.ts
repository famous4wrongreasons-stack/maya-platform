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
export async function journalSource(
  ctx: HttpProofContext,
  authorizeWidgetRuntime?: (
    tenant: import('../../test/widgets-live/support/fixtures').TenantFixture,
  ) => Promise<void>,
) {
  const tenant = await ctx.fixtures.tenant(
    'NS canonical journal',
    CalendarSource.INTERNAL,
  );
  const user = await ctx.fixtures.user(tenant, UserRole.TENANT_OWNER);
  for (const feature of ['ai.owner', 'booking', 'widgets.runtime'] as const)
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
  const trace = randomUUID();
  const initial = await post(
    '/ai/tools/operations.journal.read/execute',
    { surface: 'web', arguments: { date: '2026-09-24' } },
    trace,
  );
  assert.equal(initial.status, 201);
  const source = object(
    object(object(object(initial.body).resolution).receipt).envelope,
  );
  const intents = (source.intents as unknown[]).map(object);
  const detail = intents.find(
    (v) =>
      v.effect === 'NAVIGATE' &&
      (v.target == null ? null : object(v.target).class) === 'detail',
  );
  assert(detail);
  assert.equal(object(detail.target).class, 'detail');
  assert.equal(object(detail.target).ref, 'fs.calendar');
  assert.equal(
    Object.keys(object(detail.target)).sort().join(','),
    'class,ref',
  );
  assert.equal(detail.input_schema, null);
  assert.equal(
    object(object(source.presentation).fullscreen_detail).route_key,
    'fs.calendar',
  );
  const submit = (
    envelope: Record<string, unknown>,
    intent: Record<string, unknown>,
  ) =>
    post('/widgets/intent', {
      contract: 'maya.widget.intent.submission/1',
      widget_id: envelope.widget_id,
      intent_token: intent.intent_token,
      inputs: null,
      client_nonce: randomUUID(),
      profile_id: 'pwa.v1',
    });
  const result = await submit(source, detail);
  assert.equal(result.status, 200);
  const response = object(result.body);
  assert.equal(response.stopped_at_gate, '13', JSON.stringify(response));
  assert.equal(response.gates_run, 14);
  const next = object(response.next_envelope);
  assert.equal(
    object(next.provenance).source_capability,
    'operations.journal.read',
  );
  assert.equal(
    String(object(object(next.body).range).from).slice(0, 10),
    '2026-09-24',
  );
  assert.notEqual(next.widget_id, source.widget_id);
  const back = (next.intents as unknown[])
    .map(object)
    .find((v) => (v.target == null ? null : object(v.target).class) === 'w');
  assert(back);
  assert.equal(object(back.target).class, 'w');
  assert.equal(object(back.target).ref, source.widget_id);
  assert.equal(Object.keys(object(back.target)).sort().join(','), 'class,ref');
  const returned = await submit(next, back);
  assert.equal(returned.status, 200);
  assert.equal(
    object(returned.body).stopped_at_gate,
    '13',
    JSON.stringify(returned.body),
  );
  assert.equal(
    object(object(returned.body).resolved_widget).widget_id,
    source.widget_id,
  );
  const hash = createHash('sha256')
    .update(detail.intent_token as string)
    .digest('hex');
  assert(
    ctx
      .mintProvenance()
      .some(
        (v) =>
          v.intent_token_hash === hash &&
          v.trigger === 'T-2b' &&
          v.request_id === trace,
      ),
  );
  ctx.evidence.record({
    testId: 'NS-SOURCE',
    triggerTraceId: trace,
    recordHash: hash,
    stoppedAtGate: '13',
    gatesRun: 14,
    labels: ['[E-MINT]'],
    clauses: ['G12-R1b', 'G12-I11', 'G13-R2'],
    claim: 'L',
  });
}
export const cases: WidgetsHttpProofCase[] = [
  { id: 'NS-SOURCE', gate: '12', proofClass: 'L', run: journalSource },
];
