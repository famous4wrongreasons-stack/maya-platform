import { Injectable } from '@nestjs/common';
import { UserRole } from '../common/domain.enums';
import { AiToolPolicyService } from '../ai-tools/ai-tool-policy.service';
import { AiToolRegistryService } from '../ai-tools/ai-tool-registry.service';
import { APPOINTMENT_REMOVED_STATUS } from '../domain';
import { CrmService } from '../crm/crm.service';
import { readOpportunityCurrentCapacity } from '../crm/opportunity-lifecycle.runner';
import { OpportunityLifecycleRepository } from '../opportunities/opportunity.lifecycle';
import {
  opportunityShadowAppointmentRef,
  opportunityShadowIntervalRef,
} from '../opportunities/opportunity.shadow';
import { C9Store } from './c9.store';
import { c9C5Fingerprint } from './c9.sources';
import { C9Object, C9Principal, c9Deny, c9Hash, c9Object } from './c9.contract';

export type OccupancyOutcome =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'EXPIRED'
  | 'CLOSED'
  | 'STALE'
  | 'INCOMPLETE'
  | 'UNAVAILABLE'
  | 'NONE';
export type OccupancyProjection = {
  contract: 'maya.c9-occupancy-read/1';
  outcome: OccupancyOutcome;
  asOf: string;
  reason: string;
  hasMore: boolean;
  evidenceRefs: C9Object[];
  opportunityRef: string | null;
  window: {
    start: string;
    end: string;
    timezone: string;
    branchRef: string | null;
  } | null;
  scheduleRef: string | null;
};

/** Closed projection of existing C5/CRM owners. No user identifiers, clients or prices. */
@Injectable()
export class C9OccupancySource {
  constructor(
    private readonly store: C9Store,
    private readonly lifecycle: OpportunityLifecycleRepository,
    private readonly crm: CrmService,
    private readonly policy: AiToolPolicyService,
    private readonly registry: AiToolRegistryService,
  ) {}

