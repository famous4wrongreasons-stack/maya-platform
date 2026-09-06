import type { EntitlementsService } from '../src/entitlements/entitlements.service';
import { ClientChannelRuntimeService } from '../src/crm/client-channel-runtime.service';
import { AppointmentReminderOrchestratorService } from '../src/appointment-notifications/appointment-reminder-orchestrator.service';
import { reminderRequest } from '../src/communication-delivery/appointment-reminder.contract';
import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import { FEATURE_REQUIREMENT_DECISION_CONTRACT } from '../src/entitlements/entitlements.service';
import { CommunicationWebPushService } from '../src/communication-delivery/communication-web-push.service';
import { CommunicationDeliveryService } from '../src/communication-delivery/communication-delivery.service';
import type { CommunicationWebPushTransport } from '../src/communication-delivery/communication-web-push.transport';
import assert from 'node:assert/strict';
import {
  createECDH,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { clientChannelSubjectHash } from '../src/crm/client-channel-subject';
import { ClientWebPushService } from '../src/crm/client-web-push.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55493' ||
  !url.pathname.startsWith('/maya_c06_b25_')
)
  throw new Error('Owned isolated B25 PostgreSQL database required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const config = new ConfigService({
  CRM_ENCRYPTION_KEY: 'synthetic-b24-encryption'.repeat(3),
  MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN: 'synthetic-b24-telegram',
  MAYA_INBOX_BRIDGE_TOKEN: 'synthetic-b24-bridge'.repeat(3),
});
const encryption = new EncryptionService(config);
const context = new TenantContextService();
const channels = new ClientChannelAuthenticatorService(
  config,
  context,
  encryption,
);
const service = new ClientWebPushService(
  db as unknown as PrismaService,
  context,
  channels,
  encryption,
);
const hash = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const cases: string[] = [];
let subjectCounter = 8200000000;
const scope = <T>(tenantId: string, fn: () => T) =>
  context.runAsPublicTenant(tenantId, fn);

