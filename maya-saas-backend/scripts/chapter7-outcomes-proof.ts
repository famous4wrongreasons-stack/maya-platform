import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { createStandaloneCanonicalActionEngine } from '../src/action-engine/action-engine.factory';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
} from '../src/action-engine';
import {
  EntitlementsService,
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
} from '../src/entitlements/entitlements.service';
import { CrmService } from '../src/crm/crm.service';
import { ClientAppointmentCreateService } from '../src/appointments/client-appointment-create.service';
import { clientChannelSubjectHash } from '../src/crm/client-channel-subject';
import { AppointmentObservationService } from '../src/crm/appointment-observation.service';
import { AppointmentChangeService } from '../src/crm/appointment-change.service';
import { EventStoreService } from '../src/events/event-store.service';
import { Package5Wave5RecoveryFactPlaneService } from '../src/package5-wave5/package5-wave5.service';
import { OpportunityLifecycleRepository } from '../src/opportunities/opportunity.lifecycle';
import { CanonicalOpportunityEngine } from '../src/opportunities/opportunity.engine';
import { incomingCustomerRequestSignal } from '../src/opportunities/opportunity.signal';
import { CommunicationDeliveryKernel } from '../src/communication-delivery/communication-delivery.kernel';
import { COMMUNICATION_ENVELOPE_CONTRACT } from '../src/communication-delivery/communication-delivery.contract';
import { MeasurementOutcomesReader } from '../src/measurement/measurement.outcomes';
import { MeasurementSources } from '../src/measurement/measurement.sources';
import { MeasurementService } from '../src/measurement/measurement.service';
import {
  MeasurementIntent,
  MeasurementMetric,
} from '../src/measurement/measurement.contract';

// Fail before constructing Prisma. No aliases, query-host overrides or old DBs.
const url = new URL(process.env.DATABASE_URL ?? '');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55517');
assert.equal(url.username, 'maya_c7');
assert.equal(url.pathname, '/maya_c7_replay');
assert.equal(url.search, '');
globalThis.fetch = () =>
  Promise.reject(Error('P03 synthetic proof forbids live HTTP'));
const secret = 'chapter7-outcome-local-proof-not-production-secret';
const config = new ConfigService({
  DATABASE_URL: url.toString(),
  CRM_ENCRYPTION_KEY: secret,
});
const db = new PrismaService(config),
  context = new TenantContextService(),
  encryption = new EncryptionService(config);
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
const engine = createStandaloneCanonicalActionEngine(db, entitlements, {
  identitySecret: secret,
  payloadEncryptionSecret: secret,
});
const reader = new MeasurementOutcomesReader(db, context, {
  readTrustedNormalizedInput: (tenantId, executionId, tx) =>
    engine.kernel.readTrustedNormalizedInput(tenantId, executionId, tx),
});
const measurements = new MeasurementService(
  db,
  context,
  new MeasurementSources(db, undefined, undefined, reader),
);
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const checks: string[] = [];
async function proof(name: string, work: () => unknown) {
  await work();
  checks.push(name);
  console.log('PASS ' + name);
}
function metrics(row: { valuesJson: unknown }) {
  return (row.valuesJson as { metrics: MeasurementMetric[] }).metrics;
}
function value(row: { valuesJson: unknown }, key: string) {
  return metrics(row).find((m) => m.key === key)?.value;
}

