import { NativeFeedbackPolicyService } from '../src/native-feedback/native-feedback-policy.service';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import {
  CONSENT_SECURITY_APPROVAL,
  CONSENT_SECURITY_INCIDENT,
  consentSecurityHash,
  type SecurityManifest,
} from '../src/action-engine/consent-security-invalidation.contract';
import { ConsentSecurityInvalidationService } from '../src/package5-wave3/consent-security-invalidation.service';
import { ConsentSecurityApprovalService } from '../src/package5-wave3/consent-security-approval.service';
import {
  Package5Wave3ExecutableService,
  Package5Wave3ShadowService,
  type Package5Wave3ProviderGateway,
  type Package5Wave3Command,
} from '../src/package5-wave3/package5-wave3.service';
import { ClientChannelLinkService } from '../src/crm/client-channel-link.service';
import { ClientLinkChallengeService } from '../src/crm/client-link-challenge.service';
import {
  effectiveClientConsent,
  effectiveClientConsents,
} from '../src/crm/client-effective-consent';
import { EncryptionService } from '../src/encryption/encryption.service';
import { CommunicationBulkPolicyService } from '../src/communication-delivery/communication-bulk-policy.service';
import { ClientChannelRuntimeService } from '../src/crm/client-channel-runtime.service';
import { lockClientConsent } from '../src/crm/client-effective-consent';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { EntitlementsService } from '../src/entitlements/entitlements.service';
import type { AuthenticatedUser } from '../src/common/authenticated-user.interface';
import { UserRole } from '../src/common/domain.enums';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55517' ||
  url.pathname !== '/maya_consent_security_proof'
)
  throw new Error(
    'Only the owned disposable consent-security PostgreSQL database is permitted',
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const context = new TenantContextService();
const secret = 'synthetic-consent-security-proof-secret-only';
const encryption = new EncryptionService(
  new ConfigService({ CRM_ENCRYPTION_KEY: secret }),
);
const entitlements = {
  resolveFeatureRequirements: (tenantId: string) =>
    Promise.resolve({
      contract: 'maya.feature-requirement-decision/1',
      tenantId,
      planId: null,
      requiredFeatures: [],
      allowed: true,
      evaluatedAt: new Date(),
      validUntil: null,
    }),
} as unknown as EntitlementsService;
const engine = createStandaloneCanonicalActionEngine(
  db as PrismaService,
  entitlements,
  { identitySecret: secret, payloadEncryptionSecret: secret },
);
const provider = new Proxy(
  {},
  {
    get: () => {
      throw new Error('Provider access forbidden in local consent proof');
    },
  },
) as Package5Wave3ProviderGateway;
const planner = new Package5Wave3ShadowService(
  engine.runtime,
  db as PrismaService,
  context,
  engine.kernel,
  provider,
);
const ordinary = new Package5Wave3ExecutableService(
  db,
  engine.ingress,
  engine.kernel,
  engine.runtime,
  planner,
  provider,
);
const scoped = <T>(tenantId: string, work: () => T) =>
  context.runAsSystemTenant(tenantId, work);
const cases: string[] = [];
async function reject(work: () => Promise<unknown>, name: string) {
  await assert.rejects(work);
  cases.push(name);
}
async function validLink(tenantId: string, clientId: string) {
  const identity = randomUUID();
  const links = new ClientChannelLinkService(db, context, {
    verifyLink: () =>
      Promise.resolve({
        tenantId,
        clientId,
        provider: 'telegram',
        providerSubjectHash: consentSecurityHash(identity),
        method: 'explicit_verified_challenge',
        verificationIdentityHash: consentSecurityHash(['identity', identity]),
        verifier: 'synthetic-independent-verified-authority',
        channelControlProofHash: consentSecurityHash('channel'),
        clientAuthorityProofHash: consentSecurityHash('client'),
        validUntil: new Date(Date.now() + 600000),
      }),
    verifyRevocation: () => Promise.reject(new Error('No fixture revocation')),
  });
  return scoped(tenantId, () =>
    links.link({ proof: 'synthetic-independent-proof' }),
  );
}
async function grant(
  link: {
    tenantId: string;
    clientId: string;
    id: string;
    provider: string;
    providerSubjectHash: string;
    verificationEvidenceHash: string;
  },
  kind: 'privacy' | 'marketing',
  event: string,
  decision: 'grant' | 'revoke' = 'grant',
) {
  const now = new Date();
  const command: Package5Wave3Command = {
    operation: 'record_client_consent',
    sourceIntentRef: event,
    clientId: link.clientId,
    kind,
    decision,
    occurredAt: now,
    effectiveAt: now,
    sourceIdentityHash: consentSecurityHash({
      tenantId: link.tenantId,
      clientId: link.clientId,
      kind,
      event,
    }),
  };
  return scoped(link.tenantId, async () =>
    ordinary.execute(
      await planner.build(
        link.tenantId,
        {
          userId: null,
          consentChannel: {
            linkId: link.id,
            provider: link.provider as 'telegram',
            providerSubjectHash: link.providerSubjectHash,
            verificationEvidenceHash: link.verificationEvidenceHash,
          },
        },
        command,
        'execute',
      ),
    ),
  );
}
async function main() {
  assert.equal(
    await db.client.count(),
    0,
    'Fresh proof DB required (base migrations contain two system tenants)',
  );
  assert.equal(await db.clientConsentInvalidation.count(), 0, 'No backfill');
  const tenantId = `security_${randomUUID()}`,
    foreignTenant = `security_${randomUUID()}`;
  for (const id of [tenantId, foreignTenant])
    await db.tenant.create({
      data: {
        id,
        name: 'Synthetic consent security',
        slug: id,
        status: 'active',
      },
    });
  const client = await db.client.create({ data: { tenantId } });
  const unrelated = await db.client.create({ data: { tenantId } });
  const good = (await validLink(tenantId, client.id)).link;
  const other = (await validLink(tenantId, unrelated.id)).link;
  const provenanceChannels = {
    authenticate: (proof: string) =>
      Promise.resolve({
        tenantId:
          proof === 'synthetic-foreign-tenant' ? foreignTenant : tenantId,
        provider: 'telegram' as const,
        providerSubjectHash:
          proof === 'synthetic-verified-provenance'
            ? good.providerSubjectHash
            : consentSecurityHash(proof),
        deliveryAddress: '1000000001',
        userId: null,
        channelControlProofHash: consentSecurityHash(
          'synthetic-channel-control',
        ),
        validUntil: new Date(Date.now() + 600000),
      }),
  };
  const canonicalChannels = new ClientChannelRuntimeService(
    db as PrismaService,
    context,
    provenanceChannels as never,
    encryption,
    {} as never,
    {} as never,
  );
  const verifiedChallenge = await scoped(tenantId, () =>
    canonicalChannels.issue('synthetic-verified-provenance'),
  );
  assert(verifiedChallenge.token);
  const beforeChallenges = await db.clientLinkChallenge.count();
  for (const proof of [
    'synthetic-missing-binding',
    'synthetic-user-only',
    'synthetic-profile-only',
    'synthetic-matching-userIds-null-clientId',
    'synthetic-foreign-tenant',
  ]) {
    await reject(
      () => scoped(tenantId, () => canonicalChannels.issue(proof)),
      'canonical challenge denies ' + proof,
    );
  }
  assert.equal(await db.clientLinkChallenge.count(), beforeChallenges);
  assert.equal(await db.clientConsentFact.count(), 0);
  assert.equal(await db.actionExecution.count(), 0);
  cases.push(
    'existing verified provenance supports a Client without Maya User; rejects create no challenge/consent/execution',
  );
  await grant(good, 'privacy', 'independent-old-privacy');
  await grant(other, 'privacy', 'unrelated-privacy');
  await grant(other, 'marketing', 'unrelated-marketing');
  // Historical contamination fixture only: production issuer stays retired.
  const subject = consentSecurityHash('synthetic-historical-bad-subject');
  const closedLinks = new ClientChannelLinkService(db, context, {
    verifyLink: () => Promise.reject(new Error('Only challenge fixture')),
    verifyRevocation: () =>
      Promise.reject(new Error('Only canonical remediation')),
  });
  const issuer = {
    resolverId: 'a18.maya-user-client-association.v1',
    resolve: () =>
      Promise.resolve({
        tenantId,
        clientId: client.id,
        resolver: 'a18.maya-user-client-association.v1',
        resolutionEvidenceRef: 'synthetic-historical-issuer',
        resolutionEvidenceHash: consentSecurityHash('bad-provenance'),
        issuerAuthorityHash: consentSecurityHash('bad-issuer'),
        validUntil: new Date(Date.now() + 600000),
      }),
  };
  const channels = {
    authenticate: () =>
      Promise.resolve({
        tenantId,
        provider: 'telegram' as const,
        providerSubjectHash: subject,
        deliveryAddress: '1000000001',
        channelControlProofHash: consentSecurityHash('bad-channel'),
        validUntil: new Date(Date.now() + 600000),
      }),
  };
  const challenges = new ClientLinkChallengeService(
    db,
    context,
    encryption,
    closedLinks,
    issuer,
    channels,
  );
  const issued = await scoped(tenantId, () =>
    challenges.issue({ resolutionProof: 'synthetic-historical-proof' }),
  );
  const bad = (
    await scoped(tenantId, () =>
      challenges.consume({
        token: issued.token,
        channelProof: 'synthetic-channel-proof',
      }),
    )
  ).link;
  const privacy = await grant(bad, 'privacy', 'bad-privacy');
  const marketing = await grant(bad, 'marketing', 'bad-marketing');
  const facts = await db.clientConsentFact.findMany({
    where: {
      actionExecutionId: {
        in: [privacy.actionExecutionId, marketing.actionExecutionId],
      },
    },
    orderBy: { id: 'asc' },
  });
  assert.equal(facts.length, 2);
  const beforeFacts = JSON.stringify(facts);
  const originalExecutions = await db.actionExecution.findMany({
    where: { id: { in: facts.map((f) => f.actionExecutionId!) } },
    orderBy: { id: 'asc' },
  });
  const beforeExecutions = JSON.stringify(originalExecutions);
  const beforeUnrelated = JSON.stringify(
    await db.clientConsentFact.findMany({
      where: { clientId: unrelated.id },
      orderBy: { id: 'asc' },
    }),
  );
  const operator = await db.user.create({
    data: {
      email: `${randomUUID()}@proof.invalid`,
      passwordHash: 'synthetic-unused',
      role: 'platform_owner',
      tenantId: null,
    },
  });
  const session = await db.authSession.create({
    data: {
      userId: operator.id,
      tenantId: null,
      deviceLabel: 'synthetic',
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const actor: AuthenticatedUser = {
    userId: operator.id,
    tenantId: null,
    sessionId: session.id,
    role: UserRole.PLATFORM_OWNER,
    email: operator.email,
    branchId: null,
    membershipId: null,
    membershipStatus: null,
  };
  const command = {
    incidentId: CONSENT_SECURITY_INCIDENT,
    tenantId,
    clientId: client.id,
    linkId: bad.id,
    factIds: facts.map((f) => f.id).sort(),
  };
  // Only the external approved incident evidence is a synthetic fixture. The
  // production approval verifier is separately proved to reject these records.
  const productionApproval = new ConsentSecurityApprovalService();
  const fixtureApproval: ConsentSecurityApprovalService = {
    verify: (manifest: SecurityManifest) => {
      assert.deepEqual(manifest.command, command);
      return consentSecurityHash({
        approvalRef: CONSENT_SECURITY_APPROVAL,
        syntheticCommand: command,
      });
    },
  };
  const owner = () => {
    const restarted = createStandaloneCanonicalActionEngine(
      db as PrismaService,
      entitlements,
      { identitySecret: secret, payloadEncryptionSecret: secret },
    );
    return new ConsentSecurityInvalidationService(
      db as PrismaService,
      context,
      restarted.ingress,
      restarted.kernel,
      fixtureApproval,
    );
  };
  await reject(
    () => owner().admit({ ...actor, role: UserRole.CLIENT }, command),
    'non-platform actor denied before admission',
  );
  await reject(
    () => owner().admit({ ...actor, sessionId: 'missing-session' }, command),
    'missing canonical session denied',
  );
  await reject(
    () => owner().admit(actor, { ...command, tenantId: foreignTenant }),
    'wrong tenant denied',
  );
  await reject(
    () => owner().admit(actor, { ...command, clientId: unrelated.id }),
    'wrong Client denied',
  );
  await reject(
    () =>
      owner().admit(actor, { ...command, factIds: [facts[0].id, facts[0].id] }),
    'duplicate/cross-consent target denied',
  );
  assert.equal(
    await db.actionExecution.count({
      where: { actionClass: 'invalidate_client_consent_authority' },
    }),
    0,
  );
  const admitted = await owner().admit(actor, command);
  assert.equal(admitted.state, 'READY');
  assert.equal(await db.clientConsentInvalidation.count(), 0);
  assert.equal(
    (await db.clientChannelLink.findUniqueOrThrow({ where: { id: bad.id } }))
      .revokedAt,
    null,
  );
  const input = await engine.kernel.readTrustedNormalizedInput(
    tenantId,
    admitted.id,
  );
  assert.throws(() =>
    productionApproval.verify(input.manifest as SecurityManifest),
  );
  cases.push(
    'durable admission before effects; production approval rejects synthetic evidence',
  );
  await reject(
    () =>
      owner().admit(actor, {
        ...command,
        factIds: [facts[0].id, 'changed-fact'],
      }),
    'same incident changed material conflicts',
  );

  // Inject a real SQL error after link revocation: the complete transaction must roll back.
  await db.$executeRawUnsafe(
    `CREATE FUNCTION synthetic_reject_invalidation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic interruption after revocation'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER synthetic_reject_invalidation BEFORE INSERT ON "ClientConsentInvalidation" FOR EACH ROW EXECUTE FUNCTION synthetic_reject_invalidation()`,
  );
  await reject(
    () => owner().execute(actor, admitted.id, tenantId),
    'crash/error after revocation rolls back both halves',
  );
  assert.equal(
    (await db.clientChannelLink.findUniqueOrThrow({ where: { id: bad.id } }))
      .revokedAt,
    null,
  );
  assert.equal(await db.clientConsentInvalidation.count(), 0);
  assert.equal(
    (await db.actionExecution.findUniqueOrThrow({ where: { id: admitted.id } }))
      .state,
    'READY',
  );
  await db.$executeRawUnsafe(
    'DROP TRIGGER synthetic_reject_invalidation ON "ClientConsentInvalidation"',
  );
  await db.$executeRawUnsafe('DROP FUNCTION synthetic_reject_invalidation()');
  let concurrent!: Promise<unknown[]>;
  let completed = false;
  await db.$transaction(
    async (tx) => {
      await lockClientConsent(tx, tenantId, client.id);
      assert(
        (await effectiveClientConsent(tx, tenantId, client.id, 'marketing'))
          .effective,
      );
      concurrent = Promise.all(
        Array.from({ length: 5 }, () => owner().remediate(actor, command)),
      ).then((outcomes) => {
        completed = true;
        return outcomes;
      });
      let blocked = false;
      for (let n = 0; n < 100; n++) {
        const [row] = await db.$queryRaw<
          Array<{ waiting: bigint }>
        >`SELECT count(*) AS waiting FROM pg_locks WHERE locktype='advisory' AND NOT granted`;
        if (Number(row.waiting) > 0) {
          blocked = true;
          break;
        }
        await new Promise((done) => setTimeout(done, 10));
      }
      assert(blocked);
      assert(!completed);
    },
    { timeout: 10000 },
  );
  const outcomes = await concurrent;
  cases.push(
    'consent/CD advisory barrier orders a prior policy decision before the atomic security outcome',
  );
  for (const outcome of outcomes) assert.deepEqual(outcome, outcomes[0]);
  assert.equal(
    await db.actionExecution.count({
      where: { actionClass: 'invalidate_client_consent_authority' },
    }),
    1,
  );
  assert.equal(
    await db.actionAttempt.count({ where: { actionExecutionId: admitted.id } }),
    1,
  );
  assert.equal(await db.clientConsentInvalidation.count(), 2);
  assert.deepEqual(await owner().remediate(actor, command), outcomes[0]);
  cases.push(
    'restart and concurrent retries have one execution/attempt/outcome and exactly two invalidations',
  );
  const revoked = await db.clientChannelLink.findUniqueOrThrow({
    where: { id: bad.id },
  });
  assert(revoked.revokedAt);
  assert.deepEqual(
    revoked.verificationEvidenceJson,
    bad.verificationEvidenceJson,
  );
  assert.equal(revoked.verificationEvidenceHash, bad.verificationEvidenceHash);
  assert.equal(
    (await db.clientChannelLink.findUniqueOrThrow({ where: { id: other.id } }))
      .revokedAt,
    null,
  );
  assert.equal(
    beforeFacts,
    JSON.stringify(
      await db.clientConsentFact.findMany({
        where: { id: { in: command.factIds } },
        orderBy: { id: 'asc' },
      }),
    ),
  );
  assert.equal(
    beforeExecutions,
    JSON.stringify(
      await db.actionExecution.findMany({
        where: { id: { in: originalExecutions.map((e) => e.id) } },
        orderBy: { id: 'asc' },
      }),
    ),
  );
  assert.equal(
    beforeUnrelated,
    JSON.stringify(
      await db.clientConsentFact.findMany({
        where: { clientId: unrelated.id },
        orderBy: { id: 'asc' },
      }),
    ),
  );
  const effective = await effectiveClientConsents(db, tenantId, client.id);
  assert(!effective.privacy.effective && !effective.marketing.effective);
  assert(effective.privacy.invalidated && effective.marketing.invalidated);
  assert(
    (await effectiveClientConsents(db, tenantId, unrelated.id)).marketing
      .effective,
  );
  cases.push(
    'exact link revoked; original grants/executions/inputs/link evidence unchanged; unrelated authority unchanged',
  );
  cases.push(
    'both bad grants ineffective; older independent grant does not resurrect; audit remains',
  );
  const feedbackPolicy = new NativeFeedbackPolicyService(db as PrismaService, context, encryption, {} as never, entitlements);
  await scoped(tenantId, () => db.$transaction(async tx => {
    assert.equal(await feedbackPolicy.marketingAllowed(tx, tenantId, client.id), false);
    assert.equal(await feedbackPolicy.marketingAllowed(tx, tenantId, unrelated.id), true);
    // A stale read projection must not turn invalidated canonical grants into
    // consent. Only the profile reader is a synthetic stale projection here.
    const staleProfile = new Proxy(tx, {get(target, prop) {
      if(prop === 'customerProfile') return {findUnique: () => Promise.resolve({privacyConsentAt:new Date(),marketingConsentAt:new Date(),notificationPreferencesJson:null})};
      return Reflect.get(target, prop) as unknown;
    }});
    assert.equal(await feedbackPolicy.marketingAllowed(staleProfile, tenantId, client.id), false);
  }));
  cases.push('R08 invitation rejects exact invalidated facts even with stale profile; unrelated verified consent remains allowed');
  // Real B35 policy and PostgreSQL facts/locks; only campaign/owner metadata is
  // a read-only audience fixture. No route/provider is invoked by this denial.
  const policy = new CommunicationBulkPolicyService(
    db as PrismaService,
    context,
    encryption,
    {} as never,
    entitlements,
    new ConfigService({ CRM_ENCRYPTION_KEY: secret }),
  );
  const denied = await scoped(tenantId, () =>
    db.$transaction(async (tx) => {
      const policyTx = new Proxy(tx, {
        get(target, prop) {
          if (prop === 'marketingCampaign')
            return {
              findUniqueOrThrow: () =>
                Promise.resolve({
                  confirmedAt: new Date(),
                  confirmedByUserId: operator.id,
                  expiresAt: new Date(Date.now() + 100000),
                }),
            };
          if (prop === 'membership')
            return {
              findFirst: () =>
                Promise.resolve({
                  id: 'synthetic-audience-owner',
                  role: 'tenant_owner',
                }),
            };
          return Reflect.get(target, prop) as unknown;
        },
      });
      return policy.current(
        policyTx,
        {
          tenantId,
          clientId: client.id,
          campaignId: 'synthetic-read-only-campaign',
        } as never,
        {
          contract: 'maya.bulk-client-route/1',
          primary: 'none',
          link: null,
          userId: null,
          webPushEndpoints: [],
          apnsDevices: [],
          policyVersion: 1,
        },
      );
    }),
  );
  assert(!denied.allowed);
  assert.equal(denied.reason, 'CONSENT_NOT_GRANTED');
  cases.push(
    'B35 final policy after security commit denies the bad grants with no delivery effect',
  );
  const keyless = Object.create(
    ClientChannelRuntimeService.prototype,
  ) as ClientChannelRuntimeService;
  await reject(
    () =>
      keyless.submitLegacyNativeConsent('historical-keyless-channel', {
        privacyConsent: true,
        marketingConsent: true,
      }),
    'keyless native request cannot invoke any dependency or restore authority',
  );

  assert.equal(
    await db.auditLog.count({
      where: {
        entityId: admitted.id,
        action: 'invalidate_client_consent_authority',
      },
    }),
    1,
  );
  const invalidation = await db.clientConsentInvalidation.findFirstOrThrow();
  await reject(
    () =>
      db.clientConsentInvalidation.update({
        where: {
          tenantId_consentFactId: {
            tenantId,
            consentFactId: invalidation.consentFactId,
          },
        },
        data: { reasonCode: 'OTHER' },
      }),
    'invalidation immutable',
  );
  await reject(
    () =>
      db.clientConsentInvalidation.delete({
        where: {
          tenantId_consentFactId: {
            tenantId,
            consentFactId: invalidation.consentFactId,
          },
        },
      }),
    'invalidation cannot be deleted',
  );
  await reject(
    () =>
      db.clientConsentInvalidation.create({
        data: {
          ...invalidation,
          authorityEvidenceJson:
            invalidation.authorityEvidenceJson as Prisma.InputJsonValue,
          id: randomUUID(),
        },
      }),
    'duplicate invalidation rejected',
  );
  await reject(
    () =>
      db.clientConsentInvalidation.create({
        data: {
          ...invalidation,
          authorityEvidenceJson:
            invalidation.authorityEvidenceJson as Prisma.InputJsonValue,
          id: randomUUID(),
          tenantId: foreignTenant,
        },
      }),
    'invalidation tenant FK/guard isolation',
  );
  await reject(
    () =>
      db.clientConsentInvalidation.create({
        data: {
          ...invalidation,
          authorityEvidenceJson:
            invalidation.authorityEvidenceJson as Prisma.InputJsonValue,
          id: randomUUID(),
          clientId: unrelated.id,
        },
      }),
    'invalidation Client FK/guard isolation',
  );
  await reject(
    () =>
      db.actionExecution.update({
        where: { id: privacy.actionExecutionId },
        data: { normalizedInputEncrypted: null },
      }),
    'original execution payload retained',
  );
  await reject(
    () =>
      db.clientConsentFact.update({
        where: { id: facts[0].id },
        data: { decision: 'revoke' },
      }),
    'historical grant cannot become fake Client revoke',
  );
  await reject(
    () => grant(bad, 'privacy', 'bad-privacy'),
    'historical bad-link grant replay cannot restore authority',
  );
  assert.equal(await db.client.count(), 2);
  assert.equal(await db.user.count(), 1);
  assert.equal(await db.clientChannelLink.count(), 3);
  cases.push(
    'no hidden Client/User/link creation; Client without Maya User supported',
  );
  const fresh = await grant(good, 'privacy', 'fresh-verified-privacy');
  assert.notEqual(fresh.actionExecutionId, privacy.actionExecutionId);
  assert(
    (await effectiveClientConsent(db, tenantId, client.id, 'privacy'))
      .effective,
  );
  assert(
    !(await effectiveClientConsent(db, tenantId, client.id, 'marketing'))
      .effective,
  );
  await grant(good, 'marketing', 'fresh-verified-marketing');
  assert(
    (await effectiveClientConsents(db, tenantId, client.id)).marketing
      .effective,
  );
  assert.equal(await db.clientConsentInvalidation.count(), 2);
  assert.equal(await scoped(tenantId, () => db.$transaction(tx => feedbackPolicy.marketingAllowed(tx, tenantId, client.id))), true);
  cases.push(
    'fresh independently verified keyed grants effective; old invalidations do not apply to future facts',
  );
  // Existing canonical consent lifecycle: transition identity, not desired state.
  const g1 = await grant(good, 'marketing', 'lifecycle-G1');
  assert.equal(
    (await grant(good, 'marketing', 'lifecycle-G1')).actionExecutionId,
    g1.actionExecutionId,
  );
  const r1 = await grant(good, 'marketing', 'lifecycle-R1', 'revoke');
  assert.equal(
    (await grant(good, 'marketing', 'lifecycle-R1', 'revoke'))
      .actionExecutionId,
    r1.actionExecutionId,
  );
  assert(
    !(await effectiveClientConsent(db, tenantId, client.id, 'marketing'))
      .effective,
  );
  const g2 = await grant(good, 'marketing', 'lifecycle-G2');
  assert.equal(
    (await grant(good, 'marketing', 'lifecycle-G2')).actionExecutionId,
    g2.actionExecutionId,
  );
  assert.equal(
    new Set([g1.actionExecutionId, r1.actionExecutionId, g2.actionExecutionId])
      .size,
    3,
  );
  await reject(
    () => grant(good, 'marketing', 'lifecycle-G2', 'revoke'),
    'same consent event with changed decision conflicts',
  );
  const duplicates = await Promise.all(
    Array.from({ length: 5 }, () =>
      grant(good, 'marketing', 'lifecycle-concurrent-G3'),
    ),
  );
  assert.equal(new Set(duplicates.map((v) => v.actionExecutionId)).size, 1);
  const raceEvent = 'lifecycle-prepared-concurrent-G4';
  const racedPrepared = await Promise.all(
    Array.from({ length: 3 }, (_, index) =>
      scoped(tenantId, () =>
        planner.build(
          tenantId,
          {
            userId: null,
            consentChannel: {
              linkId: good.id,
              provider: 'telegram',
              providerSubjectHash: good.providerSubjectHash,
              verificationEvidenceHash: good.verificationEvidenceHash,
            },
          },
          {
            operation: 'record_client_consent',
            sourceIntentRef: raceEvent,
            clientId: client.id,
            kind: 'marketing',
            decision: 'grant',
            occurredAt: new Date(Date.now() - 100 + index),
            effectiveAt: new Date(Date.now() - 100 + index),
            sourceIdentityHash: consentSecurityHash({
              tenantId,
              clientId: client.id,
              kind: 'marketing',
              event: raceEvent,
            }),
          },
          'execute',
        ),
      ),
    ),
  );
  const raced = await scoped(tenantId, () =>
    Promise.all(racedPrepared.map((prepared) => ordinary.execute(prepared))),
  );
  assert.equal(new Set(raced.map((v) => v.actionExecutionId)).size, 1);
  cases.push(
    'G1/revoke/G2 distinct; each exact retry restores its own receipt; concurrent first grant has one execution',
  );
  await reject(
    () =>
      grant(
        { ...good, clientId: unrelated.id },
        'marketing',
        'wrong-client-event',
      ),
    'keyed consent rejects a foreign Client before admission',
  );
  await reject(
    () =>
      grant(
        { ...good, tenantId: foreignTenant },
        'marketing',
        'wrong-tenant-event',
      ),
    'keyed consent rejects a foreign tenant before admission',
  );
  const raceCommands = await Promise.all(
    (['grant', 'revoke'] as const).map((decision) =>
      scoped(tenantId, () =>
        planner.build(
          tenantId,
          {
            userId: null,
            consentChannel: {
              linkId: good.id,
              provider: 'telegram',
              providerSubjectHash: good.providerSubjectHash,
              verificationEvidenceHash: good.verificationEvidenceHash,
            },
          },
          {
            operation: 'record_client_consent',
            sourceIntentRef: 'logical-race-' + decision,
            clientId: client.id,
            kind: 'marketing',
            decision,
            occurredAt: new Date(),
            effectiveAt: new Date(),
            sourceIdentityHash: consentSecurityHash(['race', decision]),
          },
          'execute',
        ),
      ),
    ),
  );
  const race = await scoped(tenantId, () =>
    Promise.allSettled(raceCommands.map((p) => ordinary.execute(p))),
  );
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(race.filter((r) => r.status === 'rejected').length, 1);
  cases.push(
    'concurrent opposite consent events preserve existing optimistic target-conflict policy: one winner, one conflict',
  );
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        database: url.pathname.slice(1),
        cases,
        casesCount: cases.length,
        realMessages: 0,
        providerEffects: 0,
        productionWrites: 0,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
