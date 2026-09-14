import { AuditLogService } from '../src/audit-log/audit-log.service';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../src/action-engine';
import { EncryptionService } from '../src/encryption/encryption.service';
import { Package5Wave4FileObjectStore } from '../src/package5-wave4/package5-wave4-object-store.service';
import { TeamCommunicationsService } from '../src/team-communications/team-communications.service';
import { Package5TeamPayloadStorage } from '../src/package5-wave6/package5-team-payload-storage';
import { Package5Wave6MaintenanceService } from '../src/package5-wave6/package5-wave6.service';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';
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
const engine = new ActionEngineKernel(
    fixtureDb,
    { identitySecret: secret, payloadEncryptionSecret: secret, now: clock },
    caps,
    resolver,
    {
      audit: new AuditLogService(fixtureDb, context),
      encryption: new EncryptionService(config),
    },
  ),
  ingress = new CanonicalActionIngressService(engine, resolver);
const objects = new Package5Wave4FileObjectStore(
    new ConfigService({
      UPLOAD_ROOT: resolve(
        process.env.MAYA_RC_PROOF_DIRECTORY ?? '/tmp/maya-rc-proof-artifacts',
        'r12-retention-storage',
        'uploads',
      ),
    }),
  ),
  owner = new TeamCommunicationsService(
    fixtureDb,
    context,
    ingress,
    engine,
    new EncryptionService(config),
    objects,
    clock,
  ),
  storage = new Package5TeamPayloadStorage(owner.storage);
