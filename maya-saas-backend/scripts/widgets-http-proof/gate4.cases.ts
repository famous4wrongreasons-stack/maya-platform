// U4 — Gate 4 on the PRODUCTION BINARY [BIN]. GATES-PLAN-V11, Wave 1.
//
// WHAT THIS FILE IS NOT, first, because the gap is the point. §0.5 needs an HTTP entry AND a BIN entry
// before G4-a or G4-b may be called L, and a Gate 4 claim needs a MINTED RECORD: slot 4 runs only
// after slot 1 has found one. The BIN runner has no widget writer by design (I-HAR: `ctx.fixtures`
// carries `tenant`, `user`, `staff`, `client`, `grantFeature` and `teardown`, and nothing that writes
// a `Widget*` row), and the production trigger that mints one — T-2b,
// `POST /api/ai/tools/:toolName/execute` — is P-MT2a, in Wave 4. So THE BIN HALF OF G4-a/G4-b IS NOT
// IN THIS FILE YET. E1-G4 adds it, on T-2b records, with `WIDGETS_EVIDENCE=1` manifest lines whose
// provenance the verifier checks against the binary's own `WidgetMintProvenance` lines (D-17).
//
// What it is: the control those cases will need. On the binary, for a tenant that holds
// `widgets.runtime`, the route answers a §3.8-conformant submission of an unminted token with a slot-1
// refusal — so a later "it stopped at 4" is a statement about the record, not about a route that
// refuses everything; and for a tenant that does not hold the entitlement the route is dark before any
// gate runs. The last check is the one piece of row 4 a writerless runner can show on its own: two
// tenants asking about the same unknown token get byte-identical answers, so nothing in the response
// is a channel for another tenant's existence.
//
// `proofClass: 'CONTROL'` — never evidence, for any clause.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../widgets-intent-http-proof';

const check = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`U4 [BIN]: ${message}`);
};

/** A conformant §3.8 body (P-F88's DTO). No member of it can name a tenant; the DTO declares none. */
const submission = (intentToken: string): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: randomUUID(),
  intent_token: intentToken,
  inputs: null,
  client_nonce: `g4-${randomUUID().slice(0, 8)}`,
  profile_id: 'pwa.default',
});

const post = (ctx: HttpProofContext, bearer: string, body: unknown) =>
  ctx.request('/widgets/intent', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

const login = async (
  ctx: HttpProofContext,
  tenantSlug: string,
  email: string,
  password: string,
): Promise<string> => {
  const res = await ctx.request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug, email, password }),
  });
  const token = (res.body as { access_token?: unknown } | null)?.access_token;
  check(
    (res.status === 200 || res.status === 201) && typeof token === 'string',
    `login answered HTTP ${res.status} without an access token`,
  );
  return token as string;
};

export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'SMOKE-G4-CONTROL',
    gate: '4',
    proofClass: 'CONTROL',
    async run(ctx) {
      const build = async (label: string, granted: boolean) => {
        const tenant = await ctx.fixtures.tenant(label);
        const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
        if (granted) await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
        const bearer = await login(ctx, tenant.slug, user.email, user.password);
        return { tenant, bearer };
      };

      const a = await build('U4 tenant A', true);
      const b = await build('U4 tenant B', true);
      const dark = await build('U4 tenant without the entitlement', false);

      // The route is live for an entitled tenant, and an unminted token stops at slot 1. A "stopped at
      // 4" in a later case therefore says something about the record rather than about the route.
      const unknownToken = `g4-bin-${randomUUID()}${randomUUID()}`;
      const fromA = await post(ctx, a.bearer, submission(unknownToken));
      const bodyA = fromA.body as Record<string, unknown> | null;
      check(
        fromA.status === 200 &&
          bodyA?.outcome === 'expired' &&
          bodyA?.code === null &&
          bodyA?.stopped_at_gate === '1' &&
          bodyA?.gates_run === 1,
        `a conformant body with an unminted token answered HTTP ${fromA.status} ${JSON.stringify(bodyA)}, not the canonical slot-1 expired outcome`,
      );

      // Row 4's property a writerless runner can show: the answer carries nothing about the other
      // tenant. Same token, another tenant, identical response — including its `code` and its stop.
      const fromB = await post(ctx, b.bearer, submission(unknownToken));
      check(
        fromB.status === fromA.status &&
          JSON.stringify(fromB.body) === JSON.stringify(bodyA),
        `the same unknown token answered tenant B with ${fromB.status} ${JSON.stringify(fromB.body)} and tenant A with ${fromA.status} ${JSON.stringify(bodyA)}`,
      );

      // Dark before any gate: `FeatureGuard` refuses a tenant without `widgets.runtime` (k3 check 8).
      const locked = await post(ctx, dark.bearer, submission(unknownToken));
      check(
        locked.status === 403,
        `the route answered an unentitled tenant HTTP ${locked.status} ${JSON.stringify(locked.body)}, not 403`,
      );
    },
  },
];
