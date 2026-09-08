import { AuditLogService } from '../src/audit-log/audit-log.service';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../src/action-engine';
import { NativeFeedbackService } from '../src/native-feedback/native-feedback.service';
import { NativeFeedbackPolicyService } from '../src/native-feedback/native-feedback-policy.service';
import { NativeFeedbackStore } from '../src/native-feedback/native-feedback.store';
import { ClientWebPushService } from '../src/crm/client-web-push.service';
import type { EntitlementsService } from '../src/entitlements/entitlements.service';
import { Package5Wave6MaintenanceService } from '../src/package5-wave6/package5-wave6.service';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';
import {
  asActor,
  caps,
  context,
  db,
  resolver,
  secret,
  staffFixture,
  entitlements,
} from './package5-wave-rc-proof-support';
import {
  authenticator,
  baseFixture,
  channelRuntime,
  clientFixture,
  encryption,
} from './package5-wave-rc-client-proof-support';

let now = new Date(Date.now() - 366 * 86400000);
const created = new Date(now),
  clock = () => now;
// Synthetic fixture defaults share its explicit old clock. No production or
// historical records are read, rewritten, inferred or backfilled.
const fixtureDb = db.$extends({
  query: {
    actionExecution: {
      async create({ args, query }) {
        args.data.createdAt = clock();
        args.data.updatedAt = clock();
        return query(args);
      },
    },
  },
}) as unknown as typeof db;
const kernel = new ActionEngineKernel(
    fixtureDb,
    { identitySecret: secret, payloadEncryptionSecret: secret, now: clock },
    caps,
    resolver,
    {
      audit: new AuditLogService(fixtureDb, context),
      encryption,
    },
  ),
  ingress = new CanonicalActionIngressService(kernel, resolver);
const endpoints = new ClientWebPushService(
    fixtureDb,
    context,
    authenticator,
    encryption,
  ),
  policy = new NativeFeedbackPolicyService(
    fixtureDb,
    context,
    encryption,
    endpoints,
    entitlements as EntitlementsService,
    clock,
  );
const owner = new NativeFeedbackService(
    fixtureDb,
    context,
    channelRuntime,
    ingress,
    kernel,
    encryption,
    policy,
    clock,
  ),
  store = new NativeFeedbackStore(
    fixtureDb,
    context,
    encryption,
    ingress,
    kernel,
    policy,
    clock,
  );
