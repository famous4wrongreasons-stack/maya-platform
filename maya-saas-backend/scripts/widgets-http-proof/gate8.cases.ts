// U8a — Gate 8 on the PRODUCTION BINARY [BIN]. GATES-PLAN-V11, Wave 1.
//
// WHAT THIS FILE IS NOT, first, because the gap is the point. §0.5 needs an HTTP entry AND a BIN entry
// before G8-7, G8-8 or G8-LABELS may be called L, and every Gate 8 claim needs a MINTED RECORD: slot 8
// runs only after slot 1 has found one. The BIN runner has no widget writer by design (I-HAR:
// `ctx.fixtures` carries `tenant`, `user`, `staff`, `client`, `grantFeature` and `teardown`, and nothing
// that writes a `Widget*` row), and the production trigger that mints one — T-2b,
// `POST /api/ai/tools/:toolName/execute` — is P-MT2a, in Wave 4. SO THE BIN HALF OF THE GATE 8 CLAUSES
// IS NOT IN THIS FILE YET. E1-G8 adds it, on T-2b records, with `WIDGETS_EVIDENCE=1` manifest lines whose
// provenance the verifier checks against the binary's own `WidgetMintProvenance` lines (D-17).
//
// What it is: the control those cases will need, and it is not a formality. Gate 8's two live refusals are
// about the CONTENT of `inputs`, so they can only be observed if the shape stage lets each form through to
// a gate — and P-F88's §3.8 DTO is what decides that. On the binary, for a tenant that holds
// `widgets.runtime`, this case shows that:
//   - `inputs: null`, `inputs: {}` and `inputs: {choice:'a'}` are all ADMITTED by the shape stage and
//     answered by a gate (slot 1 here, since the token is unminted) — so a later "stopped at 8 with
//     `selection_out_of_domain`" is a statement about Gate 8 and not about a 400;
//   - a body with NO `inputs` member is refused 400 before any gate runs, which is why T-NULL-PASS's
//     "inputs absent" case cannot be a live Gate 8 test on this route at all;
//   - the route is dark for a tenant without the entitlement, before any of it.
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
  if (!condition) throw new Error(`U8a [BIN]: ${message}`);
};

/** A conformant §3.8 body (P-F88's DTO), with `inputs` in the form the case is about. */
const submission = (
  intentToken: string,
  inputs: Record<string, unknown> | null,
): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: randomUUID(),
  intent_token: intentToken,
  inputs,
  client_nonce: `g8-${randomUUID().slice(0, 8)}`,
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
    id: 'SMOKE-G8-NULL-INPUTS',
    gate: '8',
    proofClass: 'CONTROL',
    async run(ctx) {
      const build = async (label: string, granted: boolean) => {
        const tenant = await ctx.fixtures.tenant(label);
        const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
        if (granted) await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
        const bearer = await login(ctx, tenant.slug, user.email, user.password);
        return { tenant, bearer };
      };

      const entitled = await build('U8a entitled tenant', true);
      const dark = await build('U8a tenant without the entitlement', false);
      const unknownToken = `g8-bin-${randomUUID()}${randomUUID()}`;

      // Each of the three admissible `inputs` forms reaches a gate on the binary. The token is unminted,
      // so the gate that answers is slot 1 — and the answer is identical for all three, which is exactly
      // the control: nothing about `inputs` is being decided before Gate 8.
      const answers: string[] = [];
      for (const inputs of [null, {}, { choice: 'a' }]) {
        const res = await post(
          ctx,
          entitled.bearer,
          submission(unknownToken, inputs),
        );
        const body = res.body as Record<string, unknown> | null;
        check(
          res.status === 200 &&
            body?.outcome === 'expired' &&
            body?.code === null &&
            body?.stopped_at_gate === '1' &&
            body?.gates_run === 1,
          `a conformant body with inputs ${JSON.stringify(inputs)} answered HTTP ${res.status} ${JSON.stringify(body)}, not the canonical slot-1 expired outcome — the shape stage, not Gate 8, decided it`,
        );
        answers.push(JSON.stringify(body));
      }
      check(
        new Set(answers).size === 1,
        `the three inputs forms were answered differently before any gate read them: ${answers.join(' | ')}`,
      );

      // The absent member is refused at the shape stage, before a gate. §3.8 makes `inputs` REQUIRED and
      // NULLABLE (P-F88), so "omitted" is not a submission — and Gate 8's absent-`inputs` branch is
      // therefore unreachable through this route (U8a's T-NULL-PASS says the same at [GW]).
      const withoutInputs = submission(unknownToken, null);
      delete withoutInputs.inputs;
      const absent = await post(ctx, entitled.bearer, withoutInputs);
      check(
        absent.status === 400,
        `a body without \`inputs\` answered HTTP ${absent.status} ${JSON.stringify(absent.body)}, not 400 at the shape stage`,
      );

      // Dark before any gate: `FeatureGuard` refuses a tenant without `widgets.runtime` (k3 check 8).
      const locked = await post(
        ctx,
        dark.bearer,
        submission(unknownToken, null),
      );
      check(
        locked.status === 403,
        `the route answered an unentitled tenant HTTP ${locked.status} ${JSON.stringify(locked.body)}, not 403`,
      );
    },
  },
];
