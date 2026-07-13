import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface AuthRetentionCutoffs {
  authChallengeBefore: Date;
  rateLimitBefore: Date;
  sessionInactiveBefore: Date;
}

export interface AuthRetentionCounts {
  emailChallenges: number;
  oauthStates: number;
  phoneChallenges: number;
  rateLimitBuckets: number;
  refreshTokens: number;
  sessions: number;
}

export interface AuthRetentionRunParams {
  batchSize: number;
  cutoffs: AuthRetentionCutoffs;
  dryRun: boolean;
  now: Date;
}

export interface AuthRetentionRunResult {
  batchSize: number;
  cutoffs: AuthRetentionCutoffs;
  deleted: AuthRetentionCounts;
  dryRun: boolean;
  eligible: AuthRetentionCounts;
  hasMore: boolean;
  now: Date;
  status: 'completed' | 'dry_run' | 'skipped_locked';
}

type IdRow = { id: string };
type LockRow = { acquired: boolean };

const EMPTY_COUNTS: AuthRetentionCounts = {
  emailChallenges: 0,
  oauthStates: 0,
  phoneChallenges: 0,
  rateLimitBuckets: 0,
  refreshTokens: 0,
  sessions: 0,
};

@Injectable()
export class AuthRetentionRepository {
  constructor(private readonly prisma: PrismaService) {}

  run(params: AuthRetentionRunParams): Promise<AuthRetentionRunResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        const lockRows = await transaction.$queryRaw<LockRow[]>(Prisma.sql`
          SELECT pg_try_advisory_xact_lock(1296128321, 1381257294) AS "acquired"
        `);

        if (lockRows[0]?.acquired !== true) {
          return this.buildResult(params, {
            status: 'skipped_locked',
            eligible: EMPTY_COUNTS,
            deleted: EMPTY_COUNTS,
            hasMore: false,
          });
        }

        const eligible = await this.countEligible(transaction, params.cutoffs);

        if (params.dryRun) {
          return this.buildResult(params, {
            status: 'dry_run',
            eligible,
            deleted: EMPTY_COUNTS,
            hasMore: this.dryRunHasMore(eligible, params.batchSize),
          });
        }

        const deleted = await this.deleteBatch(
          transaction,
          params.cutoffs,
          params.batchSize,
        );

