import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../../test/widgets-live/support/http-proof-contract';

const object = (value: unknown): Record<string, unknown> => {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
};

async function canonicalTurnProof(ctx: HttpProofContext) {
  const tenant = await ctx.fixtures.tenant(
    'TURN canonical proof',
    CalendarSource.INTERNAL,
  );
  const user = await ctx.fixtures.user(tenant, UserRole.TENANT_OWNER);
  for (const feature of ['ai.owner', 'booking', 'widgets.runtime'] as const)
    await ctx.fixtures.grantFeature(tenant, feature);
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
  const bearer = object(login.body).access_token;
  assert.equal(typeof bearer, 'string');
  const post = (route: string, body: unknown, trace = randomUUID()) =>
    ctx.request(route, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${String(bearer)}`,
        'content-type': 'application/json',
        'x-request-id': trace,
      },
      body: JSON.stringify(body),
    });
  // Before any widget exists this is ordinary typed chat. No model transport override.
  // Exact control.dismiss@1 label and stored utteranceTemplate; never derive the
  // expected USER bytes from the returned row or accept an arbitrary live label.
  const utterance = 'Закрыть';
  const ordinaryRequest = {
    surface: 'web',
    requestId: randomUUID(),
    messages: [{ role: 'user', content: utterance }],
  };
  const ordinary = await post('/ai/chat', ordinaryRequest);
  assert.equal(ordinary.status, 201);
  const ordinaryRef = object(object(ordinary.body).user_turn);
  const ordinaryRetry = await post('/ai/chat', ordinaryRequest);
  assert.equal(ordinaryRetry.status, 201);
  assert.deepEqual(object(ordinaryRetry.body).user_turn, ordinaryRef);

  const trace = randomUUID();
  const source = await post(
    '/ai/tools/operations.journal.read/execute',
    { surface: 'web', arguments: { date: '2026-09-24' } },
    trace,
  );
  assert.equal(source.status, 201);
  const envelope = object(
    object(object(object(source.body).resolution).receipt).envelope,
  );
  assert(Array.isArray(envelope.intents));
  const control = (envelope.intents as unknown[])
    .map(object)
    .find((row) => row.effect === 'CONTROL');
  assert(control);
  assert.equal(control.label, utterance);
  const tokenHash = createHash('sha256')
    .update(String(control.intent_token))
    .digest('hex');
  const mint = ctx
    .mintProvenance()
    .find((row) => row.intent_token_hash === tokenHash);
  assert(mint);
  assert.equal(mint.trigger, 'T-2b');
  assert.equal(mint.request_id, trace);

  const typedRequest = { ...ordinaryRequest, requestId: randomUUID() };
  const typed = await post('/ai/chat', typedRequest);
  assert.equal(typed.status, 201);
  const typedRef = object(object(typed.body).user_turn);
  const typedRetry = await post('/ai/chat', typedRequest);
  assert.equal(typedRetry.status, 201);
  assert.deepEqual(object(typedRetry.body).user_turn, typedRef);
  assert.notEqual(typedRef.turnId, ordinaryRef.turnId);

  const secondSource = await post('/ai/tools/operations.journal.read/execute', {
    surface: 'web',
    arguments: { date: '2026-09-25' },
  });
  assert.equal(secondSource.status, 201);
  const next = object(
    object(object(object(secondSource.body).resolution).receipt).envelope,
  );
  assert(Array.isArray(next.intents));
  const nextControl = (next.intents as unknown[])
    .map(object)
    .find((row) => row.effect === 'CONTROL');
  assert(nextControl);
  assert.equal(nextControl.label, utterance);
  const tap = {
    contract: 'maya.widget.intent.submission/1',
    widget_id: next.widget_id,
    intent_token: nextControl.intent_token,
    inputs: null,
    client_nonce: randomUUID(),
    profile_id: 'pwa.v1',
  };
  const tapped = await post('/widgets/intent', tap);
  assert.equal(tapped.status, 200);
  assert.equal(object(tapped.body).stopped_at_gate, '13');
  assert.equal(object(tapped.body).gates_run, 14);
  assert.equal((await post('/widgets/intent', tap)).status, 200);

  const state = await ctx.fixtures.userTurnProofState(tenant);
  assert.equal(state.turns.length, 3);
  assert.equal(state.bindings.length, 3);
  const ordinaryRow = state.turns.find((row) => row.id === ordinaryRef.turnId);
  const typedRow = state.turns.find((row) => row.id === typedRef.turnId);
  assert(ordinaryRow && typedRow);
  for (const row of state.turns) {
    assert.equal(row.role, 'user');
    assert.equal(row.channel, 'pwa');
    assert.equal(row.textContent, utterance);
    assert.equal(row.principalProofHash, ordinaryRow.principalProofHash);
    assert.equal(row.erasedAt, null);
    const bindings = state.bindings.filter(
      (binding) => binding.entityId === row.id,
    );
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].userId, user.id);
    const binding = object(bindings[0].metadataJson);
    assert.equal(binding.turnId, row.id);
    assert.equal(binding.conversationId, row.conversationId);
  }
  assert.equal(
    object(
      state.bindings.find((row) => row.entityId === ordinaryRef.turnId)!
        .metadataJson,
    ).intentTokenHash,
    null,
  );
  assert.equal(
    object(
      state.bindings.find((row) => row.entityId === typedRef.turnId)!
        .metadataJson,
    ).intentTokenHash,
    tokenHash,
  );
  assert.deepEqual(
    Buffer.from(typedRow.textContent!),
    Buffer.from(ordinaryRow.textContent!),
  );
  ctx.evidence.record({
    testId: 'TURN-CANONICAL',
    triggerTraceId: trace,
    recordHash: tokenHash,
    stoppedAtGate: '13',
    gatesRun: 14,
    labels: ['[E-MINT]'],
    clauses: ['9.6'],
    claim: 'L',
  });
}

export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'TURN-CANONICAL',
    gate: '9',
    proofClass: 'L',
    run: canonicalTurnProof,
  },
];