  async authorize(runId: string, live = true) {
    const p = await this.store.transaction(
      undefined,
      async (tx, principal, now) => {
        await this.store.lock(tx, principal, runId, live, now);
        const member = await tx.membership.findFirst({
          where: {
            tenantId: principal.tenantId,
            id: principal.membershipId ?? '',
            userId: principal.userId ?? '',
            status: 'active',
          },
        });
        // Initial vertical is tenant-owner only. Branch-scoped owners fail closed;
        // a branch handle supplied by presentation can never expand this scope.
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
    for (const key of [
      'operations.journal.read',
      'staff.schedule.read',
      'booking.availability.read',
    ])
      await this.policy.assertCanExecute(
        {
          tenantId: p.principal.tenantId,
          userId: p.principal.userId!,
          role: p.role,
          surface: 'web',
        },
        this.registry.get(key),
      );
    return p.principal;
  }

  async read(runId: string): Promise<OccupancyProjection> {
    return (await this.readForExposure(runId)).projection;
  }

  /** Transient verifier; no new durable identity or retention owner. */
  async readForExposure(runId: string) {
    let revalidate: () => Promise<boolean> = async () => true;
    const projection = await this.readProjection(runId, (verify) => {
      revalidate = verify;
    });
    return { projection, revalidate };
  }

  private async readProjection(
    runId: string,
    witness: (verify: () => Promise<boolean>) => void,
  ): Promise<OccupancyProjection> {
    const principal = await this.authorize(runId);
    const initial = await this.store.transaction(
      undefined,
      async (tx, p, now) => {
        await this.store.lock(tx, p, runId, true, now);
        const candidates = await this.lifecycle.readCancellationCandidates(
          p.tenantId,
          now,
        );
        if (candidates.some((o) => o.tenantId !== p.tenantId))
          c9Deny('source_qualification');
        const op = candidates[0];
        const base: OccupancyProjection = {
          contract: 'maya.c9-occupancy-read/1',
          outcome: 'NONE',
          asOf: now.toISOString(),
          reason: 'no_saved_cancellation_opportunity',
          hasMore: candidates.length > 1,
          evidenceRefs: [],
          opportunityRef: op
            ? c9Hash('occupancy-op/1', [p.tenantId, op.id])
            : null,
          window: null,
          scheduleRef: null,
        };
        if (!op) return { base };
        if (op.expiresAt <= now)
          return {
            base: {
              ...base,
              outcome: 'EXPIRED' as const,
              reason: 'opportunity_expired',
            },
          };
        if (op.status !== 'active')
          return {
            base: {
              ...base,
              outcome: 'CLOSED' as const,
              reason: 'opportunity_not_active',
            },
          };
        const task = op.agentTasks.find(
          (t) =>
            t.tenantId === p.tenantId &&
            t.opportunityId === op.id &&
            t.status === 'current' &&
            t.expiresAt > now &&
            t.agentDomain === 'occupancy' &&
            t.autonomyLevel === 'L2_5_SHADOW',
        );
        if (
          !task ||
          op.policyKey !== 'occupancy.released_capacity' ||
          op.policyVersion !== 1
        )
          return {
            base: {
              ...base,
              outcome: 'INCOMPLETE' as const,
              reason: 'current_assignment_or_policy_unavailable',
            },
          };
        // The C5 affected reference is intentionally opaque. A finite ID-only scan
        // preserves that owner contract; absence beyond this bound is INCOMPLETE.
        const ids = await tx.appointment.findMany({
          where: { tenantId: p.tenantId },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 501,
        });
        const match = ids
          .slice(0, 500)
          .find(
            (a) =>
              opportunityShadowAppointmentRef(p.tenantId, a.id) ===
              op.affectedEntityRef,
          );
        if (!match)
          return {
            base: {
              ...base,
              outcome: 'INCOMPLETE' as const,
              reason:
                ids.length > 500
                  ? 'appointment_identity_scan_bounded'
                  : 'appointment_identity_unavailable',
            },
          };
        const appointment = await tx.appointment.findFirst({
          where: { tenantId: p.tenantId, id: match.id },
          select: {
            id: true,
            tenantId: true,
            branchId: true,
            staffExternalId: true,
            serviceIds: true,
            blockedStartAt: true,
            blockedEndAt: true,
            status: true,
          },
        });
        const tenant = await tx.tenant.findUnique({
          where: { id: p.tenantId },
          select: { defaultTimezone: true },
        });
        if (!appointment || !tenant)
          return {
            base: {
              ...base,
              outcome: 'INCOMPLETE' as const,
              reason: 'current_appointment_unavailable',
            },
          };
        if (appointment.tenantId !== p.tenantId) c9Deny('source_qualification');
        if (appointment.status !== APPOINTMENT_REMOVED_STATUS)
          return {
            base: {
              ...base,
              outcome: 'CLOSED' as const,
              reason: 'appointment_no_longer_removed',
            },
          };
        if (appointment.blockedStartAt <= now)
          return {
            base: {
              ...base,
              outcome: 'EXPIRED' as const,
              reason: 'window_already_started',
            },
          };
        const interval = opportunityShadowIntervalRef({
          tenantId: p.tenantId,
          appointmentId: appointment.id,
          blockedStartAt: appointment.blockedStartAt.toISOString(),
          blockedEndAt: appointment.blockedEndAt.toISOString(),
        });
        const items = c9Object(op.evidenceRefsJson).items;
        if (
          !Array.isArray(items) ||
          !items.some((e) => c9Object(e).ref === interval) ||
          op.lastValidatedAt > now
        )
          return {
            base: {
              ...base,
              outcome: 'STALE' as const,
              reason: 'opportunity_interval_changed',
            },
          };
        return {
          base,
          appointment,
          timezone: tenant.defaultTimezone,
          op,
          task,
        };
      },
    );
    if (!initial.appointment || !initial.op || !initial.task)
      return initial.base;
    let capacity: Awaited<ReturnType<typeof readOpportunityCurrentCapacity>>;
    let source: Awaited<ReturnType<CrmService['readCapacitySource']>>;
    try {
      source = await this.crm.readCapacitySource(
        principal.tenantId,
        initial.appointment.branchId,
      );
      witness(async () => {
        // Metadata only; never redispatch providers or renew the proposal.
        const valid = await this.store.transaction(
          undefined,
          async (tx, p, now) => {
            await this.store.lock(tx, p, runId, true, now);
            const op = await tx.opportunity.findFirst({
              where: { tenantId: p.tenantId, id: initial.op.id },
            });
            const task = await tx.agentTask.findFirst({
              where: { tenantId: p.tenantId, id: initial.task.id },
            });
            const appointment = await tx.appointment.findFirst({
              where: { tenantId: p.tenantId, id: initial.appointment.id },
              select: {
                id: true,
                tenantId: true,
                branchId: true,
                staffExternalId: true,
                serviceIds: true,
                blockedStartAt: true,
                blockedEndAt: true,
                status: true,
              },
            });
            return (
              !!op &&
              !!task &&
              op.status === 'active' &&
              op.expiresAt > now &&
              initial.appointment.blockedStartAt > now &&
              task.status === 'current' &&
              task.expiresAt > now &&
              task.opportunityId === op.id &&
              task.taskFingerprint === initial.task.taskFingerprint &&
              op.evidenceFingerprint === initial.op.evidenceFingerprint &&
              c9Hash('occupancy-appointment/1', [appointment]) ===
                c9Hash('occupancy-appointment/1', [initial.appointment])
            );
          },
        );
        if (!valid) return false;
        return this.crm
          .readCapacitySource(principal.tenantId, initial.appointment.branchId)
          .then((current) => current.revision === source.revision)
          .catch(() => false);
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        capacity = await Promise.race([
          readOpportunityCurrentCapacity(this.crm, {
            tenantId: principal.tenantId,
            timezone: initial.timezone,
            appointment: initial.appointment,
            source,
          }),
          new Promise<never>((_resolve, reject) => {
            // Leave room for source revalidation/settlement within the existing
            // eight-second logical READ lease. This never retries a provider.
            timeout = setTimeout(
              () => reject(new Error('occupancy_read_timeout')),
              6000,
            );
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    } catch {
      await this.authorize(runId);
      return {
        ...initial.base,
        outcome: 'UNAVAILABLE',
        reason: 'current_crm_read_unavailable',
      };
    }
    await this.authorize(runId);
    return this.store.transaction(undefined, async (tx, p, now) => {
      await this.store.lock(tx, p, runId, true, now);
      const op = await tx.opportunity.findFirst({
        where: { tenantId: p.tenantId, id: initial.op.id },
      });
      const appointment = await tx.appointment.findFirst({
        where: { tenantId: p.tenantId, id: initial.appointment.id },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          staffExternalId: true,
          serviceIds: true,
          blockedStartAt: true,
          blockedEndAt: true,
          status: true,
        },
      });
      const task = await tx.agentTask.findFirst({
        where: {
          tenantId: p.tenantId,
          id: initial.task.id,
          status: 'current',
          expiresAt: { gt: now },
        },
      });
      if (
        !op ||
        !task ||
        task.opportunityId !== op.id ||
        task.taskFingerprint !== initial.task.taskFingerprint ||
        op.status !== 'active' ||
        op.evidenceFingerprint !== initial.op.evidenceFingerprint ||
        c9Hash('occupancy-appointment/1', [appointment]) !==
          c9Hash('occupancy-appointment/1', [initial.appointment])
      )
        return {
          ...initial.base,
          outcome: 'STALE',
          reason: 'source_changed_during_read',
        };
      if (op.expiresAt <= now || initial.appointment.blockedStartAt <= now)
        return {
          ...initial.base,
          outcome: 'EXPIRED',
          reason: 'window_expired_during_read',
        };
      if (
        capacity.completeness !== 'complete' ||
        capacity.availability === 'unknown'
      )
        return {
          ...initial.base,
          outcome: 'INCOMPLETE',
          reason: capacity.basis,
        };
      const available =
        capacity.availability === 'available' && !!capacity.scheduleRef;
      return {
        ...initial.base,
        asOf: now.toISOString(),
        outcome: available ? 'AVAILABLE' : 'OCCUPIED',
        reason: capacity.basis,
        scheduleRef: capacity.scheduleRef,
        window: {
          start: appointment!.blockedStartAt.toISOString(),
          end: appointment!.blockedEndAt.toISOString(),
          timezone: source.timezone,
          branchRef: appointment!.branchId
            ? c9Hash('occupancy-branch/1', [p.tenantId, appointment!.branchId])
            : null,
        },
        evidenceRefs: available
          ? [
              opRef(p, op, now),
              {
                sourceType: 'AgentTask',
                id: task.id,
                tenantId: p.tenantId,
                subjectKind: 'assignment',
                subjectRef: task.id,
                contractVersion: 1,
                identityHash: c9C5Fingerprint(task.taskFingerprint),
                inputHash: c9C5Fingerprint(task.taskFingerprint),
                observedAt: now.toISOString(),
                validUntil: task.expiresAt.toISOString(),
                retentionUntil: null,
                status: 'VERIFIED',
                completeness: 'COMPLETE',
                unavailableReason: null,
              },
            ]
          : [],
      };
    });
  }
}

function opRef(
  p: C9Principal,
  op: {
    id: string;
    affectedEntityRef: string | null;
    identityFingerprint: string;
    evidenceFingerprint: string;
    expiresAt: Date;
  },
  now: Date,
): C9Object {
  return {
    sourceType: 'Opportunity',
    id: op.id,
    tenantId: p.tenantId,
    subjectKind: 'appointment',
    subjectRef: op.affectedEntityRef,
    contractVersion: 1,
    identityHash: c9C5Fingerprint(op.identityFingerprint),
    inputHash: c9C5Fingerprint(op.evidenceFingerprint),
    observedAt: now.toISOString(),
    validUntil: op.expiresAt.toISOString(),
    retentionUntil: null,
    status: 'VERIFIED',
    completeness: 'COMPLETE',
    unavailableReason: null,
  };
}
