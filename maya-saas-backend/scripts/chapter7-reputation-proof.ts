import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';
import { EncryptionService } from '../src/encryption/encryption.service';
import { AuditLogService } from '../src/audit-log/audit-log.service';
import {
  ActionCapabilityRegistry,
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../src/action-engine';
import { CanonicalActionPolicyResolver } from '../src/action-engine/action-engine.policy-resolver';
import { createCanonicalProductionPolicyRegistry } from '../src/action-engine/action-engine.policy-registry';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  EntitlementsService,
} from '../src/entitlements/entitlements.service';
import { ClientChannelRuntimeService } from '../src/crm/client-channel-runtime.service';
import {
  ClientChannelAuthenticatorService,
  CurrentClientChannel,
} from '../src/crm/client-channel-authenticator.service';
import { ClientWebPushService } from '../src/crm/client-web-push.service';
import { clientChannelSubjectHash } from '../src/crm/client-channel-subject';
import { CrmService } from '../src/crm/crm.service';
import { AppointmentObservationService } from '../src/crm/appointment-observation.service';
import { AppointmentChangeService } from '../src/crm/appointment-change.service';
import { EventStoreService } from '../src/events/event-store.service';
import { Package5Wave3CanonicalCutoverService } from '../src/package5-wave3/package5-wave3-canonical-cutover.service';
import { NativeFeedbackPolicyService } from '../src/native-feedback/native-feedback-policy.service';
import { NativeFeedbackService } from '../src/native-feedback/native-feedback.service';
import { Package5Wave4ReviewFactService } from '../src/package5-wave4/package5-wave4.service';
import {
  MeasurementReputationReader,
  reputationPeriod,
} from '../src/measurement/measurement.reputation';
import { MeasurementService } from '../src/measurement/measurement.service';
import { MeasurementSources } from '../src/measurement/measurement.sources';
import {
  MeasurementIntent,
  MeasurementMetric,
  normalizeMeasurement,
} from '../src/measurement/measurement.contract';
import { localDateMinuteToUtc } from '../src/internal-calendar/internal-calendar.utils';

// This proof is executable only against the parent-owned, disposable C7 replay.
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55517');
assert.equal(url.pathname, '/maya_c7_replay');
assert.equal(url.username, 'maya_c7');
const secret = 'c7-p05-isolated-synthetic-proof-not-production';
const config = new ConfigService({
  DATABASE_URL: url.toString(),
  CRM_ENCRYPTION_KEY: secret,
});
const db = new PrismaService(config),
  context = new TenantContextService(),
  encryption = new EncryptionService(config);
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
      validUntil: new Date('2099-01-01'),
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
  { audit: new AuditLogService(db, context), encryption },
);
const ingress = new CanonicalActionIngressService(engine, resolver);
const channelProofs = new Map<string, CurrentClientChannel>();
const authenticator = {
  authenticate: (proof: string) =>
    channelProofs.has(proof)
      ? Promise.resolve(channelProofs.get(proof)!)
      : Promise.reject(Error('Synthetic verified channel required')),
} as unknown as ClientChannelAuthenticatorService;
const channels = new ClientChannelRuntimeService(
  db,
  context,
  authenticator,
  encryption,
  {} as Package5Wave3CanonicalCutoverService,
  {} as CrmService,
);
let sourceClock = new Date();
const webPush = new ClientWebPushService(
  db,
  context,
  authenticator,
  encryption,
);
const nativePolicy = new NativeFeedbackPolicyService(
  db,
  context,
  encryption,
  webPush,
  entitlements as EntitlementsService,
  () => sourceClock,
);
const nativeOwner = new NativeFeedbackService(
  db,
  context,
  channels,
  ingress,
  engine,
  encryption,
  nativePolicy,
  () => sourceClock,
);
const reviewOwner = new Package5Wave4ReviewFactService(db, encryption);
const reader = new MeasurementReputationReader();
const measurements = new MeasurementService(
  db,
  context,
  new MeasurementSources(db, undefined, reader),
);
const digest = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const checks: string[] = [];
async function proof(name: string, work: () => unknown) {
  await work();
  checks.push(name);
  console.log('PASS ' + name);
}
function value(
  metrics: MeasurementMetric[],
  key: string,
  source = 'native_feedback',
) {
  const found = metrics.find(
    (m) => m.key === key && m.dimensions.source === source,
  );
  assert.ok(found, `${source}/${key} missing`);
  return found.value;
}

