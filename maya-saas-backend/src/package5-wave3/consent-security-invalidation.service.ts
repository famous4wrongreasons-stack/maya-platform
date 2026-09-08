import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../common/domain.enums';
import { randomUUID } from 'node:crypto';
import {
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ExternalDispatchState,
  Prisma,
  type ActionExecution,
} from '@prisma/client';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../action-engine';
import {
  CONSENT_SECURITY_ACTION,
  CONSENT_SECURITY_APPROVAL,
  CONSENT_SECURITY_CAPABILITY,
  CONSENT_SECURITY_CONTRACT,
  CONSENT_SECURITY_REASON,
  consentSecurityHash,
  normalizeConsentSecurityInput,
  normalizeSecurityCommand,
  normalizeSecurityManifest,
  type ConsentSecurityCommand,
  type SecurityAuthorityEvidence,
  type SecurityManifest,
} from '../action-engine/consent-security-invalidation.contract';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  ClientChannelLinkService,
  lockClientChannelIdentity,
} from '../crm/client-channel-link.service';
import {
  effectiveClientConsents,
  lockClientConsent,
} from '../crm/client-effective-consent';
import { ConsentSecurityApprovalService } from './consent-security-approval.service';
import { retryableBulkTransaction } from '../marketing/canonical-bulk.contract';

type Tx = Prisma.TransactionClient;
const conflict = () =>
  new ConflictException('consent_security_prestate_changed');

/** A18 security operation: never a Client revoke or an ungoverned maintenance
 * writer. One admitted incident owns both append-only invalidations and the
 * existing link owner's revocation, in one Action Engine transaction. */
