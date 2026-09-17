// U6-L1 — Gate 6 on the PRODUCTION BINARY [BIN]. GATES-PLAN-V11, Wave 1.
//
// WHAT IS NOT HERE, first, because the gap is the point. §0.5 needs an HTTP entry AND a BIN entry
// before any Gate 6 clause may be called L, and every Gate 6 claim needs a MINTED RECORD: slot 6 runs
// only after slot 1 has found one. The BIN runner has no widget writer by design (I-HAR: `ctx.fixtures`
// carries `tenant`, `user`, `staff`, `client`, `grantFeature` and `teardown`, and nothing that writes a
// `Widget*` row), and the production trigger that mints one — T-2b,
// `POST /api/ai/tools/:toolName/execute` — is P-MT2a, in Wave 4. SO THE BIN HALF OF G6-1…G6-7 AND
// G6-15…G6-20 IS NOT IN THIS FILE YET. E1-G6 adds it, on T-2b records, with `WIDGETS_EVIDENCE=1`
// manifest lines whose provenance the verifier checks against the binary's own `WidgetMintProvenance`
// lines (D-17).
//
// What IS here is the half of Gate 6 a writerless runner can show on its own, and the control the
// later cases need:
//
//   SMOKE-G6-BODY   the structural half of G6-2 and FR-14. `authority_hint`, `role`, `permissions`,
//                   `is_owner` and `presentation_hint` are refused BEFORE the pipeline — two different
//                   mechanisms, and both are absence rather than a check inside the gate: the DTO
//                   declares no such member (`forbidNonWhitelisted`), and F88's walk refuses its
//                   twenty-eight keys at every depth. A gate that merely ignored these fields would
//                   answer 200 here.
//   SMOKE-G6-CONTROL the control: on the binary, an entitled tenant's conformant submission of an
//                   unminted token stops at slot 1, and an unentitled tenant never reaches a gate at
//                   all. Without it a later "it stopped at 6" would be a statement about a route that
//                   refuses everything.
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
  if (!condition) throw new Error(`U6-L1 [BIN]: ${message}`);
};

/** A conformant §3.8 body (P-F88's DTO). No member of it can name a capability, a role or a surface. */
const submission = (intentToken: string): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: randomUUID(),
  intent_token: intentToken,
  inputs: null,
  client_nonce: `g6-${randomUUID().slice(0, 8)}`,
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
    id: 'SMOKE-G6-CONTROL',
    gate: '6',
    proofClass: 'CONTROL',
    async run(ctx) {
      const build = async (label: string, granted: boolean) => {
        const tenant = await ctx.fixtures.tenant(label);
        const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
        if (granted) await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
        const bearer = await login(ctx, tenant.slug, user.email, user.password);
        return { tenant, bearer };
      };

      const entitled = await build('U6 entitled tenant', true);
      const dark = await build('U6 tenant without the entitlement', false);

      const token = `g6-bin-${randomUUID()}${randomUUID()}`;
      const first = await post(ctx, entitled.bearer, submission(token));
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

      // Dark before any gate: `FeatureGuard` refuses a tenant without `widgets.runtime` (k3 check 8).
      const locked = await post(ctx, dark.bearer, submission(token));
      check(
        locked.status === 403,
        `the route answered an unentitled tenant HTTP ${locked.status} ${JSON.stringify(locked.body)}, not 403`,
      );
    },
  },
  {
    id: 'SMOKE-G6-BODY',
    gate: '6',
    proofClass: 'CONTROL',
    async run(ctx) {
      const tenant = await ctx.fixtures.tenant('U6 body');
      const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
      await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
      const bearer = await login(ctx, tenant.slug, user.email, user.password);
      const token = `g6-bin-${randomUUID()}${randomUUID()}`;

      // The control first: the same body without the hostile member is admitted to the pipeline and
      // refused by a GATE. Without it a 400 below would prove only that the route rejects things.
      const control = await post(ctx, bearer, submission(token));
      check(
        control.status === 200,
        `the control body answered HTTP ${control.status}, so the 400s below prove nothing`,
      );

      // G6-2's structural half: `authority_hint` is not a member of the submission and never reaches
      // a gate. FR-14's: `presentation_hint`, `role`, `is_owner` and `permissions` are F88 keys and
      // are refused at every depth, `inputs` included.
      const hostile: Record<string, unknown>[] = [
        { authority_hint: 'owner' },
        { role: 'escape' },
        { presentation_hint: 'owner' },
        { inputs: { role: 'escape' } },
        { inputs: { is_owner: true } },
        { inputs: { permissions: 'all' } },
      ];
      for (const extra of hostile) {
        const res = await post(ctx, bearer, {
          ...submission(token),
          ...extra,
        });
        check(
          res.status === 400,
          `${JSON.stringify(extra)} answered HTTP ${res.status} ${JSON.stringify(res.body)}, not 400 — the body reached the pipeline`,
        );
        const answer = res.body as Record<string, unknown> | null;
        check(
          answer?.outcome === undefined &&
            answer?.stopped_at_gate === undefined,
          `${JSON.stringify(extra)} answered with a gate verdict (${JSON.stringify(answer)}); the refusal must come from the shape stage, before any gate ran`,
        );
      }
    },
  },
];
