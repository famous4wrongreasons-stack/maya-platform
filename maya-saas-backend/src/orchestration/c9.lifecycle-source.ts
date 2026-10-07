import { Injectable } from '@nestjs/common';
import { UserRole } from '../common/domain.enums';
import { AiToolPolicyService } from '../ai-tools/ai-tool-policy.service';
import { AiToolRegistryService } from '../ai-tools/ai-tool-registry.service';
import { C8ReadService } from '../valuation/c8.read';
import { C9Store } from './c9.store';
import { C9Object, c9Deny, c9Evidence } from './c9.contract';
import { lifecycleSignal } from './c9.lifecycle-presentation';

export type LifecycleSelection = {
  contract: 'maya.c9-lifecycle-selection/1';
  asOf: string;
  configured: boolean;
  hasMore: boolean;
  withheld: boolean;
  refs: C9Object[];
};

/** Metadata selection only. Existing C8 readers own eligibility, facts and every access decision. */
@Injectable()
export class C9LifecycleSource {
  constructor(
    private readonly store: C9Store,
    private readonly valuation: C8ReadService,
    private readonly policy: AiToolPolicyService,
    private readonly registry: AiToolRegistryService,
  ) {}

  async authorize(runId: string) {
    const current = await this.store.transaction(
      undefined,
      async (tx, principal, now) => {
        await this.store.lock(tx, principal, runId, true, now);
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
        return { principal, role: member.role as UserRole };
      },
    );
    // C8 analytics access does not replace the original customers.core tool entitlement.
    await this.policy.assertCanExecute(
      {
        tenantId: current.principal.tenantId,
        userId: current.principal.userId!,
        role: current.role,
        surface: 'web',
      },
      this.registry.get('clients.dormant.list'),
    );
    const ready = await this.valuation.readiness(
      current.principal.tenantId,
      current.principal.userId!,
    );
    return { ...current, configured: ready.configured };
  }

  async select(runId: string): Promise<LifecycleSelection> {
    const { principal, configured } = await this.authorize(runId);
    const selection: LifecycleSelection = {
      contract: 'maya.c9-lifecycle-selection/1',
      asOf: new Date().toISOString(),
      configured,
      hasMore: false,
      withheld: false,
      refs: [],
    };
    if (!configured) return selection;
    const page = await this.valuation.list(
      principal.tenantId,
      principal.userId!,
      {
        kind: 'POLICY_SIGNAL',
        subjectKind: 'client',
        limit: '3',
      },
    );
    if (page.items.length > 3) c9Deny('array_bounds');
    selection.hasMore = page.nextCursor !== null;
    await this.store.transaction(undefined, async (tx, p, now) => {
      await this.store.lock(tx, p, runId, true, now);
      if (p.tenantId !== principal.tenantId || p.userId !== principal.userId)
        c9Deny('source_reader_authority');
      for (const item of page.items) {
        if (!lifecycleSignal(item)) {
          selection.withheld = true;
          continue;
        }
        // Exact metadata from a row already admitted by C8.list, never a fabricated live-CRM ref.
        const row = await tx.c8ResultRevision.findFirst({
          where: {
            tenantId: p.tenantId,
            id: item.id,
            state: 'PUBLISHED',
            kind: 'POLICY_SIGNAL',
            subjectKind: 'client',
            expiresAt: { gt: now },
          },
          select: {
            id: true,
            tenantId: true,
            subjectKind: true,
            subjectId: true,
            identityHash: true,
            intentHash: true,
            admittedAt: true,
            expiresAt: true,
            completeness: true,
            snapshotHash: true,
            revision: true,
          },
        });
        if (
          !row ||
          row.snapshotHash !== item.snapshotHash ||
          row.revision !== item.revision
        ) {
          selection.withheld = true;
          continue;
        }
        if (row.tenantId !== p.tenantId || row.subjectId !== item.subject.id)
          c9Deny('source_qualification');
        selection.refs.push(
          c9Evidence({
            sourceType: 'C8ResultRevision',
            id: row.id,
            tenantId: row.tenantId,
            subjectKind: row.subjectKind,
            subjectRef: row.subjectId,
            contractVersion: 1,
            identityHash: row.identityHash,
            inputHash: row.intentHash,
            observedAt: row.admittedAt.toISOString(),
            validUntil: row.expiresAt.toISOString(),
            retentionUntil: row.expiresAt.toISOString(),
            status: 'VERIFIED',
            completeness: row.completeness,
            unavailableReason: null,
          }) as C9Object,
        );
      }
    });
    await this.authorize(runId);
    return selection;
  }
}
