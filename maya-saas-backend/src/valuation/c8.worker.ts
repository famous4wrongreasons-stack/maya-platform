import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { C8Store } from './c8.store';
import { C8Sources } from './c8.sources';
import { C8Producer } from './c8.producer';
import { C8RankingService } from './c8.ranking';
import { C8Object, C8Target, c8Hash } from './c8.contract';
/** Bounded work on existing S14 tick. No new daemon, training, model activation or business effect. */
@Injectable()
export class C8Worker {
  private readonly logger = new Logger(C8Worker.name);
  constructor(
    private readonly store: C8Store,
    private readonly sources: C8Sources,
    private readonly producer: C8Producer,
    private readonly ranking: C8RankingService,
  ) {}
  async tickTenant(tenantId: string) {
    if (tenantId !== this.store.tenant()) throw new Error('c8_worker_tenant');
    const configured = await this.store.transaction((tx) =>
      tx.tenantBusinessConfigurationRevision.findFirst({
        where: { tenantId, namespace: 'c8_valuation' },
        select: { id: true },
      }),
    );
    if (!configured) return { captured: 0, resumed: 0 };
    const policy = await this.store.transaction((tx) =>
      this.sources.policy(tx),
    );
    const pending = await this.store.transaction((tx) =>
      tx.c8ResultRevision.findMany({
        where: { tenantId, state: 'PENDING', expiresAt: { gt: new Date() } },
        orderBy: { admittedAt: 'asc' },
        take: 50,
        select: { id: true, kind: true },
      }),
    );
    let resumed = 0,
      captured = 0,
      attempted = 0;
    for (const p of pending)
      try {
        if (p.kind === 'RANKING') await this.ranking.resume(p.id);
        else await this.producer.resume(p.id);
        resumed++;
      } catch {
        this.logger.warn('C8 pending observation retained; no business effect');
      }
    for (const target of policy.content.predictionTargets as C8Object[]) {
      const targetKey = target.targetKey as C8Target;
      const subjectKind = ['attended_return', 'client_expected_value'].includes(
        targetKey,
      )
        ? 'client'
        : targetKey === 'appointment_no_show'
          ? 'appointment'
          : targetKey === 'staff_earnings_conditional'
            ? 'staff'
            : 'tenant';
      const subjects = await this.store.transaction(async (tx) => {
        if (subjectKind === 'client')
          return tx.client.findMany({
            where: { tenantId, mergedIntoClientId: null },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: 5001,
          });
        if (subjectKind === 'appointment')
          return tx.appointment.findMany({
            where: {
              tenantId,
              mayaClientId: { not: null },
              status: 'confirmed',
              startAt: { gt: new Date() },
            },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: 5001,
          });
        if (subjectKind === 'staff')
          return tx.staff.findMany({
            where: { tenantId, active: true },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: 5001,
          });
        return [{ id: tenantId }];
      });
      if (subjects.length > 5000) {
        this.logger.warn(
          'C8 complete subject scope exceeds bound; explicit narrower scope required',
        );
        continue;
      }
      for (const subject of subjects) {
        if (attempted >= 50) return { captured, resumed };
        const existing = await this.store.transaction((tx) =>
          tx.c8ResultRevision.findFirst({
            where: {
              tenantId,
              subjectKind,
              subjectId: subject.id,
              ruleKey: 'c8.prediction/' + targetKey,
              policyRevisionId: policy.id,
              AND: [
                { scopeJson: { path: ['branchIds'], equals: [] } },
                {
                  scopeJson: {
                    path: ['serviceScope'],
                    equals: target.serviceScope as Prisma.InputJsonValue,
                  },
                },
              ],
              expiresAt: { gt: new Date() },
              horizonEnd: { gt: new Date() },
            },
            orderBy: { admittedAt: 'desc' },
            select: { id: true },
          }),
        );
        if (existing) continue; // Keep the exact admitted T0/horizon; retry is not a new observation.
        attempted++;
        try {
          await this.producer.compute(
            {
              subjectKind,
              subjectId: subject.id,
              capability: 'prediction/' + targetKey,
              branchIds: [],
            },
            undefined,
            true,
          );
          captured++;
        } catch {
          this.logger.warn(
            'C8 source capture unavailable for qualified scope ' +
              c8Hash([tenantId, targetKey]).slice(0, 12),
          );
        }
      }
    }
    return { captured, resumed };
  }
}
