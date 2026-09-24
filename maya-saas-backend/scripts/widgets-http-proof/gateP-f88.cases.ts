// P-F88 — the shape stage on the PRODUCTION BINARY [BIN]. GATES-PLAN-V11, Wave 1.
//
// The same five exits as `test/widgets-live/f88-shape.live-spec.ts`, run against `dist/src/main`, so
// they exercise the bytes a release ships: `main.ts`'s bootstrap, `configureHttpApp`'s global
// `ValidationPipe`, every global guard, the real store. §0.5 needs both entries for an L claim, and
// this file is the BIN half.
//
// It writes no widget record and cannot: the runner's fixture context has no widget writer. Every body
// is composed here, in full, and posted raw — a helper that filled §3.8's required members would defeat
// F88-3, whose whole content is that a member is missing.
//
// This unit's first exit is the control (P-F88-0): a conformant body passes the shape stage and is
// refused at slot 1. Without it, the 400s below would also be produced by a route that refused
// everything, and the file would prove nothing about the fence.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { F88_FORBIDDEN_KEYS } from '../../src/widget-contract/f88.generated';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../widgets-intent-http-proof';

const check = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`P-F88 [BIN]: ${message}`);
};

interface Issue {
  readonly field: string;
  readonly message: string;
}

const issues = (body: unknown): Issue[] =>
  (body as { error?: { details?: Issue[] } } | null)?.error?.details ?? [];

const conformant = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  contract: 'maya.widget.intent.submission/1',
  widget_id: randomUUID(),
  intent_token: `f88-bin-${randomUUID()}`,
  inputs: null,
  client_nonce: `f88-${randomUUID().slice(0, 8)}`,
  profile_id: 'pwa.default',
  ...overrides,
});

const post = (ctx: HttpProofContext, token: string, body: unknown) =>
  ctx.request('/widgets/intent', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'P-F88',
    gate: 'shape',
    // A protocol rejection before the gate array. It is the shape stage's own proof, not a gate's:
    // no §3.9 refusal is involved and no record exists.
    proofClass: 'LIVE',
    async run(ctx) {
      const mintsBefore = ctx.mintProvenance().length;
      const tenant = await ctx.fixtures.tenant('P-F88');
      const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
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
      check(
        (login.status === 200 || login.status === 201) &&
          typeof token === 'string',
        `login answered HTTP ${login.status} without an access token`,
      );
      const bearer = token as string;

      // P-F88-0 — the control.
      const control = await post(ctx, bearer, conformant());
      const controlBody = control.body as Record<string, unknown> | null;
      check(
        control.status === 200 &&
          controlBody?.outcome === 'expired' &&
          controlBody?.code === null &&
          controlBody?.stopped_at_gate === '1' &&
          controlBody?.gates_run === 1,
        `a conformant §3.8 body answered HTTP ${control.status} ${JSON.stringify(controlBody)}, not the canonical slot-1 expired outcome`,
      );

      // F88-1 — every one of the 28 keys, at depth 0 and at depth 3.
      check(
        F88_FORBIDDEN_KEYS.length === 28,
        `the generated union carries ${F88_FORBIDDEN_KEYS.length} keys, not 28`,
      );
      for (const key of F88_FORBIDDEN_KEYS) {
        const root = await post(ctx, bearer, conformant({ [key]: 'x' }));
        check(
          root.status === 400 &&
            issues(root.body).some(
              (i) =>
                i.field === key &&
                i.message ===
                  `F88: forbidden key \`${key}\` at WidgetIntentSubmission.${key} (depth 0); F88.2's closed table admits it at no location`,
            ),
          `\`${key}\` at depth 0 answered HTTP ${root.status} ${JSON.stringify(root.body)}`,
        );
        const deep = await post(
          ctx,
          bearer,
          conformant({ inputs: { a: { b: { [key]: 'x' } } } }),
        );
        check(
          deep.status === 400 &&
            issues(deep.body).some(
              (i) =>
                i.field === `inputs.a.b.${key}` &&
                i.message.startsWith(`F88: forbidden key \`${key}\``) &&
                i.message.includes('(depth 3)'),
            ),
          `\`${key}\` at depth 3 answered HTTP ${deep.status} ${JSON.stringify(deep.body)}`,
        );
      }

      // F88-2 — no F88.2 location reaches the ingress: none of the six names `WidgetIntentSubmission`,
      // so the right path, the right depth and the right type change nothing.
      for (const [at, body] of [
        ['state', conformant({ state: 'KNOWN' })],
        ['state', conformant({ state: 'MINTED' })],
        ['tenant_id', conformant({ tenant_id: tenant.id })],
        ['role', conformant({ role: 'primary' })],
        [
          'inputs.intents_withheld[].role',
          conformant({ inputs: { intents_withheld: [{ role: 'primary' }] } }),
        ],
      ] as const) {
        const res = await post(ctx, bearer, body);
        check(
          res.status === 400 &&
            issues(res.body).some(
              (i) =>
                i.field === at && i.message.startsWith('F88: forbidden key'),
            ),
          `the F88.2 location ${at} on a submission answered HTTP ${res.status} ${JSON.stringify(res.body)}`,
        );
      }

      // F88-3 — a body without `contract` is not a submission.
      const noContract = conformant();
      delete noContract.contract;
      const missing = await post(ctx, bearer, noContract);
      check(
        missing.status === 400 &&
          issues(missing.body).some((i) => i.field === 'contract'),
        `a body without \`contract\` answered HTTP ${missing.status} ${JSON.stringify(missing.body)}`,
      );

      // F88-4 — `readback_ack: null` is a 400 at the shape stage, never `readback_mismatch` (AMB-02c).
      const nullAck = await post(
        ctx,
        bearer,
        conformant({ readback_ack: null }),
      );
      check(
        nullAck.status === 400 &&
          issues(nullAck.body).some((i) => i.field === 'readback_ack') &&
          JSON.stringify(Object.keys(nullAck.body as object).sort()) ===
            JSON.stringify(['error', 'message']),
        `a null \`readback_ack\` answered HTTP ${nullAck.status} ${JSON.stringify(nullAck.body)}`,
      );

      // F88-5 — `spoken_transcript` is refused on this carrier, and its value is not echoed back (R-7).
      const spoken = await post(
        ctx,
        bearer,
        conformant({ spoken_transcript: 'yes I confirm the appointment' }),
      );
      check(
        spoken.status === 400 &&
          issues(spoken.body).some((i) => i.field === 'spoken_transcript') &&
          !JSON.stringify(spoken.body).includes('I confirm'),
        `a \`spoken_transcript\` answered HTTP ${spoken.status} ${JSON.stringify(spoken.body)}`,
      );

      // No record was minted by any of this: the binary printed no mint provenance line (D-17 (2)).
      check(
        ctx.mintProvenance().length === mintsBefore,
        `the binary printed ${ctx.mintProvenance().length - mintsBefore} mint provenance lines for a shape-stage case`,
      );

      ctx.evidence.record({
        testId: 'P-F88',
        triggerTraceId: null,
        recordHash: null,
        stoppedAtGate: null,
        gatesRun: null,
        labels: ['[shape stage; no record]'],
        clauses: [],
        claim: null,
      });
    },
  },
];
