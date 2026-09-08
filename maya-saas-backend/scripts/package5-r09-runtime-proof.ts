import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { stableActionJson } from '../src/action-engine/action-engine.identity';
import { EncryptionService } from '../src/encryption/encryption.service';
import { COMMUNITY_ACTIONS, communityHash, type CommunityOperation } from '../src/public-community/public-community.contract';
import { PublicCommunityGatewayService } from '../src/public-community/public-community-gateway.service';
import { PublicCommunityService } from '../src/public-community/public-community.service';
import { PublicCommunitySourceController } from '../src/public-community/public-community.controller';
import { asActor, config, context, db, engine, ingress, secret, staffFixture, tenantFixture } from './package5-wave-rc-proof-support';

const encryption = new EncryptionService(config);
const checkpoint = resolve(process.env.MAYA_RC_PROOF_DIRECTORY ?? '/tmp/maya-rc-proof-artifacts', 'r09-restart.json');
let now = new Date();
async function setup(tenantId: string) {
  const cfg = new ConfigService({ PUBLIC_COMMUNITY_GATEWAYS: JSON.stringify([{ sourceGatewayId: 'synthetic-community', tenantId, staticPublicationKeys: ['synthetic-first', 'synthetic-second'], publishedPostNamespace: true, brandName: 'Synthetic brand', secretEnv: 'SYNTHETIC_GATEWAY_SECRET' }]), SYNTHETIC_GATEWAY_SECRET: secret });
  const gateway = new PublicCommunityGatewayService(cfg), owner = new PublicCommunityService(db, context, gateway, ingress, engine, encryption, () => now), controller = new PublicCommunitySourceController(gateway, context, owner);
  const visitor = communityHash('synthetic-visitor', tenantId);
  function material(operation: string, command: unknown = {}, key: unknown = null, overrides: Record<string, unknown> = {}) { return { sourceGatewayId: 'synthetic-community', operation, publicationKey: 'synthetic-first', publicationPublished: true, visitorSubjectHash: visitor, command, requestKey: key, ...overrides }; }
  function signature(body: unknown) { const stamp = String(Math.floor(Date.now() / 1000)); return { stamp, sign: createHmac('sha256', secret).update(`maya.community-source/1:${stamp}:`).update(stableActionJson(body)).digest('hex') }; }
  function source(operation: 'comment', command?: unknown, key?: unknown, overrides?: Record<string, unknown>): ReturnType<PublicCommunityService['acceptComment']>;
  function source(operation: 'like' | 'view', command?: unknown, key?: unknown, overrides?: Record<string, unknown>): ReturnType<PublicCommunityService['observe']>;
  function source(operation: 'status', command?: unknown, key?: unknown, overrides?: Record<string, unknown>): ReturnType<PublicCommunityService['status']>;
  async function source(operation: string, command: unknown = {}, key: unknown = null, overrides: Record<string, unknown> = {}) { const body = material(operation, command, key, overrides), sig = signature(body); return controller.accept(body, sig.stamp, sig.sign); }
  return { cfg, gateway, owner, controller, visitor, source, material, signature };
}
async function main() {
  await db.$connect(); const checks: string[] = [];
  if (process.argv.includes('--after-restart')) {
    const saved = JSON.parse(readFileSync(checkpoint, 'utf8')) as { tenantId: string; userId: string; pendingId: string; key: string; input: Record<string, unknown> };
    const f = await setup(saved.tenantId);
    const queue = await asActor(saved.tenantId, saved.userId, 'tenant_owner', () => f.owner.queue(saved.tenantId, saved.userId));
    assert.ok(queue.comments.some(c => c.id === saved.pendingId && c.status === 'PENDING'));
    const retry = await f.source('comment', saved.input, saved.key); assert.equal(retry.commentId, saved.pendingId);
    assert.equal(await db.actionExecution.count({ where: { tenantId: saved.tenantId } }), 5);
    console.log(JSON.stringify({ package: 'R09', restart: 'actual PostgreSQL/process restart', result: 'PASS', samePendingSourceFact: true, modelOrDeliveryEffects: 0 })); return;
  }
  const tenant = await tenantFixture(), otherTenant = await tenantFixture(), moderator = await staffFixture(tenant.id), wrong = await staffFixture(tenant.id, 'staff'), f = await setup(tenant.id);
  const input = { author: 'Гость', text: 'Хороший материал, хочу уточнить детали.', publicationConsent: true, consentPolicyVersion: 'public-comment-consent/1' }, key = randomUUID();
  for (const overrides of [{ tenantId: otherTenant.id }, { userId: moderator.user.id }, { clientId: randomUUID() }, { sourceGatewayId: 'unknown' }, { publicationKey: 'draft-unpublished' }, { publicationPublished: false }]) await assert.rejects(f.source('comment', input, randomUUID(), overrides));
  const body = f.material('comment', input, key), sig = f.signature(body);
  assert.throws(() => f.controller.accept(body, sig.stamp, '0'.repeat(64)));
  assert.throws(() => f.controller.accept(body, '1000000000', sig.sign));
  for (const bad of [{ ...input, publicationConsent: false }, { ...input, author: 'Администратор' }, { ...input, text: 'Позвоните +79990001234' }, { ...input, text: 'x'.repeat(1201) }]) await assert.rejects(f.source('comment', bad, randomUUID()));
  assert.equal(await db.publicCommunityComment.count({ where: { tenantId: tenant.id } }), 0); assert.equal(await db.actionExecution.count({ where: { tenantId: tenant.id } }), 0);
  checks.push('gateway signature/configuration/tenant/publication; anonymous never Client/User; unsafe/consent/impersonation rejection before owner or AE');
  const created = await Promise.all(Array.from({ length: 4 }, () => f.source('comment', input, key)));
  const commentId = String(created[0].commentId); assert.ok(created.every(c => c.commentId === commentId && c.status === 'PENDING'));
  await assert.rejects(f.source('comment', { ...input, author: 'Другой гость' }, key), /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(f.source('comment', input, key, { publicationKey: 'synthetic-second' }), /IDEMPOTENCY_CONFLICT/);
  assert.equal(await db.publicCommunityComment.count({ where: { tenantId: tenant.id } }), 1);
  assert.equal((await f.source('status')).comments.length, 0);
  assert.equal(await db.client.count({ where: { tenantId: tenant.id } }), 0);
  assert.equal(await db.actionExecution.count({ where: { tenantId: tenant.id } }), 0);
  const row = await db.publicCommunityComment.findUniqueOrThrow({ where: { id: commentId } });
  assert.notEqual(row.textEncrypted, input.text);
  checks.push('four concurrent guest submissions converge to one immutable pending fact; changed same key conflicts; hidden read and no fabricated Client/AE');
  const execute = (operation: CommunityOperation, command: Record<string, unknown>, callerKey = randomUUID()) => asActor(tenant.id, moderator.user.id, moderator.member.role, () => f.owner.act(tenant.id, moderator.user.id, operation, command, callerKey));
  const mod = { commentId, contentHash: row.contentHash, expectedRevision: 0, decision: 'approve', reasonCode: 'human_review', text: null };
  await assert.rejects(asActor(tenant.id, wrong.user.id, wrong.member.role, () => f.owner.act(tenant.id, wrong.user.id, 'moderate', mod, randomUUID())));
  await assert.rejects(context.runAsPublicTenant(tenant.id, () => f.owner.act(tenant.id, moderator.user.id, 'moderate', mod, randomUUID())));
  await assert.rejects(execute('moderate', { ...mod, decision: 'acknowledge' }), /PENDING_REQUIRES_EXPLICIT_DECISION/);
  await assert.rejects(execute('moderate', { ...mod, contentHash: '0'.repeat(64) }), /STALE_COMMUNITY_REVISION/);
  const modKey = randomUUID(), actions = await Promise.all(Array.from({ length: 4 }, () => execute('moderate', mod, modKey)));
  assert.ok(actions.every(x => x.actionExecutionId === actions[0].actionExecutionId && x.status === 'APPROVED'));
  await assert.rejects(execute('moderate', { ...mod, decision: 'reject' }, modKey), /IDEMPOTENCY_CONFLICT/);
  assert.equal(await db.actionExecution.count({ where: { tenantId: tenant.id } }), 1);
  assert.equal(await db.actionTargetMutation.count({ where: { tenantId: tenant.id } }), 1);
  assert.equal((await f.source('status')).comments.length, 1);
  checks.push('exact current human moderator; four concurrent same-key commands one AE/mutation; invalid/stale rejection creates no execution');
  const reply = { commentId, contentHash: row.contentHash, expectedRevision: 1, decision: null, reasonCode: null, text: 'Спасибо за вопрос.' };
  const replies = await Promise.allSettled([execute('reply', reply), execute('reply', reply)]); assert.equal(replies.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await db.publicCommunityComment.count({ where: { tenantId: tenant.id, sourceKind: 'BRAND' } }), 1);
  assert.equal(await db.actionExecution.count({ where: { tenantId: tenant.id } }), 2);
  const published = await f.source('status'); assert.equal(published.comments.length, 2); assert.equal(published.comments.find(c => c.sourceKind === 'BRAND')?.author, 'Synthetic brand');
  const race = await Promise.allSettled([execute('moderate', { ...mod, expectedRevision: 1, decision: 'withdraw' }), execute('moderate', { ...mod, expectedRevision: 1, decision: 'reject' })]); assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.source('status')).comments.length, 0); assert.equal(await db.actionExecution.count({ where: { tenantId: tenant.id } }), 3);
  await execute('moderate', { ...mod, expectedRevision: 2, decision: 'acknowledge' });
  await execute('moderate', { ...mod, expectedRevision: 3, decision: 'approve' });
  checks.push('human brand reply only exact approved parent; one reply winner; moderation revision race one winner and parent withdrawal hides reply');
  const likeKey = randomUUID(); const likes = await Promise.all(Array.from({ length: 4 }, () => f.source('like', { desiredLiked: true, expectedVersion: 0 }, likeKey)));
  assert.ok(likes.every(l => l.observationId === likes[0].observationId));
  await assert.rejects(f.source('like', { desiredLiked: false, expectedVersion: 0 }, likeKey), /IDEMPOTENCY_CONFLICT/);
  const noChangeKey = randomUUID(); await f.source('like', { desiredLiked: true, expectedVersion: 1 }, noChangeKey);
  assert.equal((await f.source('status')).stats.likes, 1);
  await assert.rejects(f.source('like', { desiredLiked: false, expectedVersion: 1 }, noChangeKey), /IDEMPOTENCY_CONFLICT/);
  const unlikeRace = await Promise.allSettled([f.source('like', { desiredLiked: false, expectedVersion: 2 }, randomUUID()), f.source('like', { desiredLiked: false, expectedVersion: 2 }, randomUUID())]);
  assert.equal(unlikeRace.filter(r => r.status === 'fulfilled').length, 1); assert.equal((await f.source('status')).stats.likes, 0);
  checks.push('likes bind same/changed identity; noop anonymous observation preserves count; version race one winner; no User/cookie authority');
  const viewKey = randomUUID(); const views = await Promise.all(Array.from({ length: 4 }, () => f.source('view', {}, viewKey))); assert.ok(views.every(v => v.observationId === views[0].observationId));
  await assert.rejects(f.source('view', {}, randomUUID()), /DAILY_VIEW_ALREADY_RECORDED/);
  now = new Date(now.getTime() + 86400000); assert.equal((await f.source('view', {}, viewKey)).observationId, views[0].observationId);
  await f.source('view', {}, randomUUID()); assert.equal((await f.source('status')).stats.views, 2);
  await assert.rejects(f.source('view', {}, viewKey, { publicationKey: 'synthetic-second' }), /IDEMPOTENCY_CONFLICT/);
  const before = await db.publicCommunityInteraction.count({ where: { tenantId: tenant.id } }); await f.source('status'); assert.equal(await db.publicCommunityInteraction.count({ where: { tenantId: tenant.id } }), before);
  checks.push('separate view command; daily uniqueness; original key reuses original UTC day after clock advance; reads never record views');
  now = new Date(); const pending = await f.source('comment', { ...input, text: 'Ожидает ручной проверки после рестарта.' }, randomUUID());
  await db.membership.update({ where: { id: moderator.member.id }, data: { status: 'suspended' } });
  await assert.rejects(execute('moderate', mod, modKey));
  await db.membership.update({ where: { id: moderator.member.id }, data: { status: 'active' } });
  const pendingRow = await db.publicCommunityComment.findUniqueOrThrow({ where: { id: String(pending.commentId) } });
  now = new Date(Date.now() + 366 * 86400000); assert.equal((await f.source('status')).comments.length, 0);
  await assert.rejects(execute('moderate', { ...mod, commentId: pendingRow.id, contentHash: pendingRow.contentHash }), /retention/);
  assert.ok((await db.publicCommunityComment.findUniqueOrThrow({ where: { id: row.id } })).textEncrypted);
  assert.equal(await db.marketingCampaign.count({ where: { tenantId: tenant.id } }), 0);
  assert.equal(await db.actionExecution.count({ where: { tenantId: tenant.id, capability: { in: Object.values(COMMUNITY_ACTIONS) } } }), 5);
  checks.push('revoked moderator cannot retry; expired reads hide without erase; no external delivery or delayed model authority');
  now = new Date();
  if (process.argv.includes('--before-restart')) {
    const restartKey = randomUUID(), restartInput = { ...input, text: 'Durable pending after restart.' }, result = await f.source('comment', restartInput, restartKey);
    writeFileSync(checkpoint, JSON.stringify({ tenantId: tenant.id, userId: moderator.user.id, pendingId: result.commentId, key: restartKey, input: restartInput }));
  }
  console.log(JSON.stringify({ package: 'R09', result: 'PASS', checks, productionEffects: 0 }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
