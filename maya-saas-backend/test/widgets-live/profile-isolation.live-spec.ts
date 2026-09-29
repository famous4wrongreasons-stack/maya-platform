import { releaseBookingProof } from './support/release-booking-proof';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { UserRole, CalendarSource } from '../../src/common/domain.enums';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { TenantResolverService } from '../../src/tenancy/tenant-resolver.service';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
import { WidgetStoresService } from '../../src/widgets/stores/widget-stores.service';
import { WidgetReleaseAccessService } from '../../src/entitlements/widget-release-access.service';
import { HandoffTargetSigner } from '../../src/widgets/routing/handoff-target.signer';
import { EffectRouterService } from '../../src/widgets/routing/effect-router.service';
import { IntentGatewayService } from '../../src/widgets/intent-gateway.service';
import { intentSubmitArgs } from '../../src/widgets/intent-submit-args';
import { WidgetThreadPageService } from '../../src/widgets/resolve/thread-page.service';
import { PROFILE_REGISTRY_DIGEST } from '../../src/entitlements/widget-release-profile.contract';
import { type ReleaseReceipt } from '../../src/entitlements/widget-release.contract';
import {
  bootFixtureContext,
  toSubmitIntentDto,
  type FixtureContext,
} from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { closedFixtureComposerInput, type Fixtures } from './support/fixtures';
import { releaseProof } from './support/widget-release-proof';
import { profileCommand } from './support/widget-profile-proof';
import { assertProofDatabase } from './support/proof-db-guard';

const bodyOf = (r: { body: unknown }) => r.body as Record<string, any>;

