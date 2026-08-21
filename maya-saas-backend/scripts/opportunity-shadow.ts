import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import {
  projectAppointmentRemovalShadow,
  type OpportunityShadowEventRowV1,
} from '../src/opportunities/opportunity.shadow';

export interface RawShadowRow {
  tenantId: string;
  eventId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  occurredAt: Date;
  receivedAt: Date;
  ingestionMethod: string;
  observationOrigin: string;
  watchStartedAt: Date | null;
  appointmentId: string | null;
  appointmentTenantId: string | null;
  appointmentStatus: string | null;
  blockedStartAt: Date | null;
  blockedEndAt: Date | null;
}

export interface OpportunityShadowReadOptions {
  cutoverAt: Date;
  asOf: Date;
  tenantId?: string;
  limit: number;
}

const DEFAULT_LIMIT = 5_000;
const MAX_LIMIT = 25_000;

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required.');
  return value;
}

function parseOptions(argv: string[]): OpportunityShadowReadOptions {
  const values = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match) {
      throw new Error(
        `Unsupported argument ${argument}. Use --cutover=<ISO> [--as-of=<ISO>] [--tenant=<id>] [--limit=<n>].`,
      );
    }
    values.set(match[1], match[2]);
  }

  const cutoverAt = parseInstant(values.get('cutover'), '--cutover');
  const asOf = values.has('as-of')
    ? parseInstant(values.get('as-of'), '--as-of')
    : new Date();
  const limitRaw = values.get('limit') ?? String(DEFAULT_LIMIT);
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_LIMIT) {
    throw new Error(`--limit must be an integer from 1 to ${MAX_LIMIT}.`);
  }

  const tenantId = values.get('tenant')?.trim();
  return {
    cutoverAt,
    asOf,
    ...(tenantId ? { tenantId } : {}),
    limit,
  };
}

function parseInstant(value: string | undefined, label: string): Date {
  if (!value) throw new Error(`${label} is required.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO instant.`);
  }
  return parsed;
}

export async function readOpportunityShadowRows(
  prisma: PrismaClient,
  options: OpportunityShadowReadOptions,
): Promise<RawShadowRow[]> {
  return prisma.$transaction(
    async (tx) => {
      // PostgreSQL enforces the read-only boundary for the entire snapshot.
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;

      if (options.tenantId) {
        return tx.$queryRaw<RawShadowRow[]>`
          SELECT
            event."tenantId" AS "tenantId",
            event."id" AS "eventId",
            event."entityType" AS "entityType",
            event."entityId" AS "entityId",
            event."type" AS "eventType",
            event."occurredAt" AS "occurredAt",
            event."receivedAt" AS "receivedAt",
            event."ingestionMethod" AS "ingestionMethod",
            event."observation" AS "observationOrigin",
            integration."watchStartedAt" AS "watchStartedAt",
            appointment."id" AS "appointmentId",
            appointment."tenantId" AS "appointmentTenantId",
            appointment."status" AS "appointmentStatus",
            appointment."blockedStartAt" AS "blockedStartAt",
            appointment."blockedEndAt" AS "blockedEndAt"
          FROM "DomainEvent" event
          LEFT JOIN "CrmIntegration" integration
            ON integration."tenantId" = event."tenantId"
          LEFT JOIN "Appointment" appointment
            ON appointment."tenantId" = event."tenantId"
           AND appointment."id" = event."entityId"
          WHERE event."type" = 'appointment.removed'
            AND event."entityType" = 'appointment'
            AND event."receivedAt" >= ${options.cutoverAt}
            AND event."receivedAt" <= ${options.asOf}
            AND event."tenantId" = ${options.tenantId}
          ORDER BY event."receivedAt" ASC, event."id" ASC
          LIMIT ${options.limit}
        `;
      }

      return tx.$queryRaw<RawShadowRow[]>`
        SELECT
          event."tenantId" AS "tenantId",
          event."id" AS "eventId",
          event."entityType" AS "entityType",
          event."entityId" AS "entityId",
          event."type" AS "eventType",
          event."occurredAt" AS "occurredAt",
          event."receivedAt" AS "receivedAt",
          event."ingestionMethod" AS "ingestionMethod",
          event."observation" AS "observationOrigin",
          integration."watchStartedAt" AS "watchStartedAt",
          appointment."id" AS "appointmentId",
          appointment."tenantId" AS "appointmentTenantId",
          appointment."status" AS "appointmentStatus",
          appointment."blockedStartAt" AS "blockedStartAt",
          appointment."blockedEndAt" AS "blockedEndAt"
        FROM "DomainEvent" event
        LEFT JOIN "CrmIntegration" integration
          ON integration."tenantId" = event."tenantId"
        LEFT JOIN "Appointment" appointment
          ON appointment."tenantId" = event."tenantId"
         AND appointment."id" = event."entityId"
        WHERE event."type" = 'appointment.removed'
          AND event."entityType" = 'appointment'
          AND event."receivedAt" >= ${options.cutoverAt}
          AND event."receivedAt" <= ${options.asOf}
        ORDER BY event."receivedAt" ASC, event."id" ASC
        LIMIT ${options.limit}
      `;
    },
    { isolationLevel: 'RepeatableRead' },
  );
}

