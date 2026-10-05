import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../src/common/domain.enums';
import { ClientChannelLinkService } from '../../src/crm/client-channel-link.service';
import { clientChannelSubjectHash } from '../../src/crm/client-channel-subject';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';

// Optional two-process proof: prepare -> stop/restart owned PostgreSQL -> resume.
// JEST_ variables survive the harness environment scrub. The receipt contains only
// synthetic fixture credentials; keep it outside the repository and never publish it.
const stage = process.env.JEST_B35_STAGE ?? 'all';
const receiptPath = process.env.JEST_B35_RECEIPT;
if (!['all', 'prepare', 'resume'].includes(stage))
  throw new Error('Invalid B35 proof stage');
if (stage !== 'all' && !receiptPath)
  throw new Error('B35 restart receipt required');
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Campaign = {
  campaignId: string;
  intentHash: string;
  state: string;
  recipientCount: number;
};
type Saved = {
  tenant: TenantFixture;
  owner: UserFixture;
  campaign: Campaign;
  inbox: Campaign;
  unknownClient: string;
  pendingClient: string;
  inboxUser: string;
  logicalIds: string[];
  originalAttempts: string[];
  pid: number;
  postgresStarted: string;
};

describe('B35 campaign resume [HTTP] [PostgreSQL] [provider edge only]', () => {
  let db: FixtureContext,
    http: HttpHarness,
    fx: Fixtures,
    token: string,
    saved: Saved;
  const sends = new Map<string, number>();
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    // The bridge is the only replaced business dependency. No entitlement,
    // policy, Action Engine, delivery kernel or repository method is replaced.
    http.app
      .get(ConfigService)
      .set('MAYA_INBOX_BRIDGE_TOKEN', 'b35-http-synthetic');
    http.app
      .get(ConfigService)
      .set('MAYA_PACKAGE2_TELEGRAM_EXECUTOR_URL', 'http://b35.invalid/proof');
    jest.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      if (url !== 'http://b35.invalid/proof' || typeof init?.body !== 'string')
        throw new Error('Unexpected external I/O');
      const body = JSON.parse(init.body) as {
        telegram_chat_id: string;
      };
      const address = body.telegram_chat_id;
      sends.set(address, (sends.get(address) ?? 0) + 1);
      // The provider may have sent even though the bridge response was lost.
      return Promise.resolve(
        address === '91001'
          ? new Response(JSON.stringify({ error: 'upstream_timeout' }), {
              status: 408,
            })
          : new Response(JSON.stringify({ message_id: '123' }), {
              status: 200,
            }),
      );
    });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (saved && stage !== 'prepare')
      await db.prisma.tenant.update({
        where: { id: saved.tenant.id },
        data: { status: 'cancelled' },
      });
    await http?.close();
    await db?.close();
  });
  async function post(operation: string, payload: object, bearer = token) {
    const res = await request(http.app.getHttpServer())
      .post(`/api/marketing/bulk/${operation}`)
      .set('Authorization', `Bearer ${bearer}`)
      .send(payload);
    return {
      status: res.status,
      body: res.body as Campaign & { message?: string },
    };
  }
  async function ok(operation: string, payload: object) {
    const res = await post(operation, payload);
    expect(res).toMatchObject({ status: 201 });
    return res.body;
  }
  async function postgresStarted() {
    const rows = await db.prisma.$queryRaw<
      Array<{ started: string }>
    >`SELECT pg_postmaster_start_time()::text AS started`;
    return rows[0].started;
  }
  async function recipient(
    tenant: TenantFixture,
    address: string,
    provider: 'telegram' | 'maya_user',
  ) {
    const client = await db.prisma.client.create({
      data: { tenantId: tenant.id },
    });
    await db.prisma.customerProfile.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        privacyConsentAt: new Date(),
        marketingConsentAt: new Date(),
      },
    });
    for (const kind of ['privacy', 'marketing'])
      await db.prisma.clientConsentFact.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          kind,
          decision: 'grant',
          occurredAt: new Date(),
          effectiveAt: new Date(),
          sourceType: 'client_command',
          sourceIdentityHash: hash([client.id, kind]),
        },
      });
    // A18 fixture proof setup, not an HTTP authority override. The link owner
    // still validates and seals the complete evidence and delivery address.
    const proof = `b35-isolated-${randomUUID()}`;
    const links = new ClientChannelLinkService(db.prisma, db.tenantContext, {
      verifyLink: (supplied) =>
        supplied === proof
          ? Promise.resolve({
              tenantId: tenant.id,
              clientId: client.id,
              provider,
              providerSubjectHash: clientChannelSubjectHash(
                db.encryption,
                provider,
                address,
              ),
              method: 'explicit_verified_challenge',
              verifier: 'b35-http-synthetic-fixture',
              verificationIdentityHash: hash(proof),
              channelControlProofHash: hash(['channel', proof]),
              clientAuthorityProofHash: hash(['client', proof]),
              deliveryAddressEncrypted: db.encryption.encrypt(address),
              validUntil: new Date(Date.now() + 3600000),
            })
          : Promise.reject(new Error('Invalid fixture proof')),
      verifyRevocation: () =>
        Promise.reject(new Error('Not a revocation fixture')),
    });
    await db.tenantContext.runAsSystemTenant(tenant.id, () =>
      links.link({ proof }),
    );
    return client.id;
  }
  async function attempts(campaignId: string) {
    return db.prisma.marketingDeliveryAttempt.findMany({
      where: {
        tenantId: saved.tenant.id,
        campaign: { parentRecipient: { campaignId } },
      },
      orderBy: { id: 'asc' },
    });
  }
  async function prepare() {
    const tenant = await fx.tenant('B35 HTTP restart');
    await fx.grantFeature(tenant, 'notifications.core');
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    await db.prisma.authIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        provider: 'email',
        providerUserId: owner.id,
      },
    });
    await db.prisma.marketingPolicy.create({
      data: {
        tenantId: tenant.id,
        updatedAt: new Date(),
        canonicalHistoryStartedAt: new Date(),
      },
    });
    token = await http.login(tenant.slug, owner.email, owner.password);
    const unknownClient = await recipient(tenant, '91001', 'telegram');
    const completedClient = await recipient(tenant, '91002', 'telegram');
    const pendingClient = await recipient(tenant, '91003', 'telegram');
    const identity = randomUUID();
    const payload = {
      bulkIdentity: identity,
      text: 'Synthetic restart offer',
      clientIds: [unknownClient, completedClient, pendingClient],
    };
    const campaign = await ok('preview', payload);
    expect((await ok('preview', payload)).campaignId).toBe(campaign.campaignId);
    expect(
      (await post('preview', { ...payload, text: 'Changed intent' })).status,
    ).toBe(409);
    const logical = await db.prisma.marketingCampaignRecipient.findMany({
      where: { tenantId: tenant.id, campaignId: campaign.campaignId },
    });
    // Another worker's logical lease is a real persisted scheduling obstacle.
    // Its expiry across restart must release only pending work, never UNKNOWN.
    await db.prisma.marketingCampaignRecipient.updateMany({
      where: { campaignId: campaign.campaignId, clientId: pendingClient },
      data: {
        leaseOwner: 'proof-paused-worker',
        leaseTokenHash: hash('paused'),
        revision: { increment: 1 },
        leaseExpiresAt: new Date(Date.now() + 3600000),
      },
    });
    const results = await Promise.all([
      ok('confirm', {
        campaignId: campaign.campaignId,
        intentHash: campaign.intentHash,
      }),
      ok('confirm', {
        campaignId: campaign.campaignId,
        intentHash: campaign.intentHash,
      }),
    ]);
    expect(results.some((r) => r.state === 'UNRESOLVED')).toBe(true);
    expect(sends.get('91001')).toBe(1);
    expect(sends.get('91002')).toBe(1);
    expect(sends.has('91003')).toBe(false);
    const root = await db.prisma.marketingCampaign.findUniqueOrThrow({
      where: { id: campaign.campaignId },
    });
    expect(
      await db.prisma.actionExecution.findUnique({
        where: { id: root.actionExecutionId! },
      }),
    ).toMatchObject({
      state: 'SUCCEEDED',
      capability: 'communication.bulk-campaign.admit.v2',
    });
    const user = await fx.user(tenant, UserRole.CLIENT);
    const inboxClient = await recipient(tenant, user.id, 'maya_user');
    const inbox = await ok('preview', {
      bulkIdentity: randomUUID(),
      text: 'Synthetic inbox crash',
      clientIds: [inboxClient],
    });
    saved = {
      tenant,
      owner,
      campaign,
      inbox,
      unknownClient,
      pendingClient,
      inboxUser: user.id,
      logicalIds: logical.map((r) => r.id).sort(),
      originalAttempts: [],
      pid: process.pid,
      postgresStarted: await postgresStarted(),
    };
    saved.originalAttempts = (await attempts(campaign.campaignId)).map(
      (a) => a.id,
    );
    // Fault injection in this owned proof DB: fail actual finalization AFTER the
    // real Inbox upsert commits. No kernel method is mocked. Remove before resume.
    await db.prisma.$executeRawUnsafe(
      `CREATE FUNCTION b35_proof_finalize_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tenantId" = '${tenant.id}' AND NEW."deliveryState" = 'DELIVERED' THEN RAISE EXCEPTION 'B35_PROOF_CRASH_AFTER_INBOX_COMMIT'; END IF; RETURN NEW; END $$`,
    );
    await db.prisma.$executeRawUnsafe(
      'CREATE TRIGGER b35_proof_finalize_fault BEFORE UPDATE ON "MarketingCampaignRecipient" FOR EACH ROW EXECUTE FUNCTION b35_proof_finalize_fault()',
    );
    try {
      expect(
        (
          await post('confirm', {
            campaignId: inbox.campaignId,
            intentHash: inbox.intentHash,
          })
        ).status,
      ).toBe(500);
    } finally {
      await db.prisma.$executeRawUnsafe(
        'DROP TRIGGER b35_proof_finalize_fault ON "MarketingCampaignRecipient"',
      );
      await db.prisma.$executeRawUnsafe(
        'DROP FUNCTION b35_proof_finalize_fault()',
      );
    }
    expect(
      await db.prisma.inboxItem.count({
        where: {
          tenantId: tenant.id,
          userId: user.id,
          type: 'marketing_broadcast',
        },
      }),
    ).toBe(1);
    expect(await attempts(inbox.campaignId)).toEqual([
      expect.objectContaining({
        state: 'STARTED',
        externalDispatchState: 'MAY_HAVE_CROSSED',
      }),
    ]);
    // Synthetic expired lease simulates elapsed downtime without waiting 90s.
    await db.prisma.marketingCampaignRecipient.updateMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { campaignId: campaign.campaignId, clientId: pendingClient },
          { campaign: { parentRecipient: { campaignId: inbox.campaignId } } },
        ],
      },
      data: {
        leaseExpiresAt: new Date(Date.now() - 1000),
        revision: { increment: 1 },
      },
    });
    if (receiptPath)
      writeFileSync(receiptPath, JSON.stringify(saved), { mode: 0o600 });
  }
  async function resume() {
    token = await http.login(
      saved.tenant.slug,
      saved.owner.email,
      saved.owner.password,
    );
    const before = sends.get('91001') ?? 0;
    const command = {
      campaignId: saved.campaign.campaignId,
      intentHash: saved.campaign.intentHash,
    };
    await Promise.all([ok('resume', command), ok('resume', command)]);
    expect((await ok('status', { campaignId: command.campaignId })).state).toBe(
      'UNRESOLVED',
    );
    expect(sends.get('91003')).toBe(1);
    expect(sends.get('91001') ?? 0).toBe(before);
    const rows = await db.prisma.marketingCampaignRecipient.findMany({
      where: { tenantId: saved.tenant.id, campaignId: command.campaignId },
    });
    expect(rows.map((r) => r.id).sort()).toEqual(saved.logicalIds);
    const all = await attempts(command.campaignId);
    expect(all).toHaveLength(3);
    expect(
      all.filter((a) => saved.originalAttempts.includes(a.id)),
    ).toHaveLength(2);
    const leaves = await db.prisma.marketingCampaignRecipient.findMany({
      where: {
        tenantId: saved.tenant.id,
        campaign: {
          parentRecipient: {
            campaignId: command.campaignId,
            clientId: saved.unknownClient,
          },
        },
      },
    });
    expect(leaves).toEqual([
      expect.objectContaining({
        deliveryState: 'UNKNOWN',
        reconciliationState: 'MANUAL_REQUIRED',
        attemptCount: 1,
      }),
    ]);
    const inboxCommand = {
      campaignId: saved.inbox.campaignId,
      intentHash: saved.inbox.intentHash,
    };
    await Promise.all([ok('resume', inboxCommand), ok('resume', inboxCommand)]);
    expect(
      (await ok('status', { campaignId: inboxCommand.campaignId })).state,
    ).toBe('COMPLETED');
    expect(
      await db.prisma.inboxItem.count({
        where: {
          tenantId: saved.tenant.id,
          userId: saved.inboxUser,
          type: 'marketing_broadcast',
        },
      }),
    ).toBe(1);
    expect(await attempts(inboxCommand.campaignId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'UNKNOWN', kind: 'EXECUTION' }),
        expect.objectContaining({ state: 'SUCCEEDED', kind: 'RECONCILIATION' }),
      ]),
    );
    expect(await attempts(inboxCommand.campaignId)).toHaveLength(2);
    await ok('resume', inboxCommand);
    expect(await attempts(inboxCommand.campaignId)).toHaveLength(2);
    // Refusals traverse the same HTTP authentication and canonical owner path.
    const sendCount = [...sends.values()].reduce((a, b) => a + b, 0);
    expect(
      (await post('resume', { ...command, intentHash: '0'.repeat(64) })).status,
    ).toBe(409);
    const foreign = await fx.tenant('B35 foreign owner');
    const foreignOwner = await fx.user(foreign, UserRole.TENANT_OWNER);
    await db.prisma.authIdentity.create({
      data: {
        tenantId: foreign.id,
        userId: foreignOwner.id,
        provider: 'email',
        providerUserId: foreignOwner.id,
      },
    });
    const foreignToken = await http.login(
      foreign.slug,
      foreignOwner.email,
      foreignOwner.password,
    );
    expect((await post('resume', command, foreignToken)).status).toBe(404);
    await db.prisma.tenant.update({
      where: { id: foreign.id },
      data: { status: 'cancelled' },
    });
    await db.prisma.membership.updateMany({
      where: { tenantId: saved.tenant.id, userId: saved.owner.id },
      data: { status: 'suspended' },
    });
    expect((await post('resume', command)).status).toBe(401);
    expect([...sends.values()].reduce((a, b) => a + b, 0)).toBe(sendCount);
    expect(await attempts(command.campaignId)).toHaveLength(3);
    expect(await attempts(inboxCommand.campaignId)).toHaveLength(2);
  }
  it('keeps one graph, approval and provider attempt across concurrent retry and restart; reconciles committed Inbox', async () => {
    if (stage === 'resume') {
      saved = JSON.parse(readFileSync(receiptPath!, 'utf8')) as Saved;
      expect(process.pid).not.toBe(saved.pid);
      expect(await postgresStarted()).not.toBe(saved.postgresStarted);
      await resume();
    } else {
      await prepare();
      if (stage === 'all') {
        await http.close();
        http = await bootHttp();
        http.app
          .get(ConfigService)
          .set('MAYA_INBOX_BRIDGE_TOKEN', 'b35-http-synthetic');
        http.app
          .get(ConfigService)
          .set(
            'MAYA_PACKAGE2_TELEGRAM_EXECUTOR_URL',
            'http://b35.invalid/proof',
          );
        await resume();
      }
    }
  });
});
