// U12a — Gate 12 on the PRODUCTION BINARY [BIN]. GATES-PLAN-V11, Wave 1.
//
// WHAT THIS FILE IS NOT, first, because the gap is the point. G12-L00's whole content is OWNER SPIES AT
// ZERO, and a spy needs the process the test runs in. Here the server is a separate process
// (`dist/src/main`), so the owners cannot be watched and no assertion in this file can say "no canonical
// read happened" in the sense G12-L00 says it. It also cannot say it about a RECORD: a Gate 12 claim
// needs a minted one, the BIN runner has no widget writer by design (I-HAR), and the production trigger
// that mints one — T-2b, `POST /api/ai/tools/:toolName/execute` — is P-MT2a, in Wave 4.
//
// So `proofClass: 'CONTROL'` — never evidence, for any clause, and the BIN half of G12-L00 is not in
// this file yet. E1-G12 adds it, on T-2b records, once there is something to compose from.
//
// What it IS: the control those cases will need, on the binary the production build produces.
//   (1) For a tenant that holds `widgets.runtime`, the route answers a §3.8-conformant submission of an
//       unminted token with a SLOT-1 refusal and the controller's seven keys — so a later "it stopped at
//       12" is a statement about the record, and a later "the body carried no owner byte" is a statement
//       about a body that was composed rather than about a route that refuses everything.
//   (2) For a tenant without the entitlement the route is dark before any gate runs (403
//       `feature_locked`, k3 check 8): `widgets.runtime` stays dark in production.
//   (3) The binary printed ZERO `WidgetMintProvenance` lines (D-17 (2)). No composition, no mint, no
//       successor: the projector skeleton U12a lands is dark on the production binary too.
//   (4) Two tenants asking about the same unknown token get byte-identical answers, so the response is
//       no channel for another tenant's existence.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import { PROJECTOR_REGISTRY } from '../../src/widgets/projection/projector.registry';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../widgets-intent-http-proof';

const check = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`U12a [BIN]: ${message}`);
};

/** `widgets.controller.ts`'s response: these seven keys and no other. */
const CONTROLLER_KEYS = [
  'code',
  'contract',
  'gates_run',
  'gates_total',
  'outcome',
  // P-RENDER (IR-REN-1): R3.9.3's `reason_text`, the one member SH-22 admits on this response.
  'reason_text',
  'stopped_at_gate',
];

/** A conformant §3.8 body (P-F88's DTO). It has no member that could name a capability or a table. */
const submission = (intentToken: string): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: randomUUID(),
  intent_token: intentToken,
  inputs: null,
  client_nonce: `g12-${randomUUID().slice(0, 8)}`,
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
    id: 'SMOKE-G12-CONTROL',
    gate: '12',
    proofClass: 'CONTROL',
    async run(ctx) {
      // The skeleton this unit lands is dark in the binary's own module graph too: the registry it
      // would read from is empty, and this is the same module the server loaded.
      check(
        PROJECTOR_REGISTRY.length === 0,
        `PROJECTOR_REGISTRY carries ${PROJECTOR_REGISTRY.length} rows; U12a registers none (ARCH-12-13)`,
      );

      const build = async (label: string, granted: boolean) => {
        const tenant = await ctx.fixtures.tenant(label);
        const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
        if (granted) await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
        const bearer = await login(ctx, tenant.slug, user.email, user.password);
        return { tenant, bearer };
      };

      const a = await build('U12a tenant A', true);
      const b = await build('U12a tenant B', true);
      const dark = await build('U12a tenant without the entitlement', false);

      const unknownToken = `g12-bin-${randomUUID()}${randomUUID()}`;
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
      check(
        JSON.stringify(Object.keys(bodyA ?? {}).sort()) ===
          JSON.stringify(CONTROLLER_KEYS),
        `the response carried ${JSON.stringify(Object.keys(bodyA ?? {}).sort())}, not the controller's seven keys`,
      );

      // Same token, another tenant, identical answer — code and stop included.
      const fromB = await post(ctx, b.bearer, submission(unknownToken));
      check(
        fromB.status === fromA.status &&
          JSON.stringify(fromB.body) === JSON.stringify(bodyA),
        `the same unknown token answered tenant B with ${fromB.status} ${JSON.stringify(fromB.body)} and tenant A with ${fromA.status} ${JSON.stringify(bodyA)}`,
      );

      // Dark before any gate runs: `FeatureGuard` refuses a tenant without `widgets.runtime`.
      const locked = await post(ctx, dark.bearer, submission(unknownToken));
      check(
        locked.status === 403,
        `the route answered an unentitled tenant HTTP ${locked.status} ${JSON.stringify(locked.body)}, not 403`,
      );

      // D-17 (2): the binary's own stdout. Nothing was composed, so nothing was minted.
      const minted = ctx.mintProvenance();
      check(
        minted.length === 0,
        `the binary printed ${minted.length} WidgetMintProvenance line(s); a Gate 12 control mints nothing`,
      );
    },
  },
];
