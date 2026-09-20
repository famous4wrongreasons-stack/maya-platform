// U8R — Gate 8-R on the PRODUCTION BINARY [BIN]. GATES-PLAN-V11, Wave 1.
//
// WHAT IS MISSING FROM THIS FILE, first, because the gap is the point. §0.5 needs an HTTP entry AND a
// BIN entry before R-0, R-1, R-6 or R-7 may be called L, and every one of those clauses is about a
// MINTED RECORD: slot 8-R runs only after slot 1 has found one. The BIN runner has no widget writer by
// design (I-HAR: `ctx.fixtures` carries `tenant`, `user`, `staff`, `client`, `grantFeature` and
// `teardown`, and nothing that writes a `Widget*` row), and the production trigger that mints one —
// T-2b, `POST /api/ai/tools/:toolName/execute` — is P-MT2a, in Wave 4. So THE BIN HALF OF
// SMOKE-G8R-UNREQUIRED-ACK IS NOT IN THIS FILE YET. E1-G8R adds it, on T-2b records, with
// `WIDGETS_EVIDENCE=1` manifest lines whose provenance the verifier checks against the binary's own
// `WidgetMintProvenance` lines (D-17).
//
// What IS here is the control those cases will need, and one claim a writerless runner can make on its
// own. On the binary, for a tenant that holds `widgets.runtime`:
//
//   - a §3.8-conformant submission CARRYING AN OBJECT `readback_ack` is admitted by the shape stage and
//     answered by the pipeline (slot 1, for an unminted token). Without this, "it stopped at 8-R" in a
//     later case could just as well mean "the body never got past the DTO";
//   - a NULL `readback_ack` is a 400 from the shape stage, and the answer carries none of the six
//     members a gate verdict carries — so it can never be read as `readback_mismatch` (AMB-02c, and
//     P-F88's F88-4, which owns that case);
//   - a body with no ack at all answers exactly as the one carrying an ack does at this stage: at slot
//     1 the readback is not yet anybody's business, and a difference here would mean the ack is being
//     read before the record is found;
//   - without the entitlement the route is dark before any gate runs.
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
  if (!condition) throw new Error(`U8R [BIN]: ${message}`);
};

/** The seven members `widgets.controller.ts` answers a submission with, and no other. */
const GATE_ANSWER_KEYS = [
  'code',
  'contract',
  'gates_run',
  'gates_total',
  'outcome',
  // P-RENDER (IR-REN-1): R3.9.3's `reason_text`, the one member SH-22 admits on this response.
  'reason_text',
  'stopped_at_gate',
];

const submission = (
  intentToken: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: randomUUID(),
  intent_token: intentToken,
  inputs: null,
  client_nonce: `g8r-${randomUUID().slice(0, 8)}`,
  profile_id: 'pwa.default',
  ...over,
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

const answerOf = (body: unknown): Record<string, unknown> => {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    outcome: b.outcome,
    code: b.code,
    stopped_at_gate: b.stopped_at_gate,
    gates_run: b.gates_run,
  };
};

export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'SMOKE-G8R-CONTROL',
    gate: '8-R',
    proofClass: 'CONTROL',
    async run(ctx) {
      const build = async (label: string, granted: boolean) => {
        const tenant = await ctx.fixtures.tenant(label);
        const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
        if (granted) await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
        const bearer = await login(ctx, tenant.slug, user.email, user.password);
        return { tenant, bearer };
      };

      const entitled = await build('U8R tenant', true);
      const dark = await build('U8R tenant without the entitlement', false);
      const unknownToken = `g8r-bin-${randomUUID()}${randomUUID()}`;
      const ack = {
        readback_ref: 'R-8r-bin',
        body_hash: 'a'.repeat(64),
        affirmation: 'да',
      };

      // 1. An object ack is admitted by the shape stage and reaches the pipeline.
      const withAck = await post(
        ctx,
        entitled.bearer,
        submission(unknownToken, { readback_ack: ack }),
      );
      const withAckBody = withAck.body as Record<string, unknown> | null;
      check(
        withAck.status === 200 &&
          withAckBody?.outcome === 'expired' &&
          withAckBody?.code === null &&
          withAckBody?.stopped_at_gate === '1' &&
          withAckBody?.gates_run === 1,
        `a conformant body carrying an object readback_ack answered HTTP ${withAck.status} ${JSON.stringify(withAckBody)}, not the canonical slot-1 expired outcome`,
      );

      // 2. At slot 1 the ack changes nothing: the readback is not yet anybody's business.
      const withoutAck = await post(
        ctx,
        entitled.bearer,
        submission(unknownToken),
      );
      check(
        withoutAck.status === withAck.status &&
          JSON.stringify(answerOf(withoutAck.body)) ===
            JSON.stringify(answerOf(withAckBody)),
        `the same token answered ${JSON.stringify(answerOf(withoutAck.body))} without an ack and ${JSON.stringify(answerOf(withAckBody))} with one`,
      );

      // 3. A null ack is a shape-stage 400 (AMB-02c, P-F88 F88-4), never a §3.9 verdict.
      const nullAck = await post(
        ctx,
        entitled.bearer,
        submission(unknownToken, { readback_ack: null }),
      );
      const nullBody = (nullAck.body ?? {}) as Record<string, unknown>;
      const gateMembers = GATE_ANSWER_KEYS.filter((k) =>
        Object.prototype.hasOwnProperty.call(nullBody, k),
      );
      check(
        nullAck.status === 400 && gateMembers.length === 0,
        `a null readback_ack answered HTTP ${nullAck.status} carrying gate members [${gateMembers.join(', ')}]: ${JSON.stringify(nullBody)}`,
      );

      // 4. Dark before any gate: `FeatureGuard` refuses a tenant without `widgets.runtime`.
      const locked = await post(
        ctx,
        dark.bearer,
        submission(unknownToken, { readback_ack: ack }),
      );
      check(
        locked.status === 403,
        `the route answered an unentitled tenant HTTP ${locked.status} ${JSON.stringify(locked.body)}, not 403`,
      );
    },
  },
];