async function main() {
  await db.$connect();
  const base = await baseFixture('r08-retention'),
    client = await clientFixture(base, 'old-synthetic'),
    member = await staffFixture(base.tenantId);
  async function fixture(label: string, kind: 'resolved' | 'unknown') {
    const offset = kind === 'unknown' ? 2 * 3600000 : 0;
    const startAt = new Date(created.getTime() - 5 * 3600000 - offset),
      endAt = new Date(created.getTime() - 4 * 3600000 - offset);
    const appointment = await db.appointment.create({
      data: {
        tenantId: base.tenantId,
        mayaClientId: client.client.id,
        clientId: null,
        branchId: base.branch.id,
        staffId: base.staff.id,
        staffExternalId: base.externalStaffId,
        serviceIds: [],
        startAt,
        endAt,
        blockedStartAt: startAt,
        blockedEndAt: endAt,
        attendance: 'arrived',
        status: 'confirmed',
        source: 'internal',
      },
    });
    const request = await asActor(
      base.tenantId,
      member.user.id,
      member.member.role,
      () =>
        owner.request(
          base.tenantId,
          member.user.id,
          { appointmentId: appointment.id },
          randomUUID(),
        ),
    );
    const response = await context.runAsPublicTenant(base.tenantId, () =>
      owner.respond(
        client.proof,
        'response',
        {
          requestId: request.requestId,
          expectedAcceptedVersion: 0,
          kind: 'response',
          rating: 3,
          comment: 'Synthetic retained text ' + label,
        },
        randomUUID(),
      ),
    );
    if (kind === 'unknown')
      await context.runAsSystemTenant(base.tenantId, async () => {
        const loaded = await canonicalUtcTransaction(fixtureDb, (tx) =>
          store.read(
            tx,
            base.tenantId,
            proofId(request.requestId),
            proofId(response.revisionId),
          ),
        );
        await store.dispatch(
          base.tenantId,
          proofId(request.requestId),
          proofId(response.revisionId),
          loaded.plan.slots[0].slotKey,
        );
        const execution = await db.actionExecution.findFirstOrThrow({
          where: {
            tenantId: base.tenantId,
            nativeFeedbackRevisionId: proofId(response.revisionId),
          },
        });
        const claim = await kernel.claimExecution({
          tenantId: base.tenantId,
          executionId: execution.id,
          workerId: 'synthetic-feedback-unknown',
        });
        const owned = {
          tenantId: base.tenantId,
          executionId: execution.id,
          attemptId: claim.attempt.id,
          leaseToken: claim.leaseToken,
        };
        await kernel.markDispatchMayHaveCrossed(owned);
        await kernel.finalizeUnknown({
          ...owned,
          outcomeCode: 'synthetic_unknown',
          errorClass: 'synthetic',
        });
      });
    return {
      requestId: proofId(request.requestId),
      revisionId: proofId(response.revisionId),
    };
  }
  const resolved = await fixture('resolved', 'resolved'),
    unknown = await fixture('unknown', 'unknown');
  now = new Date();
  await context.runAsSystemTenant(base.tenantId, async () => {
    const ac6 = new Package5Wave6MaintenanceService(db, context),
      run = await ac6.prepare({
        actionClass: 'purge_native_feedback_payloads',
        batchSize: 20,
      });
    const results = await Promise.all([ac6.execute(run), ac6.execute(run)]);
    assert.ok(results.some((r) => r.deleted === 2));
    const root = await db.nativeFeedbackRequest.findUniqueOrThrow({
        where: { id: resolved.requestId },
      }),
      revision = await db.nativeFeedbackRevision.findUniqueOrThrow({
        where: { id: resolved.revisionId },
      });
    assert.equal(root.planEncrypted, null);
    assert.equal(root.contentEncrypted, null);
    assert.equal(revision.planEncrypted, null);
    assert.equal(revision.commentEncrypted, null);
    assert.equal(revision.rating, 3);
    assert.ok(
      root.planHash &&
        revision.intentHash &&
        root.requestExecutionId &&
        revision.executionId,
    );
    assert.equal((await ac6.execute(run)).deleted, 2);
    assert.ok(
      (
        await db.nativeFeedbackRequest.findUniqueOrThrow({
          where: { id: unknown.requestId },
        })
      ).planEncrypted,
    );
    assert.ok(
      (
        await db.nativeFeedbackRevision.findUniqueOrThrow({
          where: { id: unknown.revisionId },
        })
      ).planEncrypted,
    );
    await assert.rejects(
      db.nativeFeedbackRequest.delete({ where: { id: resolved.requestId } }),
    );
    await assert.rejects(
      db.nativeFeedbackRevision.update({
        where: { id: unknown.revisionId },
        data: {
          commentEncrypted: null,
          planEncrypted: null,
          payloadErasedAt: new Date(),
        },
      }),
    );
  });
  await context.runAsPublicTenant(base.tenantId, async () => {
    const view = await owner.readOwn(client.proof);
    assert.ok(
      view.requests.every(
        (r) => r.state === 'EXPIRED' && r.rating === null && r.comment === null,
      ),
    );
    await owner.respond(
      client.proof,
      'withdraw',
      {
        requestId: resolved.requestId,
        expectedAcceptedVersion: 1,
        kind: 'withdraw',
        rating: null,
        comment: null,
      },
      randomUUID(),
    );
    assert.equal(
      (
        await db.nativeFeedbackRequest.findUniqueOrThrow({
          where: { id: resolved.requestId },
        })
      ).state,
      'WITHDRAWN',
    );
  });
  console.log(
    JSON.stringify({
      package: 'R08',
      proof: 'actual AC6 runtime',
      result: 'PASS',
      erasedResolvedPayloads: 2,
      unknownOwnerAndRevisionHeld: true,
      immutableTombstonesRetained: true,
      expiredReadsHideContent: true,
      withdrawalAfterRetention: true,
      productionEffects: 0,
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

function proofId(value: unknown): string {
  assert.equal(typeof value, 'string');
  return value as string;
}
