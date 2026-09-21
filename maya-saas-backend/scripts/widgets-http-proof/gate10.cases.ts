// U10b production-binary control. Synthetic widget records are forbidden in BIN, so the guarded
// binary proves the fifteen-slot route remains present; PostgreSQL Gate 10 evidence is in the live
// suite until a production trigger mints conformant records.

import { randomUUID } from 'node:crypto';
import { UserRole } from '../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../widgets-intent-http-proof';

const check = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`U10b [BIN]: ${message}`);
};

export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'SMOKE-G10-CONTROL',
    gate: '10',
    proofClass: 'CONTROL',
    async run(ctx: HttpProofContext) {
      const tenant = await ctx.fixtures.tenant('U10b binary control');
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
      const bearer = (login.body as { access_token?: unknown } | null)
        ?.access_token;
      check(typeof bearer === 'string', 'login did not return a bearer');
      const response = await ctx.request('/widgets/intent', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearer as string}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
          widget_id: randomUUID(),
          intent_token: `g10-bin-${randomUUID()}${randomUUID()}`,
          inputs: null,
          client_nonce: `g10-${randomUUID().slice(0, 8)}`,
          profile_id: 'pwa.default',
        }),
      });
      const body = response.body as Record<string, unknown> | null;
      check(
        response.status === 200 &&
          body?.outcome === 'expired' &&
          body?.stopped_at_gate === '1' &&
          body?.gates_total === 15,
        `guarded binary answered ${response.status} ${JSON.stringify(body)}`,
      );
    },
  },
];