        return this.buildResult(params, {
          status: 'completed',
          eligible,
          deleted,
          hasMore: this.executeHasMore(eligible, deleted),
        });
      },
      {
        maxWait: 5_000,
        timeout: 60_000,
      },
    );
  }

  private async countEligible(
    transaction: Prisma.TransactionClient,
    cutoffs: AuthRetentionCutoffs,
  ): Promise<AuthRetentionCounts> {
    const sessionWhere = this.sessionEligibility(cutoffs.sessionInactiveBefore);
    const sessions = await transaction.authSession.count({
      where: sessionWhere,
    });
    const refreshTokens = await transaction.authRefreshToken.count({
      where: { session: sessionWhere },
    });
    const phoneChallenges = await transaction.phoneAuthCode.count({
      where: this.phoneChallengeEligibility(cutoffs.authChallengeBefore),
    });
    const emailChallenges = await transaction.emailAuthCode.count({
      where: this.emailChallengeEligibility(cutoffs.authChallengeBefore),
    });
    const oauthStates = await transaction.authFlowState.count({
      where: this.oauthStateEligibility(cutoffs.authChallengeBefore),
    });
    const rateLimitBuckets = await transaction.authRateLimitBucket.count({
      where: { windowEndsAt: { lt: cutoffs.rateLimitBefore } },
    });

    return {
      sessions,
      refreshTokens,
      phoneChallenges,
      emailChallenges,
      oauthStates,
      rateLimitBuckets,
    };
  }

  private async deleteBatch(
    transaction: Prisma.TransactionClient,
    cutoffs: AuthRetentionCutoffs,
    batchSize: number,
  ): Promise<AuthRetentionCounts> {
    const sessionIds = await this.selectSessionIds(
      transaction,
      cutoffs.sessionInactiveBefore,
      batchSize,
    );
    const refreshTokens =
      sessionIds.length === 0
        ? 0
        : await transaction.authRefreshToken.count({
            where: { sessionId: { in: sessionIds } },
          });
    const sessions = await this.deleteSessions(transaction, sessionIds);
    const phoneChallenges = await this.deletePhoneChallenges(
      transaction,
      cutoffs.authChallengeBefore,
      batchSize,
    );
    const emailChallenges = await this.deleteEmailChallenges(
      transaction,
      cutoffs.authChallengeBefore,
      batchSize,
    );
    const oauthStates = await this.deleteOauthStates(
      transaction,
      cutoffs.authChallengeBefore,
      batchSize,
    );
    const rateLimitBuckets = await this.deleteRateLimitBuckets(
      transaction,
      cutoffs.rateLimitBefore,
      batchSize,
    );

    return {
      sessions,
      refreshTokens,
      phoneChallenges,
      emailChallenges,
      oauthStates,
      rateLimitBuckets,
    };
  }

  private async selectSessionIds(
    transaction: Prisma.TransactionClient,
    cutoff: Date,
    batchSize: number,
  ): Promise<string[]> {
    const rows = await transaction.$queryRaw<IdRow[]>(Prisma.sql`
      SELECT "id"
      FROM "AuthSession"
      WHERE
        ("revokedAt" IS NOT NULL AND "revokedAt" < ${cutoff})
        OR "expiresAt" < ${cutoff}
      ORDER BY LEAST("expiresAt", COALESCE("revokedAt", "expiresAt")), "id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `);

    return rows.map((row) => row.id);
  }

  private async deleteSessions(
    transaction: Prisma.TransactionClient,
    ids: string[],
  ): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const result = await transaction.authSession.deleteMany({
      where: { id: { in: ids } },
    });

    return result.count;
  }

  private async deletePhoneChallenges(
    transaction: Prisma.TransactionClient,
    cutoff: Date,
    batchSize: number,
  ): Promise<number> {
    const ids = await transaction.$queryRaw<IdRow[]>(Prisma.sql`
      SELECT "id"
      FROM "PhoneAuthCode"
      WHERE
        "expiresAt" < ${cutoff}
        OR ("consumedAt" IS NOT NULL AND "consumedAt" < ${cutoff})
      ORDER BY "expiresAt", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `);

    if (ids.length === 0) {
      return 0;
    }

    const result = await transaction.phoneAuthCode.deleteMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });

    return result.count;
  }

  private async deleteOauthStates(
    transaction: Prisma.TransactionClient,
    cutoff: Date,
    batchSize: number,
  ): Promise<number> {
    const ids = await transaction.$queryRaw<IdRow[]>(Prisma.sql`
      SELECT "id"
      FROM "AuthFlowState"
      WHERE
        "expiresAt" < ${cutoff}
        OR ("consumedAt" IS NOT NULL AND "consumedAt" < ${cutoff})
      ORDER BY "expiresAt", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `);

    if (ids.length === 0) {
      return 0;
    }

    const result = await transaction.authFlowState.deleteMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });

    return result.count;
  }

  private async deleteEmailChallenges(
    transaction: Prisma.TransactionClient,
    cutoff: Date,
    batchSize: number,
  ): Promise<number> {
    const ids = await transaction.$queryRaw<IdRow[]>(Prisma.sql`
      SELECT "id"
      FROM "EmailAuthCode"
      WHERE
        "expiresAt" < ${cutoff}
        OR ("consumedAt" IS NOT NULL AND "consumedAt" < ${cutoff})
      ORDER BY "expiresAt", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `);

    if (ids.length === 0) return 0;

    const result = await transaction.emailAuthCode.deleteMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });

    return result.count;
  }

  private async deleteRateLimitBuckets(
    transaction: Prisma.TransactionClient,
    cutoff: Date,
    batchSize: number,
  ): Promise<number> {
    const ids = await transaction.$queryRaw<IdRow[]>(Prisma.sql`
      SELECT "id"
      FROM "AuthRateLimitBucket"
      WHERE "windowEndsAt" < ${cutoff}
      ORDER BY "windowEndsAt", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `);

    if (ids.length === 0) {
      return 0;
    }

    const result = await transaction.authRateLimitBucket.deleteMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });

    return result.count;
  }

  private sessionEligibility(cutoff: Date): Prisma.AuthSessionWhereInput {
    return {
      OR: [{ revokedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
    };
  }

  private phoneChallengeEligibility(
    cutoff: Date,
  ): Prisma.PhoneAuthCodeWhereInput {
    return {
      OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }],
    };
  }

  private emailChallengeEligibility(
    cutoff: Date,
  ): Prisma.EmailAuthCodeWhereInput {
    return {
      OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }],
    };
  }

  private oauthStateEligibility(cutoff: Date): Prisma.AuthFlowStateWhereInput {
    return {
      OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }],
    };
  }

  private buildResult(
    params: AuthRetentionRunParams,
    values: Pick<
      AuthRetentionRunResult,
      'deleted' | 'eligible' | 'hasMore' | 'status'
    >,
  ): AuthRetentionRunResult {
    return {
      batchSize: params.batchSize,
      cutoffs: params.cutoffs,
      deleted: { ...values.deleted },
      dryRun: params.dryRun,
      eligible: { ...values.eligible },
      hasMore: values.hasMore,
      now: params.now,
      status: values.status,
    };
  }

  private dryRunHasMore(
    eligible: AuthRetentionCounts,
    batchSize: number,
  ): boolean {
    return (
      eligible.sessions > batchSize ||
      eligible.phoneChallenges > batchSize ||
      eligible.emailChallenges > batchSize ||
      eligible.oauthStates > batchSize ||
      eligible.rateLimitBuckets > batchSize
    );
  }

  private executeHasMore(
    eligible: AuthRetentionCounts,
    deleted: AuthRetentionCounts,
  ): boolean {
    return (
      eligible.sessions > deleted.sessions ||
      eligible.phoneChallenges > deleted.phoneChallenges ||
      eligible.emailChallenges > deleted.emailChallenges ||
      eligible.oauthStates > deleted.oauthStates ||
      eligible.rateLimitBuckets > deleted.rateLimitBuckets
    );
  }
}
