// U11a — Gate 11 on the PRODUCTION BINARY [BIN]. GATES-PLAN-V11, Wave 1.
//
// WHAT THIS FILE IS NOT, first, because the gap is the point. §0.5 needs an HTTP entry AND a BIN entry
// before a Gate 11 clause may be called L, and a Gate 11 claim needs TWO things this runner does not
// have: a MINTED RECORD (the BIN runner has no widget writer by design — I-HAR gives a case `tenant`,
// `user`, `staff`, `client`, `grantFeature` and `teardown`, and nothing that writes a `Widget*` row),
// and a pipeline that REACHES slot 11 (slots 8, 9 and 10 are `pending()` seams at this commit and
// refuse `mechanism_absent` first). So THE BIN HALF OF EVERY G11 CLAUSE IS NOT IN THIS FILE YET. E1's
// Gate 11 task adds it, on T-2b records (`POST /api/ai/tools/:toolName/execute`, P-MT2a, Wave 4), with
// `WIDGETS_EVIDENCE=1` manifest lines whose provenance the verifier checks against the binary's own
// `WidgetMintProvenance` lines (D-17).
//
// What it IS: the controls those cases will need, plus the one half of row 11 a writerless runner can
// show on its own.
//
//   (1) The route is live on the binary for an entitled tenant, and a §3.8-conformant submission of an
//       unminted token stops at slot 1. A later "it stopped at 11" is then a statement about the
//       record, not about a route that refuses everything.
//   (2) The pipeline the binary runs is the contract's fifteen, so slot 11 is IN it — `gates_total`
//       comes from the array, and a Gate 11 claim against a fourteen-gate pipeline would be a claim
//       about a different pipeline.
//   (3) R3.7.3 — "frozen nouns never travel to the client". The response has seven keys and no more, on
//       every answer the route gives, so there is no member a handle, a witness or a noun could ride
//       out on. That is the same property the submission shape has on the way in (§3.8), checked here
//       on the way out.
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
  if (!condition) throw new Error(`U11a [BIN]: ${message}`);
};

/** `widgets.controller.ts`'s response: these eleven keys and no other. */
const CONTROLLER_KEYS = [
  'code',
  'contract',
  'gates_run',
  'gates_total',
  'outcome',
  'next_envelope',
  'owner_decision',
  'receipt_outcome',
  'resolved_widget',
  // P-RENDER (IR-REN-1): R3.9.3's `reason_text`, the one member SH-22 admits on this response.
  'reason_text',
  'stopped_at_gate',
];

/** A conformant §3.8 body (P-F88's DTO). No member of it can carry a noun, a handle or a witness. */
const submission = (intentToken: string): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: randomUUID(),
  intent_token: intentToken,
  inputs: null,
  client_nonce: `g11-${randomUUID().slice(0, 8)}`,
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
    id: 'SMOKE-G11-CONTROL',
    gate: '11',
    proofClass: 'CONTROL',
    async run(ctx) {
      const tenant = await ctx.fixtures.tenant('U11a tenant');
      const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
      await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
      const bearer = await login(ctx, tenant.slug, user.email, user.password);

      // (1) the route is live, and an unminted token stops at slot 1.
      const unknownToken = `g11-bin-${randomUUID()}${randomUUID()}`;
      const res = await post(ctx, bearer, submission(unknownToken));
      const body = res.body as Record<string, unknown> | null;
      check(
        res.status === 200 &&
          body?.outcome === 'expired' &&
          body?.code === null &&
          body?.stopped_at_gate === '1' &&
          body?.gates_run === 1,
        `a conformant body with an unminted token answered HTTP ${res.status} ${JSON.stringify(body)}, not the canonical slot-1 expired outcome`,
      );

      // (2) the pipeline the binary runs is §3.9's fifteen, so slot 11 is one of them.
      check(
        body?.gates_total === 15,
        `the binary's pipeline reports ${String(body?.gates_total)} gates, not the contract's fifteen; a Gate 11 claim would be about another pipeline`,
      );

      // (3) R3.7.3 on the way out: seven keys, and no member a noun could ride on. Checked on this
      // answer and on a second, differently shaped one (a body the shape stage refuses), so the claim
      // is about the ROUTE and not about one branch of it.
      check(
        JSON.stringify(Object.keys(body ?? {}).sort()) ===
          JSON.stringify(CONTROLLER_KEYS),
        `the route answered with keys ${JSON.stringify(Object.keys(body ?? {}))}, not the seven of the controller's response`,
      );
      const serialized = JSON.stringify(body);
      for (const forbidden of [
        'frozen_nouns',
        'revision_id',
        'run_id',
        'snapshot_hash',
        'payload_hash',
      ])
        check(
          !serialized.includes(forbidden),
          `the route's answer carried \`${forbidden}\`; R3.7.3 says frozen nouns and witnesses never travel to the client`,
        );

      // A shape-stage refusal is a 400 with the validator's own body, not the gateway's — checked so
      // the six-key claim above is known to be about the GATE answer and not about every 2xx/4xx.
      const malformed = await post(ctx, bearer, { intent_token: unknownToken });
      check(
        malformed.status === 400,
        `a body missing the §3.8 members answered HTTP ${malformed.status}, not 400 at the shape stage`,
      );
      check(
        !JSON.stringify(malformed.body).includes('frozen_nouns'),
        'the shape-stage refusal named `frozen_nouns`',
      );
    },
  },
];
