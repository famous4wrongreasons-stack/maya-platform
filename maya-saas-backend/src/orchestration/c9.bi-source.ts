import { Injectable } from '@nestjs/common';
import { UserRole } from '../common/domain.enums';
import { MeasurementReadService } from '../measurement/measurement.read.service';
import { AiToolPolicyService } from '../ai-tools/ai-tool-policy.service';
import { AiToolRegistryService } from '../ai-tools/ai-tool-registry.service';
import { C9Store } from './c9.store';
import { C9Object, c9Deny, c9Evidence, c9Hash, c9Refs } from './c9.contract';

export const BI_REPORT_CALL = 'explicit-published-financial-report';

/** Exact published metadata only. C7 owns financial facts and current viewer authority. */
@Injectable()
export class C9BiSource {
  constructor(
    private readonly store: C9Store,
    private readonly measurement: MeasurementReadService,
    private readonly policy: AiToolPolicyService,
    private readonly registry: AiToolRegistryService,
  ) {}

  async authorize(runId: string) {
    const current = await this.store.transaction(
      undefined,
      async (tx, principal, now) => {
        const root = await this.store.lock(tx, principal, runId, true, now);
        const member = await tx.membership.findFirst({
          where: {
            tenantId: principal.tenantId,
            id: principal.membershipId ?? '',
            userId: principal.userId ?? '',
            status: 'active',
          },
        });
        if (
          !member ||
          !['tenant_owner', 'business_owner'].includes(member.role) ||
          member.branchId ||
          principal.branchRefs.length ||
          !principal.userId
        )
          c9Deny('source_reader_authority');
        return { principal, root, role: member.role as UserRole };
      },
    );
    await this.policy.assertCanExecute(
      {
        tenantId: current.principal.tenantId,
        userId: current.principal.userId!,
        role: current.role,
        surface: 'web',
      },
      this.registry.get('analytics.business.profit'),
    );
    // Required even when there is no report. Tool access does not replace finance scope.
    await this.measurement.viewer(
      current.principal.tenantId,
      current.principal.userId!,
      'business_period',
    );
    return current;
  }

  async select(runId: string): Promise<C9Object[]> {
    await this.authorize(runId);
    return this.store.transaction(undefined, async (tx, p, now) => {
      const root = await this.store.lock(tx, p, runId, true, now);
      const existing = await tx.c9WorkReceipt.findFirst({
        where: {
          tenantId: p.tenantId,
          runId,
          callKeyHash: c9Hash('call-key/1', [
            p.tenantId,
            runId,
            BI_REPORT_CALL,
          ]),
        },
      });
      if (existing) {
        if (existing.retentionUntil <= now) c9Deny('source_expired');
        const refs = c9Refs(existing.inputEvidenceRefsJson) as C9Object[];
        if (
          refs.length > 1 ||
          refs.some(
            (r) =>
              r.sourceType !== 'MeasurementRevision' ||
              r.subjectKind !== 'business_period',
          )
        )
          c9Deny('source_read_receipt');
        return refs;
      }
      // The immutable cutoff makes concurrent first selection and post-crash
      // selection stable. An expired selected source is not replaced by an older one.
      const row = await tx.measurementRevision.findFirst({
        where: {
          tenantId: p.tenantId,
          kind: 'business_period',
          state: 'PUBLISHED',
          publishedAt: { lte: root.admittedAt },
          expiresAt: { gt: root.admittedAt },
          clientId: null,
          appointmentId: null,
          staffId: null,
          branchId: null,
          configurationUserId: null,
          scopeJson: { path: ['branchIds'], equals: [] },
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          tenantId: true,
          identityHash: true,
          intentHash: true,
          publishedAt: true,
          expiresAt: true,
          completeness: true,
        },
      });
      if (!row) return [];
      if (row.expiresAt <= now) c9Deny('source_expired');
      return [
        c9Evidence({
          sourceType: 'MeasurementRevision',
          id: row.id,
          tenantId: row.tenantId,
          subjectKind: 'business_period',
          subjectRef: row.id,
          contractVersion: 1,
          identityHash: row.identityHash,
          inputHash: row.intentHash,
          observedAt: row.publishedAt!.toISOString(),
          validUntil: row.expiresAt.toISOString(),
          retentionUntil: row.expiresAt.toISOString(),
          status: 'VERIFIED',
          completeness: row.completeness,
          unavailableReason: null,
        }) as C9Object,
      ];
    });
  }
}
