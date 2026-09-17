// HAR-7 [BIN] — the BIN runner's own self-test (GATES-PLAN-V11 I-HAR). NOT a gate case and never evidence.
//
// It lives outside `scripts/widgets-http-proof/`, so a plain `npm run test:widgets:http` never discovers it; it runs
// only with `-- --cases-dir test/widgets-live/support/bin-selftest`. It shows that a BIN case can build its own
// principal through the runner's guarded fixture context, and that the binary sees a `widgets.runtime` grant made
// through `ctx.fixtures.grantFeature` for that case's tenant only:
//   1. tenant + administrator through `ctx.fixtures`; a token from the binary's own `POST /api/auth/login`;
//   2. `POST /api/widgets/intent` before the grant → 403 `feature_locked` (FeatureGuard is live, not overridden);
//   3. `ctx.fixtures.grantFeature(tenant, 'widgets.runtime')`;
//   4. the same request → 200, refused at slot 1 (the token matches no record), the controller's six keys;
//   5. one manifest line through `ctx.evidence` (written only with `WIDGETS_EVIDENCE=1`), claiming nothing.
// The runner tears the tenant down afterwards; the integrator's HAR-7 check then counts 0 remaining
// `widgets.runtime` entitlements and 0 harness tenants on the proof database.

import { UserRole } from '../../../../src/common/domain.enums';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../../../../scripts/widgets-intent-http-proof';

const check = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`HAR-7: ${message}`);
};

const intent = (ctx: HttpProofContext, token: string) =>
  ctx.request('/widgets/intent', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    // P-F88, IR-F88-3: HAR-7 asserts a 200 slot-1 refusal, so the body must pass the §3.8 shape stage.
    // Spelled out here rather than filled by a helper: a BIN case posts its own bytes (D-17).
    body: JSON.stringify({
      contract: 'maya.widget.intent.submission/1',
      widget_id: '00000000-0000-4000-8000-000000000007',
      intent_token: 'har7-unknown-intent-token-0000',
      inputs: null,
      client_nonce: 'har7-nonce-0001',
      profile_id: 'pwa.default',
    }),
  });

export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'HAR-7',
    gate: 'harness',
    proofClass: 'HARNESS-SELF-TEST',
    async run(ctx) {
      const tenant = await ctx.fixtures.tenant('HAR-7');
      const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);

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
      check(
        (login.status === 200 || login.status === 201) &&
          typeof token === 'string',
        `login answered HTTP ${login.status} without an access token`,
      );

      const dark = await intent(ctx, token as string);
      check(
        dark.status === 403 &&
          (dark.body as { error?: { code?: unknown } } | null)?.error?.code ===
            'feature_locked',
        `before the grant the route answered HTTP ${dark.status} ${JSON.stringify(dark.body)}, not 403 feature_locked`,
      );

      await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');

      const lit = await intent(ctx, token as string);
      const body = lit.body as Record<string, unknown> | null;
      check(
        lit.status === 200 &&
          body !== null &&
          JSON.stringify(Object.keys(body).sort()) ===
            JSON.stringify([
              'code',
              'contract',
              'gates_run',
              'gates_total',
              'outcome',
              'stopped_at_gate',
            ]) &&
          body.outcome === 'refuse' &&
          body.stopped_at_gate === '1' &&
          body.gates_run === 1,
        `after the grant the route answered HTTP ${lit.status} ${JSON.stringify(body)}, not a slot-1 refusal`,
      );

      ctx.evidence.record({
        testId: 'HAR-7',
        triggerTraceId: null,
        recordHash: null,
        stoppedAtGate: body?.stopped_at_gate as string,
        gatesRun: body?.gates_run as number,
        labels: ['[harness self-test]'],
        clauses: [],
        claim: null,
      });
    },
  },
];