async function main() {
  await db.$connect();
  const tenant = await tenantFixture(),
    actor = await staffFixture(tenant.id, 'staff');
  const run = <T>(f: () => T) =>
    asActor(tenant.id, actor.user.id, actor.member.role, f);
  const bytes = Buffer.from('Synthetic retained private bytes.'),
    digest = createHash('sha256').update(bytes).digest('hex');
  async function upload(finalize: boolean, unknown = false) {
    const key = randomUUID(),
      r = await run(() =>
        owner.act(
          tenant.id,
          actor.user.id,
          'reserve',
          {
            contentSha256: digest,
            declaredSize: bytes.length,
            kind: 'file',
            mime: 'text/plain',
            filename: 'private.txt',
            retentionPolicyVersion: 1,
          },
          key,
        ),
      ),
      id = proofId(r.attachmentId);
    await run(() => owner.chunk(tenant.id, actor.user.id, id, 0, bytes));
    if (finalize) {
      const publish = owner.storage.publish.bind(owner.storage);
      if (unknown)
        owner.storage.publish = async (input) => {
          await publish(input);
          throw Error('Synthetic unresolved storage receipt');
        };
      try {
        await run(() =>
          owner.act(
            tenant.id,
            actor.user.id,
            'finalize',
            { attachmentId: id, expectedDigest: digest },
            randomUUID(),
          ),
        );
      } finally {
        owner.storage.publish = publish;
      }
    }
    return id;
  }
  const ready = await upload(true),
    abandoned = await upload(false),
    unknown = await upload(true, true);
  const sent = await run(() =>
      owner.act(
        tenant.id,
        actor.user.id,
        'send',
        {
          conversationKey: 'team/main',
          text: 'Synthetic expired text',
          attachmentId: ready,
        },
        randomUUID(),
      ),
    ),
    messageId = proofId(sent.messageId);
  now = new Date();
  const recent = await run(() =>
    owner.act(
      tenant.id,
      actor.user.id,
      'send',
      {
        conversationKey: 'team/main',
        text: 'Recent retained text',
        attachmentId: null,
      },
      randomUUID(),
    ),
  );
  await assert.rejects(run(() => owner.media(tenant.id, actor.user.id, ready)));
  const row = await db.teamAttachment.findUniqueOrThrow({
    where: { id: ready },
  });
  assert.ok(await owner.storage.head(owner.storageIntent(row)));
  await assert.rejects(
    db.teamMessage.update({
      where: { id: messageId },
      data: {
        payloadEncrypted: null,
        planEncrypted: null,
        payloadErasedAt: new Date(),
      },
    }),
  );
  await context.runAsSystemTenant(tenant.id, async () => {
    assert.equal(
      await canonicalUtcTransaction(db, (tx) =>
        storage.eraseClaimedAttachment(tx, {
          kind: 'TeamAttachment',
          id: ready,
          tenantId: tenant.id,
          digest,
          deadline: row.mediaExpiresAt!,
        }),
      ),
      false,
    );
    const maintenance = new Package5Wave6MaintenanceService(
      db,
      context,
      undefined,
      storage,
    );
    const shadow = await maintenance.shadow({
      actionClass: 'purge_team_attachment_payloads',
      batchSize: 20,
    });
    assert.equal(shadow.items.length, 2);
    const runId = await maintenance.prepare({
        actionClass: 'purge_team_attachment_payloads',
        batchSize: 20,
      }),
      lease = await maintenance.claim(runId);
    assert.ok(lease);
    const erase = owner.storage.eraseClaimed.bind(owner.storage);
    let interrupted = false;
    owner.storage.eraseClaimed = async (input) => {
      const result = await erase(input);
      if (!interrupted) {
        interrupted = true;
        throw Error('Synthetic process loss after claimed physical purge');
      }
      return result;
    };
    try {
      await assert.rejects(maintenance.commit(lease), /Synthetic process loss/);
    } finally {
      owner.storage.eraseClaimed = erase;
    }
    assert.equal(
      (await db.maintenanceRun.findUniqueOrThrow({ where: { id: runId } }))
        .state,
      'RUNNING',
    );
    assert.equal(
      await db.teamAttachment.count({
        where: { tenantId: tenant.id, state: 'ERASED' },
      }),
      0,
    );
    await maintenance.commit(lease);
    assert.equal((await maintenance.execute(runId)).deleted, 2);
    for (const id of [ready, abandoned]) {
      const a = await db.teamAttachment.findUniqueOrThrow({ where: { id } });
      assert.equal(a.state, 'ERASED');
      assert.equal(a.filenameEncrypted, null);
      assert.ok(a.payloadErasedAt && a.contentSha256 && a.uploadIdentityHash);
      assert.equal(await owner.storage.head(owner.storageIntent(a)), null);
    }
    const held = await db.teamAttachment.findUniqueOrThrow({
      where: { id: unknown },
    });
    assert.equal(held.state, 'RESERVED');
    assert.ok(held.filenameEncrypted);
    assert.ok(await owner.storage.head(owner.storageIntent(held)));
    assert.equal(
      (
        await db.actionExecution.findUniqueOrThrow({
          where: { id: held.finalizeExecutionId! },
        })
      ).state,
      'UNKNOWN',
    );
    const textRun = await maintenance.prepare({
      actionClass: 'purge_team_message_payloads',
      batchSize: 20,
    });
    const results = await Promise.all([
      maintenance.execute(textRun),
      maintenance.execute(textRun),
    ]);
    assert.ok(results.some((x) => x.deleted === 1));
  });
  const erased = await db.teamMessage.findUniqueOrThrow({
    where: { id: messageId },
  });
  assert.equal(erased.payloadEncrypted, null);
  assert.equal(erased.planEncrypted, null);
  assert.ok(erased.intentHash && erased.planHash && erased.sendExecutionId);
  assert.ok(
    (
      await db.teamMessage.findUniqueOrThrow({
        where: { id: proofId(recent.messageId) },
      })
    ).payloadEncrypted,
  );
  await assert.rejects(db.teamAttachment.delete({ where: { id: abandoned } }));
  console.log(
    JSON.stringify({
      package: 'R12',
      proof: 'actual scoped AC6 storage/text disposal',
      result: 'PASS',
      attachmentPayloads: 2,
      messagePayloads: 1,
      claimedCrashResumed: true,
      unknownStorageHeld: true,
      unclaimedEraseDenied: true,
      readSideEffects: 0,
      historyRetained: true,
      productionEffects: 0,
    }),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

function proofId(value: unknown): string {
  assert.equal(typeof value, 'string');
  return value as string;
}
