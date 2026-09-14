import { readFileSync, writeFileSync } from 'node:fs';
/** Real PostgreSQL + canonical runtime. Synthetic fixture identities; no provider I/O. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import {
  randomUUID,
  createHash,
  createHmac,
  createECDH,
  randomBytes,
} from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { ClientWebPushService } from '../src/crm/client-web-push.service';
import { clientChannelSubjectHash } from '../src/crm/client-channel-subject';
import {
  ActionEngineKernel,
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
  ActionCapabilityRegistry,
} from '../src/action-engine';
import { CanonicalActionPolicyResolver } from '../src/action-engine/action-engine.policy-resolver';
import { createCanonicalProductionPolicyRegistry } from '../src/action-engine/action-engine.policy-registry';
import {
  type EntitlementsService,
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
} from '../src/entitlements/entitlements.service';
import { CommunicationBulkPolicyService } from '../src/communication-delivery/communication-bulk-policy.service';
import { CommunicationBulkDeliveryService } from '../src/communication-delivery/communication-bulk-delivery.service';
import { CommunicationWebPushTransport } from '../src/communication-delivery/communication-web-push.transport';
import { CanonicalBulkService } from '../src/marketing/canonical-bulk.service';
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55505');
assert.equal(url.pathname, '/maya_b35_runtime');
const secret = 'b35-runtime-fixture-secret-not-production';
const config = new ConfigService({
  DATABASE_URL: url.toString(),
  CRM_ENCRYPTION_KEY: secret,
  JWT_SECRET: secret,
  MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN: secret,
  MAYA_INBOX_BRIDGE_TOKEN: secret,
  MAYA_PACKAGE2_TELEGRAM_EXECUTOR_URL: 'http://b35.invalid/synthetic',
});
const db = new PrismaService(config),
  ctx = new TenantContextService(),
  encryption = new EncryptionService(config);
const channels = new ClientChannelAuthenticatorService(config, ctx, encryption);
const endpoints = new ClientWebPushService(db, ctx, channels, encryption);
const caps = new ActionCapabilityRegistry();
const entitlements: Pick<EntitlementsService, 'resolveFeatureRequirements'> = {
  resolveFeatureRequirements: (tenantId, features) =>
    Promise.resolve({
      contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
      tenantId,
      planId: null,
      requiredFeatures: features.map((featureKey) => ({
        featureKey,
        enabled: true,
      })),
      allowed: true,
      evaluatedAt: new Date(),
      validUntil: new Date('2099-01-01T00:00:00Z'),
    }),
};
const resolver = new CanonicalActionPolicyResolver(
  db,
  entitlements,
  { attestationSecret: secret },
  createCanonicalProductionPolicyRegistry(caps),
  caps,
);
const engine = new ActionEngineKernel(
  db,
  { identitySecret: secret, payloadEncryptionSecret: secret },
  caps,
  resolver,
);
const ingress = new CanonicalActionIngressService(engine, resolver),
  runtime = new ActionEngineRuntimeService(engine, ingress);
const policy = new CommunicationBulkPolicyService(
  db,
  ctx,
  encryption,
  endpoints,
  entitlements as EntitlementsService,
  config,
);
const transport = new CommunicationWebPushTransport(config);
let providerCalls = 0;
const outcomes = new Map<string, number>();
const calls = new Map<string, number>();
globalThis.fetch = (_url, init) => {
  assert.equal(typeof init?.body, 'string');
  const request = JSON.parse(init!.body as string) as {
    telegram_chat_id: string;
  };
  providerCalls++;
  calls.set(
    request.telegram_chat_id,
    (calls.get(request.telegram_chat_id) ?? 0) + 1,
  );
  return Promise.resolve(
    new Response(JSON.stringify({ message_id: 'synthetic-provider-ref' }), {
      status: outcomes.get(request.telegram_chat_id) ?? 200,
    }),
  );
};
const delivery = new CommunicationBulkDeliveryService(
  db,
  ingress,
  runtime,
  policy,
  encryption,
  endpoints,
  transport,
  config,
);
const bulk = new CanonicalBulkService(
  db,
  ctx,
  channels,
  encryption,
  policy,
  ingress,
  engine,
  runtime,
  delivery,
);
const h = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const checks: string[] = [];
async function main() {
  if (process.argv[2] === '--after-restart') {
    const saved = JSON.parse(readFileSync(process.argv[3], 'utf8')) as {
      tenantId: string;
      proof: string;
      campaignId: string;
      intentHash: string;
      unknownClientId: string;
      pendingClientId: string;
    };
    await ctx.runAsPublicTenant(saved.tenantId, async () => {
      const before = await db.marketingDeliveryAttempt.count({
        where: {
          tenantId: saved.tenantId,
          campaign: { parentRecipient: { clientId: saved.unknownClientId } },
        },
      });
      const result = await bulk.resume(saved.proof, {
        campaignId: saved.campaignId,
        intentHash: saved.intentHash,
      });
      assert.equal(result.state, 'UNRESOLVED');
      assert.equal(providerCalls, 1);
      assert.equal(calls.get('10011'), 1);
      assert.equal(calls.get('10010'), undefined);
      assert.equal(
        await db.marketingDeliveryAttempt.count({
          where: {
            tenantId: saved.tenantId,
            campaign: { parentRecipient: { clientId: saved.unknownClientId } },
          },
        }),
        before,
      );
      await bulk.resume(saved.proof, {
        campaignId: saved.campaignId,
        intentHash: saved.intentHash,
      });
      assert.equal(providerCalls, 1);
    });
    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          checks: [
            'actual restart resumes original pending sibling',
            'original UNKNOWN never resent',
            'same approved graph and exact terminal outcomes',
          ],
          productionMessages: 0,
        },
        null,
        2,
      ),
    );
    return;
  }

  const tenant = await db.tenant.create({
    data: {
      name: 'B35 synthetic runtime',
      slug: randomUUID(),
      status: 'active',
    },
  });
  const owner = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: randomUUID() + '@example.invalid',
      passwordHash: 'synthetic',
      role: 'tenant_owner',
    },
  });
  await db.membership.create({
    data: { tenantId: tenant.id, userId: owner.id, role: 'tenant_owner' },
  });
  await db.authIdentity.create({
    data: {
      tenantId: tenant.id,
      userId: owner.id,
      provider: 'email',
      providerUserId: owner.id,
    },
  });
  const session = await db.authSession.create({
    data: {
      tenantId: tenant.id,
      userId: owner.id,
      deviceLabel: 'synthetic',
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const proof = JSON.stringify({
    type: 'maya_jwt',
    credential: new JwtService().sign(
      { user_id: owner.id, tenant_id: tenant.id, session_id: session.id },
      { secret, expiresIn: '1h' },
    ),
  });
  await db.marketingPolicy.create({
    data: {
      tenantId: tenant.id,
      updatedAt: new Date(),
      canonicalHistoryStartedAt: new Date(),
    },
  });
  const client = await db.client.create({ data: { tenantId: tenant.id } });
  await db.customerProfile.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      privacyConsentAt: new Date(),
      marketingConsentAt: new Date(),
    },
  });
  for (const kind of ['privacy', 'marketing'])
    await db.clientConsentFact.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        kind,
        decision: 'grant',
        occurredAt: new Date(),
        effectiveAt: new Date(),
        sourceType: 'client_command',
        sourceIdentityHash: h([client.id, kind]),
      },
    });
  const evidence = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'b35.runtime.fixture',
    channelControlProofHash: h('control'),
    clientAuthorityProofHash: h('authority'),
    verificationIdentityHash: h(client.id),
    tenantId: tenant.id,
    provider: 'telegram',
    providerSubjectHash: clientChannelSubjectHash(
      encryption,
      'telegram',
      '10001',
    ),
    clientId: client.id,
  };
  await db.clientChannelLink.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      provider: 'telegram',
      providerSubjectHash: evidence.providerSubjectHash,
      verificationMethod: 'explicit_verified_challenge',
      verificationIdentityHash: evidence.verificationIdentityHash,
      verificationEvidenceJson: evidence,
      verificationEvidenceHash: h(evidence),
    },
  });
  // Existing verified delivery-address authority must seal the endpoint; no guessed binding.
  const link = await db.clientChannelLink.findFirstOrThrow({
    where: { tenantId: tenant.id, clientId: client.id },
  });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('maya.client_channel_delivery_subject_hash',${link.providerSubjectHash},true)`;
    await tx.clientChannelLink.update({
      where: { id: link.id },
      data: { deliveryAddressEncrypted: encryption.encrypt('10001') },
    });
  });
  await ctx.runAsPublicTenant(tenant.id, async () => {
    const key = randomUUID();
    const preview = await bulk.preview(proof, {
      bulkIdentity: key,
      text: 'Synthetic offer',
      clientIds: [client.id, client.id],
    });
    assert.equal(preview.recipientCount, 1);
    checks.push('canonical Client deduplication');
    const repeat = await bulk.preview(proof, {
      bulkIdentity: key,
      text: 'Synthetic offer',
      clientIds: [client.id],
    });
    assert.equal(repeat.campaignId, preview.campaignId);
    await assert.rejects(
      bulk.preview(proof, {
        bulkIdentity: key,
        text: 'Changed offer',
        clientIds: [client.id],
      }),
      /IDEMPOTENCY_CONFLICT/,
    );
    checks.push('same identity immutable content');
    await assert.rejects(
      bulk.preview(proof, {
        bulkIdentity: key,
        text: 'Synthetic offer',
        clientIds: [],
      }),
      /IDEMPOTENCY_CONFLICT/,
    );
    checks.push(
      'same identity changed audience conflicts before a second admission',
    );
    const result = await bulk.confirm(proof, {
      campaignId: preview.campaignId,
      intentHash: preview.intentHash,
    });
    assert.equal(result.state, 'COMPLETED');
    assert.equal(providerCalls, 1);
    checks.push(
      'User-free verified Client via canonical approval, AE admission and delivery',
    );
    const again = await bulk.resume(proof, {
      campaignId: preview.campaignId,
      intentHash: preview.intentHash,
    });
    assert.equal(again.state, 'COMPLETED');
    assert.equal(providerCalls, 1);
    checks.push('repeat skips terminal delivery');
    await assert.rejects(
      bulk.preview('invalid-proof', {
        bulkIdentity: randomUUID(),
        text: 'Synthetic',
      }),
    );
    const foreign = await db.tenant.create({
      data: { name: 'B35 foreign synthetic', slug: randomUUID() },
    });
    const foreignClient = await db.client.create({
      data: { tenantId: foreign.id },
    });
    await assert.rejects(
      bulk.preview(proof, {
        bulkIdentity: randomUUID(),
        text: 'Synthetic',
        clientIds: [foreignClient.id],
      }),
      /B35_AUDIENCE_CLIENT_CONTEXT_INVALID/,
    );
    checks.push(
      'unauthorized and foreign Client rejected before business admission',
    );
    async function recipient(
      address: string | null,
      settings: Record<string, string | number | boolean | null> = {},
      addressMaterial = true,
    ) {
      const client = await db.client.create({ data: { tenantId: tenant.id } });
      await db.customerProfile.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          privacyConsentAt: new Date(),
          marketingConsentAt: new Date(),
          ...(Object.keys(settings).length
            ? {
                notificationPreferencesJson: {
                  version: 1,
                  overrides: settings,
                },
              }
            : {}),
        },
      });
      for (const kind of ['privacy', 'marketing'])
        await db.clientConsentFact.create({
          data: {
            tenantId: tenant.id,
            clientId: client.id,
            kind,
            decision: 'grant',
            occurredAt: new Date(),
            effectiveAt: new Date(),
            sourceType: 'client_command',
            sourceIdentityHash: h([client.id, kind]),
          },
        });
      if (address) {
        const evidence = {
          contract: 'a18.client-channel-verification.v1',
          verifier: 'b35.runtime.fixture',
          channelControlProofHash: h(['control', client.id]),
          clientAuthorityProofHash: h(['authority', client.id]),
          verificationIdentityHash: h(client.id),
          tenantId: tenant.id,
          provider: 'telegram',
          providerSubjectHash: clientChannelSubjectHash(
            encryption,
            'telegram',
            address,
          ),
          clientId: client.id,
        };
        const link = await db.clientChannelLink.create({
          data: {
            tenantId: tenant.id,
            clientId: client.id,
            provider: 'telegram',
            providerSubjectHash: evidence.providerSubjectHash,
            verificationMethod: 'explicit_verified_challenge',
            verificationIdentityHash: evidence.verificationIdentityHash,
            verificationEvidenceJson: evidence,
            verificationEvidenceHash: h(evidence),
          },
        });
        if (addressMaterial)
          await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('maya.client_channel_delivery_subject_hash',${link.providerSubjectHash},true)`;
            await tx.clientChannelLink.update({
              where: { id: link.id },
              data: { deliveryAddressEncrypted: encryption.encrypt(address) },
            });
          });
      }
      return client;
    }
    const denied = await recipient('10002', { marketing: false }),
      noEndpoint = await recipient(null),
      frequency = await recipient('10003', { marketing_freq: 'week' });
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone: tenant.defaultTimezone,
      }).format(new Date()),
    );
    const quiet = await recipient('10004', {
      quiet_from: hour,
      quiet_to: (hour + 1) % 24,
    });
    const pDenied = await bulk.preview(proof, {
      bulkIdentity: randomUUID(),
      text: 'Suppressed',
      clientIds: [denied.id, noEndpoint.id, frequency.id, quiet.id],
    });
    const rDenied = await bulk.confirm(proof, {
      campaignId: pDenied.campaignId,
      intentHash: pDenied.intentHash,
    });
    assert.equal(rDenied.state, 'SKIPPED');
    assert.equal(providerCalls, 1);
    assert.equal(
      await db.marketingDeliveryAttempt.count({
        where: {
          tenantId: tenant.id,
          campaign: { parentRecipient: { campaignId: pDenied.campaignId } },
        },
      }),
      0,
    );
    checks.push(
      'preference/no endpoint/frequency history/quiet-hour denials produce no provider attempts',
    );
    const unknown = await recipient('10005'),
      pending = await recipient('10006');
    outcomes.set('10005', 503);
    const pMixed = await bulk.preview(proof, {
      bulkIdentity: randomUUID(),
      text: 'Partial synthetic',
      clientIds: [unknown.id, pending.id],
    });
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        bulk.confirm(proof, {
          campaignId: pMixed.campaignId,
          intentHash: pMixed.intentHash,
        }),
      ),
    );
    assert(concurrent.some((r) => r.state === 'UNRESOLVED'));
    assert.equal(calls.get('10005'), 1);
    assert.equal(calls.get('10006'), 1);
    const oldAttempts = await db.marketingDeliveryAttempt.count({
      where: { tenantId: tenant.id },
    });
    await bulk.resume(proof, {
      campaignId: pMixed.campaignId,
      intentHash: pMixed.intentHash,
    });
    assert.equal(
      await db.marketingDeliveryAttempt.count({
        where: { tenantId: tenant.id },
      }),
      oldAttempts,
    );
    checks.push(
      'concurrent confirmation converges; UNKNOWN preserves one attempt and independent sibling succeeds',
    );
    const reject = await recipient('10007');
    outcomes.set('10007', 403);
    const pFail = await bulk.preview(proof, {
      bulkIdentity: randomUUID(),
      text: 'Deterministic synthetic',
      clientIds: [reject.id],
    });
    const rFail = await bulk.confirm(proof, {
      campaignId: pFail.campaignId,
      intentHash: pFail.intentHash,
    });
    assert.equal(rFail.state, 'FAILED');
    await bulk.resume(proof, {
      campaignId: pFail.campaignId,
      intentHash: pFail.intentHash,
    });
    assert.equal(calls.get('10007'), 1);
    checks.push(
      'deterministic provider failure is terminal, no automatic resend or fallback',
    );
    const revoked = await recipient('10008');
    const pRevoke = await bulk.preview(proof, {
      bulkIdentity: randomUUID(),
      text: 'Withdraw before boundary',
      clientIds: [revoked.id],
    });
    const boundary = delivery.kernel.markBulkDispatchBoundary.bind(
      delivery.kernel,
    );
    delivery.kernel.markBulkDispatchBoundary = async (...args) => {
      await db.$transaction(async (tx) => {
        await tx.clientConsentFact.create({
          data: {
            tenantId: tenant.id,
            clientId: revoked.id,
            kind: 'marketing',
            decision: 'revoke',
            occurredAt: new Date(),
            effectiveAt: new Date(),
            sourceType: 'client_command',
            sourceIdentityHash: h([revoked.id, 'withdraw']),
          },
        });
        await tx.customerProfile.update({
          where: {
            tenantId_clientId: { tenantId: tenant.id, clientId: revoked.id },
          },
          data: { marketingConsentAt: null },
        });
      });
      return boundary(...args);
    };
    const rRevoke = await bulk.confirm(proof, {
      campaignId: pRevoke.campaignId,
      intentHash: pRevoke.intentHash,
    });
    assert.equal(rRevoke.state, 'SKIPPED');
    assert.equal(calls.get('10008'), undefined);
    delivery.kernel.markBulkDispatchBoundary = boundary;
    checks.push(
      'consent withdrawal after approval/claim but before durable boundary prevents effect',
    );
    const next = await bulk.preview(proof, {
      bulkIdentity: randomUUID(),
      text: 'Cannot bypass unknown',
      clientIds: [unknown.id],
    });
    const nextResult = await bulk.confirm(proof, {
      campaignId: next.campaignId,
      intentHash: next.intentHash,
    });
    assert.equal(nextResult.state, 'SKIPPED');
    assert.equal(calls.get('10005'), 1);
    checks.push(
      'different campaign cannot bypass unresolved Client provider operation',
    );
    const inboxClient = await recipient(null);
    const account = await db.user.create({
      data: {
        tenantId: tenant.id,
        email: randomUUID() + '@example.invalid',
        passwordHash: 'synthetic',
        role: 'client',
      },
    });
    await db.membership.create({
      data: { tenantId: tenant.id, userId: account.id, role: 'client' },
    });
    const inboxEvidence = {
      contract: 'a18.client-channel-verification.v1',
      verifier: 'b35.runtime.fixture',
      channelControlProofHash: h(['control', account.id]),
      clientAuthorityProofHash: h(['authority', inboxClient.id]),
      verificationIdentityHash: h(inboxClient.id),
      tenantId: tenant.id,
      provider: 'maya_user',
      providerSubjectHash: clientChannelSubjectHash(
        encryption,
        'maya_user',
        account.id,
      ),
      clientId: inboxClient.id,
    };
    const inboxLink = await db.clientChannelLink.create({
      data: {
        tenantId: tenant.id,
        clientId: inboxClient.id,
        provider: 'maya_user',
        providerSubjectHash: inboxEvidence.providerSubjectHash,
        verificationMethod: 'explicit_verified_challenge',
        verificationIdentityHash: inboxEvidence.verificationIdentityHash,
        verificationEvidenceJson: inboxEvidence,
        verificationEvidenceHash: h(inboxEvidence),
      },
    });
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('maya.client_channel_delivery_subject_hash',${inboxLink.providerSubjectHash},true)`;
      await tx.clientChannelLink.update({
        where: { id: inboxLink.id },
        data: { deliveryAddressEncrypted: encryption.encrypt(account.id) },
      });
    });
    const pInbox = await bulk.preview(proof, {
      bulkIdentity: randomUUID(),
      text: 'Hello, {name}',
      clientIds: [inboxClient.id],
    });
    const frozenInboxChild =
      await db.marketingCampaignRecipient.findFirstOrThrow({
        where: { campaignId: pInbox.campaignId, tenantId: tenant.id },
      });
    assert.equal(
      (
        JSON.parse(encryption.decrypt(frozenInboxChild.contentEncrypted!)) as {
          body: string;
        }
      ).body,
      'Hello, друг',
    );
    await db.user.update({
      where: { id: account.id },
      data: { encryptedName: encryption.encrypt('Changed Synthetic Name') },
    });
    const finalize = delivery.kernel.finalizeDelivered.bind(delivery.kernel);
    delivery.kernel.finalizeDelivered = () =>
      Promise.reject(new Error('synthetic_crash_after_inbox_commit'));
    await assert.rejects(
      bulk.confirm(proof, {
        campaignId: pInbox.campaignId,
        intentHash: pInbox.intentHash,
      }),
      /synthetic_crash/,
    );
    delivery.kernel.finalizeDelivered = finalize;
    assert.equal(
      await db.inboxItem.count({
        where: {
          tenantId: tenant.id,
          userId: account.id,
          type: 'marketing_broadcast',
        },
      }),
      1,
    );
    const inboxLeaf = await db.marketingCampaignRecipient.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        campaign: { parentRecipient: { campaignId: pInbox.campaignId } },
      },
    });
    await db.marketingCampaignRecipient.update({
      where: { id: inboxLeaf.id },
      data: {
        leaseExpiresAt: new Date(Date.now() - 1000),
        revision: { increment: 1 },
      },
    });
    await bulk.resume(proof, {
      campaignId: pInbox.campaignId,
      intentHash: pInbox.intentHash,
    });
    const inboxResult = await bulk.resume(proof, {
      campaignId: pInbox.campaignId,
      intentHash: pInbox.intentHash,
    });
    assert.equal(inboxResult.state, 'COMPLETED');
    assert.equal(
      await db.inboxItem.count({
        where: {
          tenantId: tenant.id,
          userId: account.id,
          type: 'marketing_broadcast',
        },
      }),
      1,
    );
    checks.push(
      'Inbox commit/crash recovers through original attempt reconciliation without another Inbox write',
    );
    const laterInbox = await bulk.preview(proof, {
      bulkIdentity: randomUUID(),
      text: 'Separate approved contact',
      clientIds: [inboxClient.id],
    });
    assert.equal(
      (
        await bulk.confirm(proof, {
          campaignId: laterInbox.campaignId,
          intentHash: laterInbox.intentHash,
        })
      ).state,
      'COMPLETED',
    );
    checks.push('resolved UNKNOWN releases its lane; no implicit weekly cap');
    const wpClient = await recipient('10009', {}, false);
    const authDate = Math.floor(Date.now() / 1000),
      widget = { id: '10009', auth_date: authDate };
    const widgetHash = createHmac(
      'sha256',
      createHash('sha256').update(secret).digest(),
    )
      .update(`auth_date=${authDate}\nid=10009`)
      .digest('hex');
    const wpProof = JSON.stringify({
      type: 'telegram_widget',
      credential: JSON.stringify({ ...widget, hash: widgetHash }),
    });
    const keypair = createECDH('prime256v1');
    keypair.generateKeys();
    const subscription = (i: number) => ({
      endpoint: `https://fcm.googleapis.com/b35-synthetic/${wpClient.id}/${i}`,
      keys: {
        p256dh: keypair.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    });
    for (let i = 0; i < 5; i++)
      await endpoints.register(wpProof, { subscription: subscription(i) });
    await assert.rejects(
      endpoints.register(wpProof, { subscription: subscription(5) }),
      /CLIENT_WEB_PUSH_LIMIT_EXCEEDED/,
    );
    let wpCalls = 0;
    transport.ready = () => true;
    transport.send = () => {
      wpCalls++;
      return Promise.resolve(
        wpCalls === 1
          ? 'UNKNOWN'
          : wpCalls === 2
            ? 'PERMANENT_ENDPOINT_INVALID'
            : 'SUCCEEDED',
      );
    };
    const pWeb = await bulk.preview(proof, {
      bulkIdentity: randomUUID(),
      text: 'User-free Web Push synthetic',
      clientIds: [wpClient.id],
    });
    const webResult = await bulk.confirm(proof, {
      campaignId: pWeb.campaignId,
      intentHash: pWeb.intentHash,
    });
    assert.equal(webResult.state, 'UNRESOLVED');
    assert.equal(wpCalls, 5);
    assert.equal(
      await db.clientWebPushEndpoint.count({
        where: {
          tenantId: tenant.id,
          clientId: wpClient.id,
          endReason: 'PERMANENT_ENDPOINT_INVALID',
        },
      }),
      1,
    );
    await bulk.resume(proof, {
      campaignId: pWeb.campaignId,
      intentHash: pWeb.intentHash,
    });
    assert.equal(wpCalls, 5);
    assert.equal(
      await db.marketingCampaignRecipient.count({
        where: { tenantId: tenant.id, campaignId: pWeb.campaignId },
      }),
      1,
    );
    checks.push(
      'User-free Web Push-only, five devices/one logical Client; UNKNOWN device does not block pending devices; no sixth endpoint or resend',
    );
    // Leave one UNKNOWN and one admitted but unstarted sibling for an actual process/PG restart.
    const restartUnknown = await recipient('10010'),
      restartPending = await recipient('10011');
    outcomes.set('10010', 503);
    const pRestart = await bulk.preview(proof, {
      bulkIdentity: randomUUID(),
      text: 'Restart original snapshot',
      clientIds: [restartUnknown.id, restartPending.id],
    });
    const claimNext = delivery.kernel.claimNext.bind(delivery.kernel);
    delivery.kernel.claimNext = async (input, tx) => {
      const slot = await db.marketingCampaign.findFirst({
        where: { id: input.campaignId, tenantId: tenant.id },
        include: { parentRecipient: true },
      });
      return slot?.parentRecipient?.clientId === restartPending.id
        ? null
        : claimNext(input, tx);
    };
    await bulk.confirm(proof, {
      campaignId: pRestart.campaignId,
      intentHash: pRestart.intentHash,
    });
    delivery.kernel.claimNext = claimNext;
    assert.equal(calls.get('10010'), 1);
    assert.equal(calls.get('10011'), undefined);
    if (process.env.B35_RESTART_FIXTURE)
      writeFileSync(
        process.env.B35_RESTART_FIXTURE,
        JSON.stringify({
          tenantId: tenant.id,
          proof,
          campaignId: pRestart.campaignId,
          intentHash: pRestart.intentHash,
          unknownClientId: restartUnknown.id,
          pendingClientId: restartPending.id,
        }),
      );
    checks.push('partial graph persisted for actual restart verification');
  });
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        checks,
        providerCallsSynthetic: providerCalls,
        productionMessages: 0,
      },
      null,
      2,
    ),
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