describe('PROFILE fixed no-handoff [HTTP] [PostgreSQL] [synthetic certificate]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const tenants: string[] = [],
    users: string[] = [];
  beforeAll(async () => {
    assertProofDatabase();
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterAll(async () => {
    await db?.prisma.auditLog.deleteMany({
      where: {
        OR: [
          { tenantId: { in: tenants } },
          { action: 'widget.release', entityId: { in: tenants } },
        ],
      },
    });
    await fx?.teardown();
    await db?.prisma.user.deleteMany({
      where: { id: { in: users }, tenantId: null },
    });
    await http?.close();
    await db?.close();
  });
  async function fixture() {
    const tenant = await fx.tenant(
      'Profile isolation synthetic',
      CalendarSource.INTERNAL,
    );
    tenants.push(tenant.id);
    const operator = await fx.user(tenant, UserRole.PLATFORM_OWNER);
    users.push(operator.id);
    await db.prisma.user.update({
      where: { id: operator.id },
      data: { tenantId: null },
    });
    const operatorLogin = await request(http.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: operator.email, password: operator.password });
    expect(operatorLogin.status).toBe(201);
    const operatorToken = bodyOf(operatorLogin).access_token as string;
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    const token = await http.login(tenant.slug, owner.email, owner.password);
    const actor = await fx.actorFromAccessToken(token);
    const principal = await fx.principalView(actor);
    // Historical full-contract mechanism fixture, before the restricted grant.
    await fx.grantFeature(tenant, 'widgets.runtime');
    await fx.grantFeature(tenant, 'ai.consultant');
    const p = releaseProof(process.env.DATABASE_URL!, operator.id);
    const cfg = http.app.get(ConfigService);
    for (const key of [
      'WIDGET_RELEASE_ENVIRONMENT',
      'WIDGET_RELEASE_CANDIDATE_SHA',
      'WIDGET_RELEASE_TRUST_JSON',
    ])
      cfg.set(key, p.config.get(key));
    const postRelease = (action: string, body: unknown) =>
      request(http.app.getHttpServer())
        .post(`/api/platform/widget-release/${tenant.id}/${action}`)
        .set('Authorization', 'Bearer ' + operatorToken)
        .send(body as object);
    const status = async () =>
      bodyOf(
        await request(http.app.getHttpServer())
          .get(`/api/platform/widget-release/${tenant.id}/status`)
          .set('Authorization', 'Bearer ' + operatorToken),
      );
    const scoped = <T>(work: () => Promise<T>) =>
      http.app
        .get(TenantContextService)
        .run('profile-proof-' + randomUUID(), () => {
          http.app.get(TenantResolverService).bindAuthenticatedUser(actor);
          return work();
        });
    const emitter = http.app.get(WidgetEmitterService);
    const stores = http.app.get(WidgetStoresService);
    const mint = async (handoff = false, mixed = false) =>
      scoped(async () => {
        const conversationId = randomUUID();
        const turn = await stores.appendTurn({
          tenantId: tenant.id,
          conversationId,
          turnIndex: 0,
          role: 'assistant',
          principalProofHash: principal.proofHash,
          channel: 'pwa',
        });
        const input = closedFixtureComposerInput({
          kind: 'SCHEDULE',
          turnId: turn.id,
          executionId: conversationId,
        });
        const kind = handoff
          ? ('SETTINGS_DRAFT' as const)
          : ('SCHEDULE' as const);
        return emitter.emit({
          tenantId: tenant.id,
          conversationId,
          turnId: turn.id,
          kind,
          principal,
          principalProofHash: principal.proofHash,
          deliveryChannel: 'pwa',
          body: {},
          ttlSeconds: 600,
          freshnessClass: 'live',
          composerInput: {
            ...input,
            kind_proposal: kind,
            capability: handoff ? 'settings.read' : 'staff.schedule.read',
            intent_proposals: [
              ...(handoff
                ? [
                    ...(mixed
                      ? [
                          {
                            intent_template_key: 'navigate.account@1',
                            role: 'remedy' as const,
                          },
                        ]
                      : []),
                    {
                      intent_template_key: 'handoff.settings@1',
                      handoff_capability_ref: {
                        space: 'C9' as const,
                        key: 'settings.read',
                      },
                      role: 'handoff' as const,
                    },
                  ]
                : [
                    {
                      intent_template_key: 'navigate.schedule@1',
                      role: 'primary' as const,
                    },
                  ]),
              {
                intent_template_key: 'control.dismiss@1',
                capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
                role: 'escape',
              },
            ],
          },
        });
      });
    const grant = async () => {
      const c = profileCommand(
        p,
        tenant.id,
        (await status()).version as string,
      );
      const result = await postRelease('grant', c);
      expect(result.status).toBe(201);
      return { command: c, receipt: bodyOf(result).receipt as ReleaseReceipt };
    };
    const revoke = async (command: ReturnType<typeof profileCommand>) => {
      const result = await postRelease('revoke', {
        authorization: p.signOwner({
          ...command.authorization.payload,
          authorizationId: randomUUID(),
          operation: 'revoke',
          grantExpiresAt: null,
          expectedVersion: (await status()).version as string,
        }),
      });
      expect(result.status).toBe(201);
      return result;
    };
    return {
      tenant,
      p,
      token,
      actor,
      principal,
      scoped,
      mint,
      grant,
      revoke,
      status,
      postRelease,
      operatorToken,
    };
  }
  const submission = (
    env: Awaited<ReturnType<WidgetEmitterService['emit']>>,
    index = 0,
  ) => ({
    contract: 'maya.widget.intent.submission/1',
    widget_id: env.widgetId,
    intent_token: env.intentTokens[index],
    inputs: null,
    client_nonce: randomUUID(),
    profile_id: 'pwa.default',
  });

  it('PROFILE-INGRESS refuses an old HANDOFF at HTTP/typed/internal ingress and direct dispatch, with zero signer, turn, consumption or owner effect', async () => {
    const f = await fixture();
    const old = await f.mint(true);
    const before = await db.prisma.widgetIntentRecord.findFirstOrThrow({
      where: { tenantId: f.tenant.id, widgetId: old.widgetId },
    });
    const snapshot = await db.prisma.widgetRenderReceipt.findMany({
      where: { tenantId: f.tenant.id, widgetId: old.widgetId },
    });
    await f.grant();
    expect(await f.status()).toMatchObject({
      enabled: true,
      scope: 'closed-input.no-handoff@1',
      certification: 'CERTIFIED_FOR_PROFILE',
      fullContractCertified: false,
    });
    const signer = jest.spyOn(http.app.get(HandoffTargetSigner), 'sign');
    const body = submission(old);
    const result = await http.postIntent(f.token, body);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      outcome: 'refuse',
      code: 'insufficient_authority',
      stopped_at_gate: '6',
    });
    const typed = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', 'Bearer ' + f.token)
      .send({
        surface: 'web',
        requestId: randomUUID(),
        messages: [{ role: 'user', content: 'Open settings' }],
      });
    expect(typed.status).toBe(201);
    expect(bodyOf(typed).action).toMatchObject({
      status: 'refuse',
      code: 'insufficient_authority',
      stopped_at_gate: '6',
    });
    const dto = await toSubmitIntentDto(body);
    expect(
      await f.scoped(() =>
        http.app
          .get(IntentGatewayService)
          .submit(intentSubmitArgs(dto, f.actor)),
      ),
    ).toMatchObject({ stoppedAt: '6', verdict: { outcome: 'refuse' } });
    expect(
      await f.scoped(() =>
        http.app.get(EffectRouterService).route(
          {
            tenantId: f.tenant.id,
            record: before,
            principal: f.principal,
            carrier: 'pwa',
            now: new Date(),
            actor: f.actor,
            facts: {},
          } as never,
          undefined,
        ),
      ),
    ).toMatchObject({ outcome: 'refuse', code: 'insufficient_authority' });
    expect(signer).not.toHaveBeenCalled();
    signer.mockRestore();
    expect(
      await db.prisma.widgetTimelineTurn.count({
        where: { tenantId: f.tenant.id, role: 'user' },
      }),
    ).toBe(0);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(0);
    expect(
      await db.prisma.widgetIntentRecord.findUnique({
        where: { id: before.id },
      }),
    ).toEqual(before);
    expect(
      await db.prisma.widgetRenderReceipt.findMany({
        where: { tenantId: f.tenant.id, widgetId: old.widgetId },
      }),
    ).toEqual(snapshot);
  });

  it('PROFILE-EGRESS refuses new/mixed HANDOFF mint and suppresses every old mixed control from resolve without rewriting history', async () => {
    const f = await fixture();
    const old = await f.mint(true, true);
    await f.grant();
    const before = await db.prisma.widgetEmission.count({
      where: { tenantId: f.tenant.id },
    });
    await expect(f.mint(true)).rejects.toThrow('profile_unavailable');
    await expect(f.mint(true, true)).rejects.toThrow('profile_unavailable');
    expect(
      await db.prisma.widgetEmission.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(before);
    expect(
      bodyOf(await http.resolveWidgets(f.token, { thread_page: { limit: 20 } }))
        .widgets,
    ).toEqual([]);
    expect(
      await f.scoped(() =>
        http.app.get(WidgetThreadPageService).resolveForNavigate({
          tenantId: f.tenant.id,
          widgetId: old.widgetId,
          principalProofHash: f.principal.proofHash,
        }),
      ),
    ).toBeNull();
    const stored = await db.prisma.widgetRenderReceipt.findFirstOrThrow({
      where: { tenantId: f.tenant.id, widgetId: old.widgetId },
    });
    expect(stored.emittedEnvelopeJson).toEqual(old.envelope);
  });

  it('PROFILE-GRANT passes allowed navigation through scope admission, rejects old grants, and rolls back a failed binding', async () => {
    const f = await fixture();
    const g = await f.grant();
    const old = await f.mint();
    const result = await http.postIntent(f.token, submission(old));
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      outcome: 'refuse',
      receipt_outcome: null,
      code: 'effect_not_admissible',
      stopped_at_gate: '13',
    });
    await f.revoke(g.command);
    expect((await http.postIntent(f.token, submission(old))).status).toBe(403);
    await f.grant();
    expect(
      (await http.postIntent(f.token, submission(old))).body,
    ).toMatchObject({
      outcome: 'refuse',
      code: 'insufficient_authority',
      stopped_at_gate: '6',
    });
    const fresh = await f.mint();
    expect(
      (await http.postIntent(f.token, submission(fresh))).body,
    ).toMatchObject({
      outcome: 'refuse',
      code: 'effect_not_admissible',
      stopped_at_gate: '13',
    });
    const access = http.app.get(WidgetReleaseAccessService);
    const before = await db.prisma.widgetEmission.count({
      where: { tenantId: f.tenant.id },
    });
    const spy = jest
      .spyOn(access, 'bindMint')
      .mockRejectedValueOnce(new Error('synthetic atomic failure'));
    await expect(f.mint()).rejects.toThrow('synthetic atomic failure');
    spy.mockRestore();
    expect(
      await db.prisma.widgetEmission.count({
        where: { tenantId: f.tenant.id },
      }),
    ).toBe(before);
  });

  it('PROFILE-LOCK serializes concurrent revoke with an in-flight profile admission under the existing AR-1 lock', async () => {
    const f = await fixture();
    const g = await f.grant();
    const old = await f.mint();
    const record = await db.prisma.widgetIntentRecord.findFirstOrThrow({
      where: { tenantId: f.tenant.id, widgetId: old.widgetId },
    });
    let unlock!: () => void;
    const barrier = new Promise<void>((r) => {
      unlock = r;
    });
    let entered!: () => void;
    const locked = new Promise<void>((r) => {
      entered = r;
    });
    const access = http.app.get(WidgetReleaseAccessService);
    const admission = db.prisma.$transaction(async (tx) => {
      expect(
        await access.admits(f.tenant.id, record, PROFILE_REGISTRY_DIGEST, tx),
      ).toBe(true);
      entered();
      await barrier;
    });
    const admitted = admission.then(
      () => undefined,
      (error) => {
        entered();
        throw error;
      },
    );
    // Do not leave an unhandled rejection or pending latch under adversarial mutants.
    void admitted.catch(() => undefined);
    let revocation: Promise<unknown> | undefined;
    try {
      await locked;
      let revoked = false;
      revocation = f.revoke(g.command).then(() => {
        revoked = true;
      });
      const deadline = Date.now() + 8000;
      let waiting = false;
      while (Date.now() < deadline) {
        const waits = await db.prisma.$queryRaw<
          Array<{ n: bigint }>
        >`SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
        if (waits[0].n > 0n) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      expect(revoked).toBe(false);
    } finally {
      unlock();
      await Promise.allSettled([admitted, revocation]);
    }
    // Cleanup must not replace an assertion failure. On success, still propagate worker errors.
    await admitted;
    await revocation;
    expect(
      await db.prisma.$transaction((tx) =>
        access.admits(f.tenant.id, record, PROFILE_REGISTRY_DIGEST, tx),
      ),
    ).toBe(false);
  });
  it('PROFILE-BOOKING admits the actual HTTP catalog → selectors → DRAFT → COMMIT source under a signed restricted grant', async () => {
    const f = await fixture();
    const base = await http.listenLoopback();
    const proofs = await releaseBookingProof(
      {
        apiBase: base,
        fixtures: fx.binView(),
        mintProvenance: () => http.mintProvenance(),
        request: async (route, init) => {
          const r = await fetch(`${base}/api${route}`, init);
          return { status: r.status, body: (await r.json()) as unknown };
        },
        evidence: {
          enabled: false,
          record: () => {
            throw new Error(
              'synthetic profile proof, not a release attestation',
            );
          },
        },
      },
      undefined,
      async (tenant) => {
        tenants.push(tenant.id);
        const c = profileCommand(f.p, tenant.id);
        const response = await request(http.app.getHttpServer())
          .post(`/api/platform/widget-release/${tenant.id}/grant`)
          .set('Authorization', 'Bearer ' + f.operatorToken)
          .send(c);
        expect(response.status).toBe(201);
      },
    );
    expect(proofs).toHaveLength(7);
  });
});
