// U7a — Gate 7 on the PRODUCTION BINARY [BIN]. GATES-PLAN-V11, Wave 1.
//
// WHAT IS MISSING, FIRST, BECAUSE THE GAP IS THE POINT. §0.5 needs an HTTP entry AND a BIN entry
// before G7-1, G7-2, G7-3 or G7-7 may be called L, and every Gate 7 claim needs a MINTED RECORD with
// a chosen `widget_kind`, `effect` and — for the tier clause — a chosen `delivery_channel`. The BIN
// runner has no widget writer by design (I-HAR: `ctx.fixtures` carries `tenant`, `user`, `staff`,
// `client`, `grantFeature` and `teardown`, and nothing that writes a `Widget*` row), and the
// production trigger that mints one, T-2b `POST /api/ai/tools/:toolName/execute`, is P-MT2a in Wave 4.
//
// **SO THE THREE CASES THE CARD NAMES — a tier refusal, the escape on push, and the kind rule — ARE
// NOT IN THIS FILE YET.** E1-G7 adds them on T-2b records, as an HTTP and BIN pair with
// `WIDGETS_EVIDENCE=1` manifest lines whose provenance the verifier checks against the binary's own
// `WidgetMintProvenance` lines (D-17). Writing them here against harness-minted records would put a
// `[BIN]` label on something that is not evidence, which is the one thing §0.5 is for.
//
// WHAT THIS FILE IS: the control those cases will need, and the one half of row 7 a writerless runner
// can show on its own.
//   (1) On the binary, for a tenant holding `widgets.runtime`, the route answers a §3.8-conformant
//       submission of an unminted token with a SLOT-1 refusal. Without that, a later "it stopped at 7"
//       would be a statement about a route that refuses everything.
//   (2) The response carries `gates_total` — §3.9's fifteen — so a "stopped at 7" in E1-G7 is read
//       against a pipeline that still has fifteen slots, not a subset.
//   (3) A body that names `widget_kind`, `delivery_channel`, `effect` or `priority` is refused at the
//       SHAPE stage, before any gate runs (I18: no client value is a Gate 7 antecedent, and §3.8 has
//       no member that could be one). That is row 7's own property, and it needs no widget record.
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
  if (!condition) throw new Error(`U7a [BIN]: ${message}`);
};

/** A conformant §3.8 body (P-F88's DTO). No member of it names a kind, a channel or an effect. */
const submission = (
  intentToken: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: randomUUID(),
  intent_token: intentToken,
  inputs: null,
  client_nonce: `g7-${randomUUID().slice(0, 8)}`,
  profile_id: 'pwa.default',
  ...extra,
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
    id: 'SMOKE-G7-CONTROL',
    gate: '7',
    proofClass: 'CONTROL',
    async run(ctx) {
      const tenant = await ctx.fixtures.tenant('U7a tenant');
      const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
      await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
      const bearer = await login(ctx, tenant.slug, user.email, user.password);

      // (1) and (2): the route is live for an entitled tenant, an unminted token stops at slot 1, and
      // the pipeline still reports §3.9's fifteen slots.
      const unknownToken = `g7-bin-${randomUUID()}${randomUUID()}`;
      const first = await post(ctx, bearer, submission(unknownToken));
      const body = first.body as Record<string, unknown> | null;
      check(
        first.status === 200 &&
          body?.outcome === 'refuse' &&
          body?.stopped_at_gate === '1' &&
          body?.gates_run === 1,
        `a conformant body with an unminted token answered HTTP ${first.status} ${JSON.stringify(body)}, not a slot-1 refusal`,
      );
      check(
        body?.gates_total === 15,
        `the binary reports ${String(body?.gates_total)} gates, not §3.9's fifteen`,
      );

      // (3) I18 on the binary: §3.8 declares no member that could carry a kind, a channel, an effect
      // or a priority, and the global pipe's `forbidNonWhitelisted` refuses one before any gate runs.
      // A Gate 7 antecedent therefore cannot come from the client — it is a property of the DTO, not
      // a check the gate has to remember to make.
      for (const forbidden of [
        { widget_kind: 'BOOKING_CONFIRMATION' },
        { delivery_channel: 'pwa' },
        { effect: 'NAVIGATE' },
        { priority: 0 },
      ]) {
        const dressed = await post(
          ctx,
          bearer,
          submission(unknownToken, forbidden),
        );
        check(
          dressed.status === 400,
          `a body carrying ${Object.keys(forbidden)[0]} answered HTTP ${dressed.status} ${JSON.stringify(dressed.body)}, not 400 from the shape stage`,
        );
      }

      // The control for (3): without the extra member, the same body is admitted to the pipeline. A
      // route that answered 400 to everything would satisfy the loop above and prove nothing.
      const clean = await post(ctx, bearer, submission(unknownToken));
      check(
        clean.status === 200,
        `the undressed body answered HTTP ${clean.status}, so the 400s above say nothing about the member`,
      );
    },
  },
];
