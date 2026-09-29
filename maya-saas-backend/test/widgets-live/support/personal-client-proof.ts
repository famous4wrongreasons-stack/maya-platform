// SB-1 HTTP/BIN proof. Synthetic link fixture proves context consumption only;
// it is never evidence that a production re-verification issuer exists.
import { CalendarSource, UserRole } from '../../../src/common/domain.enums';
import type { HttpProofContext } from './http-proof-contract';
import { requireProof } from './release-booking-proof';
export async function personalClientProof(ctx: HttpProofContext) {
  const tenant = await ctx.fixtures.tenant(
    'SB-1 personal context',
    CalendarSource.INTERNAL,
  );
  const user = await ctx.fixtures.user(tenant, UserRole.TENANT_OWNER);
  const source = await ctx.fixtures.bookingSource(tenant, user, true);
  for (const feature of [
    'booking',
    'booking.customer_app',
    'crm.integration',
  ] as const)
    await ctx.fixtures.grantFeature(tenant, feature);
  const login = await ctx.request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantSlug: tenant.slug,
      email: user.email,
      password: user.password,
    }),
  });
  const token = (login.body as { access_token: string }).access_token;
  requireProof(typeof token === 'string', 'SB-1 login');
  const date = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const dto = {
    staffId: source.staffId,
    serviceIds: [source.serviceId],
    start: `${date}T12:00:00+03:00`,
  };
  const post = (route: string, body: unknown, selection?: string) =>
    ctx.request(route, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': `sb1-${user.id}`,
        ...(selection ? { 'x-maya-authority-context': selection } : {}),
      },
      body: JSON.stringify(body),
    });
  requireProof(
    (await post('/personal-client/appointments', dto)).status === 403,
    'SB-1 explicit selection required',
  );
  requireProof(
    (await post('/appointments', dto)).status === 403,
    'SB-1 owner has no implicit personal authority',
  );
  requireProof(
    (
      await post(
        '/personal-client/appointments',
        { ...dto, clientId: 'foreign' },
        'personal_client',
      )
    ).status === 400,
    'SB-1 caller Client refused',
  );
  const before = await ctx.fixtures.bookingProofState(tenant);
  requireProof(
    before.executions.length === 0 && before.appointments.length === 0,
    'SB-1 denied requests have no effects',
  );
  const created = await post(
    '/personal-client/appointments',
    dto,
    'personal_client',
  );
  requireProof(
    created.status === 201,
    `SB-1 canonical create: ${JSON.stringify(created)}`,
  );
  const state = await ctx.fixtures.bookingProofState(tenant);
  requireProof(
    state.executions.length === 1 && state.executions[0].state === 'SUCCEEDED',
    'SB-1 durable canonical execution',
  );
  const refs = state.executions[0].evidenceRefsJson as string[];
  requireProof(
    refs.includes('personal-context:v1:personal_client') &&
      refs.includes(`personal-actor-user:v1:${user.id}`) &&
      refs.includes('personal-actor-role:v1:tenant_owner'),
    'SB-1 durable context and actual actor',
  );
  requireProof(
    refs.some((r) => r.startsWith('personal-actor-session:v1:')) &&
      refs.some((r) => r.startsWith('personal-actor-membership:v1:')) &&
      refs.some((r) => r.startsWith('client-authority:v1:')),
    'SB-1 durable session/membership/link',
  );
  requireProof(
    state.memberships.find((m) => m.userId === user.id)?.role ===
      'tenant_owner',
    'SB-1 owner role unchanged',
  );
  requireProof(
    state.personalAudits.some(
      (a) =>
        a.userId === user.id &&
        (a.metadataJson as { authority_context?: string })
          ?.authority_context === 'personal_client',
    ),
    'SB-1 actual actor audit',
  );
  const replay = await post(
    '/personal-client/appointments',
    dto,
    'personal_client',
  );
  requireProof(
    replay.status === 201 &&
      (await ctx.fixtures.bookingProofState(tenant)).executions.length === 1,
    'SB-1 immutable booking retry',
  );
}
