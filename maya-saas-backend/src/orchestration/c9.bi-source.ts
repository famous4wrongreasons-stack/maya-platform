import { Injectable } from '@nestjs/common';
import { UserRole } from '../common/domain.enums';
import { MeasurementReadService } from '../measurement/measurement.read.service';
import { AiToolPolicyService } from '../ai-tools/ai-tool-policy.service';
import { AiToolRegistryService } from '../ai-tools/ai-tool-registry.service';
import { C9Store } from './c9.store';
import { C9Object, c9Deny, c9Evidence, c9Hash, c9Refs } from './c9.contract';
import {
  type FinancialReportRequest,
  financialReportMonthMatches,
} from './c9.bi-presentation';

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

  async select(
    runId: string,
    request: FinancialReportRequest = { kind: 'latest' },
  ): Promise<C9Object[]> {
    if (
      !request ||
      (request.kind !== 'latest' && request.kind !== 'calendar_month') ||
      (request.kind === 'calendar_month' &&
        (!Number.isInteger(request.year) ||
          request.year < 1000 ||
          request.year > 9998 ||
          !Number.isInteger(request.month) ||
          request.month < 1 ||
          request.month > 12)) ||
      Object.keys(request).some(
        (key) =>
          !(
            request.kind === 'latest' ? ['kind'] : ['kind', 'year', 'month']
          ).includes(key),
      )
    )
      c9Deny('source_read_receipt');
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
              r.subjectKind !== 'business_period' ||
              r.tenantId !== p.tenantId,
          )
        )
          c9Deny('source_read_receipt');
        return refs;
      }
      // The immutable cutoff makes concurrent first selection and post-crash
      // selection stable. An expired selected source is not replaced by an older one.
      const selection = {
        where: {
          tenantId: p.tenantId,
          kind: 'business_period' as const,
          state: 'PUBLISHED' as const,
          publishedAt: { lte: root.admittedAt },
          expiresAt: { gt: root.admittedAt },
          clientId: null,
          appointmentId: null,
          staffId: null,
          branchId: null,
          configurationUserId: null,
          scopeJson: { path: ['branchIds'], equals: [] },
        },
        orderBy: [{ publishedAt: 'desc' as const }, { id: 'desc' as const }],
        select: {
          id: true as const,
          tenantId: true as const,
          identityHash: true as const,
          intentHash: true as const,
          publishedAt: true as const,
          expiresAt: true as const,
          completeness: true as const,
        },
      };
      let row;
      if (request.kind === 'latest') {
        row = await tx.measurementRevision.findFirst(selection);
      } else {
        // Candidate metadata only. Every legal IANA local midnight lies within
        // this UTC envelope; exact matching uses each source's own timezone.
        // Newer nonmatching periods are never relabelled as the requested month.
        const from = Date.UTC(request.year, request.month - 1, 1);
        const to = Date.UTC(request.year, request.month, 1);
        const day = 86400000;
        const candidates = await tx.measurementRevision.findMany({
          ...selection,
          where: {
            ...selection.where,
            periodFrom: {
              gte: new Date(from - day),
              lte: new Date(from + day),
            },
            periodTo: { gte: new Date(to - day), lte: new Date(to + day) },
          },
          select: {
            ...selection.select,
            periodFrom: true,
            periodTo: true,
            timezone: true,
          },
          take: 51,
        });
        for (const candidate of candidates) {
          const matches = financialReportMonthMatches(
            {
              from: candidate.periodFrom,
              toExclusive: candidate.periodTo,
              timezone: candidate.timezone,
            },
            request,
          );
          // Unknown metadata or a truncated search is unavailable, never proof
          // that the month has no published snapshot.
          if (matches === null) c9Deny('context_fact_source_unavailable');
          if (matches) {
            row = candidate;
            break;
          }
        }
        if (!row && candidates.length === 51) c9Deny('array_bounds');
      }
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
