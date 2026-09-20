// U13a — production-binary control for the Gate 13 response surface.
//
// The BIN harness owns no widget writer. Until E1 supplies a production-minted record this case is
// CONTROL, not Gate 13 clause evidence: it proves the guarded binary exposes the closed routing
// result members while an unminted token still terminates at Gate 1.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../widgets-intent-http-proof';

const check = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`U13a [BIN]: ${message}`);
};

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
    id: 'SMOKE-G13-CONTROL',
    gate: '13',
    proofClass: 'CONTROL',
    async run(ctx) {
      const tenant = await ctx.fixtures.tenant('U13a entitled tenant');
      const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
      await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
      const bearer = await login(ctx, tenant.slug, user.email, user.password);
      const res = await ctx.request('/widgets/intent', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
          widget_id: randomUUID(),
          intent_token: `g13-bin-${randomUUID()}${randomUUID()}`,
          inputs: null,
          client_nonce: `g13-${randomUUID().slice(0, 8)}`,
          profile_id: 'pwa.default',
        }),
      });
      const body = res.body as Record<string, unknown> | null;
      check(
        res.status === 200 &&
          body?.outcome === 'expired' &&
          body?.stopped_at_gate === '1' &&
          body?.gates_total === 15 &&
          body?.next_envelope === null &&
          body?.resolved_widget === null &&
          body?.owner_decision === null &&
          body?.receipt_outcome === null,
        `the unminted submission answered HTTP ${res.status} ${JSON.stringify(body)}, not the closed Gate 1 terminal response`,
      );
    },
  },
];
