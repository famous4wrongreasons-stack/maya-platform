import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ActionEngineRuntimeService } from '../src/action-engine';
import { EncryptionService } from '../src/encryption/encryption.service';
import { CommunicationDeliveryService } from '../src/communication-delivery';
import { Package5Wave4FileObjectStore } from '../src/package5-wave4/package5-wave4-object-store.service';
import { TEAM_CHUNK_BYTES } from '../src/package5-wave4/package5-team-object-store';
import { TeamCommunicationsService } from '../src/team-communications/team-communications.service';
import { TeamMessageStore } from '../src/team-communications/team-message.store';
import { TeamCommunicationsScheduler } from '../src/team-communications/team-communications.scheduler';
import { type TeamOperation } from '../src/team-communications/team-communications.contract';
import {
  asActor,
  config,
  context,
  db,
  engine,
  ingress,
  staffFixture,
  tenantFixture,
} from './package5-wave-rc-proof-support';

const directory = resolve(
  process.env.MAYA_RC_PROOF_DIRECTORY ?? '/tmp/maya-rc-proof-artifacts',
);
mkdirSync(directory, { recursive: true });
const objects = new Package5Wave4FileObjectStore(
    new ConfigService({
      UPLOAD_ROOT: resolve(directory, 'r12-private-proof', 'uploads'),
    }),
  ),
  encryption = new EncryptionService(config);
const now = new Date();
let publishes = 0,
  externalCalls = 0;
const owner = new TeamCommunicationsService(
    db,
    context,
    ingress,
    engine,
    encryption,
    objects,
    () => now,
  ),
  store = new TeamMessageStore(
    db,
    context,
    encryption,
    ingress,
    engine,
    () => now,
  ),
  runtime = new ActionEngineRuntimeService(engine, ingress);
const delivery = new CommunicationDeliveryService(
    db,
    runtime,
    config,
    undefined,
    undefined,
    undefined,
    store,
  ),
  scheduler = new TeamCommunicationsScheduler(db, context, store, delivery);
const originalFetch = global.fetch;
global.fetch = async () => {
  externalCalls++;
  return await Promise.reject(Error('R12 external delivery forbidden'));
};
const checkpoint = resolve(directory, 'r12-restart.json'),
  checks: string[] = [];