export function normalizeOpportunityShadowRows(
  rows: RawShadowRow[],
): OpportunityShadowEventRowV1[] {
  return rows.map((row) => ({
    tenantId: row.tenantId,
    eventId: row.eventId,
    entityType: row.entityType,
    entityId: row.entityId,
    eventType: row.eventType,
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    ingestionMethod: row.ingestionMethod,
    observationOrigin: row.observationOrigin,
    watchStartedAt: row.watchStartedAt?.toISOString() ?? null,
    appointment:
      row.appointmentId && row.appointmentTenantId && row.appointmentStatus
        ? {
            id: row.appointmentId,
            tenantId: row.appointmentTenantId,
            status: row.appointmentStatus,
            blockedStartAt: row.blockedStartAt?.toISOString() ?? null,
            blockedEndAt: row.blockedEndAt?.toISOString() ?? null,
            currentCapacity: null,
          }
        : null,
  }));
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
  });

  try {
    const rows = await readOpportunityShadowRows(prisma, options);
    const shadow = projectAppointmentRemovalShadow({
      rows: normalizeOpportunityShadowRows(rows),
      cutoverAt: options.cutoverAt.toISOString(),
      asOf: options.asOf.toISOString(),
    });
    const opportunityByType = Object.fromEntries(
      [...new Set(shadow.projection.opportunities.map((row) => row.type))]
        .sort()
        .map((type) => [
          type,
          shadow.projection.opportunities.filter((row) => row.type === type)
            .length,
        ]),
    );
    const actionIntentByClass = Object.fromEntries(
      [
        ...new Set(
          shadow.projection.actionIntents.map((row) => row.actionClass),
        ),
      ]
        .sort()
        .map((actionClass) => [
          actionClass,
          shadow.projection.actionIntents.filter(
            (row) => row.actionClass === actionClass,
          ).length,
        ]),
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: shadow.projection.metrics.executed === 0,
          contract: shadow.contract,
          mode: shadow.mode,
          cutover_at: shadow.cutoverAt,
          as_of: shadow.asOf,
          read_limit: options.limit,
          limit_reached: rows.length === options.limit,
          source: shadow.source,
          opportunities: {
            total: shadow.projection.opportunities.length,
            by_type: opportunityByType,
          },
          agent_tasks: {
            total: shadow.projection.agentTasks.length,
            routed_by_domain: shadow.projection.metrics.routedByDomain,
          },
          action_intents: {
            proposed: shadow.projection.metrics.actionIntentsProposed,
            by_class: actionIntentByClass,
            executed: 0,
          },
          safety: shadow.safety,
          limitations: [
            'Only appointment.removed events with a still-canceled canonical mirror and a future blocked interval are projected.',
            'Business State changes are transient today and are not replayed by this read-only shadow command.',
            'No raw tenant, event, appointment, client, staff, contact, payload, or credential values are emitted.',
          ],
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`Opportunity shadow failed: ${message}\n`);
    process.exitCode = 1;
  });
}