async function main() {
  const tenant = await db.tenant.create({
    data: {
      name: 'Synthetic C7 P03',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    },
  });
  const foreign = await db.tenant.create({
    data: {
      name: 'Synthetic P03 foreign',
      slug: randomUUID(),
      status: 'active',
      defaultTimezone: 'UTC',
    },
  });
  const system = <T>(work: () => T) =>
    context.runAsSystemTenant(tenant.id, work);
  const client = await db.client.create({ data: { tenantId: tenant.id } });
  const otherClient = await db.client.create({ data: { tenantId: tenant.id } });
  const foreignClient = await db.client.create({
    data: { tenantId: foreign.id },
  });
  const subjectHash = clientChannelSubjectHash(
    encryption,
    'telegram',
    'p03-synthetic-channel',
  );
  const verificationIdentityHash = hash(randomUUID());
  const verificationEvidenceJson = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'p03-synthetic-proof',
    tenantId: tenant.id,
    clientId: client.id,
    provider: 'telegram',
    providerSubjectHash: subjectHash,
    verificationIdentityHash,
    channelControlProofHash: hash('synthetic-control'),
    clientAuthorityProofHash: hash(client.id),
  };
  const link = await db.clientChannelLink.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      provider: 'telegram',
      providerSubjectHash: subjectHash,
      verificationMethod: 'explicit_verified_challenge',
      verificationIdentityHash,
      verificationEvidenceJson,
      verificationEvidenceHash: hash(verificationEvidenceJson),
    },
  });
  const start = '2099-09-20T10:00:00.000Z';
  const fixtureKernel = new ActionEngineKernel(db, {
    identitySecret: secret,
    payloadEncryptionSecret: secret,
    controlledFixtureMode: true,
  });
  const crm = Object.assign(Object.create(CrmService.prototype), {
    prisma: db,
    tenantContext: context,
    encryptionService: encryption,
    actionEngineRuntime: engine.runtime,
    internalCalendarService: {
      getAvailableSlots: () =>
        Promise.resolve([
          {
            start,
            end: '2099-09-20T11:00:00.000Z',
            staff_id: 'synthetic-staff',
            branch_id: null,
          },
          {
            start: '2099-09-20T12:00:00.000Z',
            end: '2099-09-20T13:00:00.000Z',
            staff_id: 'synthetic-staff',
            branch_id: null,
          },
        ]),
      getServiceTiming: () =>
        Promise.resolve({
          durationMinutes: 60,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        }),
    },
    getCalendarSource: () => Promise.resolve('internal'),
    getServices: () =>
      Promise.resolve([
        {
          id: 'synthetic-service',
          name: 'Synthetic service',
          price: 2500.25,
          duration_minutes: 60,
          currency: 'RUB',
        },
      ]),
    getStaff: () => Promise.resolve([]),
    getAvailableSlots: () =>
      Promise.resolve([
        {
          start,
          end: '2099-09-20T11:00:00.000Z',
          staff_id: 'synthetic-staff',
          branch_id: null,
        },
        {
          start: '2099-09-20T12:00:00.000Z',
          end: '2099-09-20T13:00:00.000Z',
          staff_id: 'synthetic-staff',
          branch_id: null,
        },
      ]),
    resolveStaffIdForBooking: () => Promise.resolve(null),
  }) as CrmService;
  const creator = new ClientAppointmentCreateService(
    db,
    context,
    encryption,
    crm,
  );
  const create = (key: string, at = start) =>
    system(() =>
      creator.forVerifiedChannel(
        tenant.id,
        link.id,
        {
          staffId: 'synthetic-staff',
          serviceIds: ['synthetic-service'],
          start: at,
          clientName: 'Synthetic contact',
          clientPhone: '+79990000001',
        },
        {
          sourceType: 'authenticated_request',
          sourceRef: `p03:${key}`,
          callerIdempotency: { scope: 'appointments.client.create.v1', key },
          authorizationCheck: () => Promise.resolve(),
        },
      ),
    );
  const created = await create('p03-canonical-internal');
  const appointment = await db.appointment.findFirstOrThrow({
    where: { tenantId: tenant.id, mayaClientId: client.id },
  });
  const periodFrom = new Date(Date.now() - 90 * 86_400_000),
    periodTo = new Date(Date.now() + 86_400_000);
  const input = (
    kind: 'appointment_outcome' | 'execution_funnel' = 'appointment_outcome',
  ): MeasurementIntent => ({
    kind,
    ...(kind === 'appointment_outcome'
      ? { clientId: client.id, appointmentId: appointment.id }
      : {}),
    periodFrom,
    periodTo,
    timezone: 'UTC',
    asOf: new Date(),
    scope: {
      version: 1,
      capabilityKey: 'measurement.read',
      dimensions: {},
      sourceQuery: {},
      branchIds: [],
    },
  });
  const materialize = (i = input()) =>
    system(async () => {
      const receipt = await measurements.admit(i, {
        namespace: 'measurement_request',
        id: randomUUID(),
      });
      const lease = await measurements.claim(receipt.id);
      assert.ok(lease);
      return measurements.compute(lease);
    });
  const first = await materialize();
  await proof(
    'Q12 real B31 direct receipt credits exact internal Appointment and Client without User',
    () => {
      assert.equal(client.userId, null);
      assert.equal(first.state, 'PUBLISHED');
      assert.equal(first.attributionStatus, 'ATTRIBUTED');
      assert.equal(first.creditedExecutionId, created.execution.executionId);
      assert.equal(value(first, 'booked_value'), '250025');
      assert.equal(value(first, 'confirmed_cash'), null);
      assert.equal(value(first, 'filled_capacity'), null);
      assert.equal(value(first, 'exact_attributed_active_booking'), true);
    },
  );
  await proof(
    'Q04 later canonical cancellation advances current revision and preserves published history',
    async () => {
      const oldHash = first.snapshotHash;
      await system(() =>
        crm.executeInternalAppointmentCancelWithReceipt(
          tenant.id,
          appointment.id,
          {
            sourceType: 'authenticated_request',
            sourceRef: 'p03-exact-client-cancel',
            clientPrincipal: { linkId: link.id, appointmentId: appointment.id },
            authorizationCheck: () => Promise.resolve(),
            callerIdempotency: {
              scope: 'appointments.client.cancel.v1',
              key: 'p03-late-cancel',
            },
          },
        ),
      );
      const second = await materialize();
      assert.equal(second.attributionStatus, 'ATTRIBUTED');
      assert.equal(value(second, 'exact_attributed_active_booking'), false);
      assert.equal(second.revision, first.revision + 1);
      assert.equal(
        (
          await db.measurementRevision.findUniqueOrThrow({
            where: { id: first.id },
          })
        ).snapshotHash,
        oldHash,
      );
      assert.equal(value(first, 'exact_attributed_active_booking'), true);
      assert.equal(
        (await system(() => measurements.current(input()))).revision?.id,
        second.id,
      );
    },
  );
  await proof(
    'UNKNOWN source execution is read-only and is not replayed or credited by funnel measurement',
    async () => {
      const execution = await fixtureKernel.createExecutionForControlledFixture(
        {
          contract: ACTION_EXECUTION_REQUEST_CONTRACT,
          tenantId: tenant.id,
          capability: 'kernel.test.reconcile-before-retry',
          source: {
            type: 'synthetic_shadow',
            occurrenceScope: 'p03:unknown',
            sourceRef: 'p03:unknown',
          },
          targetRef: 'p03:unknown',
          input: { valueRef: 'p03:unknown' },
          evidenceRefs: [],
        },
      );
      const claim = await fixtureKernel.claimExecution({
        tenantId: tenant.id,
        executionId: execution.id,
        workerId: 'p03-unknown-proof',
      });
      const owned = {
        tenantId: tenant.id,
        executionId: execution.id,
        attemptId: claim.attempt.id,
        leaseToken: claim.leaseToken,
      };
      await fixtureKernel.markDispatchMayHaveCrossed(owned);
      await fixtureKernel.finalizeUnknown({
        ...owned,
        outcomeCode: 'p03_synthetic_unknown',
        errorClass: 'synthetic_lost_response',
      });
      const unknown = await db.actionExecution.findFirstOrThrow({
        where: { tenantId: tenant.id, state: 'UNKNOWN' },
      });
      const before = await db.actionAttempt.count({
        where: { tenantId: tenant.id, actionExecutionId: unknown.id },
      });
      const result = await materialize(input('execution_funnel'));
      assert.equal(value(result, 'action_unknown_count'), '1');
      assert.equal(
        await db.actionAttempt.count({
          where: { tenantId: tenant.id, actionExecutionId: unknown.id },
        }),
        before,
      );
      assert.equal(
        (
          await db.actionExecution.findUniqueOrThrow({
            where: { id: unknown.id },
          })
        ).state,
        'UNKNOWN',
      );
    },
  );
  await proof(
    'Q04 A29 frozen assignment and late source cancellation remain labelled and immutable as reported',
    async () => {
      const a29 = new Package5Wave5RecoveryFactPlaneService(db, context);
      const occurrence = new Date(Date.now() - 50 * 86_400_000),
        booking = new Date(occurrence.getTime() + 3600_000);
      await system(() =>
        a29.acceptTouchpoint({
          tenantId: tenant.id,
          externalEventId: 'p03-touchpoint',
          subjectRef: hash('p03-subject'),
          kind: 'reactivation',
          channel: 'telegram',
          status: 'sent',
          occurredAt: occurrence,
          attributionWindowDays: 1,
          source: 'legacy_bot',
          ingestionMethod: 'webhook',
        }),
      );
      await system(() =>
        a29.acceptBooking({
          tenantId: tenant.id,
          externalBookingRef: 'p03-booking',
          subjectRef: hash('p03-subject'),
          bookedAt: booking,
          visitAt: booking,
          bookedValueKopecks: 250025,
          currency: 'RUB',
          filledWindow: true,
          source: 'legacy_bot',
          ingestionMethod: 'webhook',
        }),
      );
      const assigned = await materialize(input('execution_funnel'));
      assert.equal(value(assigned, 'a29_current_booked_count'), '1');
      const before = await db.recoveryConversion.findFirstOrThrow({
        where: { tenantId: tenant.id },
      });
      await system(() =>
        a29.acceptBookingStatus({
          tenantId: tenant.id,
          externalBookingRef: 'p03-booking',
          status: 'canceled',
          occurredAt: new Date(),
          source: 'legacy_bot',
          ingestionMethod: 'webhook',
        }),
      );
      const canceled = await materialize(input('execution_funnel'));
      assert.equal(value(canceled, 'a29_current_canceled_count'), '1');
      assert.equal(canceled.attributionStatus, 'NOT_APPLICABLE');
      assert.equal(
        (
          await db.recoveryConversion.findFirstOrThrow({
            where: { tenantId: tenant.id },
          })
        ).touchpointId,
        before.touchpointId,
      );
      assert.equal(
        (
          await db.recoveryTouchpoint.findUniqueOrThrow({
            where: { id: before.touchpointId },
          })
        ).attributionWindowDays,
        1,
      );
      assert.equal(
        (
          await db.measurementRevision.findUniqueOrThrow({
            where: { id: assigned.id },
          })
        ).snapshotHash,
        assigned.snapshotHash,
      );
    },
  );
  await proof(
    'Q12 pending exact Appointment A-to-B correction publishes UNAVAILABLE with P03 installed',
    async () => {
      await db.crmClientLink.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          provider: 'yclients',
          externalId: 'p03-a',
        },
      });
      await db.crmClientLink.create({
        data: {
          tenantId: tenant.id,
          clientId: otherClient.id,
          provider: 'yclients',
          externalId: 'p03-b',
        },
      });
      const observer = new AppointmentObservationService(db, context, crm);
      const changes = new AppointmentChangeService(
        db,
        context,
        new EventStoreService(db, context),
      );
      const observe = (externalClient: string) =>
        system(async () => {
          const observed = await observer.fromSourceShape(
            tenant.id,
            'yclients',
            {
              id: 'p03-correction',
              client: { id: externalClient },
              provider: { id: 'p03-external' },
              service_ids: [],
              start_at: '2026-09-08T10:00:00Z',
              end_at: '2026-09-08T11:00:00Z',
              status: 'confirmed',
              attendance: 'arrived',
              total_price: 100,
              currency: 'RUB',
            },
          );
          assert.ok(observed);
          return changes.applyObservation({
            tenantId: tenant.id,
            provider: 'yclients',
            observed,
            ingestionMethod: 'reconciliation',
            baselineEstablished: true,
            observedAt: new Date(),
          });
        });
      const original = await observe('p03-a');
      const receipt = await system(() =>
        measurements.admit(
          { ...input(), appointmentId: original.appointmentId },
          { namespace: 'measurement_request', id: randomUUID() },
        ),
      );
      await observe('p03-b');
      const closed = await system(() => measurements.resume(receipt.id));
      assert.equal(closed.completeness, 'UNAVAILABLE');
      assert.equal(closed.clientId, client.id);
      assert.deepEqual(closed.valuesJson, { version: 1, metrics: [] });
      assert.deepEqual(closed.limitationsJson, {
        version: 1,
        reasons: ['source_subject_changed'],
      });
      const current = await materialize({
        ...input(),
        clientId: otherClient.id,
        appointmentId: original.appointmentId,
      });
      assert.equal(current.attributionStatus, 'UNATTRIBUTED');
      assert.ok(Number(value(current, 'outcome_event_count')) >= 1);
    },
  );
  await proof(
    'exact tenant, timezone and unsupported scoped funnel authority fails closed',
    async () => {
      await assert.rejects(
        system(() =>
          measurements.admit(
            { ...input(), clientId: foreignClient.id },
            { namespace: 'measurement_request', id: randomUUID() },
          ),
        ),
      );
      await assert.rejects(
        materialize({ ...input(), timezone: 'Europe/Moscow' }),
      );
      await assert.rejects(
        materialize({ ...input('execution_funnel'), clientId: client.id }),
      );
    },
  );
  await proof(
    'Q14 canonical delivery owner distinguishes ACCEPTED, DELIVERED, UNKNOWN and unsupported read receipt',
    async () => {
      // Existing controlled fixture gate and pre-existing capability only. These
      // create lifecycle facts through canonical owners, never raw ledger writes.
      const delivery = new CommunicationDeliveryKernel(db, {
        identitySecret: secret,
        payloadEncryptionSecret: secret,
      });
      for (const state of ['ACCEPTED', 'DELIVERED', 'UNKNOWN'] as const) {
        const execution =
          await fixtureKernel.createExecutionForControlledFixture({
            contract: ACTION_EXECUTION_REQUEST_CONTRACT,
            tenantId: tenant.id,
            capability: 'kernel.test.safe-retry',
            source: {
              type: 'synthetic_shadow',
              occurrenceScope: `p03:${state}`,
              sourceRef: `p03:${state}`,
            },
            targetRef: `p03:${state}`,
            input: { valueRef: `p03:${state}` },
            evidenceRefs: [],
          });
        const campaign = await delivery.createEnvelope({
          contract: COMMUNICATION_ENVELOPE_CONTRACT,
          tenantId: tenant.id,
          actionExecutionId: execution.id,
          scope: 'SINGLE',
          channel: 'test',
          capabilityKey: 'communication.test.reconcilable',
          campaignIdempotencyKey: `p03:${state}`,
          contentRef: `p03:${state}`,
          contentIdentityHash: hash(state),
          expiresAt: new Date(Date.now() + 3600_000),
          recipients: [
            {
              recipientRef: `p03:${state}`,
              recipientKind: 'external_client',
              eligibility: {
                basis: 'synthetic_consent',
                decision: 'ALLOW',
                policyVersion: 1,
                evidenceRef: `p03-consent:${state}`,
                evidenceHash: hash(state),
                checkedAt: new Date(),
              },
            },
          ],
        });
        const claim = await delivery.claimNext({
          tenantId: tenant.id,
          campaignId: campaign.id,
          workerId: 'p03-proof',
        });
        assert.ok(claim);
        const owned = {
          tenantId: tenant.id,
          campaignId: campaign.id,
          recipientId: claim.recipient.id,
          attemptId: claim.attempt.id,
          leaseToken: claim.leaseToken,
          recipientRevision: claim.recipient.revision,
        };
        const boundary = await delivery.markDispatchBoundary(owned);
        owned.recipientRevision = boundary.recipient.revision;
        if (state === 'ACCEPTED')
          await delivery.finalizeAccepted({
            ...owned,
            outcomeCode: 'p03_synthetic_accepted',
          });
        if (state === 'DELIVERED')
          await delivery.finalizeDelivered({
            ...owned,
            outcomeCode: 'p03_synthetic_delivered',
          });
        if (state === 'UNKNOWN')
          await delivery.finalizeUnknown({
            ...owned,
            outcomeCode: 'p03_synthetic_unknown',
            errorCode: 'synthetic_lost_response',
          });
      }
      const countBefore = await db.marketingDeliveryAttempt.count({
        where: { tenantId: tenant.id },
      });
      const result = await materialize(input('execution_funnel'));
      assert.equal(value(result, 'campaign_root_count'), '3');
      assert.equal(value(result, 'root_recipient_count'), '3');
      assert.equal(value(result, 'transport_delivery_accepted_count'), '1');
      assert.equal(value(result, 'transport_delivery_delivered_count'), '1');
      assert.equal(value(result, 'transport_delivery_unknown_count'), '1');
      assert.equal(value(result, 'recipient_read_count'), null);
      assert.equal(value(result, 'recipient_delivery_rate_numerator'), '1');
      assert.equal(value(result, 'recipient_delivery_rate_denominator'), '3');
      assert.equal(
        await db.marketingDeliveryAttempt.count({
          where: { tenantId: tenant.id },
        }),
        countBefore,
      );
    },
  );
  const opportunityOwner = new OpportunityLifecycleRepository(db),
    opportunityEngine = new CanonicalOpportunityEngine();
  const createOpportunities = (count: number) => {
    const at = new Date();
    return opportunityOwner.persistProjection({
      tenantId: tenant.id,
      validatedAt: at,
      projection: opportunityEngine.project({
        signals: Array.from({ length: count }, (_, index) =>
          incomingCustomerRequestSignal({
            tenantId: tenant.id,
            requestRef: `p03-request:${randomUUID()}:${index}`,
            observedAt: at.toISOString(),
            expiresAt: new Date(at.getTime() + 3600_000).toISOString(),
          }),
        ),
        policies: [],
        asOf: at.toISOString(),
      }),
    });
  };
  await proof(
    'Q15 canonical Opportunity assignment and admitted action cohorts retain independent denominators',
    async () => {
      await createOpportunities(2);
      const result = await materialize(input('execution_funnel'));
      assert.equal(value(result, 'opportunity_logical_count'), '2');
      assert.equal(value(result, 'opportunity_revision_count'), '2');
      assert.equal(value(result, 'proposal_count'), null);
      const executionCount = await db.actionExecution.count({
        where: { tenantId: tenant.id },
      });
      assert.equal(
        value(result, 'action_admitted_count'),
        String(executionCount),
      );
      assert.doesNotMatch(
        JSON.stringify([result.valuesJson, result.evidenceRefsJson]),
        /Synthetic contact|79990000001|normalizedInputEncrypted|bodyText|subjectRef/,
      );
    },
  );
  await proof(
    'Q13 unavailable capacity source never becomes true from A29 filledWindow flag',
    async () => {
      const result = await materialize();
      assert.equal(value(result, 'filled_capacity'), null);
      assert.equal(value(result, 'filled_capacity_attended'), null);
      assert.equal(
        metrics(result).find((m) => m.key === 'filled_capacity')?.state,
        'NOT_MEASURED',
      );
    },
  );
  await proof(
    'bounded source overflow publishes terminal UNAVAILABLE through shared publication',
    async () => {
      await createOpportunities(1000);
      const result = await materialize(input('execution_funnel'));
      assert.equal(result.state, 'PUBLISHED');
      assert.equal(result.completeness, 'UNAVAILABLE');
      assert.deepEqual(result.valuesJson, { version: 1, metrics: [] });
      assert.deepEqual(result.limitationsJson, {
        version: 1,
        reasons: ['measurement_outcomes_source_bound_exceeded'],
      });
      assert.equal(
        (await system(() => measurements.current(input('execution_funnel'))))
          .refreshPending,
        false,
      );
    },
  );
  console.log(
    JSON.stringify(
      {
        package: 'C7-P03',
        checks,
        schemaChanges: 0,
        providerWrites: 0,
        productionEffects: 0,
        syntheticTenant: tenant.id,
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
