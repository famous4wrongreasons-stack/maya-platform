// U9b — Gate 9 production-binary control.
//
// The BIN harness intentionally owns no widget writer. Until E1 supplies a production-minted record,
// this case proves the guarded binary accepts Gate 9's submission shape and carries the complete
// fifteen-slot pipeline. It is CONTROL, never evidence for a Gate 9 clause.

import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../widgets-intent-http-proof';

const check = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`U9b [BIN]: ${message}`);
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
    id: 'SMOKE-G9-CONTROL',
    gate: '9',
    proofClass: 'CONTROL',
    async run(ctx) {
      const tenant = await ctx.fixtures.tenant('U9b entitled tenant');
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
          intent_token: `g9-bin-${randomUUID()}${randomUUID()}`,
          inputs: null,
          client_nonce: `g9-${randomUUID().slice(0, 8)}`,
          profile_id: 'pwa.default',
        }),
      });
      const body = res.body as Record<string, unknown> | null;
      check(
        res.status === 200 &&
          body?.outcome === 'expired' &&
          body?.stopped_at_gate === '1' &&
          body?.gates_run === 1 &&
          body?.gates_total === 15,
        `the conformant unminted submission answered HTTP ${res.status} ${JSON.stringify(body)}, not the canonical slot-1 terminal result`,
      );
    },
  },
];
