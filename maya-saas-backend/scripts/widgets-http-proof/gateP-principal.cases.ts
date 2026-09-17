// P-PRINCIPAL's BIN half — G2-EQ against the PRODUCTION BINARY (GATES-PLAN-V11 §0.5, D-16).
//
// §0.5's L needs BOTH entries: HTTP (`AppModule` under jest, every global guard present) and BIN
// (`dist/src/main`, the bytes a release ships). `test/widgets-live/principal.live-spec.ts` runs the HTTP
// half of G2-EQ; this file runs the same claim through the binary, so the equivalence is a property of
// what is deployed rather than of what a test module composed.
//
// THE CLAIM: row 2 (C11:4721) — "session resolved exactly as for a typed message". D-16 reads that as
// the TRANSPORT chain: the same six global `APP_GUARD`s, with no `@Public`, on `POST /api/ai/chat` and
// `POST /api/widgets/intent` alike. So each row is submitted to both routes and the two answers are
// compared; a differing row keeps G2-a `false`.
//
// WHAT IT IS NOT. `C9Authority.current(T)` is the K1/K3 principal of Gates 1, 3, 5 and 6, and it is not
// this clause (D-16). A principal the transport chain admits and `C9Authority.current` denies is refused
// at slot 3, never at slot 2, and that is PR-4's claim in the live spec — not this case's.
//
// THREE ROWS, not the live spec's nine. A BIN case gets no store client of its own, only the fixture
// builders, and the runner resets the loopback login preflight once per CASE rather than once per login
// (`test/widgets-live/support/login-rate-limit.ts`). The rows that need a second and third login to set
// up (revoked session, inactive user, inactive membership, inactive tenant, a staff-class role with no
// Staff row) therefore stay at the HTTP level, where the harness resets the bucket before each login and
// can mutate rows through the fixture context. The three rows here need one login between them.
//
// Proof class LIVE-TRANSPORT: it is one half of G2-a's evidence, and it flips nothing on its own. The
// flip happens at E1, with the HTTP half beside it and the mutation shard for the same commit.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../widgets-intent-http-proof';

/** What the six guards did with a request, read from the status alone. */
const stage = (status: number): 'refused' | 'admitted' =>
  status === 401 || status === 403 ? 'refused' : 'admitted';

const authHeaders = (token: string | null): Record<string, string> => ({
  'content-type': 'application/json',
  ...(token === null ? {} : { authorization: `Bearer ${token}` }),
});

/** A §3.8-conformant submission. Nothing in it is authority: that is the point of the shape (F88). */
const submission = (): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: randomUUID(),
  intent_token: `g2-eq-bin-${randomUUID()}`,
  inputs: null,
  client_nonce: `g2-eq-bin-${randomUUID().slice(0, 12)}`,
  profile_id: 'pwa',
});

const chatBody = (): Record<string, unknown> => ({
  surface: 'web',
  requestId: randomUUID().replaceAll('-', ''),
  messages: [{ role: 'user', content: 'g2-eq' }],
});

async function bothRoutes(
  ctx: HttpProofContext,
  token: string | null,
): Promise<{ chat: number; intent: number }> {
  const chat = await ctx.request('/ai/chat', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(chatBody()),
  });
  const intent = await ctx.request('/widgets/intent', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(submission()),
  });
  return { chat: chat.status, intent: intent.status };
}

export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'PR-G2EQ-BIN',
    gate: '2',
    proofClass: 'LIVE-TRANSPORT',
    async run(ctx: HttpProofContext): Promise<void> {
      const tenant = await ctx.fixtures.tenant('PR-G2EQ-BIN');
      const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
      // The ONLY way `widgets.runtime` reaches a tenant here, and only on the guarded proof database
      // (§2.6 constraint 8). Without it `FeatureGuard` would refuse the widget route for a reason that
      // has nothing to do with the session, and the comparison would be meaningless.
      await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');

      const login = await ctx.request('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: tenant.slug,
          email: user.email,
          password: user.password,
        }),
      });
      const token = (login.body as { access_token?: unknown } | null)
        ?.access_token;
      if (typeof token !== 'string')
        throw new Error(
          `PR-G2EQ-BIN: the binary refused the login (HTTP ${login.status})`,
        );

      const rows: [string, string | null][] = [
        ['active member', token],
        ['no token', null],
        ['malformed token', 'not-a-jwt'],
      ];
      const observed: Record<string, { chat: number; intent: number }> = {};
      for (const [label, credential] of rows) {
        const answer = await bothRoutes(ctx, credential);
        observed[label] = answer;
        if (stage(answer.chat) !== stage(answer.intent))
          throw new Error(
            `PR-G2EQ-BIN: row "${label}" is ${stage(answer.chat)} on /ai/chat and ${stage(
              answer.intent,
            )} on /widgets/intent (${answer.chat} vs ${answer.intent})`,
          );
        // Where the transport chain REFUSED, the status must be the same too: a widget route that
        // refuses a session the typed route admits, or answers a different refusal, is not "resolved
        // exactly as for a typed message".
        if (stage(answer.chat) === 'refused' && answer.chat !== answer.intent)
          throw new Error(
            `PR-G2EQ-BIN: row "${label}" refuses ${answer.chat} on /ai/chat and ${answer.intent} on /widgets/intent`,
          );
      }

      ctx.evidence.record({
        testId: 'PR-G2EQ-BIN',
        triggerTraceId: null,
        recordHash: null,
        stoppedAtGate: null,
        gatesRun: null,
        labels: ['[G2-EQ]', '[transport-stage]'],
        // No claim: the BIN half alone flips nothing, and G2-a flips at E1 with its HTTP half beside it.
        clauses: ['G2-a'],
        claim: null,
      });
    },
  },
];