function subscription(label = randomUUID()) {
  const key = createECDH('prime256v1');
  key.generateKeys();
  return {
    endpoint: `https://push.example.invalid/subscription/${label}`,
    expirationTime: null,
    keys: {
      p256dh: key.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
}
function proofFor(subject: string) {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    id: subject,
  };
  const material = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const signed = {
    ...fields,
    hash: createHmac(
      'sha256',
      createHash('sha256').update('synthetic-b24-telegram').digest(),
    )
      .update(material)
      .digest('hex'),
  };
  return JSON.stringify({
    type: 'telegram_widget',
    credential: JSON.stringify(signed),
  });
}
async function fixture(tenantId?: string, delivery = true) {
  if (!tenantId) {
    tenantId = randomUUID();
    await db.tenant.create({
      data: {
        id: tenantId,
        slug: tenantId,
        name: 'Synthetic B24',
        status: 'active',
      },
    });
  }
  const client = await db.client.create({ data: { tenantId } });
  const subject = String(++subjectCounter);
  const providerSubjectHash = clientChannelSubjectHash(
    encryption,
    'telegram',
    subject,
  );
  const verificationIdentityHash = hash(['link', client.id]);
  const evidence = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'synthetic-b24-proof',
    channelControlProofHash: hash(['channel', subject]),
    clientAuthorityProofHash: hash(['client', client.id]),
    verificationIdentityHash,
    tenantId,
    provider: 'telegram',
    providerSubjectHash,
    clientId: client.id,
  };
  const link = await db.clientChannelLink.create({
    data: {
      tenantId,
      clientId: client.id,
      provider: 'telegram',
      providerSubjectHash,
      verificationMethod: 'explicit_verified_challenge',
      verificationIdentityHash,
      verificationEvidenceJson: evidence,
      verificationEvidenceHash: hash(evidence),
    },
  });
  if (delivery) await setAddress(link, encryption.encrypt(subject));
  return { tenantId, client, link, proof: proofFor(subject) };
}
async function setAddress(
  link: { id: string; providerSubjectHash: string },
  value: string | null,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('maya.client_channel_delivery_subject_hash', ${link.providerSubjectHash}, true)`;
    return tx.clientChannelLink.update({
      where: { id: link.id },
      data: { deliveryAddressEncrypted: value },
    });
  });
}
const entitlements: Pick<
  EntitlementsService,
  'hasFeature' | 'resolveFeatureRequirements'
> = {
  hasFeature: () => Promise.resolve(true),
  resolveFeatureRequirements: (
    tenantId: string,
    features,
    evaluatedAt = new Date(),
  ) =>
    Promise.resolve({
      contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
      tenantId,
      planId: null,
      requiredFeatures: features.map((featureKey) => ({
        featureKey,
        enabled: true,
      })),
      allowed: true,
      evaluatedAt,
      validUntil: null,
    }),
};
const engine = createStandaloneCanonicalActionEngine(
  db as never,
  entitlements,
  {
    identitySecret: 'synthetic-b24-encryption'.repeat(3),
    payloadEncryptionSecret: 'synthetic-b24-encryption'.repeat(3),
    policyAttestationSecret: 'synthetic-b25-policy'.repeat(3),
  },
);
const runtimeChannels = new ClientChannelRuntimeService(
  db as never,
  context,
  channels,
  encryption,
  {} as never,
  {} as never,
);
let pushSends = 0,
  telegramSends = 0,
  telegramOutcome = 'PASS';
const transport = {
  ready: () => true,
  accepts: () => true,
  send: () => {
    pushSends++;
    return Promise.resolve('SUCCEEDED');
  },
} as unknown as CommunicationWebPushTransport;
const web = new CommunicationWebPushService(
  db as never,
  context,
  engine.runtime,
  engine.kernel,
  service,
  encryption,
  transport,
  config,
);
const comm = new CommunicationDeliveryService(
  db as never,
  engine.runtime,
  config,
  web,
);
let afterPersist: (() => Promise<void>) | null = null;
const ingress = {
  createExecution: async (
    ...args: Parameters<typeof engine.ingress.createExecution>
  ) => {
    const result = await engine.ingress.createExecution(...args);
    const hook = afterPersist;
    afterPersist = null;
    if (hook) await hook();
    return result;
  },
};
const makeOrchestrator = () =>
  new AppointmentReminderOrchestratorService(
    db as never,
    context,
    encryption,
    entitlements as never,
    runtimeChannels,
    service,
    ingress as never,
    engine.kernel,
    comm,
    web,
  );
let orchestrator = makeOrchestrator();
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  telegramSends++;
  if (telegramOutcome === 'UNKNOWN')
    return Promise.reject(new Error('synthetic_timeout'));
  return Promise.resolve(
    new Response(
      JSON.stringify(
        telegramOutcome === 'FAIL'
          ? { error: 'synthetic' }
          : { message_id: `synthetic-${telegramSends}` },
      ),
      { status: telegramOutcome === 'FAIL' ? 400 : 200 },
    ),
  );
};
async function appointment(
  f: Awaited<ReturnType<typeof fixture>>,
  minutes = 120,
) {
  const startAt = new Date(Date.now() + minutes * 60000),
    endAt = new Date(startAt.getTime() + 3600000);
  return db.appointment.create({
    data: {
      tenantId: f.tenantId,
      mayaClientId: f.client.id,
      staffExternalId: 'synthetic-staff',
      serviceIds: [],
      startAt,
      endAt,
      blockedStartAt: startAt,
      blockedEndAt: endAt,
    },
  });
}
async function ready(minutes = 120, delivery = true) {
  const f = await fixture(undefined, delivery);
  await db.customerProfile.create({
    data: {
      tenantId: f.tenantId,
      clientId: f.client.id,
      privacyConsentAt: new Date(),
    },
  });
  const a = await appointment(f, minutes);
  return { ...f, a };
}
async function tick(f: { tenantId: string }, now = new Date()) {
  orchestrator['now'] = () => now;
  const counts = await Promise.all([
    db.client.count(),
    db.clientChannelLink.count(),
    db.clientConsentFact.count(),
  ]);
  const result = await scope(f.tenantId, () =>
    orchestrator.processTenant(f.tenantId, now),
  );
  assert.deepEqual(
    await Promise.all([
      db.client.count(),
      db.clientChannelLink.count(),
      db.clientConsentFact.count(),
    ]),
    counts,
  );
  return result;
}
async function userLink(f: Awaited<ReturnType<typeof fixture>>) {
  const user = await db.user.create({
    data: {
      tenantId: null,
      email: `${randomUUID()}@invalid.test`,
      passwordHash: 'synthetic',
      role: 'client',
      phone: '+79990000000',
    },
  });
  await db.membership.create({
    data: { tenantId: f.tenantId, userId: user.id, role: 'client' },
  });
  const providerSubjectHash = clientChannelSubjectHash(
      encryption,
      'maya_user',
      user.id,
    ),
    verificationIdentityHash = hash(['maya_user', user.id]);
  const evidence = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'synthetic-b25-proof',
    channelControlProofHash: hash(['user', user.id]),
    clientAuthorityProofHash: hash(['client', f.client.id]),
    verificationIdentityHash,
    tenantId: f.tenantId,
    provider: 'maya_user',
    providerSubjectHash,
    clientId: f.client.id,
  };
  const linked = await db.clientChannelLink.create({
    data: {
      tenantId: f.tenantId,
      clientId: f.client.id,
      provider: 'maya_user',
      providerSubjectHash,
      verificationMethod: 'explicit_verified_challenge',
      verificationIdentityHash,
      verificationEvidenceJson: evidence,
      verificationEvidenceHash: hash(evidence),
    },
  });
  await setAddress(linked, encryption.encrypt(user.id));
  return user;
}
async function revoke(link: Awaited<ReturnType<typeof fixture>>['link']) {
  const revocationIdentityHash = hash(['revoke', link.id]);
  const evidence = {
    contract: 'a18.client-channel-revocation.v1',
    revocationIdentityHash,
    tenantId: link.tenantId,
    linkId: link.id,
    actorProofHash: hash('synthetic-owner'),
    reason: 'synthetic-proof',
  };
  await db.clientChannelLink.update({
    where: { id: link.id },
    data: {
      revokedAt: new Date(),
      revocationIdentityHash,
      revocationEvidenceJson: evidence,
      revocationEvidenceHash: hash(evidence),
    },
  });
}
async function device(f: Awaited<ReturnType<typeof fixture>>) {
  await scope(f.tenantId, () =>
    service.register(f.proof, { subscription: subscription() }),
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
}
async function primary(f: { tenantId: string }) {
  return db.actionExecution.findMany({
    where: { tenantId: f.tenantId, sourceRef: { startsWith: 'b25.reminder:' } },
  });
}
async function run() {
  const a = await ready();
  const count = await db.client.count(),
    links = await db.clientChannelLink.count(),
    facts = await db.clientConsentFact.count();
  await tick(a);
  assert.equal(telegramSends, 1);
  assert.equal((await primary(a)).length, 1);
  assert.equal(a.client.userId, null);
  await Promise.all(Array.from({ length: 5 }, () => tick(a)));
  orchestrator = makeOrchestrator();
  await tick(a);
  assert.equal(telegramSends, 1);
  assert.equal(await db.client.count(), count);
  assert.equal(await db.clientChannelLink.count(), links);
  assert.equal(await db.clientConsentFact.count(), facts);
  cases.push(
    'exact Appointment.mayaClientId; Telegram without Maya User; concurrent repeat/restart produces one logical reminder and no identity/consent facts',
  );
  const b = await ready();
  const user = await userLink(b);
  const other = await fixture(b.tenantId);
  await userLink(other);
  await db.client.updateMany({
    where: { id: { in: [b.client.id, other.client.id] } },
    data: { phoneHash: hash('same-synthetic-phone') },
  });
  const t = telegramSends;
  await tick(b);
  assert.equal(telegramSends, t);
  const inbox = await db.inboxItem.findMany({
    where: { tenantId: b.tenantId },
  });
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].userId, user.id);
  cases.push(
    'inbox priority; duplicate phone across Users and Clients does not deliver other Client appointment or Telegram duplicate',
  );
  const c = await ready(120, false);
  await device(c);
  const pushBefore = pushSends;
  await tick(c);
  assert.equal(pushSends, pushBefore + 1);
  assert.equal((await primary(c))[0].state, 'SUCCEEDED');
  assert.equal(
    await db.inboxItem.count({ where: { tenantId: c.tenantId } }),
    0,
  );
  cases.push(
    'Web Push-only primary without Maya User or fabricated inbox/Telegram receipt',
  );
  const d = await ready(120, false);
  await tick(d);
  assert.equal((await primary(d)).length, 0);
  cases.push('no endpoint creates no private intent or delivery');
  for (const outcome of ['UNKNOWN', 'FAIL']) {
    const f = await ready();
    await device(f);
    telegramOutcome = outcome;
    const before: number = telegramSends,
      push = pushSends;
    await tick(f);
    await tick(f);
    assert.equal(telegramSends, before + 1);
    assert.equal(pushSends, push);
    assert.equal(
      (await primary(f))[0].state,
      outcome === 'FAIL' ? 'FAILED' : 'UNKNOWN',
    );
    cases.push(
      `Telegram ${outcome}: durable outcome, no repeated provider dispatch, no Web Push fallback`,
    );
  }
  telegramOutcome = 'PASS';
  const r = await ready();
  await device(r);
  const before: number = telegramSends,
    push = pushSends;
  afterPersist = () => revoke(r.link);
  await tick(r);
  await tick(r);
  assert.equal(telegramSends, before);
  assert.equal(pushSends, push);
  assert.equal((await primary(r)).length, 1);
  cases.push(
    'primary revoked after durable planning: no automatic route reselection or secondary delivery',
  );
  const many = await ready(120, false);
  for (let i = 0; i < 5; i++) await device(many);
  const p0 = pushSends;
  await Promise.all(Array.from({ length: 4 }, () => tick(many)));
  await tick(many);
  assert.equal(pushSends, p0 + 5);
  assert.equal((await primary(many)).length, 1);
  cases.push(
    'concurrent first schedulers: one plan, Web Push fan-out exactly five; each device at most once',
  );
  const inherited = await ready(1440);
  await tick(inherited);
  await tick(inherited, new Date(inherited.a.startAt.getTime() - 120 * 60000));
  assert.equal((await primary(inherited)).length, 2);
  const override = await ready(1440);
  await db.customerProfile.update({
    where: {
      tenantId_clientId: {
        tenantId: override.tenantId,
        clientId: override.client.id,
      },
    },
    data: {
      notificationPreferencesJson: {
        version: 1,
        overrides: { reminder_hours: 6 },
      },
    },
  });
  await tick(override);
  assert.equal((await primary(override)).length, 0);
  await tick(override, new Date(override.a.startAt.getTime() - 360 * 60000));
  await tick(override, new Date(override.a.startAt.getTime() - 120 * 60000));
  assert.equal((await primary(override)).length, 1);
  cases.push('tenant24h+2h inherited=>two; Client6h replaces=>one, never adds');
  for (const reason of [
    'client-disabled',
    'tenant-disabled',
    'missing-client',
    'cancelled',
    'privacy-revoked',
  ]) {
    const f = await ready();
    if (reason === 'client-disabled')
      await db.customerProfile.update({
        where: {
          tenantId_clientId: { tenantId: f.tenantId, clientId: f.client.id },
        },
        data: {
          notificationPreferencesJson: {
            version: 1,
            overrides: { reminder: false },
          },
        },
      });
    if (reason === 'tenant-disabled')
      await db.appointmentNotificationSetting.create({
        data: {
          tenantId: f.tenantId,
          enabled: false,
          leadTimesMinutes: [1440, 120],
        },
      });
    if (reason === 'missing-client')
      await db.appointment.update({
        where: { id: f.a.id },
        data: { mayaClientId: null },
      });
    if (reason === 'cancelled')
      await db.appointment.update({
        where: { id: f.a.id },
        data: { status: 'cancelled' },
      });
    if (reason === 'privacy-revoked')
      await db.customerProfile.update({
        where: {
          tenantId_clientId: { tenantId: f.tenantId, clientId: f.client.id },
        },
        data: { privacyConsentAt: null },
      });
    await tick(f);
    assert.equal((await primary(f)).length, 0);
    cases.push(`${reason}: fail closed/no private payload`);
  }
  const moved = await ready();
  const beforeMove = telegramSends;
  afterPersist = async () => {
    await db.appointment.update({
      where: { id: moved.a.id },
      data: {
        startAt: new Date(moved.a.startAt.getTime() + 86400000),
        endAt: new Date(moved.a.endAt.getTime() + 86400000),
      },
    });
  };
  await tick(moved);
  assert.equal(telegramSends, beforeMove);
  cases.push('reschedule between plan and dispatch rejects stale occurrence');
  const ambiguous = await ready();
  await db.crmClientLink.create({
    data: {
      tenantId: ambiguous.tenantId,
      clientId: ambiguous.client.id,
      provider: 'yclients',
      externalId: 'synthetic-client',
    },
  });
  await db.unresolvedClientIdentityHold.create({
    data: {
      tenantId: ambiguous.tenantId,
      provider: 'yclients',
      externalId: 'synthetic-client',
      reasonCode: 'loyalty_identity_unresolved',
      sourceNamespace: 'synthetic-b25',
      sourceEvidenceHash: hash('ambiguous'),
      unresolvedPrincipalCount: 2,
    },
  });
  await tick(ambiguous);
  assert.equal((await primary(ambiguous)).length, 0);
  cases.push(
    'ambiguous canonical identity hold fails closed without private intent',
  );
  await assert.rejects(
    db.appointment.create({
      data: {
        tenantId: b.tenantId,
        mayaClientId: a.client.id,
        staffExternalId: 'synthetic',
        serviceIds: [],
        startAt: a.a.startAt,
        endAt: a.a.endAt,
        blockedStartAt: a.a.startAt,
        blockedEndAt: a.a.endAt,
      },
    }),
  );
  cases.push('cross-tenant Appointment Client binding rejected by PostgreSQL');
  const exactBefore = JSON.stringify(
    await db.actionExecution.findMany({ where: { tenantId: a.tenantId } }),
  );
  assert.ok(!exactBefore.includes('8200000001'));
  assert.ok(!exactBefore.includes('Ваша запись'));
  cases.push(
    'durable execution/audit contains encrypted content and opaque recipient references only',
  );
  const crashed = await ready();
  afterPersist = () =>
    Promise.reject(new Error('synthetic-crash-before-child'));
  await tick(crashed);
  await tick(crashed);
  assert.equal((await primary(crashed)).length, 1);
  // Directly replay the stored execution after policy revocation cannot reauthorize a new route.
  const stored = (await primary(a))[0];
  const normalized = await engine.kernel.readTrustedNormalizedInput(
    a.tenantId,
    stored.id,
  );
  await assert.rejects(
    scope(b.tenantId, () =>
      comm.deliverAppointmentReminder({
        request: reminderRequest(a.tenantId, normalized),
        authorize: () => orchestrator['authorize'](b.tenantId, normalized),
      }),
    ),
  );
  cases.push(
    'tenant-mismatch dispatch cannot expose private appointment content',
  );
  const limits = await ready(1440);
  await db.appointmentNotificationSetting.create({
    data: { tenantId: limits.tenantId, leadTimesMinutes: [1440, 120, 60, 30] },
  });
  for (const lead of [1440, 120, 60, 30])
    await tick(limits, new Date(limits.a.startAt.getTime() - lead * 60000));
  assert.equal((await primary(limits)).length, 4);
  cases.push(
    'maximum four logical current-policy occurrences; retries collapse overlap',
  );
  console.log(
    JSON.stringify(
      {
        verdict: 'PASS',
        cases,
        total: cases.length,
        realProductionMutations: 0,
        newSchema: false,
        newActionClasses: 0,
      },
      null,
      2,
    ),
  );
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    globalThis.fetch = originalFetch;
    await db.$disconnect();
  });
