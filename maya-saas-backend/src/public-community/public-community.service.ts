import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, type PublicCommunityComment, type PublicCommunityInteraction } from '@prisma/client';
import { ACTION_EXECUTION_REQUEST_CONTRACT, ActionEngineKernel, CanonicalActionIngressService, type TrustedActionExecutionRequestV1 } from '../action-engine';
import { attachExistingInvocationReceipt } from '../action-engine/action-invocation-receipt.context';
import { isPostgresSerializationConflict } from '../common/postgres-transaction-conflict';
import { EncryptionService } from '../encryption/encryption.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { COMMUNITY_ACTIONS, COMMUNITY_CONTRACT, COMMUNITY_ROLES, communityCommand, communityHash, communityKey, communityObject, communityText, communityVersion, type CommunityOperation } from './public-community.contract';
import { PublicCommunityGatewayService, type VerifiedCommunitySource } from './public-community-gateway.service';

type Tx = Prisma.TransactionClient;
/** Anonymous source owner and local human-moderation executor. No provider,
 * Client projection, model publication, external delivery or legacy SQL owner. */
@Injectable()
export class PublicCommunityService {
  constructor(private readonly prisma: PrismaService, private readonly context: TenantContextService,
    private readonly gateway: PublicCommunityGatewayService, private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel, private readonly encryption: EncryptionService,
    @Optional() private readonly clock: () => Date = () => new Date()) {}
  private async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await canonicalUtcTransaction(this.prisma, work); }
      catch (error) { if ((isPostgresSerializationConflict(error) || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) && attempt < 4) continue; throw error; }
    }
    throw new ConflictException('Community transaction could not serialize');
  }
  private async lock(tx: Tx, scope: string) { await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r09-owner/${scope}`},0))::text`); }
  private async tenant(tx: Tx, tenantId: string) {
    this.context.assertTenantId(tenantId);
    if (!(await tx.tenant.findFirst({ where: { id: tenantId, status: 'active' } }))) throw new ForbiddenException('Current community tenant required');
  }
  private async actor(tx: Tx, tenantId: string, userId: string) {
    await this.tenant(tx, tenantId);
    const actor = await tx.membership.findUnique({ where: { userId_tenantId: { tenantId, userId } }, include: { user: { select: { status: true } } } });
    if (!actor || actor.status !== 'active' || actor.user.status !== 'active' || !COMMUNITY_ROLES.includes(actor.role)) throw new ForbiddenException('Current exact-tenant community moderator required');
    return actor;
  }
  private sourceScope(source: VerifiedCommunitySource) {
    this.gateway.assertVerified(source); this.context.assertTenantId(source.tenantId);
    return { tenantId: source.tenantId, sourceGatewayId: source.sourceGatewayId, publicationKey: source.publicationKey, visitorSubjectHash: source.visitorSubjectHash };
  }
  async acceptComment(source: VerifiedCommunitySource, value: unknown, key: unknown) {
    const scope = this.sourceScope(source), input = communityObject(value, ['author', 'text', 'publicationConsent', 'consentPolicyVersion']);
    if (input.publicationConsent !== true || typeof input.consentPolicyVersion !== 'string' || !/^[A-Za-z0-9_.:/-]{1,100}$/.test(input.consentPolicyVersion)) throw new ForbiddenException('Explicit versioned public consent required');
    const author = communityText(input.author, true), text = communityText(input.text), callerKey = communityKey(key);
    const identityHash = communityHash('guest-identity', { sourceGatewayId: scope.sourceGatewayId, tenantId: scope.tenantId, visitorSubjectHash: scope.visitorSubjectHash, operation: 'comment', callerKey });
    const intentHash = communityHash('guest-intent', { contractVersion: 1, ...scope, normalizedAuthor: author, normalizedText: text, publicationConsent: true, consentPolicyVersion: input.consentPolicyVersion });
    return this.transaction(async tx => {
      await this.tenant(tx, source.tenantId); await this.lock(tx, `${scope.tenantId}/${identityHash}`);
      const prior = await tx.publicCommunityComment.findUnique({ where: { tenantId_sourceGatewayId_identityHash: { tenantId: scope.tenantId, sourceGatewayId: scope.sourceGatewayId, identityHash } } });
      if (prior) { if (prior.intentHash !== intentHash) throw new ConflictException('IDEMPOTENCY_CONFLICT'); return this.sourceReceipt(prior); }
      const now = this.clock();
      const row = await tx.publicCommunityComment.create({ data: { id: randomUUID(), ...scope, parentCommentId: null, sourceKind: 'GUEST', identityHash, intentHash, authorEncrypted: this.encryption.encrypt(author), textEncrypted: this.encryption.encrypt(text), contentHash: communityHash('content', { author, text }), consentPolicyVersion: String(input.consentPolicyVersion), consentAcceptedAt: now, status: 'PENDING', revision: 0, createdAt: now, retentionUntil: new Date(now.getTime() + 365 * 86400000), sourceGatewayId: scope.sourceGatewayId } });
      return this.sourceReceipt(row);
    });
  }
  private sourceReceipt(row: PublicCommunityComment) { return { contract: COMMUNITY_CONTRACT, commentId: row.id, status: row.status, revision: row.revision, anonymous: true, actionExecutionId: null }; }
  async observe(source: VerifiedCommunitySource, kind: 'like' | 'view', value: unknown, key: unknown) {
    const scope = this.sourceScope(source), command = communityObject(value, kind === 'like' ? ['desiredLiked', 'expectedVersion'] : []), callerKey = communityKey(key);
    const expectedVersion = kind === 'like' ? communityVersion(command.expectedVersion) : null;
    if (kind === 'like' && typeof command.desiredLiked !== 'boolean') throw new ForbiddenException('Explicit desired like state required');
    const desiredValue = kind === 'like' ? Boolean(command.desiredLiked) : null;
    const identityHash = communityHash('observation-identity', { tenantId: scope.tenantId, sourceGatewayId: scope.sourceGatewayId, visitorSubjectHash: scope.visitorSubjectHash, kind, callerKey });
    return this.transaction(async tx => {
      await this.tenant(tx, scope.tenantId); await this.lock(tx, `${scope.tenantId}/${scope.sourceGatewayId}/${scope.visitorSubjectHash}/${kind}`);
      const prior = await tx.publicCommunityInteraction.findUnique({ where: { tenantId_sourceGatewayId_identityHash: { tenantId: scope.tenantId, sourceGatewayId: scope.sourceGatewayId, identityHash } } });
      const now = this.clock(), viewDay = kind === 'view' ? prior?.viewDay ?? new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z') : null;
      const intentHash = communityHash('observation-intent', { contractVersion: 1, ...scope, kind, ...(kind === 'like' ? { desiredLiked: desiredValue, expectedVersion } : { viewDay: viewDay!.toISOString().slice(0, 10) }) });
      if (prior) { if (prior.intentHash !== intentHash) throw new ConflictException('IDEMPOTENCY_CONFLICT'); return this.observationReceipt(prior); }
      const latest = await tx.publicCommunityInteraction.findFirst({ where: { ...scope, kind }, orderBy: { version: 'desc' } });
      if (kind === 'view') {
        const daily = await tx.publicCommunityInteraction.findFirst({ where: { ...scope, kind, viewDay } });
        // The daily uniqueness fence rejects a second source identity. Do not
        // acknowledge an unbound caller key as if it were the original receipt.
        if (daily) throw new ConflictException('DAILY_VIEW_ALREADY_RECORDED');
      } else if (expectedVersion !== (latest?.version ?? 0)) throw new ConflictException('STALE_COMMUNITY_OBSERVATION');
      // A fresh accepted observation binds its identity even when liked state
      // already equals the requested value. Only boolean changes are transitions;
      // counts remain a projection of the latest observation, never row counts.
      const version = (latest?.version ?? 0) + 1;
      const row = await tx.publicCommunityInteraction.create({ data: { id: randomUUID(), ...scope, kind, identityHash, intentHash, expectedVersion: version - 1, version, desiredValue, viewDay, receivedAt: now, contractVersion: 1, payloadHash: communityHash('observation-payload', { intentHash, version }) } });
      return this.observationReceipt(row);
    });
  }
  private observationReceipt(row: PublicCommunityInteraction) { return { contract: COMMUNITY_CONTRACT, observationId: row.id, kind: row.kind, version: row.version, liked: row.desiredValue, viewDay: row.viewDay?.toISOString().slice(0, 10) ?? null, anonymous: true }; }
  async act(tenantId: string, userId: string, operation: CommunityOperation, value: unknown, key: unknown) {
    this.context.assertAuthPrincipal(userId, tenantId);
    const command = communityCommand(operation, value), callerKey = communityKey(key);
    const commandHash = communityHash('moderator-intent', { contractVersion: 1, tenantId, actorUserId: userId, operation, ...command });
    const sourceRef = `public-community:${communityHash('moderator-identity', { tenantId, userId, operation, callerKey })}`;
    return this.transaction(async tx => {
      const actor = await this.actor(tx, tenantId, userId); await this.lock(tx, `${tenantId}/${sourceRef}`);
      const prior = await tx.actionExecution.findFirst({ where: { tenantId, actorUserId: userId, capability: COMMUNITY_ACTIONS[operation], sourceRef } });
      if (prior) {
        await attachExistingInvocationReceipt(prior); const receipt = prior.safeResultSummaryJson;
        if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || receipt.commandHash !== commandHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        if (prior.state !== 'SUCCEEDED') throw new ConflictException('Existing community execution requires canonical resolution');
        return receipt;
      }
      await this.lock(tx, `${tenantId}/comment/${command.commentId}`);
      const comment = await tx.publicCommunityComment.findUnique({ where: { id_tenantId: { tenantId, id: command.commentId } } });
      if (!comment) throw new NotFoundException('Canonical community comment required');
      if (comment.contentHash !== command.contentHash || comment.revision !== command.expectedRevision) throw new ConflictException('STALE_COMMUNITY_REVISION');
      const mapping = operation === 'reply' || command.decision === 'approve' ? this.gateway.mapping(comment.sourceGatewayId, tenantId) : null, now = this.clock();
      if ((operation === 'reply' || command.decision === 'approve') && (comment.retentionUntil <= now || !comment.textEncrypted)) throw new ConflictException('Community content retention has expired');
      if (operation === 'reply' && (comment.sourceKind !== 'GUEST' || comment.status !== 'APPROVED' || await tx.publicCommunityComment.findFirst({ where: { tenantId, parentCommentId: comment.id, sourceKind: 'BRAND' } }))) throw new ConflictException('One human reply to an approved guest parent is permitted');
      if (command.decision === 'acknowledge' && comment.status === 'PENDING') throw new ConflictException('PENDING_REQUIRES_EXPLICIT_DECISION');
      const input = { contract: COMMUNITY_CONTRACT, operation, tenantId, actorUserId: userId, actorMembershipId: actor.id, targetRef: comment.id, command, commandHash, sourceGatewayId: comment.sourceGatewayId, publicationKey: comment.publicationKey, brandName: operation === 'reply' ? mapping!.brandName : null };
      const request: TrustedActionExecutionRequestV1 = { contract: ACTION_EXECUTION_REQUEST_CONTRACT, tenantId, capability: COMMUNITY_ACTIONS[operation], source: { type: 'authenticated_request', sourceRef, actorUserId: userId, occurrenceScope: sourceRef }, targetRef: comment.id, input, evidenceRefs: [`public-community-intent:${commandHash}`], callerIdempotency: { scope: `public-community.${operation}`, key: sourceRef } };
      if ((await this.ingress.preview(request)).policyDecision !== 'ALLOW') throw new ForbiddenException('Community moderation policy denied');
      const execution = await this.ingress.createExecution(request, tx), claim = await this.kernel.claimExecution({ tenantId, executionId: execution.id, workerId: 'public-community.local' }, tx);
      let resultComment: PublicCommunityComment;
      if (operation === 'reply') {
        resultComment = await tx.publicCommunityComment.create({ data: { id: randomUUID(), tenantId, publicationKey: comment.publicationKey, parentCommentId: comment.id, sourceKind: 'BRAND', visitorSubjectHash: null, identityHash: communityHash('brand-identity', { tenantId, userId, callerKey }), intentHash: commandHash, authorEncrypted: this.encryption.encrypt(mapping!.brandName), textEncrypted: this.encryption.encrypt(command.text!), contentHash: communityHash('content', { author: mapping!.brandName, text: command.text }), status: 'APPROVED', revision: 0, createdAt: now, retentionUntil: new Date(now.getTime() + 365 * 86400000), creationExecutionId: execution.id, sourceGatewayId: comment.sourceGatewayId } });
      } else {
        const status = command.decision === 'acknowledge' ? comment.status : command.decision === 'approve' ? 'APPROVED' : command.decision === 'reject' ? 'REJECTED' : 'WITHDRAWN';
        resultComment = await tx.publicCommunityComment.update({ where: { id: comment.id, revision: command.expectedRevision, contentHash: command.contentHash }, data: { status, revision: comment.revision + 1, lastModerationExecutionId: execution.id } });
      }
      const last = await tx.actionTargetMutation.findFirst({ where: { tenantId, targetKind: execution.targetKind, targetRef: comment.id }, orderBy: { targetGeneration: 'desc' } });
      await tx.actionTargetMutation.create({ data: { tenantId, actionExecutionId: execution.id, mutationKey: `community:${operation}:${resultComment.id}:r${resultComment.revision}`, targetKind: execution.targetKind, targetRef: comment.id, targetGeneration: (last?.targetGeneration ?? -1) + 1, mutationKind: execution.actionClass, beforeStateHash: communityHash('visibility', { commentId: comment.id, revision: comment.revision, status: comment.status, contentHash: comment.contentHash }), afterStateHash: communityHash('visibility', { commentId: resultComment.id, revision: resultComment.revision, status: resultComment.status, contentHash: resultComment.contentHash }) } });
      const result = { contract: COMMUNITY_CONTRACT, actionExecutionId: execution.id, commentId: resultComment.id, status: resultComment.status, revision: resultComment.revision, commandHash, reasonCode: command.reasonCode, providerWrites: 0, messages: 0 };
      await this.kernel.finalizeSuccess({ tenantId, executionId: execution.id, attemptId: claim.attempt.id, leaseToken: claim.leaseToken, outcomeCode: 'public_community_committed', safeResult: result }, tx);
      return result;
    });
  }
  private projection(row: PublicCommunityComment) {
    return { id: row.id, publicationKey: row.publicationKey, parentId: row.parentCommentId, author: this.encryption.decrypt(row.authorEncrypted!), text: this.encryption.decrypt(row.textEncrypted!), sourceKind: row.sourceKind, status: row.status, revision: row.revision, contentHash: row.contentHash, createdAt: row.createdAt.toISOString(), consentPolicyVersion: row.consentPolicyVersion };
  }
  async status(source: VerifiedCommunitySource) {
    const scope = this.sourceScope(source);
    return canonicalUtcTransaction(this.prisma, async tx => {
      await this.tenant(tx, scope.tenantId); const now = this.clock();
      const publication = { tenantId: scope.tenantId, sourceGatewayId: scope.sourceGatewayId, publicationKey: scope.publicationKey };
      const visible = { ...publication, status: 'APPROVED', retentionUntil: { gt: now }, authorEncrypted: { not: null }, textEncrypted: { not: null } };
      const roots = await tx.publicCommunityComment.findMany({ where: { ...visible, parentCommentId: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
      const replies = roots.length ? await tx.publicCommunityComment.findMany({ where: { ...visible, parentCommentId: { in: roots.map(row => row.id) } }, orderBy: { createdAt: 'asc' } }) : [];
      const likes = await tx.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT count(*) AS count FROM (SELECT DISTINCT ON ("visitorSubjectHash") "desiredValue" FROM "PublicCommunityInteraction" WHERE "tenantId"=${scope.tenantId} AND "sourceGatewayId"=${scope.sourceGatewayId} AND "publicationKey"=${scope.publicationKey} AND kind='like' ORDER BY "visitorSubjectHash",version DESC) latest WHERE "desiredValue"`);
      const views = await tx.publicCommunityInteraction.count({ where: { ...publication, kind: 'view' } });
      const own = await tx.publicCommunityInteraction.findFirst({ where: { ...scope, kind: 'like' }, orderBy: { version: 'desc' } });
      return { contract: COMMUNITY_CONTRACT, anonymous: true, sourceScope: communityHash('public-browser-scope', scope), stats: { likes: Number(likes[0].count), views, comments: await tx.publicCommunityComment.count({ where: { ...visible, parentCommentId: null } }), liked: own?.desiredValue ?? false, version: own?.version ?? 0 }, comments: [...roots, ...replies].map(row => this.projection(row)), readOnly: true };
    }, { readOnly: true });
  }
  async queue(tenantId: string, userId: string, cursor?: string) {
    this.context.assertAuthPrincipal(userId, tenantId);
    return canonicalUtcTransaction(this.prisma, async tx => {
      await this.actor(tx, tenantId, userId);
      const rows = await tx.publicCommunityComment.findMany({ where: { tenantId, retentionUntil: { gt: this.clock() }, authorEncrypted: { not: null }, textEncrypted: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 101 });
      return { contract: COMMUNITY_CONTRACT, tenantId, userId, comments: rows.slice(0, 100).map(row => this.projection(row)), nextCursor: rows.length > 100 ? rows[99].id : null, readOnly: true };
    }, { readOnly: true });
  }
}
