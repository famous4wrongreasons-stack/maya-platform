import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { NativeFeedbackService } from '../src/native-feedback/native-feedback.service';
import { NativeFeedbackPolicyService } from '../src/native-feedback/native-feedback-policy.service';
import { ClientWebPushService } from '../src/crm/client-web-push.service';
import type { EntitlementsService } from '../src/entitlements/entitlements.service';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';
import {
  asActor,
  context,
  db,
  engine,
  ingress,
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

let now = new Date();
const endpoints = new ClientWebPushService(
  db,
  context,
  authenticator,
  encryption,
);
const policy = new NativeFeedbackPolicyService(
  db,
  context,
  encryption,
  endpoints,
  entitlements as EntitlementsService,
  () => now,
);
const owner = () =>
  new NativeFeedbackService(
    db,
    context,
    channelRuntime,
    ingress,
    engine,
    encryption,
    policy,
    () => now,
  );
const checks: string[] = [];
async function main() {
  await db.$connect();
  const base = await baseFixture('r08'),
    client = await clientFixture(base, 'native'),
    other = await clientFixture(base, 'other');
  const actor = await staffFixture(base.tenantId),
    foreignBase = await baseFixture('r08-foreign'),
    foreign = await clientFixture(foreignBase, 'foreign');
  const appt = await db.appointment.create({
    data: {
      tenantId: base.tenantId,
      mayaClientId: client.client.id,
      clientId: null,
      branchId: base.branch.id,
      staffId: base.staff.id,
      staffExternalId: base.externalStaffId,
      serviceIds: [],
      blockedStartAt: new Date(now.getTime() - 5 * 3600000),
      blockedEndAt: new Date(now.getTime() - 4 * 3600000),
      startAt: new Date(now.getTime() - 5 * 3600000),
      endAt: new Date(now.getTime() - 4 * 3600000),
      attendance: 'arrived',
      status: 'confirmed',
      source: 'internal',
    },
  });
  const manager = <T>(work: () => T) =>
    asActor(base.tenantId, actor.user.id, actor.member.role, work);
  const clientScope = <T>(work: () => T) =>
    context.runAsPublicTenant(base.tenantId, work);
  const counts = async () => [
    await db.actionExecution.count({ where: { tenantId: base.tenantId } }),
    await db.nativeFeedbackRequest.count({
      where: { tenantId: base.tenantId },
    }),
  ];
  await manager(async () => {
    const before = await counts();
    await assert.rejects(
      owner().request(
        base.tenantId,
        actor.user.id,
        { appointmentId: 'unproven' },
        randomUUID(),
      ),
    );
    await db.appointment.update({
      where: { id: appt.id },
      data: { attendance: null },
    });
    await assert.rejects(
      owner().request(
        base.tenantId,
        actor.user.id,
        { appointmentId: appt.id },
        randomUUID(),
      ),
      /arrived/,
    );
    await db.appointment.update({
      where: { id: appt.id },
      data: { attendance: 'arrived' },
    });
    assert.deepEqual(await counts(), before);
  });
  checks.push(
    'missing exact Appointment/attendance rejected before ActionExecution',
  );
  const key = randomUUID();
  const results = await manager(() =>
    Promise.all(
      Array.from({ length: 4 }, () =>
        owner().request(
          base.tenantId,
          actor.user.id,
          { appointmentId: appt.id },
          key,
        ),
      ),
    ),
  );
  assert.equal(new Set(results.map((r) => r.actionExecutionId)).size, 1);
  const requestId = proofId(results[0].requestId);
  const root = await canonicalUtcTransaction(
    db,
    (tx) =>
      tx.nativeFeedbackRequest.findUniqueOrThrow({ where: { id: requestId } }),
    { readOnly: true },
  );
  assert.equal(root.clientId, client.client.id);
  assert.equal(root.state, 'OPEN');
  assert.equal(owner().readPlan(root).slots.length, 0);
  await manager(async () => {
    assert.equal(
      (
        await owner().request(
          base.tenantId,
          actor.user.id,
          { appointmentId: appt.id },
          randomUUID(),
        )
      ).requestId,
      requestId,
    );
    await assert.rejects(
      owner().request(
        base.tenantId,
        actor.user.id,
        { appointmentId: 'changed' },
        key,
      ),
      /IDEMPOTENCY_CONFLICT/,
    );
  });
  checks.push(
    'four concurrent commands one root/execution; changed intent conflicts; different key same Appointment returns original root; missing marketing consent creates no delivery slots',
  );
  const response = {
      requestId,
      expectedAcceptedVersion: 0,
      kind: 'response',
      rating: 4,
      comment: '  Хорошо\r\nСпасибо  ',
    },
    responseKey = randomUUID();
  await clientScope(async () => {
    const before = await counts();
    await assert.rejects(
      owner().respond('unverified-proof', 'response', response, randomUUID()),
    );
    await assert.rejects(
      owner().respond(other.proof, 'response', response, randomUUID()),
      /owned feedback/,
    );
    await assert.rejects(
      owner().respond(foreign.proof, 'response', response, randomUUID()),
    );
    await assert.rejects(
      owner().respond(
        client.proof,
        'response',
        { ...response, rating: 6 },
        randomUUID(),
      ),
    );
    await assert.rejects(
      owner().respond(
        client.proof,
        'response',
        { ...response, userId: actor.user.id },
        randomUUID(),
      ),
    );
    assert.deepEqual(await counts(), before);
    const accepted = await Promise.all(
      Array.from({ length: 4 }, () =>
        owner().respond(client.proof, 'response', response, responseKey),
      ),
    );
    assert.equal(new Set(accepted.map((r) => r.actionExecutionId)).size, 1);
    await assert.rejects(
      owner().respond(
        client.proof,
        'response',
        { ...response, rating: 5 },
        responseKey,
      ),
      /IDEMPOTENCY_CONFLICT/,
    );
    const projection = await owner().readOwn(client.proof);
    assert.equal(projection.requests[0].rating, 4);
    assert.equal(projection.requests[0].comment, 'Хорошо\nСпасибо');
    const beforeRace = await db.actionExecution.count({
      where: { tenantId: base.tenantId },
    });
    const race = await Promise.allSettled(
      [4, 5].map((rating) =>
        owner().respond(
          client.proof,
          'response',
          { ...response, expectedAcceptedVersion: 1, rating },
          randomUUID(),
        ),
      ),
    );
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      await db.actionExecution.count({ where: { tenantId: base.tenantId } }),
      beforeRace + 1,
    );
    assert.equal(
      await db.nativeFeedbackRevision.count({
        where: { tenantId: base.tenantId, requestId },
      }),
      2,
    );
  });
  checks.push(
    'User-free verified Client supported; unverified/wrong Client/tenant/rating/extra authority denied before AE; one concurrent correction winner and no loser AE',
  );
  now = new Date(root.expiresAt.getTime() + 86400000);
  await clientScope(async () => {
    assert.equal(
      (await owner().respond(client.proof, 'response', response, responseKey))
        .version,
      1,
    );
    await assert.rejects(
      owner().respond(
        client.proof,
        'response',
        { ...response, expectedAcceptedVersion: 2 },
        randomUUID(),
      ),
      /WINDOW_CLOSED/,
    );
    await owner().respond(
      client.proof,
      'withdraw',
      {
        requestId,
        expectedAcceptedVersion: 2,
        kind: 'withdraw',
        rating: null,
        comment: null,
      },
      randomUUID(),
    );
    const before = await counts(),
      view = await owner().readOwn(client.proof);
    assert.equal(view.requests[0].state, 'WITHDRAWN');
    assert.equal(view.requests[0].rating, null);
    assert.equal(view.requests[0].comment, null);
    assert.deepEqual(await counts(), before);
    const revocation = {
      contract: 'a18.client-channel-revocation.v1',
      revocationIdentityHash: 'a'.repeat(64),
      tenantId: base.tenantId,
      linkId: client.link.id,
      actorProofHash: 'b'.repeat(64),
      reason: 'Synthetic explicit revocation',
    };
    await db.clientChannelLink.update({
      where: { id: client.link.id },
      data: {
        revokedAt: new Date(),
        revocationIdentityHash: revocation.revocationIdentityHash,
        revocationEvidenceJson: revocation,
        revocationEvidenceHash: createHash('sha256')
          .update(JSON.stringify(revocation))
          .digest('hex'),
      },
    });
    await assert.rejects(owner().readOwn(client.proof));
    await assert.rejects(
      owner().respond(client.proof, 'response', response, responseKey),
    );
  });
  assert.equal(
    await db.businessReview.count({ where: { tenantId: base.tenantId } }),
    0,
  );
  assert.equal(
    await db.marketingCampaign.count({ where: { tenantId: base.tenantId } }),
    0,
  );
  checks.push(
    'exact retry survives expiry; new response denied; withdrawal after window hides content without read write; revoked link denied; BusinessReview/provider/delivery writes zero',
  );
  console.log(
    JSON.stringify(
      {
        package: 'R08',
        proof: 'real PostgreSQL business executor',
        checks,
        productionEffects: 0,
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

function proofId(value: unknown): string {
  assert.equal(typeof value, 'string');
  return value as string;
}