@Injectable()
export class ConsentSecurityInvalidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly approval: ConsentSecurityApprovalService,
  ) {}

  async remediate(actor: AuthenticatedUser, value: unknown) {
    const execution = await this.admit(actor, value);
    return this.execute(actor, execution.id, execution.tenantId);
  }

  /** Admission is durable independently of execution; restart uses this row. */
  async admit(actor: AuthenticatedUser, value: unknown) {
    const command = normalizeSecurityCommand(value);
    const sourceRef = `a18-consent-security:${consentSecurityHash({ tenantId: command.tenantId, clientId: command.clientId, incidentId: command.incidentId })}`;
    return this.inTenant(command.tenantId, () =>
      this.serializable(async (tx) => {
        const authority = await this.authority(tx, actor);
        await lockClientConsent(tx, command.tenantId, command.clientId);
        const prior = await tx.actionExecution.findMany({
          where: {
            tenantId: command.tenantId,
            capability: CONSENT_SECURITY_CAPABILITY,
            sourceRef,
          },
          take: 2,
        });
        if (prior.length > 1) throw conflict();
        if (prior[0]) {
          const input = normalizeConsentSecurityInput(
            await this.kernel.readTrustedNormalizedInput(
              command.tenantId,
              prior[0].id,
            ),
          );
          if (
            input.requestMaterialHash !== consentSecurityHash(command) ||
            input.manifest.authority.userId !== actor.userId
          )
            throw conflict();
          this.approval.verify(input.manifest);
          return prior[0];
        }
        const manifest = await this.snapshot(tx, command, authority);
        manifest.authority.approvalMaterialHash =
          this.approval.verify(manifest);
        const normalized = normalizeSecurityManifest(manifest);
        const evidenceSetHash = consentSecurityHash(normalized);
        return this.ingress.createExecution(
          {
            contract: ACTION_EXECUTION_REQUEST_CONTRACT,
            tenantId: command.tenantId,
            capability: CONSENT_SECURITY_CAPABILITY,
            targetRef: command.clientId,
            // Existing platform-action mapping: no fabricated tenant Membership FK.
            source: {
              type: 'legacy_bridge',
              sourceRef,
              occurrenceScope: sourceRef,
            },
            input: {
              operation: CONSENT_SECURITY_ACTION,
              targetKind: 'client_consent_security',
              targetRef: command.clientId,
              requestMaterialHash: consentSecurityHash(command),
              evidenceSetHash,
              manifest: normalized,
            },
            evidenceRefs: [
              `security-evidence:${evidenceSetHash}`,
              `security-link:${command.linkId}`,
              `security-target:${command.clientId}`,
              `security-actor:${actor.userId}`,
              `security-authority:${consentSecurityHash(normalized.authority)}`,
              ...normalized.facts.map(
                (f) =>
                  `security-fact:${f.id}:${f.actionExecutionId}:${f.normalizedInputHash}`,
              ),
            ],
            callerIdempotency: {
              scope: 'a18.consent-security-invalidation.v1',
              key: sourceRef,
            },
          },
          tx,
        );
      }),
    );
  }

  async execute(
    actor: AuthenticatedUser,
    executionId: string,
    tenantId: string,
  ) {
    const input = normalizeConsentSecurityInput(
      await this.kernel.readTrustedNormalizedInput(tenantId, executionId),
    );
    const m = input.manifest,
      c = m.command;
    if (c.tenantId !== tenantId || m.authority.userId !== actor.userId)
      throw new ForbiddenException('Exact security actor and tenant required');
    if (this.approval.verify(m) !== m.authority.approvalMaterialHash)
      throw conflict();
    return this.inTenant(tenantId, () =>
      this.serializable(async (tx) => {
        await this.authority(tx, actor);
        await lockClientConsent(tx, tenantId, c.clientId);
        await lockClientChannelIdentity(
          tx,
          tenantId,
          m.link.provider,
          m.link.providerSubjectHash,
        );
        await tx.$queryRaw`SELECT id FROM "Client" WHERE id=${c.clientId} AND "tenantId"=${tenantId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "CustomerProfile" WHERE "clientId"=${c.clientId} AND "tenantId"=${tenantId} FOR UPDATE`;
        const e = await tx.actionExecution.findUniqueOrThrow({
          where: { id_tenantId: { id: executionId, tenantId } },
        });
        if (e.state === ActionExecutionState.SUCCEEDED) return this.restore(e);
        if (
          e.state !== ActionExecutionState.READY ||
          e.dryRun ||
          e.policyDecision !== ActionPolicyDecision.ALLOW ||
          e.capability !== CONSENT_SECURITY_CAPABILITY
        )
          throw conflict();
        const current = await this.snapshot(tx, c, m.authority);
        if (consentSecurityHash(current) !== input.evidenceSetHash)
          throw conflict();
        const [clock] = await tx.$queryRaw<
          Array<{ now: Date }>
        >`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::timestamp(3) AS now`;
        const now = clock.now,
          attemptId = randomUUID();
        await tx.actionAttempt.create({
          data: {
            id: attemptId,
            tenantId,
            actionExecutionId: e.id,
            attemptNumber: e.executionAttemptCount + 1,
            kind: ActionAttemptKind.EXECUTION,
            state: ActionAttemptState.STARTED,
            executorKey: 'package5.a18.consent-security-invalidation.local',
            executorVersion: 1,
            externalDispatchState: ExternalDispatchState.NOT_CROSSED,
            reconciliationRequired: false,
            startedAt: now,
          },
        });
        await tx.actionExecution.update({
          where: { id: e.id },
          data: {
            state: ActionExecutionState.EXECUTING,
            executionAttemptCount: { increment: 1 },
            firstAttemptedAt: e.firstAttemptedAt ?? now,
            leaseOwner: `a18-security:${e.id}`,
            leaseTokenHash: consentSecurityHash(e.id),
            leaseExpiresAt: new Date(now.getTime() + 60000),
            revision: { increment: 1 },
          },
        });
        const proofToken = consentSecurityHash({
          executionId: e.id,
          evidenceSetHash: input.evidenceSetHash,
        });
        const links = new ClientChannelLinkService(
          this.prisma,
          this.context,
          {
            verifyLink: () =>
              Promise.reject(
                new ForbiddenException(
                  'Security invalidation cannot create links',
                ),
              ),
            verifyRevocation: async (proof) => {
              if (proof !== proofToken)
                throw new ForbiddenException(
                  'Admitted security proof required',
                );
              await this.authority(tx, actor);
              return {
                tenantId,
                provider: m.link.provider,
                providerSubjectHash: m.link.providerSubjectHash,
                linkId: c.linkId,
                revocationIdentityHash: input.evidenceSetHash,
                actorProofHash: consentSecurityHash(m.authority),
                reason: CONSENT_SECURITY_REASON,
                validUntil: new Date(now.getTime() + 60000),
              };
            },
          },
          () => now,
        );
        await links.revokeInTransaction(tx, { proof: proofToken });
        for (const fact of m.facts)
          await tx.clientConsentInvalidation.create({
            data: {
              tenantId,
              clientId: c.clientId,
              consentFactId: fact.id,
              invalidatedLinkId: c.linkId,
              actionExecutionId: e.id,
              authorizedByUserId: actor.userId,
              reasonCode: CONSENT_SECURITY_REASON,
              policyVersion: 1,
              invalidatedAt: now,
              evidenceSetHash: input.evidenceSetHash,
              authorityEvidenceJson:
                m.authority as unknown as Prisma.InputJsonValue,
            },
          });
        const effective = await effectiveClientConsents(
          tx,
          tenantId,
          c.clientId,
          now,
        );
        if (effective.privacy.effective || effective.marketing.effective)
          throw conflict();
        // Only proven canonical profile targets; never User/Profile association.
        for (const p of m.profiles) {
          const changed = await tx.customerProfile.updateMany({
            where: { id: p.id, tenantId, clientId: c.clientId },
            data: {
              privacyConsentAt: effective.privacy.effectiveAt,
              marketingConsentAt: effective.marketing.effectiveAt,
            },
          });
          if (changed.count !== 1) throw conflict();
        }
        const generation = await tx.actionTargetMutation.aggregate({
          where: {
            tenantId,
            targetKind: 'client_consent_security',
            targetRef: c.clientId,
          },
          _max: { targetGeneration: true },
        });
        await tx.actionTargetMutation.create({
          data: {
            tenantId,
            actionExecutionId: e.id,
            targetKind: 'client_consent_security',
            targetRef: c.clientId,
            mutationKind: CONSENT_SECURITY_ACTION,
            mutationKey: c.incidentId,
            targetGeneration: (generation._max.targetGeneration ?? -1) + 1,
            beforeStateHash: input.evidenceSetHash,
            afterStateHash: consentSecurityHash({
              invalidated: c.factIds,
              revoked: c.linkId,
            }),
          },
        });
        await tx.auditLog.create({
          data: {
            scope: 'platform',
            userId: actor.userId,
            action: CONSENT_SECURITY_ACTION,
            entityType: 'ActionExecution',
            entityId: e.id,
            metadataJson: {
              affectedTenantId: tenantId,
              incidentId: c.incidentId,
              evidenceSetHash: input.evidenceSetHash,
              invalidations: 2,
            },
          },
        });
        const receipt = {
          actionExecutionId: e.id,
          outcome: 'security_invalidated',
          invalidations: 2,
          providerWrites: 0,
        };
        await tx.actionAttempt.update({
          where: { id: attemptId },
          data: {
            state: ActionAttemptState.SUCCEEDED,
            outcomeCode: 'local_transaction_committed',
            safeResultJson: receipt,
            finishedAt: now,
          },
        });
        await tx.actionExecution.update({
          where: { id: e.id },
          data: {
            state: ActionExecutionState.SUCCEEDED,
            finalOutcomeCode: 'local_transaction_committed',
            safeResultSummaryJson: receipt,
            finalizedAt: now,
            reconciliationState: 'NOT_REQUIRED',
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            revision: { increment: 1 },
          },
        });
        return receipt;
      }),
    );
  }

  private async authority(
    tx: Tx,
    actor: AuthenticatedUser,
  ): Promise<SecurityAuthorityEvidence> {
    if (
      !actor?.sessionId ||
      actor.tenantId !== null ||
      actor.role !== UserRole.PLATFORM_OWNER ||
      actor.membershipId !== null
    )
      throw new ForbiddenException(
        'Current canonical platform security actor required',
      );
    const [user, session] = await Promise.all([
      tx.user.findUnique({ where: { id: actor.userId } }),
      tx.authSession.findUnique({ where: { id: actor.sessionId } }),
    ]);
    const [clock] = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`;
    if (
      !user ||
      user.status !== 'active' ||
      user.role !== 'platform_owner' ||
      user.tenantId !== null ||
      !session ||
      session.userId !== user.id ||
      session.tenantId !== null ||
      session.revokedAt ||
      session.expiresAt <= clock.now
    )
      throw new ForbiddenException('Security authority is no longer active');
    return {
      contract: 'maya.a18.security-actor/1',
      policyVersion: 1,
      userId: user.id,
      role: 'platform_owner',
      scope: 'platform',
      sessionIdentityHash: consentSecurityHash({
        sessionId: session.id,
        userId: user.id,
      }),
      verifiedAt: clock.now.toISOString(),
      approvalRef: CONSENT_SECURITY_APPROVAL,
      approvalMaterialHash: '0'.repeat(64),
    };
  }

  private async snapshot(
    tx: Tx,
    command: ConsentSecurityCommand,
    authority: SecurityAuthorityEvidence,
  ): Promise<SecurityManifest> {
    const { tenantId, clientId, linkId } = command;
    const link = await tx.clientChannelLink.findUnique({
      where: { id_tenantId: { id: linkId, tenantId } },
    });
    if (
      !link ||
      link.clientId !== clientId ||
      link.revokedAt ||
      !['maya_user', 'telegram'].includes(link.provider)
    )
      throw conflict();
    const challenges = await tx.clientLinkChallenge.findMany({
      where: {
        issuanceEvidenceJson: {
          path: ['resolver'],
          equals: 'a18.maya-user-client-association.v1',
        },
      },
      take: 2,
    });
    if (
      challenges.length !== 1 ||
      challenges[0].consumedLinkId !== linkId ||
      challenges[0].tenantId !== tenantId ||
      challenges[0].clientId !== clientId
    )
      throw conflict();
    const challenge = challenges[0];
    if (
      (link.verificationEvidenceJson as Prisma.JsonObject)
        .clientAuthorityProofHash !== challenge.issuanceEvidenceHash
    )
      throw conflict();
    const allFacts = await tx.clientConsentFact.findMany({
      where: { tenantId, clientId },
      include: { execution: true, invalidation: true },
      take: 101,
    });
    if (allFacts.length > 100) throw conflict();
    const facts: SecurityManifest['facts'] = [];
    for (const f of allFacts) {
      if (
        f.decision !== 'grant' ||
        !f.execution ||
        f.execution.state !== ActionExecutionState.SUCCEEDED ||
        f.execution.actionClass !== 'record_client_consent'
      )
        continue;
      const original = await this.kernel.readTrustedNormalizedInput(
        tenantId,
        f.execution.id,
      );
      const binding = original.consentChannel as
        { linkId?: string } | undefined;
      if (binding?.linkId !== linkId) continue;
      if (
        original.clientId !== clientId ||
        original.consentKind !== f.kind ||
        original.consentDecision !== f.decision ||
        original.sourceIdentityHash !== f.sourceIdentityHash ||
        f.invalidation ||
        !['privacy', 'marketing'].includes(f.kind)
      )
        throw conflict();
      facts.push({
        id: f.id,
        kind: f.kind as 'privacy' | 'marketing',
        actionExecutionId: f.execution.id,
        normalizedInputHash: f.execution.normalizedInputHash,
      });
    }
    if (
      facts
        .map((f) => f.id)
        .sort()
        .join(',') !== command.factIds.join(',')
    )
      throw conflict();
    const heads: SecurityManifest['heads'] = [];
    for (const kind of ['privacy', 'marketing'] as const) {
      const rows = await tx.clientConsentFact.findMany({
        where: { tenantId, clientId, kind, effectiveAt: { lte: new Date() } },
        orderBy: [
          { effectiveAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: 2,
      });
      if (
        !rows[0] ||
        !facts.some((f) => f.id === rows[0].id && f.kind === kind) ||
        (rows[1]?.effectiveAt.getTime() === rows[0].effectiveAt.getTime() &&
          rows[1].decision !== rows[0].decision)
      )
        throw conflict();
      heads.push({ kind, factId: rows[0].id });
    }
    const profiles = await tx.customerProfile.findMany({
      where: { tenantId, clientId },
      select: { id: true, privacyConsentAt: true, marketingConsentAt: true },
    });
    return normalizeSecurityManifest({
      contract: CONSENT_SECURITY_CONTRACT,
      command,
      reasonCode: CONSENT_SECURITY_REASON,
      policyVersion: 1,
      authority,
      link: {
        id: link.id,
        provider: link.provider,
        providerSubjectHash: link.providerSubjectHash,
        verificationEvidenceHash: link.verificationEvidenceHash,
        challengeId: challenge.id,
        issuanceEvidenceHash: challenge.issuanceEvidenceHash,
        expectedRevokedAt: null,
      },
      facts,
      heads,
      profiles: profiles.map((p) => ({
        id: p.id,
        privacyConsentAt: p.privacyConsentAt?.toISOString() ?? null,
        marketingConsentAt: p.marketingConsentAt?.toISOString() ?? null,
      })),
    });
  }
  private restore(e: ActionExecution) {
    if (!e.safeResultSummaryJson) throw conflict();
    return e.safeResultSummaryJson;
  }
  private inTenant<T>(tenantId: string, work: () => Promise<T>) {
    return this.context.runAsPublicTenant(tenantId, work);
  }
  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let n = 0; ; n++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        });
      } catch (error) {
        if (n < 4 && retryableBulkTransaction(error)) continue;
        throw error;
      }
    }
  }
}
