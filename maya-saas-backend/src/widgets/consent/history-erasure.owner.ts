import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { meets } from '../authority/ladder';
import type { PrincipalResolver, RequestTx } from '../authority/principal-view';
import { PRINCIPAL_RESOLVER } from '../di-tokens';
import { TimelineStore } from '../stores/timeline.store';
import { WidgetConversationErasureJob } from './erasure.job';
import { historyErasureInput } from './history-erasure.dto';

const REQUEST_NAMESPACE = 'maya.privacy.history-erasure/1';

export interface HistoryErasureCompletion {
  readonly contract: typeof REQUEST_NAMESPACE;
  readonly outcome: 'COMPLETED';
  readonly requestId: string;
  readonly conversationId: string;
  /** Persisted completion time, including on replay; no assertion about a fresh erase. */
  readonly erasedAt: string;
}

/**
 * Authenticated privacy confirmation owner, outside chat/model/widget actuation.
 * Existing tombstones bind one request to one immutable current-principal scope;
 * the existing RT6 job remains the only writer of erasure effects and tombstones.
 */
@Injectable()
export class HistoryErasureOwner {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRINCIPAL_RESOLVER)
    private readonly principals: PrincipalResolver,
    private readonly erasure: WidgetConversationErasureJob,
  ) {}

  async erase(
    actor: AuthenticatedUser,
    conversationIdentity: unknown,
    body: unknown,
  ): Promise<HistoryErasureCompletion> {
    const { conversationId, requestId } = historyErasureInput(
      conversationIdentity,
      body,
    );
    // The controller receives this actor from the canonical JWT/session guard.
    // The resolver below independently binds it to current tenant/user authority.
    if (!actor.tenantId || !actor.userId || !actor.sessionId)
      throw new ForbiddenException('history_erasure_principal_unavailable');
    const tenantId = actor.tenantId;
    const requestDigest = TimelineStore.historyErasureIdentityDigest([
      REQUEST_NAMESPACE,
      tenantId,
      actor.userId,
      requestId,
    ]);
    const requestPrefix = `${REQUEST_NAMESPACE}:${requestDigest}:`;
    const complete = (erasedAt: Date): HistoryErasureCompletion => {
      if (!(erasedAt instanceof Date) || !Number.isFinite(erasedAt.getTime()))
        throw new InternalServerErrorException('history_erasure_incomplete');
      return Object.freeze({
        contract: REQUEST_NAMESPACE,
        outcome: 'COMPLETED',
        requestId,
        conversationId,
        erasedAt: erasedAt.toISOString(),
      });
    };

    return this.prisma.$transaction(
      async (tx) => {
        // Serialize the request identity BEFORE any conversation lock. The same
        // request cannot concurrently be admitted for two different conversations.
        await WidgetConversationErasureJob.lockRequest(tx, requestPrefix);
        const initial = await this.currentPrincipal(tx, actor, tenantId);
        await TimelineStore.lockConversation(tx, tenantId, conversationId);
        // Preserve the writers' principal→conversation lock order. Tenant and
        // Staff activity are not covered by the resolver's Membership/User share
        // locks, so re-resolve after a possible conversation-lock wait.
        const principal = await this.currentPrincipal(tx, actor, tenantId);
        if (principal.proofHash !== initial.proofHash)
          throw new ForbiddenException('history_erasure_principal_unavailable');
        const now = await TimelineStore.readDatabaseClock(tx);
        const scopeDigest = TimelineStore.historyErasureIdentityDigest([
          `${REQUEST_NAMESPACE}/scope`,
          tenantId,
          actor.userId,
          principal.proofHash,
          conversationId,
        ]);
        const erasureRequestRef = `${requestPrefix}${scopeDigest}`;

        // A successful job creates MANY rows for one ref. Bound DISTINCT refs,
        // never two arbitrary tombstones that might hide a conflicting scope.
        const prior = await tx.$queryRaw<
          { erasureRequestRef: string; erasedAt: Date }[]
        >`
          SELECT "erasureRequestRef", MIN("erasedAt") FILTER (
            WHERE "store" = 'timeline' AND "rowKey" LIKE 'WidgetTimelineTurn/%'
          ) AS "erasedAt"
          FROM "WidgetErasureTombstone"
          WHERE "tenantId" = ${tenantId}
            AND "erasureRequestRef" LIKE ${`${requestPrefix}%`}
          GROUP BY "erasureRequestRef"
          LIMIT 2
        `;
        if (prior.length > 0) {
          if (
            prior.length !== 1 ||
            prior[0].erasureRequestRef !== erasureRequestRef
          )
            throw new ConflictException('history_erasure_request_conflict');
          // Bind completion ONLY to original turn tombstones. A repair timestamp
          // cannot change it, even if the database clock moved backwards.
          const completion = complete(prior[0].erasedAt);
          // Authority was resolved again above. Repair only legacy narrative on
          // this request's already-tombstoned emissions; never rerun full erasure
          // or select newly written rows. Clean retries write nothing.
          await this.erasure.repairRetainedTerminalContent(
            tx,
            {
              tenantId,
              conversationId,
              subjectPrincipalProofHash: principal.proofHash,
              erasureRequestRef,
            },
            now,
          );
          return completion;
        }

        const liveTurn = await TimelineStore.readLiveConversationAnchor(
          tx,
          {
            tenantId,
            conversationId,
            principalProofHash: principal.proofHash,
          },
          now,
        );
        if (!liveTurn)
          throw new NotFoundException(
            'history_erasure_conversation_unavailable',
          );

        // WidgetDraft has no conversation column. Retained metadata links are
        // the sole provenance. A content-bearing orphan of this exact subject
        // cannot be assigned to the selected conversation by guessing.
        const hasUnlinkedContent =
          await WidgetConversationErasureJob.hasUnlinkedDraftContent(tx, {
            tenantId,
            subjectPrincipalProofHash: principal.proofHash,
          });
        if (hasUnlinkedContent)
          throw new ConflictException('history_erasure_unlinked_draft_content');

        const result = await this.erasure.runInTransaction(
          tx,
          {
            tenantId,
            conversationId,
            subjectPrincipalProofHash: principal.proofHash,
            erasureRequestRef,
          },
          now,
        );
        if (result.tombstonesWritten < 1)
          throw new InternalServerErrorException('history_erasure_incomplete');
        // A generic changed-row count is insufficient: bind success to the exact
        // live owned turn found under the conversation lock in this transaction.
        const completedTurn = await tx.widgetErasureTombstone.findFirst({
          where: {
            tenantId,
            erasureRequestRef,
            store: 'timeline',
            rowKey: `WidgetTimelineTurn/${liveTurn.id}`,
          },
          select: { erasedAt: true },
        });
        if (!completedTurn)
          throw new InternalServerErrorException('history_erasure_incomplete');
        return complete(completedTurn.erasedAt);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async currentPrincipal(
    tx: RequestTx,
    actor: AuthenticatedUser,
    tenantId: string,
  ) {
    const principal = await this.principals.resolve(tx);
    if (
      !principal ||
      principal.authority.kind !== 'USER' ||
      !meets(principal.verificationLevel, 'SESSION_VERIFIED') ||
      principal.authority.tenantId !== tenantId ||
      principal.authority.userId !== actor.userId ||
      !/^[0-9a-f]{64}$/.test(principal.proofHash)
    )
      throw new ForbiddenException('history_erasure_principal_unavailable');
    return principal;
  }
}
