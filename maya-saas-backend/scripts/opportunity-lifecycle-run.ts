/**
 * Immutable Chapter 5 production proof entrypoint.
 *
 * It invokes the same lifecycle runner as the reconciliation scheduler and
 * deliberately disables every background scheduler before the Nest
 * application context is created.
 * The command may write only Opportunity/AgentTask lifecycle state.
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { OpportunityLifecycleRunner } from '../src/crm/opportunity-lifecycle.runner';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

process.env.OWNER_REPORTS_SCHEDULER_ENABLED = 'false';
process.env.APPOINTMENT_REMINDERS_SCHEDULER_ENABLED = 'false';
process.env.BILLING_SCHEDULER_ENABLED = 'false';
process.env.CRM_RECONCILIATION_SCHEDULER_ENABLED = 'false';
process.env.INGESTION_QUARANTINE_RETENTION_ENABLED = 'false';

const CONFIRMATION = 'chapter5-lifecycle-only';
const FAMILY = 'appointment_cancellation_recovery';

function arg(name: string, fallback = ''): string {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function instant(raw: string, label: string): Date {
  const value = new Date(raw);
  if (!raw || Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid ISO instant.`);
  }
  return value;
}

async function main(): Promise<void> {
  if (arg('confirm') !== CONFIRMATION) {
    throw new Error(`Use --confirm=${CONFIRMATION}.`);
  }
  if (!enabled(process.env.OPPORTUNITY_LIFECYCLE_ENABLED)) {
    throw new Error(
      'OPPORTUNITY_LIFECYCLE_ENABLED must be true for an invocation proof.',
    );
  }
  const tenantId = arg('tenant');
  if (!tenantId) throw new Error('--tenant is required.');

  const maxSourceAgeMinutes = Number(arg('max-source-age-minutes', '180'));
  if (!Number.isFinite(maxSourceAgeMinutes) || maxSourceAgeMinutes <= 0) {
    throw new Error('--max-source-age-minutes must be a positive number.');
  }
  const explainLimit = Math.min(
    2,
    Math.max(0, Number(arg('explain-limit', '2')) || 0),
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const prisma = app.get(PrismaService);
    const tenantContext = app.get(TenantContextService);
    const runner = app.get(OpportunityLifecycleRunner);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new Error('Tenant not found.');

    const latest = await prisma.reconciliationRun.findFirst({
      where: { tenantId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      select: {
        windowTo: true,
        startedAt: true,
        finishedAt: true,
        completeness: true,
        failureCode: true,
      },
    });
    const requestedAsOf = arg('as-of');
    const asOf = requestedAsOf ? instant(requestedAsOf, '--as-of') : new Date();
    const sourceCompleteness = reconciliationCompleteness({
      latest,
      asOf,
      maxSourceAgeMinutes,
    });

    const existingBefore = await prisma.opportunity.findMany({
      where: { tenantId, type: FAMILY, status: 'active' },
      orderBy: [{ firstDetectedAt: 'asc' }, { id: 'asc' }],
      take: explainLimit,
      select: { id: true },
    });

    const result = await tenantContext.runAsSystemTenant(tenantId, () =>
      runner.run({ tenantId, asOf, sourceCompleteness }),
    );
    const existingAfter = existingBefore.length
      ? await prisma.opportunity.findMany({
          where: { tenantId, id: { in: existingBefore.map((row) => row.id) } },
          select: {
            id: true,
            status: true,
            lastValidatedAt: true,
            expiresAt: true,
            terminalReasonCode: true,
            evidenceRefsJson: true,
          },
        })
      : [];
    const afterById = new Map(existingAfter.map((row) => [row.id, row]));

    console.log(
      JSON.stringify(
        {
          proof: 'chapter_5_opportunity_lifecycle',
          release: process.env.RELEASE_VERSION ?? null,
          invocation: 'compiled_production_artifact',
          source_completeness: sourceCompleteness,
          as_of: asOf.toISOString(),
          detected_now: result.detectedNow,
          durable_active_before: result.durableActiveBefore,
          resolved: result.resolved,
          expired: result.expired,
          superseded: result.superseded,
          durable_active_after: result.durableActiveAfter,
          current_tasks: result.currentTasks,
          stale_tasks: result.staleTasks,
          duplicate_attempts_collapsed: result.duplicateAttemptsCollapsed,
          action_intents_proposed: result.actionIntentsProposed,
          action_intents_executed: result.actionIntentsExecuted,
          external_side_effects: result.externalSideEffects,
          existing_opportunities: existingBefore.map((before, index) => {
            const after = afterById.get(before.id);
            return after
              ? safeExplanation(index + 1, after, result.completeness, asOf)
              : {
                  ordinal: index + 1,
                  state: 'not_found_after_run',
                  reason: 'lifecycle_row_missing_requires_investigation',
                };
          }),
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

function reconciliationCompleteness(input: {
  latest: {
    windowTo: Date;
    startedAt: Date;
    finishedAt: Date | null;
    completeness: string | null;
    failureCode: string | null;
  } | null;
  asOf: Date;
  maxSourceAgeMinutes: number;
}): 'complete' | 'partial' | 'provider_failure' {
  if (!input.latest) return 'partial';
  if (input.latest.failureCode || !input.latest.finishedAt) {
    return 'provider_failure';
  }
  const sourceAgeMs = Date.now() - input.latest.finishedAt.getTime();
  const fresh = sourceAgeMs <= input.maxSourceAgeMinutes * 60_000;
  const coversAsOf = input.latest.windowTo.getTime() >= input.asOf.getTime();
  return input.latest.completeness === 'complete' && fresh && coversAsOf
    ? 'complete'
    : 'partial';
}

function safeExplanation(
  ordinal: number,
  opportunity: {
    status: string;
    lastValidatedAt: Date;
    expiresAt: Date;
    terminalReasonCode: string | null;
    evidenceRefsJson: unknown;
  },
  completeness: string,
  asOf: Date,
): Record<string, unknown> {
  const validatedNow =
    opportunity.lastValidatedAt.getTime() === asOf.getTime() &&
    opportunity.status === 'active';
  return {
    ordinal,
    state: opportunity.status,
    reason:
      opportunity.status !== 'active'
        ? (opportunity.terminalReasonCode ?? 'canonical_lifecycle_transition')
        : validatedNow
          ? 'current_canonical_evidence_validated'
          : completeness !== 'complete'
            ? 'preserved_because_negative_current_state_is_not_proven'
            : 'preserved_because_family_resolution_proof_is_not_sufficient',
    evidence: summarizeEvidence(opportunity.evidenceRefsJson),
  };
}

function summarizeEvidence(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((item) => {
    if (!item || typeof item !== 'object') return { completeness: 'unknown' };
    const row = item as Record<string, unknown>;
    return {
      owner: safeString(row.owner),
      capability: safeString(row.capability),
      observed_at: safeString(row.observedAt),
      as_of: safeString(row.asOf),
      completeness: safeString(row.completeness),
      basis: safeString(row.basis),
    };
  });
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'on', 'yes'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
