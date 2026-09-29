// U13c on an actual catalog→selectors→draft→COMMIT lineage, never a fabricated token.
import type { HttpProofContext } from './http-proof-contract';
import { releaseBookingProof, requireProof } from './release-booking-proof';
export async function releaseRevocationProof(ctx: HttpProofContext) {
  requireProof(ctx.gate14DisagreementCount, 'real metric observer required');
  const metric = ctx.gate14DisagreementCount;
  return releaseBookingProof(ctx, async ({ tenant, body, post }) => {
    const before = metric();
    const response = await ctx.fixtures.withWidgetRevocationRace(tenant, () =>
      post('/widgets/intent', body),
    );
    const value = response.body as Record<string, unknown>;
    requireProof(
      response.status === 200 &&
        value.outcome === 'terminate' &&
        value.receipt_outcome === 'REFUSED' &&
        value.stopped_at_gate === '13' &&
        value.gates_run === 14,
      'canonical Gate14 refusal ' + JSON.stringify(value),
    );
    const deadline = Date.now() + 1000;
    while (metric() === before && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 10));
    requireProof(
      metric() === before + 1,
      'exactly one real entitlement disagreement increment',
    );
    const state = await ctx.fixtures.bookingProofState(tenant);
    requireProof(
      state.executions.length === 0 && state.appointments.length === 0,
      'revoked COMMIT has no canonical booking effect',
    );
    const record = state.records.find(
      (r) => r.widgetId === body.widget_id && r.effect === 'COMMIT',
    );
    const mint = ctx
      .mintProvenance()
      .find((m) => m.intent_token_hash === record?.intentTokenHash);
    requireProof(
      mint?.predecessor_widget_id,
      'production COMMIT mint and ancestry',
    );
    return [
      {
        testId: 'AR-G6-REVOCATION',
        recordHash: mint.intent_token_hash,
        triggerTraceId: mint.request_id,
        stoppedAtGate: '13',
        gatesRun: 14,
        labels: ['[E-MINT]'],
        clauses: ['G6-13'],
        claim: 'L',
      },
    ];
  });
}