async function main() {
  await db.$connect();
  const beforeTenants = await db.tenant.count();
  const tenant = await db.tenant.create({
    data: {
      name: 'C7 P05 synthetic',
      slug: randomUUID(),
      status: 'active',
      defaultTimezone: 'Europe/Moscow',
    },
  });
  const other = await db.tenant.create({
    data: {
      name: 'C7 P05 foreign synthetic',
      slug: randomUUID(),
      status: 'active',
    },
  });
  const branch = await db.branch.create({
    data: { tenantId: tenant.id, name: 'P05 branch', timezone: 'UTC' },
  });
  const branch2 = await db.branch.create({
    data: { tenantId: tenant.id, name: 'P05 other branch' },
  });
  const foreignBranch = await db.branch.create({
    data: { tenantId: other.id, name: 'P05 foreign branch' },
  });
  const staff = await db.staff.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      encryptedDisplayName: encryption.encrypt('Synthetic Staff'),
      active: true,
    },
  });
  const user = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: randomUUID() + '@example.invalid',
      passwordHash: 'synthetic',
      role: 'tenant_owner',
      status: 'active',
    },
  });
  await db.membership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      role: 'tenant_owner',
      status: 'active',
    },
  });
  const client = await db.client.create({ data: { tenantId: tenant.id } });
  const foreignClient = await db.client.create({
    data: { tenantId: other.id },
  });
  const providerSubjectHash = clientChannelSubjectHash(
    encryption,
    'telegram',
    '7000000001',
  );
  const verificationIdentityHash = digest(['verification', client.id]);
  const evidence = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'c7-p05-local-proof',
    channelControlProofHash: digest(['channel', client.id]),
    clientAuthorityProofHash: digest(['client', client.id]),
    verificationIdentityHash,
    tenantId: tenant.id,
    provider: 'telegram',
    providerSubjectHash,
    clientId: client.id,
  };
  await db.clientChannelLink.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      provider: 'telegram',
      providerSubjectHash,
      verificationMethod: 'explicit_verified_challenge',
      verificationIdentityHash,
      verificationEvidenceJson: evidence,
      verificationEvidenceHash: digest(evidence),
    },
  });
  const channelProof = randomUUID();
  channelProofs.set(channelProof, {
    tenantId: tenant.id,
    provider: 'telegram',
    providerSubjectHash,
    deliveryAddress: '7000000001',
    userId: null,
    channelControlProofHash: evidence.channelControlProofHash,
    validUntil: new Date(Date.now() + 3600000),
  });
  const manager = <T>(work: () => T) =>
    context.runAsAuthPrincipal(
      { tenantId: tenant.id, userId: user.id, role: 'tenant_owner' },
      work,
    );
  const publicClient = <T>(work: () => T) =>
    context.runAsPublicTenant(tenant.id, work);
  const system = <T>(work: () => T) =>
    context.runAsSystemTenant(tenant.id, work);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === 'year')!.value),
    month = Number(parts.find((p) => p.type === 'month')!.value);
  const localMonth = (offset: number) =>
    new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
  const periodFrom = localDateMinuteToUtc(localMonth(-1), 0, 'Europe/Moscow');
  const periodTo = localDateMinuteToUtc(localMonth(0), 0, 'Europe/Moscow');
  const input: MeasurementIntent = {
    kind: 'reputation_period',
    periodFrom,
    periodTo,
    asOf: periodTo,
    timezone: 'Europe/Moscow',
    scope: {
      version: 1,
      capabilityKey: 'measurement.read',
      branchIds: [],
      dimensions: {},
      sourceQuery: {},
    },
  };
  const previousFrom = reputationPeriod(
    normalizeMeasurement(input),
  ).previousFrom;
  const nativeInput: MeasurementIntent = {
    ...input,
    scope: { ...input.scope, dimensions: { source: 'native_feedback' } },
  };
  const read = (i: MeasurementIntent = input) =>
    canonicalUtcTransaction(
      db,
      (tx) => reader.read(tenant.id, normalizeMeasurement(i), tx),
      { readOnly: true },
    );
  const materialize = async (i: MeasurementIntent = input) =>
    system(async () => {
      const receipt = await measurements.admit(i, {
        namespace: 'measurement_request',
        id: randomUUID(),
      });
      return measurements.resume(receipt.id);
    });
  async function response(at: Date, rating: number) {
    sourceClock = at;
    const start = new Date(at.getTime() - 5 * 3600000),
      end = new Date(at.getTime() - 4 * 3600000);
    const appointment = await db.appointment.create({
      data: {
        tenantId: tenant.id,
        mayaClientId: client.id,
        branchId: branch.id,
        staffId: staff.id,
        staffExternalId: 'untrusted-external-staff',
        serviceIds: [],
        startAt: start,
        endAt: end,
        blockedStartAt: start,
        blockedEndAt: end,
        attendance: 'arrived',
        status: 'confirmed',
        source: 'internal',
      },
    });
    const request = await manager(() =>
      nativeOwner.request(
        tenant.id,
        user.id,
        { appointmentId: appointment.id },
        randomUUID(),
      ),
    );
    assert.equal(typeof request.requestId, 'string');
    const requestId = request.requestId as string;
    await publicClient(() =>
      nativeOwner.respond(
        channelProof,
        'response',
        {
          requestId,
          expectedAcceptedVersion: 0,
          kind: 'response',
          rating,
          comment:
            'Synthetic private text must never enter measurement evidence',
        },
        randomUUID(),
      ),
    );
    return { requestId, appointment };
  }
  await response(new Date(previousFrom.getTime() + 3 * 86400000), 4);
  const current = await response(
    new Date(periodTo.getTime() - 2 * 86400000),
    2,
  );
  const review = (
    source: string,
    rating: number,
    occurredAt: Date,
    branchId: string | null = branch.id,
    tenantId = tenant.id,
  ) =>
    reviewOwner.accept({
      tenantId,
      source,
      externalRef: randomUUID(),
      rating,
      occurredAt,
      topicTags: [],
      branchId,
      text: 'Synthetic private review',
    });
  await review('yandex', 1, new Date(periodFrom.getTime() - 1));
  await review('yandex', 5, periodFrom);
  await review('yandex', 1, periodTo);
  await review('yandex', 1, new Date(periodFrom.getTime() + 1), branch2.id);
  await review('yandex', 1, periodFrom, foreignBranch.id, other.id);
  await review('native_feedback', 5, periodFrom);
  await proof(
    'month start inclusive/end exclusive, tenant-local timezone, exact branch and tenant',
    async () => {
      const result = await read({ ...input, branchId: branch.id });
      assert.equal(
        value(
          result.metrics,
          'observed_review_count',
          'business_review/yandex',
        ),
        '1',
      );
      assert.equal(
        value(
          result.metrics,
          'previous_observed_review_count',
          'business_review/yandex',
        ),
        '1',
      );
      assert.equal(
        value(result.metrics, 'average_rating', 'business_review/yandex'),
        '5',
      );
      assert.equal(
        value(
          result.metrics,
          'verified_client_author_count',
          'business_review/native_feedback',
        ),
        null,
      );
      assert.equal(value(result.metrics, 'observed_review_count'), '1');
    },
  );
  await proof(
    'Staff/Client/Appointment exact native scope supports Client without Maya User',
    async () => {
      assert.equal(client.userId, null);
      const result = await read({
        ...nativeInput,
        clientId: client.id,
        staffId: staff.id,
        appointmentId: current.appointment.id,
        branchId: branch.id,
      });
      assert.equal(value(result.metrics, 'verified_client_author_count'), '1');
      assert.equal(value(result.metrics, 'verified_appointment_count'), '1');
      assert.equal(result.qualification, 'VERIFIED');
      for (const invalid of [
        { ...input, staffId: staff.id },
        { ...input, branchId: foreignBranch.id },
        { ...nativeInput, clientId: foreignClient.id },
        { ...nativeInput, staffId: staff.id, branchId: branch2.id },
        {
          ...input,
          branchId: branch.id,
          scope: { ...input.scope, branchIds: [branch2.id] },
        },
        {
          ...input,
          timezone: 'UTC',
          periodFrom: new Date(localMonth(-1)),
          periodTo: new Date(localMonth(0)),
        },
      ])
        await assert.rejects(() => read(invalid));
    },
  );
  const first = await materialize(nativeInput);
  const firstSnapshot = JSON.stringify(first.valuesJson),
    firstHash = first.snapshotHash;
  await proof(
    'observed average/count delta uses its same source and exact denominator',
    () => {
      const metrics = (
        first.valuesJson as unknown as { metrics: MeasurementMetric[] }
      ).metrics;
      assert.equal(value(metrics, 'rating_denominator'), '1');
      assert.equal(value(metrics, 'average_rating'), '2');
      assert.equal(value(metrics, 'observed_average_delta'), '-2');
      assert.equal(first.attributionStatus, 'NOT_APPLICABLE');
    },
  );
  sourceClock = new Date(periodTo.getTime() + 86400000);
  await publicClient(() =>
    nativeOwner.respond(
      channelProof,
      'response',
      {
        requestId: current.requestId,
        expectedAcceptedVersion: 1,
        kind: 'response',
        rating: 5,
        comment: null,
      },
      randomUUID(),
    ),
  );
  await proof(
    'current correction remains in original response month and records later observation',
    async () => {
      const result = await read(nativeInput);
      assert.equal(value(result.metrics, 'observed_review_count'), '1');
      assert.equal(value(result.metrics, 'average_rating'), '5');
      assert.ok(
        result.reasons.includes('source_observed_after_business_cutoff'),
      );
      const revised = await materialize(nativeInput);
      assert.equal(revised.revision, first.revision + 1);
      assert.notEqual(revised.snapshotHash, firstHash);
    },
  );
  sourceClock = new Date();
  await publicClient(() =>
    nativeOwner.respond(
      channelProof,
      'withdraw',
      {
        requestId: current.requestId,
        expectedAcceptedVersion: 2,
        kind: 'withdraw',
        rating: null,
        comment: null,
      },
      randomUUID(),
    ),
  );
  await proof(
    'withdrawal supersedes current result without resurrecting earlier responses or rewriting snapshots',
    async () => {
      const withdrawn = await materialize(nativeInput);
      const metrics = (
        withdrawn.valuesJson as unknown as { metrics: MeasurementMetric[] }
      ).metrics;
      assert.equal(value(metrics, 'observed_review_count'), '0');
      assert.equal(value(metrics, 'average_rating'), null);
      const old = await canonicalUtcTransaction(
        db,
        (tx) =>
          tx.measurementRevision.findUniqueOrThrow({ where: { id: first.id } }),
        { readOnly: true },
      );
      assert.equal(JSON.stringify(old.valuesJson), firstSnapshot);
      assert.equal(old.snapshotHash, firstHash);
      assert.equal(
        (await system(() => measurements.current(nativeInput))).revision?.id,
        withdrawn.id,
      );
    },
  );
  for (let n = 0; n < 1005; n += 20)
    await Promise.all(
      Array.from({ length: Math.min(20, 1005 - n) }, () =>
        review('bulk', 4, periodFrom),
      ),
    );
  await proof(
    'more than 1000 reviews use bounded aggregate receipts and retain no text or individual source copies',
    async () => {
      const before = await Promise.all([
        db.actionExecution.count(),
        db.nativeFeedbackRequest.count(),
        db.nativeFeedbackRevision.count(),
        db.businessReview.count(),
      ]);
      const result = await materialize(input);
      const metrics = (
        result.valuesJson as unknown as { metrics: MeasurementMetric[] }
      ).metrics;
      const evidenceResult = result.evidenceRefsJson as unknown as {
        sources: unknown[];
      };
      assert.equal(
        value(metrics, 'observed_review_count', 'business_review/bulk'),
        '1005',
      );
      assert.equal(evidenceResult.sources.length, 2);
      assert.ok(Buffer.byteLength(JSON.stringify(result.valuesJson)) < 64000);
      assert.doesNotMatch(
        JSON.stringify([result.valuesJson, result.evidenceRefsJson]),
        /Synthetic|private text|encrypted|7000000001|example\.invalid/,
      );
      assert.deepEqual(
        await Promise.all([
          db.actionExecution.count(),
          db.nativeFeedbackRequest.count(),
          db.nativeFeedbackRevision.count(),
          db.businessReview.count(),
        ]),
        before,
      );
      assert.equal(
        await db.actionExecution.count({
          where: {
            tenantId: tenant.id,
            capability: { startsWith: 'communication.native-feedback.' },
          },
        }),
        0,
      );
    },
  );
  await proof(
    'partial current local month comparison remains not measured',
    async () => {
      const result = await read({
        ...input,
        asOf: new Date(periodFrom.getTime() + 4 * 86400000),
      });
      assert.equal(
        value(result.metrics, 'observed_count_delta', 'business_review/yandex'),
        null,
      );
      assert.equal(
        value(
          result.metrics,
          'observed_average_delta',
          'business_review/yandex',
        ),
        null,
      );
      assert.ok(
        result.reasons.includes(
          'partial_calendar_month_comparison_not_measured',
        ),
      );
    },
  );
  await proof(
    'pending exact Appointment reputation receipt closes unavailable after canonical Client correction',
    async () => {
      const replacement = await db.client.create({
        data: { tenantId: tenant.id },
      });
      for (const [externalId, clientId] of [
        ['p05-a', client.id],
        ['p05-b', replacement.id],
      ])
        await db.crmClientLink.create({
          data: {
            tenantId: tenant.id,
            provider: 'yclients',
            externalId,
            clientId,
          },
        });
      const sourceOwner = new AppointmentObservationService(db, context, {
        resolveStaffIdForBooking: () => Promise.resolve(null),
      } as unknown as CrmService);
      const changeOwner = new AppointmentChangeService(
        db,
        context,
        new EventStoreService(db, context),
      );
      const observe = (externalClient: string) =>
        system(async () => {
          const observed = await sourceOwner.fromSourceShape(
            tenant.id,
            'yclients',
            {
              id: 'p05-correction',
              client: { id: externalClient },
              provider: { id: 'p05-external' },
              service_ids: [],
              start_at: new Date(periodFrom.getTime() + 86400000).toISOString(),
              end_at: new Date(periodFrom.getTime() + 90000000).toISOString(),
              status: 'confirmed',
              attendance: 'arrived',
              total_price: 100,
              currency: 'RUB',
            },
          );
          assert.ok(observed);
          return changeOwner.applyObservation({
            tenantId: tenant.id,
            provider: 'yclients',
            observed,
            ingestionMethod: 'reconciliation',
            baselineEstablished: false,
            observedAt: new Date(),
          });
        });
      const original = await observe('p05-a');
      const receipt = await system(() =>
        measurements.admit(
          {
            ...nativeInput,
            clientId: client.id,
            appointmentId: original.appointmentId,
          },
          { namespace: 'measurement_request', id: randomUUID() },
        ),
      );
      await observe('p05-b');
      const closed = await system(() => measurements.resume(receipt.id));
      assert.equal(closed.completeness, 'UNAVAILABLE');
      assert.equal(closed.clientId, client.id);
      assert.deepEqual(closed.valuesJson, { version: 1, metrics: [] });
      assert.deepEqual(closed.limitationsJson, {
        version: 1,
        reasons: ['source_subject_changed'],
      });
    },
  );
  await proof(
    'source-family overflow publishes unavailable and supersedes the earlier aggregate without a pending loop',
    async () => {
      const prior = await system(() => measurements.current(input));
      assert.equal(prior.revision?.completeness, 'PARTIAL');
      for (let n = 0; n < 17; n++) await review(`overflow_${n}`, 5, periodFrom);
      const overflow = await materialize(input);
      assert.equal(overflow.state, 'PUBLISHED');
      assert.equal(overflow.completeness, 'UNAVAILABLE');
      assert.equal(overflow.qualification, 'UNQUALIFIED');
      assert.deepEqual(overflow.valuesJson, { version: 1, metrics: [] });
      assert.deepEqual(overflow.limitationsJson, {
        version: 1,
        reasons: ['reputation_source_bound_exceeded'],
      });
      const current = await system(() => measurements.current(input));
      assert.equal(current.revision?.id, overflow.id);
      assert.equal(current.refreshPending, false);
    },
  );
  assert.equal(await db.tenant.count(), beforeTenants + 2);
  console.log(
    JSON.stringify(
      {
        package: 'C7-P05',
        checks,
        productionEffects: 0,
        providerWrites: 0,
        schemaChanges: 0,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
