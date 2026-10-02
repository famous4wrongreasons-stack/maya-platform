// Shared backend journey: actual HTTP requests; widgets/actions are production-minted.
// The one declared E-TAMPER probe changes only confirmationJson and restores it.
import { randomUUID } from 'node:crypto';
import { CalendarSource, UserRole } from '../../../src/common/domain.enums';
import type { HttpProofContext } from './http-proof-contract';
import type { TenantFixture } from './fixtures';
import type { EvidenceLineInput } from './evidence';
export const requireProof: (ok: unknown, message: string) => asserts ok = (
  ok,
  message,
) => {
  if (!ok) throw new Error(`WR proof: ${message}`);
};
const object = (v: unknown): Record<string, unknown> => {
  requireProof(
    v !== null && typeof v === 'object' && !Array.isArray(v),
    'expected object',
  );
  return v as Record<string, unknown>;
};
const array = (v: unknown): Record<string, unknown>[] => {
  requireProof(Array.isArray(v), 'expected array');
  return v.map(object);
};
export async function releaseBookingProof(
  ctx: HttpProofContext,
  atCommit?: (input: {
    tenant: TenantFixture;
    body: Record<string, unknown>;
    post: (
      route: string,
      body: unknown,
    ) => Promise<{ status: number; body: unknown }>;
  }) => Promise<Omit<EvidenceLineInput, 'entry' | 'source'>[]>,
  authorizeWidgetRuntime?: (tenant: TenantFixture) => Promise<void>,
): Promise<Omit<EvidenceLineInput, 'entry' | 'source'>[]> {
  const tenant = await ctx.fixtures.tenant(
    'Release booking proof',
    CalendarSource.INTERNAL,
  );
  const user = await ctx.fixtures.user(tenant, UserRole.CLIENT);
  await ctx.fixtures.bookingSource(tenant, user);
  for (const feature of [
    'widgets.runtime',
    'ai.consultant',
    'booking',
    'booking.customer_app',
    'crm.integration',
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
  const token = object(login.body).access_token;
  requireProof(typeof token === 'string', 'login token');
  const post = (route: string, body: unknown, trace?: string) =>
    ctx.request(route, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(trace ? { 'x-request-id': trace } : {}),
      },
      body: JSON.stringify(body),
    });
  const trace = `wr-${randomUUID()}`;
  const catalog = await post(
    '/ai/tools/catalog.services.read/execute',
    { arguments: {}, surface: 'web' },
    trace,
  );
  requireProof([200, 201].includes(catalog.status), 'catalog HTTP status');
  let next = object(object(object(catalog.body).resolution).receipt).envelope;
  const proofs: Omit<EvidenceLineInput, 'entry' | 'source'>[] = [];
  let commitBody: Record<string, unknown> | null = null;
  for (const [kind, effect, field] of [
    ['SERVICE_SELECTOR', 'REFINE', 'service_ref'],
    ['STAFF_SELECTOR', 'REFINE', 'staff_ref'],
    ['TIME_SLOT_SELECTOR', 'DRAFT', 'slot_ref'],
    ['BOOKING_CONFIRMATION', 'COMMIT', null],
  ] as const) {
    const env = object(next);
    requireProof(
      env.kind === kind,
      `expected ${kind}, got ${String(env.kind)}`,
    );
    // L25 client observation is a separate HTTP request; a selector tap is never its evidence.
    if (kind === 'SERVICE_SELECTOR' || kind === 'STAFF_SELECTOR') {
      const rendered = await post('/widgets/resolve', {
        thread_page: { limit: 1 },
        rendered: {
          widget_id: env.widget_id,
          body_hash: object(env.integrity).body_hash,
          envelope_seal: object(env.integrity).envelope_seal,
        },
      });
      requireProof(
        rendered.status === 200,
        'independent selector render observation',
      );
    }
    const intent = array(env.intents).find((i) => i.effect === effect);
    requireProof(
      intent && typeof intent.intent_token === 'string',
      `${effect} token`,
    );
    const envBody = object(env.body);
    const selected =
      field === null
        ? null
        : field === 'slot_ref'
          ? array(array(envBody.groups)[0].slots)[0].slot_ref
          : array(envBody.options)[0].option_id;
    const body = {
      contract: 'maya.widget.intent.submission/1',
      widget_id: env.widget_id,
      intent_token: intent.intent_token,
      inputs: field ? { [field]: selected } : null,
      client_nonce: `wr-${randomUUID()}`,
      profile_id: 'pwa.default',
    };
    const provenance = ctx
      .mintProvenance()
      .find((m) => m.widget_id === env.widget_id);
    requireProof(provenance, `${kind} captured server mint`);
    if (effect === 'COMMIT') {
      const before = await ctx.fixtures.bookingProofState(tenant);
      requireProof(
        before.appointments.length === 0 && before.executions.length === 0,
        'no booking effect before COMMIT',
      );
      const record = before.records.find(
        (r) => r.widgetId === env.widget_id && r.effect === 'COMMIT',
      );
      requireProof(
        record?.confirmationOfKind === 'draft' &&
          record.confirmationOfRef &&
          record.capabilitySpace === 'AE',
        'canonical COMMIT draft linkage',
      );
      requireProof(
        envBody.confirmation_subject === 'create',
        'canonical create subject',
      );
      if (atCommit) return atCommit({ tenant, body, post });
      // These fields cannot override the server-owned action source or cross
      // F76 into canonical action input. Refused before any durable execution.
      for (const extra of [
        { sourceType: 'agent_task' },
        { widget_kind: 'BOOKING_CONFIRMATION' },
        { confirmation_subject: 'cancel' },
      ]) {
        const forged = await post('/widgets/intent', { ...body, ...extra });
        requireProof(
          forged.status === 400,
          'F33/F76 caller metadata is refused',
        );
      }
      requireProof(
        (await ctx.fixtures.bookingProofState(tenant)).executions.length === 0,
        'F33/F76 forged metadata has no owner effect',
      );
      // The E2 recipe expressly permits this one AUDIT_RETAINED column.
      // A real production-minted COMMIT remains the input; no owner is replaced.
      const mint = ctx
        .mintProvenance()
        .find((m) => m.intent_token_hash === record.intentTokenHash);
      requireProof(mint, 'readback exact COMMIT mint');
      await ctx.fixtures.withReadbackDutyTamper(
        tenant,
        record.intentTokenHash,
        async () => {
          const refusal = await post('/widgets/intent', body);
          const value = object(refusal.body);
          requireProof(
            refusal.status === 200 &&
              value.outcome === 'refuse' &&
              value.code === 'readback_mismatch' &&
              value.stopped_at_gate === '8-R' &&
              value.gates_run === 9,
            `readback divergence refused: ${JSON.stringify(value)}`,
          );
          const after = await ctx.fixtures.bookingProofState(tenant);
          requireProof(
            after.executions.length === 0 &&
              after.appointments.length === 0 &&
              after.records.find(
                (r) => r.intentTokenHash === record.intentTokenHash,
              )?.consumedAt === null,
            'readback refusal has no actuation or token consumption',
          );
        },
      );
      proofs.push({
        testId: 'WF-READBACK-DIVERGENCE',
        recordHash: mint.intent_token_hash,
        triggerTraceId: mint.request_id,
        stoppedAtGate: '8-R',
        gatesRun: 9,
        labels: ['[E-TAMPER:confirmationJson]'],
        clauses: ['R-1a'],
        claim: 'L-T',
      });
      commitBody = body;
    }
    const answer = await post('/widgets/intent', body);
    const value = object(answer.body);
    requireProof(
      answer.status === 200 &&
        value.outcome === 'terminate' &&
        value.receipt_outcome === 'ACCEPTED',
      `${effect} accepted: ${JSON.stringify(value)}`,
    );
    requireProof(
      value.gates_run === 14 && value.stopped_at_gate === '13',
      `${effect} complete gateway trace`,
    );
    if (effect === 'DRAFT' || effect === 'COMMIT') {
      const record = (
        await ctx.fixtures.bookingProofState(tenant)
      ).records.find(
        (r) => r.widgetId === env.widget_id && r.effect === effect,
      );
      requireProof(
        record && record.consumedAt !== null,
        `${effect} consumed at owner boundary`,
      );
      const mint = ctx
        .mintProvenance()
        .find((m) => m.intent_token_hash === record?.intentTokenHash);
      requireProof(mint, `${effect} exact mint record`);
      requireProof(
        mint.predecessor_widget_id,
        `${effect} predecessor provenance`,
      );
      proofs.push({
        testId: `WR-${effect}-CREATE`,
        recordHash: mint.intent_token_hash,
        triggerTraceId: mint.request_id,
        stoppedAtGate: '13',
        gatesRun: 14,
        labels: ['[E-MINT]'],
        clauses:
          effect === 'DRAFT'
            ? ['G13-R6']
            : [
                'G6-8',
                'G6-9',
                'G6-10',
                'G6-11',
                'G6-12',
                'G7-4',
                'G7-6',
                'G13-R9',
                'G14-a',
                'G14-b',
                'G14-c',
              ],
        claim: 'L',
      });
    }
    next = value.next_envelope;
  }
  const state = await ctx.fixtures.bookingProofState(tenant);
  requireProof(
    state.appointments.length === 1 &&
      state.appointments[0].status === 'confirmed',
    'exactly one confirmed appointment',
  );
  requireProof(
    state.executions.length === 1,
    'exactly one Action Engine execution',
  );
  const ae = state.executions[0];
  requireProof(
    ae.sourceType === 'authenticated_request' &&
      ae.capability === 'crm.appointment.create.v1' &&
      ae.state === 'SUCCEEDED' &&
      ae.policyDecision === 'ALLOW',
    'canonical AE/policy owner',
  );
  requireProof(
    ae.policyDecidedBy &&
      ae.normalizedInputContract &&
      ae.normalizedInputHash &&
      ae.requestIdempotencyKeyHash,
    'server prepare and resolver fields persisted',
  );
  requireProof(Array.isArray(ae.evidenceRefsJson), 'prepare evidence refs');
  const replay = await post('/widgets/intent', commitBody);
  requireProof(
    object(replay.body).receipt_outcome !== 'ACCEPTED',
    'single-use replay cannot actuate',
  );
  requireProof(
    (await ctx.fixtures.bookingProofState(tenant)).executions.length === 1,
    'replay creates no second execution',
  );
  const commitProof = proofs.find((p) => p.testId === 'WR-COMMIT-CREATE');
  requireProof(commitProof, 'F33/F76 production-minted COMMIT provenance');
  proofs.push({
    ...commitProof,
    testId: 'WR-COMMIT-ACTION-BOUNDARY',
    clauses: ['G13-I7'],
  });
  proofs.push({ ...commitProof, testId: 'WF-PAIRING', clauses: ['G7-FR6b'] });
  // Programme §4.5 Money expressly permits mutation-only negative evidence.
  // This is its non-MONEY production positive, never a financial actuation claim.
  proofs.push({
    ...commitProof,
    testId: 'AR-FR6D-NONMONEY',
    clauses: ['G7-FR6d'],
  });
  proofs.push({
    ...commitProof,
    testId: 'WF-READBACK-POSITIVE',
    clauses: ['R-1a'],
  });
  return proofs;
}
