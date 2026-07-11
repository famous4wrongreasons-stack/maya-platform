import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';

export interface AuthRateLimitRuleInput {
  action: string;
  maxAttempts: number;
  policyKey: string;
  scope: 'identity' | 'ip' | 'tenant';
  subjectHash: string;
  tenantId: string | null;
  windowSeconds: number;
}

export interface AuthRateLimitConsumeResult {
  allowed: boolean;
  retryAfterSeconds: number;
  violatedPolicyKeys: string[];
}

type CounterRow = {
  attempts: number;
  windowEndsAt: Date;
};

@Injectable()
export class AuthRateLimitRepository {
  constructor(private readonly prisma: PrismaService) {}

  consume(
    rules: AuthRateLimitRuleInput[],
    now: Date,
  ): Promise<AuthRateLimitConsumeResult> {
    const orderedRules = [...rules].sort((left, right) => {
      const scopeDifference =
        this.scopePriority(left.scope) - this.scopePriority(right.scope);

      return (
        scopeDifference ||
        `${left.policyKey}:${left.subjectHash}`.localeCompare(
          `${right.policyKey}:${right.subjectHash}`,
        )
      );
    });

    return this.prisma.$transaction(async (transaction) => {
      for (const rule of orderedRules) {
        const windowEndsAt = new Date(
          now.getTime() + rule.windowSeconds * 1000,
        );
        const rows = await transaction.$queryRaw<CounterRow[]>(Prisma.sql`
          INSERT INTO "AuthRateLimitBucket" (
            "id",
            "tenantId",
            "policyKey",
            "action",
            "scope",
            "subjectHash",
            "attempts",
            "windowStartedAt",
            "windowEndsAt",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            ${randomUUID()},
            ${rule.tenantId},
            ${rule.policyKey},
            ${rule.action},
            ${rule.scope},
            ${rule.subjectHash},
            1,
            ${now},
            ${windowEndsAt},
            ${now},
            ${now}
          )
          ON CONFLICT ("policyKey", "subjectHash")
          DO UPDATE SET
            "tenantId" = EXCLUDED."tenantId",
            "action" = EXCLUDED."action",
            "scope" = EXCLUDED."scope",
            "attempts" = CASE
              WHEN "AuthRateLimitBucket"."windowEndsAt" <= EXCLUDED."windowStartedAt"
                THEN 1
              WHEN "AuthRateLimitBucket"."attempts" >= 2147483647
                THEN 2147483647
              ELSE "AuthRateLimitBucket"."attempts" + 1
            END,
            "windowStartedAt" = CASE
              WHEN "AuthRateLimitBucket"."windowEndsAt" <= EXCLUDED."windowStartedAt"
                THEN EXCLUDED."windowStartedAt"
              ELSE "AuthRateLimitBucket"."windowStartedAt"
            END,
            "windowEndsAt" = CASE
              WHEN "AuthRateLimitBucket"."windowEndsAt" <= EXCLUDED."windowStartedAt"
                THEN EXCLUDED."windowEndsAt"
              ELSE "AuthRateLimitBucket"."windowEndsAt"
            END,
            "updatedAt" = EXCLUDED."updatedAt"
          RETURNING "attempts", "windowEndsAt"
        `);
        const counter = rows[0];

        if (!counter) {
          throw new Error('Auth rate-limit counter was not returned');
        }

        if (counter.attempts > rule.maxAttempts) {
          return {
            allowed: false,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil(
                (counter.windowEndsAt.getTime() - now.getTime()) / 1000,
              ),
            ),
            violatedPolicyKeys: [rule.policyKey],
          };
        }
      }

      return {
        allowed: true,
        retryAfterSeconds: 0,
        violatedPolicyKeys: [],
      };
    });
  }

  private scopePriority(scope: AuthRateLimitRuleInput['scope']): number {
    if (scope === 'ip') {
      return 0;
    }

    if (scope === 'tenant') {
      return 1;
    }

    return 2;
  }
}
