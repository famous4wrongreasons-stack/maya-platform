import { AuditLogService } from '../src/audit-log/audit-log.service';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../src/action-engine';
import { stableActionJson } from '../src/action-engine/action-engine.identity';
import { EncryptionService } from '../src/encryption/encryption.service';
import { PublicCommunityService } from '../src/public-community/public-community.service';
import { PublicCommunityGatewayService } from '../src/public-community/public-community-gateway.service';
import { communityHash } from '../src/public-community/public-community.contract';
import { Package5Wave6MaintenanceService } from '../src/package5-wave6/package5-wave6.service';
import {
  asActor,
  caps,
  config,
  context,
  db,
  resolver,
  secret,
  staffFixture,
  tenantFixture,
} from './package5-wave-rc-proof-support';

let now = new Date(Date.now() - 366 * 86400000);
const clock = () => now;
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
      encryption: new EncryptionService(config),
    },
  ),
  ingress = new CanonicalActionIngressService(kernel, resolver);
async function main() {
  await db.$connect();
  const tenant = await tenantFixture(),
    actor = await staffFixture(tenant.id);
  const settings = new ConfigService({
    PUBLIC_COMMUNITY_GATEWAYS: JSON.stringify([
      {
        sourceGatewayId: 'synthetic-community-retention',
        tenantId: tenant.id,
        staticPublicationKeys: ['synthetic'],
        publishedPostNamespace: false,
        brandName: 'Synthetic brand',
        secretEnv: 'SYNTHETIC_SECRET',
      },
    ]),
    SYNTHETIC_SECRET: secret,
  });
  const gateway = new PublicCommunityGatewayService(settings),
    owner = new PublicCommunityService(
      fixtureDb,
      context,
      gateway,
      ingress,
      kernel,
      new EncryptionService(config),
      clock,
    );
  const body = {
      sourceGatewayId: 'synthetic-community-retention',
      operation: 'comment',
      publicationKey: 'synthetic',
      publicationPublished: true,
      visitorSubjectHash: communityHash('synthetic', tenant.id),
      command: {},
      requestKey: randomUUID(),
    },
    stamp = String(Math.floor(Date.now() / 1000));
  const source = gateway.verify(
    body,
    stamp,
    createHmac('sha256', secret)
      .update(`maya.community-source/1:${stamp}:`)
      .update(stableActionJson(body))
      .digest('hex'),
  ).source;
  const create = () =>
    context.runAsPublicTenant(tenant.id, () =>
      owner.acceptComment(
        source,
        {
          author: 'Гость',
          text: 'Synthetic immutable payload.',
          publicationConsent: true,
          consentPolicyVersion: 'public-comment-consent/1',
        },
        randomUUID(),
      ),
    );
  const pending = await create(),
    comment = await create(),
    row = await db.publicCommunityComment.findUniqueOrThrow({
      where: { id: comment.commentId },
    });
  const command = {
    commentId: row.id,
    contentHash: row.contentHash,
    expectedRevision: 0,
    decision: 'approve',
    reasonCode: 'human_review',
    text: null,
  };
  await asActor(tenant.id, actor.user.id, actor.member.role, () =>
    owner.act(tenant.id, actor.user.id, 'moderate', command, randomUUID()),
  );
  const reply = await asActor(tenant.id, actor.user.id, actor.member.role, () =>
    owner.act(
      tenant.id,
      actor.user.id,
      'reply',
      {
        ...command,
        expectedRevision: 1,
        decision: null,
        reasonCode: null,
        text: 'Confirmed human answer.',
      },
      randomUUID(),
    ),
  );
  now = new Date();
  const recent = await create();
  await assert.rejects(
    db.publicCommunityComment.update({
      where: { id: row.id },
      data: {
        authorEncrypted: null,
        textEncrypted: null,
        payloadErasedAt: new Date(),
      },
    }),
  );
  await context.runAsSystemTenant(tenant.id, async () => {
    const maintenance = new Package5Wave6MaintenanceService(db, context),
      run = await maintenance.prepare({
        actionClass: 'purge_public_community_payloads',
        batchSize: 20,
      });
    const results = await Promise.all([
      maintenance.execute(run),
      maintenance.execute(run),
    ]);
    assert.ok(results.some((r) => r.deleted === 3));
    for (const id of [
      pending.commentId,
      comment.commentId,
      proofId(reply.commentId),
    ]) {
      const erased = await db.publicCommunityComment.findUniqueOrThrow({
        where: { id },
      });
      assert.equal(erased.textEncrypted, null);
      assert.equal(erased.authorEncrypted, null);
      assert.ok(erased.payloadErasedAt);
      assert.ok(erased.intentHash && erased.contentHash && erased.identityHash);
    }
    const kept = await db.publicCommunityComment.findUniqueOrThrow({
      where: { id: recent.commentId },
    });
    assert.ok(kept.textEncrypted);
    assert.equal(kept.payloadErasedAt, null);
    await assert.rejects(
      db.publicCommunityComment.delete({ where: { id: pending.commentId } }),
    );
    assert.equal((await maintenance.execute(run)).deleted, 3);
  });
  const visible = await context.runAsPublicTenant(tenant.id, () =>
    owner.status(source),
  );
  assert.equal(visible.comments.length, 0);
  const final = await db.publicCommunityComment.findUniqueOrThrow({
    where: { id: row.id },
  });
  assert.equal(final.status, 'APPROVED');
  assert.ok(final.lastModerationExecutionId);
  console.log(
    JSON.stringify({
      package: 'R09',
      proof: 'actual AC6 scoped payload retention',
      result: 'PASS',
      erasedPayloads: 3,
      recentPayloadHeld: true,
      immutableTombstonesRetained: true,
      readSideErasure: 0,
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
