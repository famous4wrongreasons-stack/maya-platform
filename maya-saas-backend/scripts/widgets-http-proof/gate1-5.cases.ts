import { randomUUID } from 'node:crypto';

import { UserRole } from '../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../widgets-intent-http-proof';

const check = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`P-G15a [BIN]: ${message}`);
};

const login = async (
  ctx: HttpProofContext,
  tenantSlug: string,
  email: string,
  password: string,
): Promise<string> => {
  const response = await ctx.request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug, email, password }),
  });
  const token = (response.body as { access_token?: unknown } | null)
    ?.access_token;
  check(
    (response.status === 200 || response.status === 201) &&
      typeof token === 'string',
    `login answered ${response.status} without a token`,
  );
  return token as string;
};

export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'SMOKE-G15-EXPIRED',
    gate: '1',
    proofClass: 'CONTROL',
    async run(ctx) {
      const tenant = await ctx.fixtures.tenant('P-G15a code-less expiry');
      const user = await ctx.fixtures.user(tenant, UserRole.ADMINISTRATOR);
      await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
      const bearer = await login(ctx, tenant.slug, user.email, user.password);
      const response = await ctx.request('/widgets/intent', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
          widget_id: randomUUID(),
          intent_token: `g15-bin-${randomUUID()}${randomUUID()}`,
          inputs: null,
          client_nonce: `g15-${randomUUID()}`,
          profile_id: 'pwa.default',
        }),
      });
      const body = response.body as Record<string, unknown> | null;
      check(response.status === 200, `route answered HTTP ${response.status}`);
      check(
        body?.outcome === 'expired',
        `outcome was ${String(body?.outcome)}`,
      );
      check(body?.code === null, `code was ${String(body?.code)}`);
      check(
        body?.stopped_at_gate === '1' && body?.gates_run === 1,
        `not a slot-1 answer: ${JSON.stringify(body)}`,
      );
    },
  },
];