async function main() {
  await db.$connect();
  if (process.argv.includes('--after-restart')) {
    const s = JSON.parse(readFileSync(checkpoint, 'utf8')) as {
      tenantId: string;
      userId: string;
      role: string;
      finalKey: string;
      attachmentId: string;
      digest: string;
      finalExecutionId: string;
      messageId: string;
      sendKey: string;
      text: string;
      executions: string[];
      users: string[];
    };
    const publish = owner.storage.publish.bind(owner.storage);
    owner.storage.publish = async (input) => {
      publishes++;
      return publish(input);
    };
    const recovered = await asActor(s.tenantId, s.userId, s.role, () =>
      owner.act(
        s.tenantId,
        s.userId,
        'finalize',
        { attachmentId: s.attachmentId, expectedDigest: s.digest },
        s.finalKey,
      ),
    );
    assert.equal(recovered.actionExecutionId, s.finalExecutionId);
    assert.equal(recovered.state, 'SEALED');
    assert.equal(publishes, 0);
    assert.equal(
      (
        await db.teamAttachment.findUniqueOrThrow({
          where: { id: s.attachmentId },
        })
      ).state,
      'SEALED',
    );
    const send = await asActor(s.tenantId, s.userId, s.role, () =>
      owner.act(
        s.tenantId,
        s.userId,
        'send',
        { conversationKey: 'team/main', text: s.text, attachmentId: null },
        s.sendKey,
      ),
    );
    assert.equal(send.messageId, s.messageId);
    const late = await staffFixture(s.tenantId, 'staff');
    await context.runAsSystemTenant(s.tenantId, () =>
      scheduler.tickTenant(s.tenantId),
    );
    const executions = await db.actionExecution.findMany({
      where: { tenantId: s.tenantId, teamMessageId: s.messageId },
    });
    assert.deepEqual(executions.map((e) => e.id).sort(), s.executions);
    assert.ok(executions.every((e) => e.state === 'SUCCEEDED'));
    const inbox = await db.inboxItem.findMany({
      where: { tenantId: s.tenantId },
    });
    assert.deepEqual(inbox.map((i) => i.userId).sort(), s.users);
    assert.equal(inbox.filter((i) => i.userId === late.user.id).length, 0);
    assert.equal(externalCalls, 0);
    console.log(
      JSON.stringify({
        package: 'R12',
        phase: 'after actual process/PostgreSQL restart',
        result: 'PASS',
        sameFinalExecution: true,
        secondPublish: publishes,
        originalSlots: true,
        newRecipients: 0,
        productionEffects: 0,
      }),
    );
    return;
  }
  const tenant = await tenantFixture(),
    foreign = await tenantFixture(),
    actor = await staffFixture(tenant.id, 'staff'),
    other = await staffFixture(tenant.id, 'administrator'),
    third = await staffFixture(tenant.id, 'staff'),
    outsider = await staffFixture(foreign.id, 'staff'),
    denied = await staffFixture(tenant.id, 'accountant');
  const run = <T>(fn: () => T) =>
      asActor(tenant.id, actor.user.id, actor.member.role, fn),
    call = (operation: TeamOperation, value: unknown, key = randomUUID()) =>
      run(() => owner.act(tenant.id, actor.user.id, operation, value, key));
  const empty = { conversationKey: 'team/main', text: '', attachmentId: null };
  await assert.rejects(call('send', empty));
  await assert.rejects(
    call('send', { ...empty, text: 'bad', conversationKey: 'other' }),
  );
  await assert.rejects(call('send', { ...empty, text: 'x'.repeat(2001) }));
  await assert.rejects(
    asActor(tenant.id, denied.user.id, denied.member.role, () =>
      owner.act(
        tenant.id,
        denied.user.id,
        'send',
        { ...empty, text: 'bad' },
        randomUUID(),
      ),
    ),
  );
  await assert.rejects(
    asActor(foreign.id, outsider.user.id, outsider.member.role, () =>
      owner.act(
        tenant.id,
        outsider.user.id,
        'send',
        { ...empty, text: 'bad' },
        randomUUID(),
      ),
    ),
  );
  await assert.rejects(
    context.runAsPublicTenant(tenant.id, () =>
      owner.act(
        tenant.id,
        actor.user.id,
        'send',
        { ...empty, text: 'bad' },
        randomUUID(),
      ),
    ),
  );
  assert.equal(
    await db.actionExecution.count({ where: { tenantId: tenant.id } }),
    0,
  );
  const text = 'Синтетическое сообщение после рестарта.',
    sendKey = randomUUID();
  const sent = await Promise.all(
    Array.from({ length: 4 }, () => call('send', { ...empty, text }, sendKey)),
  );
  assert.ok(sent.every((s) => s.messageId === sent[0].messageId));
  const messageId = proofId(sent[0].messageId);
  await assert.rejects(
    call('send', { ...empty, text: 'Изменённое намерение' }, sendKey),
    /IDEMPOTENCY_CONFLICT/,
  );
  assert.equal(
    await db.teamMessage.count({ where: { tenantId: tenant.id } }),
    1,
  );
  assert.equal(
    await db.actionExecution.count({ where: { tenantId: tenant.id } }),
    1,
  );
  assert.equal(
    (await run(() => owner.feed(tenant.id, actor.user.id))).messages.length,
    1,
  );
  assert.equal(
    await db.authIdentity.count({
      where: { userId: actor.user.id, provider: 'telegram' },
    }),
    0,
  );
  checks.push(
    'User without Telegram; exact active membership; invalid input/auth creates no AE; four same-key sends one message/AE; changed key intent conflicts',
  );
  const bytes = Buffer.alloc(TEAM_CHUNK_BYTES + 19, 97),
    digest = createHash('sha256').update(bytes).digest('hex'),
    reserveKey = randomUUID();
  const reservation = {
    contentSha256: digest,
    declaredSize: bytes.length,
    kind: 'file',
    mime: 'text/plain',
    filename: 'synthetic.txt',
    retentionPolicyVersion: 1,
  };
  const reservations = await Promise.all(
    Array.from({ length: 3 }, () => call('reserve', reservation, reserveKey)),
  );
  assert.ok(
    reservations.every((r) => r.attachmentId === reservations[0].attachmentId),
  );
  const attachmentId = proofId(reservations[0].attachmentId);
  await assert.rejects(
    call('reserve', { ...reservation, filename: 'changed.txt' }, reserveKey),
    /IDEMPOTENCY_CONFLICT/,
  );
  await assert.rejects(
    run(() =>
      owner.chunk(
        tenant.id,
        actor.user.id,
        randomUUID(),
        0,
        bytes.subarray(0, TEAM_CHUNK_BYTES),
      ),
    ),
  );
  await assert.rejects(
    asActor(tenant.id, other.user.id, other.member.role, () =>
      owner.chunk(
        tenant.id,
        other.user.id,
        attachmentId,
        0,
        bytes.subarray(0, TEAM_CHUNK_BYTES),
      ),
    ),
  );
  const chunk = () =>
    run(() =>
      owner.chunk(
        tenant.id,
        actor.user.id,
        attachmentId,
        0,
        bytes.subarray(0, TEAM_CHUNK_BYTES),
      ),
    );
  await chunk();
  await chunk();
  await assert.rejects(
    run(() =>
      owner.chunk(
        tenant.id,
        actor.user.id,
        attachmentId,
        0,
        Buffer.alloc(TEAM_CHUNK_BYTES, 98),
      ),
    ),
    /IDEMPOTENCY_CONFLICT/,
  );
  await run(() =>
    owner.chunk(
      tenant.id,
      actor.user.id,
      attachmentId,
      1,
      bytes.subarray(TEAM_CHUNK_BYTES),
    ),
  );
  const finalKey = randomUUID(),
    publish = owner.storage.publish.bind(owner.storage);
  let lose = true;
  owner.storage.publish = async (input) => {
    publishes++;
    const result = await publish(input);
    if (lose) {
      lose = false;
      throw Error('Synthetic process lost final storage receipt');
    }
    return result;
  };
  const finalized = await call(
    'finalize',
    { attachmentId, expectedDigest: digest },
    finalKey,
  );
  assert.equal(finalized.state, 'UNKNOWN');
  assert.equal(publishes, 1);
  const finalExecutionId = proofId(finalized.actionExecutionId),
    reserved = await db.teamAttachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });
  assert.equal(reserved.state, 'RESERVED');
  assert.ok(await owner.storage.head(owner.storageIntent(reserved)));
  await assert.rejects(
    call(
      'finalize',
      { attachmentId, expectedDigest: 'f'.repeat(64) },
      finalKey,
    ),
    /IDEMPOTENCY_CONFLICT/,
  );
  await assert.rejects(call('send', { ...empty, attachmentId }));
  assert.equal(publishes, 1);
  checks.push(
    'concurrent reserve one owner; exact current reservation/chunk bytes; two chunks >6MiB verified; final publish lost receipt UNKNOWN; changed retry conflicts; no attach or unlink',
  );
  const upsert = db.inboxItem.upsert.bind(db.inboxItem),
    reconcile = engine.claimReconciliation.bind(engine);
  let lost = false,
    interrupted = false;
  Object.defineProperty(db.inboxItem, 'upsert', {
    configurable: true,
    value: async (args: Prisma.InboxItemUpsertArgs) => {
      const result = await upsert(args);
      if (args.create.userId === other.user.id && !lost) {
        lost = true;
        throw Error('Synthetic lost Inbox receipt');
      }
      return result;
    },
  });
  engine.claimReconciliation = async (input) => {
    const e = await db.actionExecution.findUniqueOrThrow({
      where: { id: input.executionId },
    });
    if (
      e.teamMessageId === messageId &&
      e.targetRef === 'user:' + other.user.id &&
      !interrupted
    ) {
      interrupted = true;
      throw Error('Synthetic process exit before Inbox reconcile');
    }
    return reconcile(input);
  };
  try {
    await context.runAsSystemTenant(tenant.id, () =>
      scheduler.tickTenant(tenant.id),
    );
  } finally {
    Object.defineProperty(db.inboxItem, 'upsert', {
      configurable: true,
      value: upsert,
    });
    engine.claimReconciliation = reconcile;
  }
  assert.ok(lost && interrupted);
  const executions = await db.actionExecution.findMany({
    where: { tenantId: tenant.id, teamMessageId: messageId },
  });
  assert.equal(executions.length, 2);
  assert.equal(executions.filter((e) => e.state === 'UNKNOWN').length, 1);
  assert.equal(executions.filter((e) => e.state === 'SUCCEEDED').length, 1);
  assert.equal(
    (
      await db.actionExecution.findUniqueOrThrow({
        where: { id: proofId(sent[0].actionExecutionId) },
      })
    ).state,
    'SUCCEEDED',
  );
  assert.equal(externalCalls, 0);
  checks.push(
    'message acceptance independent of notification; exact frozen Inbox plan; one UNKNOWN recipient does not block another; no external effect',
  );
  if (process.argv.includes('--before-restart')) {
    writeFileSync(
      checkpoint,
      JSON.stringify({
        tenantId: tenant.id,
        userId: actor.user.id,
        role: actor.member.role,
        finalKey,
        attachmentId,
        digest,
        finalExecutionId,
        messageId,
        sendKey,
        text,
        executions: executions.map((e) => e.id).sort(),
        users: [other.user.id, third.user.id].sort(),
      }),
    );
    console.log(
      JSON.stringify(
        {
          package: 'R12',
          phase: 'before actual restart',
          result: 'PASS',
          checks,
          externalCalls,
          productionEffects: 0,
        },
        null,
        2,
      ),
    );
    return;
  }
  const result = await call(
    'finalize',
    { attachmentId, expectedDigest: digest },
    finalKey,
  );
  assert.equal(result.state, 'SEALED');
  assert.equal(result.actionExecutionId, finalExecutionId);
  assert.equal(publishes, 1);
  const claimRace = await Promise.allSettled([
    call('send', { ...empty, attachmentId }),
    call('send', { ...empty, attachmentId }),
  ]);
  assert.equal(claimRace.filter((r) => r.status === 'fulfilled').length, 1);
  const bound = await db.teamMessage.findFirstOrThrow({
      where: { tenantId: tenant.id, attachmentId },
    }),
    read = await run(() => owner.media(tenant.id, actor.user.id, attachmentId));
  let readBytes = 0;
  for await (const chunk of read.stream) {
    assert.ok(Buffer.isBuffer(chunk));
    readBytes += chunk.length;
  }
  assert.equal(readBytes, bytes.length);
  await assert.rejects(
    asActor(tenant.id, other.user.id, other.member.role, () =>
      owner.act(
        tenant.id,
        other.user.id,
        'withdraw',
        { messageId: bound.id, expectedRevision: 0 },
        randomUUID(),
      ),
    ),
  );
  const withdrawKey = randomUUID(),
    withdrawal = await call(
      'withdraw',
      { messageId: bound.id, expectedRevision: 0 },
      withdrawKey,
    );
  assert.equal(
    (
      await call(
        'withdraw',
        { messageId: bound.id, expectedRevision: 0 },
        withdrawKey,
      )
    ).actionExecutionId,
    withdrawal.actionExecutionId,
  );
  await assert.rejects(
    run(() => owner.media(tenant.id, actor.user.id, attachmentId)),
  );
  assert.ok(
    await owner.storage.head(
      owner.storageIntent(
        await db.teamAttachment.findUniqueOrThrow({
          where: { id: attachmentId },
        }),
      ),
    ),
  );
  const late = await staffFixture(tenant.id, 'staff');
  await context.runAsSystemTenant(tenant.id, () =>
    scheduler.tickTenant(tenant.id),
  );
  assert.equal(
    await db.inboxItem.count({
      where: { tenantId: tenant.id, userId: late.user.id },
    }),
    0,
  );
  const before = await db.actionExecution.count({
    where: { tenantId: tenant.id },
  });
  await db.membership.update({
    where: { id: actor.member.id },
    data: { status: 'suspended' },
  });
  await assert.rejects(call('send', { ...empty, text: 'revoked' }));
  await assert.rejects(run(() => owner.feed(tenant.id, actor.user.id)));
  assert.equal(
    await db.actionExecution.count({ where: { tenantId: tenant.id } }),
    before,
  );
  checks.push(
    'same finalize reconciles without republish; one attachment consume winner; private member download; own-only withdrawal; reads hide without unlink; new recipient not added; revoked principal denied',
  );
  assert.equal(externalCalls, 0);
  console.log(
    JSON.stringify(
      {
        package: 'R12',
        proof: 'PostgreSQL and actual private local storage',
        result: 'PASS',
        checks,
        publishes,
        externalCalls,
        productionEffects: 0,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    global.fetch = originalFetch;
    await db.$disconnect();
  });

function proofId(value: unknown): string {
  assert.equal(typeof value, 'string');
  return value as string;
}
