import assert from 'node:assert/strict';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ActionEngineRuntimeService } from '../src/action-engine';
import { CommunicationDeliveryService } from '../src/communication-delivery';
import { CommunicationWebPushService } from '../src/communication-delivery/communication-web-push.service';
import type { CommunicationWebPushTransport, WebPushTransportOutcome } from '../src/communication-delivery/communication-web-push.transport';
import { NativeFeedbackService } from '../src/native-feedback/native-feedback.service';
import { NativeFeedbackPolicyService } from '../src/native-feedback/native-feedback-policy.service';
import { NativeFeedbackStore } from '../src/native-feedback/native-feedback.store';
import { NativeFeedbackScheduler } from '../src/native-feedback/native-feedback.scheduler';
import { ClientWebPushService } from '../src/crm/client-web-push.service';
import type { EntitlementsService } from '../src/entitlements/entitlements.service';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';
import { asActor, config, context, db, engine, ingress, staffFixture, entitlements, secret } from './package5-wave-rc-proof-support';
import { authenticator, baseFixture, channelRuntime, clientFixture, consentFixture, encryption } from './package5-wave-rc-client-proof-support';

const settings = new ConfigService({ DATABASE_URL: config.get('DATABASE_URL'), CRM_ENCRYPTION_KEY: secret, MAYA_INBOX_BRIDGE_TOKEN: 'synthetic-r08-bridge-credential-only', MAYA_PACKAGE2_TELEGRAM_EXECUTOR_URL: 'http://127.0.0.1:1/synthetic-r08' });
const endpoints = new ClientWebPushService(db, context, authenticator, encryption);
const policy = new NativeFeedbackPolicyService(db, context, encryption, endpoints, entitlements as EntitlementsService);
const store = new NativeFeedbackStore(db, context, encryption, ingress, engine, policy);
const owner = new NativeFeedbackService(db, context, channelRuntime, ingress, engine, encryption, policy);
let pushOutcome: WebPushTransportOutcome = 'SUCCEEDED', pushes = 0, telegramCalls = 0, telegramUnknown = false;
const transport = { ready: () => true, accepts: () => true, send: async () => { pushes++; return pushOutcome; } } as unknown as CommunicationWebPushTransport;
const runtime = new ActionEngineRuntimeService(engine, ingress);
const push = new CommunicationWebPushService(db, context, runtime, engine, endpoints, encryption, transport, settings);
const delivery = () => new CommunicationDeliveryService(db, runtime, settings, push, undefined, store);
const scheduler = () => new NativeFeedbackScheduler(db, context, store, delivery());
const checks: string[] = [];
const checkpoint = resolve(process.env.MAYA_RC_PROOF_DIRECTORY ?? '/tmp/maya-rc-proof-artifacts', 'r08-restart.json');
const originalFetch = global.fetch;
global.fetch = (async (url: string | URL | Request) => { assert.equal(String(url), 'http://127.0.0.1:1/synthetic-r08'); telegramCalls++; if (telegramUnknown) throw Error('Synthetic UNKNOWN'); return new Response(JSON.stringify({ message_id: 'synthetic-r08-accepted' }), { status: 200 }); }) as typeof fetch;
async function setup(label: string, withTelegram = true) {
  const base = await baseFixture('r08-' + label), client = await clientFixture(base, label, withTelegram), actor = await staffFixture(base.tenantId), other = await staffFixture(base.tenantId, 'administrator');
  await consentFixture(client.link, 'marketing');
  const startAt = new Date(Date.now() - 5 * 3600000), endAt = new Date(Date.now() - 4 * 3600000);
  const appointment = await db.appointment.create({ data: { tenantId: base.tenantId, mayaClientId: client.client.id, clientId: null, branchId: base.branch.id, staffId: base.staff.id, staffExternalId: base.externalStaffId, serviceIds: [], startAt, endAt, blockedStartAt: startAt, blockedEndAt: endAt, attendance: 'arrived', status: 'confirmed', source: 'internal' } });
  const admit = () => asActor(base.tenantId, actor.user.id, actor.member.role, () => owner.request(base.tenantId, actor.user.id, { appointmentId: appointment.id }, randomUUID()));
  const scope = <T>(work: () => T) => context.runAsSystemTenant(base.tenantId, work);
  return { base, client, actor, other, appointment, admit, scope };
}
async function register(f: Awaited<ReturnType<typeof setup>>, name: string) {
  const key = createECDH('prime256v1'); key.generateKeys();
  return f.scope(() => endpoints.register(f.client.proof, { subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/r08-${name}-${randomUUID()}`, expirationTime: null, keys: { p256dh: key.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } } }));
}
async function afterRestart() {
  const saved = JSON.parse(readFileSync(checkpoint, 'utf8')) as { tenantId: string; requestId: string; revisionId: string; executions: string[]; users: string[] };
  await context.runAsSystemTenant(saved.tenantId, async () => {
    const late = await staffFixture(saved.tenantId); await scheduler().tickTenant(saved.tenantId);
    const executions = await db.actionExecution.findMany({ where: { tenantId: saved.tenantId, nativeFeedbackRevisionId: saved.revisionId } });
    assert.deepEqual(executions.map(e => e.id).sort(), saved.executions); assert.ok(executions.every(e => e.state === 'SUCCEEDED'));
    const rows = await db.inboxItem.findMany({ where: { tenantId: saved.tenantId } }); assert.deepEqual(rows.map(r => r.userId).sort(), saved.users); assert.equal(rows.filter(r => r.userId === late.user.id).length, 0);
    assert.equal(pushes, 0); assert.equal(telegramCalls, 0);
  });
  console.log(JSON.stringify({ phase: 'after actual PostgreSQL/process restart', result: 'PASS', originalExecutions: true, newLogicalSlots: 0, productionEffects: 0 }));
}
async function main() {
  await db.$connect(); if (process.argv.includes('--after-restart')) return afterRestart();
  const tg = await setup('telegram'); const admitted = await tg.admit(); const requestId = String(admitted.requestId);
  await tg.scope(async () => {
    const loaded = await canonicalUtcTransaction(db, tx => store.read(tx, tg.base.tenantId, requestId, null)); assert.equal(loaded.plan.slots[0].channel, 'telegram'); assert.equal(loaded.plan.slots.length, 1);
    await register(tg, 'later');
    telegramUnknown = true;
    await scheduler().tickTenant(tg.base.tenantId); telegramUnknown = false;
    const row = await db.actionExecution.findFirstOrThrow({ where: { tenantId: tg.base.tenantId, nativeFeedbackRequestId: requestId } }); assert.equal(row.state, 'UNKNOWN');
    assert.equal(telegramCalls, 1); assert.equal(pushes, 0);
    await scheduler().tickTenant(tg.base.tenantId); assert.equal(telegramCalls, 1); assert.equal(pushes, 0);
    assert.equal((await db.actionExecution.findFirstOrThrow({ where: { tenantId: tg.base.tenantId, nativeFeedbackRequestId: requestId } })).id, row.id);
  });
  checks.push('verified Telegram first; UNKNOWN preserves original slot/execution; new device cannot enter or bypass UNKNOWN');
  const web = await setup('web', false); await register(web, 'one'); await register(web, 'two');
  const webRoot = String((await web.admit()).requestId);
  await web.scope(async () => {
    const loaded = await canonicalUtcTransaction(db, tx => store.read(tx, web.base.tenantId, webRoot, null)); assert.equal(loaded.plan.slots.length, 2); assert.ok(loaded.plan.slots.every(s => s.channel === 'web_push'));
    await assert.rejects(delivery().deliverNativeFeedbackSlot(web.base.tenantId, webRoot, null, loaded.plan.slots[1].slotKey), /Previous feedback/);
    const prior = pushes; pushOutcome = 'UNKNOWN'; await scheduler().tickTenant(web.base.tenantId); pushOutcome = 'SUCCEEDED';
    assert.equal(pushes, prior + 1); assert.equal(await db.actionExecution.count({ where: { tenantId: web.base.tenantId, nativeFeedbackRequestId: webRoot } }), 1);
    await register(web, 'new-after-admission'); await scheduler().tickTenant(web.base.tenantId); assert.equal(pushes, prior + 1);
  });
  checks.push('frozen ordered Web Push plan: first UNKNOWN blocks later devices and newly registered endpoint');
  const fail = await setup('failure', false); await register(fail, 'one'); await register(fail, 'two'); const failedRoot = String((await fail.admit()).requestId);
  await fail.scope(async () => { const before = pushes; pushOutcome = 'DETERMINISTIC_FAILED'; await scheduler().tickTenant(fail.base.tenantId); pushOutcome = 'SUCCEEDED'; const execution = await db.actionExecution.findFirstOrThrow({ where: { tenantId: fail.base.tenantId, nativeFeedbackRequestId: failedRoot } }); assert.equal(execution.state, 'FAILED'); await scheduler().tickTenant(fail.base.tenantId); assert.equal(pushes, before + 1); });
  checks.push('deterministic Web Push failure is terminal; no later endpoint or fallback');
  const revoke = await setup('consent'); const revokedRoot = String((await revoke.admit()).requestId);
  await db.customerProfile.update({ where: { tenantId_clientId: { tenantId: revoke.base.tenantId, clientId: revoke.client.client.id } }, data: { marketingConsentAt: null } });
  await revoke.scope(async () => { const calls = telegramCalls; await scheduler().tickTenant(revoke.base.tenantId); assert.equal(telegramCalls, calls); assert.equal(await db.actionExecution.count({ where: { tenantId: revoke.base.tenantId, nativeFeedbackRequestId: revokedRoot } }), 0); });
  checks.push('consent withdrawal between admission and delivery denies effect and preserves plan');
  const inbox = await setup('inbox');
  await db.customerProfile.update({ where: { tenantId_clientId: { tenantId: inbox.base.tenantId, clientId: inbox.client.client.id } }, data: { marketingConsentAt: null } });
  const inboxRoot = String((await inbox.admit()).requestId);
  const response = await inbox.scope(() => owner.respond(inbox.client.proof, 'response', { requestId: inboxRoot, expectedAcceptedVersion: 0, kind: 'response', rating: 2, comment: 'Private synthetic feedback' }, randomUUID()));
  const revisionId = String(response.revisionId);
  await inbox.scope(async () => {
    const upsert = db.inboxItem.upsert.bind(db.inboxItem), claim = engine.claimReconciliation.bind(engine); let lost = false, interrupted = false;
    Object.defineProperty(db.inboxItem, 'upsert', { configurable: true, value: async (args: Prisma.InboxItemUpsertArgs) => { const result = await upsert(args); if (args.create.userId === inbox.actor.user.id && !lost) { lost = true; throw Error('Synthetic lost Inbox commit response'); } return result; } });
    engine.claimReconciliation = async input => { const row = await db.actionExecution.findUniqueOrThrow({ where: { id: input.executionId } }); if (row.nativeFeedbackRevisionId === revisionId && row.targetRef === 'user:' + inbox.actor.user.id && !interrupted) { interrupted = true; throw Error('Synthetic process exit before reconciliation'); } return claim(input); };
    try { await scheduler().tickTenant(inbox.base.tenantId); } finally { Object.defineProperty(db.inboxItem, 'upsert', { configurable: true, value: upsert }); engine.claimReconciliation = claim; }
    assert.ok(lost && interrupted);
    const executions = await db.actionExecution.findMany({ where: { tenantId: inbox.base.tenantId, nativeFeedbackRevisionId: revisionId } }); assert.equal(executions.length, 2); assert.equal(executions.filter(e => e.state === 'UNKNOWN').length, 1); assert.equal(executions.filter(e => e.state === 'SUCCEEDED').length, 1);
    assert.equal((await db.actionExecution.findUniqueOrThrow({ where: { id: String(response.actionExecutionId) } })).state, 'SUCCEEDED');
    if (process.argv.includes('--before-restart')) { writeFileSync(checkpoint, JSON.stringify({ tenantId: inbox.base.tenantId, requestId: inboxRoot, revisionId, executions: executions.map(e => e.id).sort(), users: [inbox.actor.user.id, inbox.other.user.id].sort() })); return; }
    const late = await staffFixture(inbox.base.tenantId); await scheduler().tickTenant(inbox.base.tenantId);
    const after = await db.actionExecution.findMany({ where: { tenantId: inbox.base.tenantId, nativeFeedbackRevisionId: revisionId } }); assert.ok(after.every(e => e.state === 'SUCCEEDED')); assert.deepEqual(after.map(e => e.id).sort(), executions.map(e => e.id).sort()); assert.equal(await db.inboxItem.count({ where: { tenantId: inbox.base.tenantId, userId: late.user.id } }), 0);
  });
  checks.push('private response succeeds independently of follow-up; Inbox UNKNOWN does not block other recipient; resume reuses original AE/CD and audience');
  console.log(JSON.stringify({ package: 'R08', proof: 'PostgreSQL + synthetic CD transports', result: 'PASS', checks, syntheticTelegramCalls: telegramCalls, syntheticWebPushCalls: pushes, productionEffects: 0 }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { global.fetch = originalFetch; await db.$disconnect(); });
