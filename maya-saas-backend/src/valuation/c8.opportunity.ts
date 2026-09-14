import { Injectable } from '@nestjs/common';
import { Prisma, Opportunity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  OpportunityLifecycleRepository,
  resolutionEvidenceFingerprint,
} from '../opportunities/opportunity.lifecycle';
import {
  OpportunityV1,
  OpportunityEvidenceV1,
} from '../opportunities/opportunity.contract';
import { C8Store } from './c8.store';
import { C8Sources } from './c8.sources';
import { C8Object, c8Hash } from './c8.contract';
import {
  c8OpportunityProjection,
  c8ParseOpportunityRef,
} from './c8.opportunity.contract';

/** Typed evidence adapter. Every write is delegated to the existing Opportunity lifecycle owner. */
@Injectable()
export class C8OpportunityBridge {
  private readonly lifecycle: OpportunityLifecycleRepository;
  constructor(
    prisma: PrismaService,
    private readonly store: C8Store,
    private readonly sources: C8Sources,
  ) {
    this.lifecycle = new OpportunityLifecycleRepository(prisma);
  }
  private async projections(
    tx: Prisma.TransactionClient,
    subject?: { kind: string; id: string },
  ) {
    const tenantId = this.store.tenant();
    const head = await tx.tenantBusinessConfigurationRevision.findFirst({
      where: { tenantId, namespace: 'c8_valuation' },
      orderBy: { revision: 'desc' },
      select: { encryptedContent: true },
    });
    if (!head?.encryptedContent) return [];
    const policy = await this.sources.policy(tx);
    const admission = policy.content.opportunityAdmission as C8Object;
    if (admission.enabled !== true) return [];
    const now = new Date(),
      rows = await tx.c8ResultRevision.findMany({
        where: {
          tenantId,
          policyRevisionId: policy.id,
          state: 'PUBLISHED',
          ...(subject
            ? { subjectKind: subject.kind, subjectId: subject.id }
            : {}),
          expiresAt: { gt: now },
        },
        orderBy: [{ t0: 'desc' }, { id: 'asc' }],
        take: 5001,
      });
    if (rows.length > 5000)
      throw new Error('c8_opportunity_scope_exceeds_bound');
    const current = [] as typeof rows;
    for (const row of rows)
      if (await this.store.refsCurrent(row, tx)) {
        const latest = await tx.c8ResultRevision.findFirst({
          where: { tenantId, identityHash: row.identityHash },
          orderBy: { revision: 'desc' },
          select: { id: true },
        });
        if (latest?.id === row.id) current.push(row);
      }
    const revision =
      await tx.tenantBusinessConfigurationRevision.findFirstOrThrow({
        where: { id: policy.id, tenantId },
        select: { revision: true },
      });
    const byCondition = new Map<string, OpportunityV1>();
    for (const rule of admission.rules as C8Object[])
      for (const row of current) {
        const projection = c8OpportunityProjection(
          row,
          current,
          rule,
          revision.revision,
          now,
        );
        if (projection && !byCondition.has(projection.semanticKey))
          byCondition.set(projection.semanticKey, projection);
      }
    return [...byCondition.values()];
  }
  async refresh() {
    const tenantId = this.store.tenant();
    const projections = await this.store.transaction((tx) =>
      this.projections(tx),
    );
    const accepted: string[] = [];
    for (const opportunity of projections) {
      await this.lifecycle.persistOpportunity({
        tenantId,
        opportunity,
        task: null,
        validatedAt: new Date(),
        verifyEvidence: async (tx) => {
          const current = await this.projections(tx, {
            kind: opportunity.affectedEntity!.kind,
            id: opportunity.affectedEntity!.ref,
          });
          if (
            !current.some(
              (c) => c.identityFingerprint === opportunity.identityFingerprint,
            )
          )
            throw new Error('c8_opportunity_current_evidence_required');
        },
      });
      accepted.push(opportunity.semanticKey);
    }
    const active = await this.store.transaction((tx) =>
      tx.opportunity.findMany({
        where: { tenantId, status: 'active', policyKey: { startsWith: 'c8_' } },
        take: 5001,
      }),
    );
    if (active.length > 5000)
      throw new Error('c8_opportunity_scope_exceeds_bound');
    let resolved = 0;
    for (const row of active)
      if (!(await this.current(row))) {
        const now = new Date();
        // Complete proof of failed effective eligibility; never infer a negative source event from absence.
        const evidence: OpportunityEvidenceV1[] = [
          {
            owner: 'c8_result',
            capability: 'valuation_result_v1',
            factRef: c8Hash([
              row.id,
              row.evidenceFingerprint,
              'current_eligibility_failed',
            ]),
            version: 1,
            observedAt: now.toISOString(),
            asOf: now.toISOString(),
            basis: 'current_eligibility_failed',
            completeness: 'complete',
          },
        ];
        await this.lifecycle.resolveCurrent({
          tenantId,
          semanticKey: row.semanticKey,
          resolvedAt: now,
          proof: {
            evidence,
            observedAt: now.toISOString(),
            evidenceFingerprint: resolutionEvidenceFingerprint(evidence),
            reasonCode: 'c8_result_no_longer_eligible',
          },
        });
        resolved++;
      }
    return { admitted: accepted.length, resolved };
  }
  async current(row: Opportunity) {
    if (
      row.tenantId !== this.store.tenant() ||
      row.status !== 'active' ||
      row.expiresAt <= new Date()
    )
      return false;
    const wrapper = row.evidenceRefsJson as unknown as {
      items?: Array<{ owner: string; ref?: string }>;
    };
    if (
      !wrapper.items?.length ||
      wrapper.items.some((i) => i.owner !== 'c8_result' || !i.ref)
    )
      return false;
    for (const item of wrapper.items) c8ParseOpportunityRef(item.ref!);
    return this.store.transaction(async (tx) => {
      const projections = await this.projections(tx, {
        kind: row.affectedEntityKind!,
        id: row.affectedEntityRef!,
      });
      return projections.some(
        (p) => p.identityFingerprint === row.identityFingerprint,
      );
    });
  }
}
