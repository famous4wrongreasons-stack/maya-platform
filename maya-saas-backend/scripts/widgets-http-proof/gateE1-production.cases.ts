import { randomUUID } from 'node:crypto';

import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { E1_L_CLAUSES } from '../../test/widgets-live/support/e1-claims';
import type {
  HttpProofContext,
  WidgetsHttpProofCase,
} from '../../test/widgets-live/support/http-proof-contract';

const check = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`E1 [BIN]: ${message}`);
};

const object = (value: unknown, label: string): Record<string, unknown> => {
  check(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${label} is not an object`,
  );
  return value as Record<string, unknown>;
};

const request = (
  ctx: HttpProofContext,
  route: string,
  bearer: string,
  body: unknown,
  requestId?: string,
) =>
  ctx.request(route, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      ...(requestId === undefined ? {} : { 'x-request-id': requestId }),
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
  const token = object(res.body, 'login body').access_token;
  check(
    (res.status === 200 || res.status === 201) && typeof token === 'string',
    `login answered HTTP ${res.status}`,
  );
  return token as string;
};

export const cases: WidgetsHttpProofCase[] = [
  {
    id: 'E1-T2B-CLEAN',
    gate: 'E1',
    proofClass: 'L',
    async run(ctx) {
      const tenant = await ctx.fixtures.tenant(
        'E1 clean T-2b BIN',
        CalendarSource.INTERNAL,
      );
      const user = await ctx.fixtures.user(tenant, UserRole.TENANT_OWNER);
      await ctx.fixtures.grantFeature(tenant, 'booking');
      await ctx.fixtures.grantFeature(tenant, 'ai.owner');
      await ctx.fixtures.grantFeature(tenant, 'widgets.runtime');
      const bearer = await login(ctx, tenant.slug, user.email, user.password);
      const trace = `e1-bin-${randomUUID()}`;
      const executed = await request(
        ctx,
        '/ai/tools/operations.journal.read/execute',
        bearer,
        { arguments: { date: '2026-09-24' }, surface: 'web' },
        trace,
      );
      check(
        executed.status === 200 || executed.status === 201,
        `T-2b answered HTTP ${executed.status} ${JSON.stringify(executed.body)}`,
      );
      const execution = object(executed.body, 'execution');
      const resolution = object(execution.resolution, 'resolution');
      const receipt = object(resolution.receipt, 'receipt');
      const envelope = object(receipt.envelope, 'envelope');
      check(Array.isArray(envelope.intents), 'envelope has no intents');
      const intent = object((envelope.intents as unknown[])[0], 'first intent');
      check(intent.effect === 'REFINE', 'first intent is not REFINE');
      check(
        typeof intent.intent_token === 'string',
        'first intent has no token',
      );
      const minted = ctx
        .mintProvenance()
        .find(
          (line) =>
            line.request_id === trace && line.widget_id === envelope.widget_id,
        );
      check(
        minted?.trigger === 'T-2b',
        'the record has no matching T-2b server provenance',
      );
      const body = {
        contract: 'maya.widget.intent.submission/1',
        widget_id: envelope.widget_id,
        intent_token: intent.intent_token,
        inputs: null,
        client_nonce: `e1-${randomUUID().slice(0, 8)}`,
        profile_id: 'pwa.default',
      };

      const noSession = await ctx.request('/widgets/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      check(
        noSession.status === 401,
        'an unauthenticated submission did not answer 401',
      );

      const hostile = await request(ctx, '/widgets/intent', bearer, {
        ...body,
        credentials: { bearer: 'client-controlled' },
      });
      check(
        hostile.status === 400,
        'a credential in the widget body was not refused',
      );

      const forged = await request(ctx, '/widgets/intent', bearer, {
        ...body,
        intent_token: `${String(intent.intent_token)}forged`,
      });
      check(
        object(forged.body, 'forged answer').outcome === 'expired' &&
          object(forged.body, 'forged answer').stopped_at_gate === '1',
        'a forged token did not expire at Gate 1',
      );

      const wrongWidget = await request(ctx, '/widgets/intent', bearer, {
        ...body,
        widget_id: randomUUID(),
      });
      check(
        object(wrongWidget.body, 'wrong-widget answer').outcome === 'expired' &&
          object(wrongWidget.body, 'wrong-widget answer').stopped_at_gate ===
            '1',
        'a mismatched widget id did not expire at Gate 1',
      );

      const otherUser = await ctx.fixtures.user(
        tenant,
        UserRole.TENANT_OWNER,
        'other',
      );
      const otherBearer = await login(
        ctx,
        tenant.slug,
        otherUser.email,
        otherUser.password,
      );
      const replay = await request(ctx, '/widgets/intent', otherBearer, body);
      const replayBody = object(replay.body, 'foreign-principal answer');
      check(
        replayBody.code === 'widget_principal_mismatch' &&
          replayBody.stopped_at_gate === '3',
        'another current principal was not refused at Gate 3',
      );

      const foreignTenant = await ctx.fixtures.tenant(
        'E1 foreign tenant BIN',
        CalendarSource.INTERNAL,
      );
      const foreignUser = await ctx.fixtures.user(
        foreignTenant,
        UserRole.TENANT_OWNER,
      );
      await ctx.fixtures.grantFeature(foreignTenant, 'widgets.runtime');
      const foreignBearer = await login(
        ctx,
        foreignTenant.slug,
        foreignUser.email,
        foreignUser.password,
      );
      const foreign = await request(
        ctx,
        '/widgets/intent',
        foreignBearer,
        body,
      );
      const foreignBody = object(foreign.body, 'foreign-tenant answer');
      check(
        foreignBody.outcome === 'expired' &&
          foreignBody.stopped_at_gate === '1',
        'a foreign tenant did not receive the opaque Gate-1 answer',
      );

      const submitted = await request(ctx, '/widgets/intent', bearer, body);
      const answer = object(submitted.body, 'submission answer');
      check(
        submitted.status === 200 &&
          answer.gates_run === 14 &&
          answer.stopped_at_gate === '13' &&
          answer.outcome === 'terminate' &&
          answer.receipt_outcome === 'REFUSED',
        `the production record did not traverse slots 1-12 and terminate canonically at 13: ${JSON.stringify(answer)}`,
      );
      ctx.evidence.record({
        testId: 'E1-T2B-CLEAN',
        triggerTraceId: trace,
        recordHash: minted?.intent_token_hash ?? null,
        stoppedAtGate: '13',
        gatesRun: 14,
        labels: ['[E-MINT]'],
        clauses: E1_L_CLAUSES,
        claim: 'L',
      });
    },
  },
];
