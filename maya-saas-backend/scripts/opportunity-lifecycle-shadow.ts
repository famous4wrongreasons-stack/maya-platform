import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import {
  normalizeOpportunityShadowRows,
  readOpportunityShadowRows,
} from './opportunity-shadow';
import {
  bindProjectionToTrustedTenant,
  OpportunityLifecycleRepository,
  type OpportunityPersistenceDisposition,
} from '../src/opportunities/opportunity.lifecycle';
import {
  opportunityShadowTenantRef,
  projectAppointmentRemovalShadow,
} from '../src/opportunities/opportunity.shadow';

interface CliOptions {
  cutoverAt: Date;
  asOf: Date;
  tenantId: string;
  limit: number;
}

const CONTRACT = 'maya.opportunity-lifecycle-shadow-write/1';
const CONFIRMATION = 'chapter5-lifecycle-only';
const DEFAULT_LIMIT = 5_000;
const MAX_LIMIT = 25_000;

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required.');
  return value;
}

function parseOptions(argv: string[]): CliOptions {
  const allowed = new Set(['cutover', 'as-of', 'tenant', 'limit', 'confirm']);
  const values = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match || !allowed.has(match[1]) || values.has(match[1])) {
      throw new Error(
        `Unsupported argument ${argument}. Use --cutover=<ISO> --tenant=<id> --confirm=${CONFIRMATION} [--as-of=<ISO>] [--limit=<n>].`,
      );
    }
    values.set(match[1], match[2]);
  }

  if (values.get('confirm') !== CONFIRMATION) {
    throw new Error(`--confirm=${CONFIRMATION} is required.`);
  }
  const tenantId = values.get('tenant')?.trim();
  if (!tenantId) throw new Error('--tenant is required.');

  const cutoverAt = parseInstant(values.get('cutover'), '--cutover');
  const asOf = values.has('as-of')
    ? parseInstant(values.get('as-of'), '--as-of')
    : new Date();
  const limit = Number(values.get('limit') ?? String(DEFAULT_LIMIT));
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_LIMIT) {
    throw new Error(`--limit must be an integer from 1 to ${MAX_LIMIT}.`);
  }

  return { cutoverAt, asOf, tenantId, limit };
}

function parseInstant(value: string | undefined, label: string): Date {
  if (!value) throw new Error(`${label} is required.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO instant.`);
  }
  return parsed;
}

function dispositionCounts(
  results: Awaited<
    ReturnType<OpportunityLifecycleRepository['persistProjection']>
  >,
): Record<OpportunityPersistenceDisposition, number> {
  const counts: Record<OpportunityPersistenceDisposition, number> = {
    created: 0,
    revalidated: 0,
    superseded: 0,
    terminal_duplicate_collapsed: 0,
    expired_input_rejected: 0,
  };
  for (const result of results) counts[result.disposition] += 1;
  return counts;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
  });

  try {
    const rows = await readOpportunityShadowRows(prisma, options);
    if (rows.length === options.limit) {
      throw new Error(
        'Read limit reached; lifecycle persistence stopped before any write.',
      );
    }

    const shadow = projectAppointmentRemovalShadow({
      rows: normalizeOpportunityShadowRows(rows),
      cutoverAt: options.cutoverAt.toISOString(),
      asOf: options.asOf.toISOString(),
    });
    if (shadow.projection.metrics.executed !== 0 || shadow.safety.sideEffects) {
      throw new Error('Projection crossed the Chapter 5 action boundary.');
    }

    const projection = bindProjectionToTrustedTenant({
      projection: shadow.projection,
      sourceTenantRef: opportunityShadowTenantRef(options.tenantId),
      trustedTenantId: options.tenantId,
    });
    const lifecycle = new OpportunityLifecycleRepository(prisma);
    const expiredBeforePersist = await lifecycle.expireDue({
      tenantId: options.tenantId,
      asOf: options.asOf,
    });
    const results = await lifecycle.persistProjection({
      tenantId: options.tenantId,
      projection,
      validatedAt: options.asOf,
    });
    const snapshot = await lifecycle.snapshot(options.tenantId);
    const duplicatesCollapsed =
      shadow.projection.metrics.deduplicated +
      results.filter((result) => result.duplicateCollapsed).length;

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: shadow.projection.metrics.executed === 0,
          contract: CONTRACT,
          mode: 'L2_5_SHADOW',
          cutover_at: options.cutoverAt.toISOString(),
          as_of: options.asOf.toISOString(),
          source: shadow.source,
          persistence: {
            attempted: results.length,
            dispositions: dispositionCounts(results),
            expired_before_persist: expiredBeforePersist,
            duplicate_attempts_collapsed: duplicatesCollapsed,
          },
          opportunities: snapshot.opportunities,
          agent_tasks: snapshot.agentTasks,
          action_intents: {
            proposed: shadow.projection.metrics.actionIntentsProposed,
            persisted: 0,
            executed: 0,
          },
          safety: {
            source_snapshot_read_only: true,
            lifecycle_writes: ['Opportunity', 'AgentTask'],
            external_actions_executed: 0,
            side_effects: false,
            raw_crm_payload_persisted: false,
            identifiers_emitted: false,
          },
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write(`Opportunity lifecycle shadow failed: ${message}\n`);
  process.exitCode = 1;
});
