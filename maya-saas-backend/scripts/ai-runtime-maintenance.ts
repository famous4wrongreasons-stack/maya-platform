import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

interface CliOptions {
  batchSize: number;
  dryRun: boolean;
  help: boolean;
}

const LOCK_ID = BigInt(7_150_002_026);

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return parsed;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    batchSize: 1_000,
    dryRun: true,
    help: false,
  };
  let explicitMode: 'dry-run' | 'execute' | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--execute' || argument === '--dry-run') {
      const nextMode = argument === '--execute' ? 'execute' : 'dry-run';
      if (explicitMode && explicitMode !== nextMode) {
        throw new Error('Choose either --execute or --dry-run, not both');
      }
      explicitMode = nextMode;
      options.dryRun = nextMode === 'dry-run';
      continue;
    }
    if (argument === '--batch-size') {
      options.batchSize = parseBoundedInteger(
        argv[index + 1],
        1_000,
        1,
        10_000,
        '--batch-size',
      );
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp(): void {
  process.stdout.write(
    [
      'MAYA AI runtime maintenance',
      '',
      'Usage:',
      '  npm run ai:maintenance',
      '  npm run ai:maintenance -- --execute [--batch-size 1000]',
      '',
      'Dry-run is the default. No tool payloads are printed.',
      '',
    ].join('\n'),
  );
}

async function acquireLock(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ acquired: boolean }>>(
    Prisma.sql`SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired`,
  );
  return rows[0]?.acquired === true;
}

async function releaseLock(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw(
    Prisma.sql`SELECT pg_advisory_unlock(${LOCK_ID}) AS released`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.dryRun)
    throw new Error('package5_a30_ai_cleanup_not_allowlisted');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const retentionDays = parseBoundedInteger(
    process.env.AI_TOOL_RETENTION_DAYS,
    30,
    7,
    365,
    'AI_TOOL_RETENTION_DAYS',
  );
  const staleMinutes = parseBoundedInteger(
    process.env.AI_TOOL_STALE_EXECUTION_MINUTES,
    15,
    5,
    120,
    'AI_TOOL_STALE_EXECUTION_MINUTES',
  );
  const now = new Date();
  const staleBefore = new Date(now.getTime() - staleMinutes * 60_000);
  const retentionBefore = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1_000,
  );
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  let locked = false;

  try {
    locked = await acquireLock(prisma);
    if (!locked) {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'maintenance_already_running',
        }) + '\n',
      );
      return;
    }

    const [expiredPending, staleApprovals, staleExecutions] = await Promise.all(
      [
        prisma.aiApprovalRequest.count({
          where: { status: 'pending', expiresAt: { lte: now } },
        }),
        prisma.aiApprovalRequest.count({
          where: {
            status: { in: ['approved', 'executing'] },
            updatedAt: { lte: staleBefore },
          },
        }),
        prisma.aiToolExecution.count({
          where: {
            status: 'executing',
            startedAt: { lte: staleBefore },
          },
        }),
      ],
    );
    const executionIds = (
      await prisma.aiToolExecution.findMany({
        where: {
          status: { in: ['completed', 'failed'] },
          completedAt: { lte: retentionBefore },
        },
        select: { id: true },
        orderBy: { completedAt: 'asc' },
        take: options.batchSize,
      })
    ).map((row) => row.id);
    const approvalIds = (
      await prisma.aiApprovalRequest.findMany({
        where: {
          status: { in: ['completed', 'failed', 'rejected', 'expired'] },
          updatedAt: { lte: retentionBefore },
          execution: null,
        },
        select: { id: true },
        orderBy: { updatedAt: 'asc' },
        take: options.batchSize,
      })
    ).map((row) => row.id);
    const brainSessionIds = (
      await prisma.aiBrainSession.findMany({
        where: { expiresAt: { lte: now } },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: options.batchSize,
      })
    ).map((row) => row.id);
    const memoryFactIds = (
      await prisma.aiMemoryFact.findMany({
        where: {
          OR: [{ expiresAt: { lte: now } }, { deletedAt: { not: null } }],
        },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: options.batchSize,
      })
    ).map((row) => row.id);
    const candidates = {
      expired_pending_approvals: expiredPending,
      stale_approvals: staleApprovals,
      stale_executions: staleExecutions,
      retained_executions_selected: executionIds.length,
      retained_approvals_selected: approvalIds.length,
      expired_brain_sessions_selected: brainSessionIds.length,
      expired_or_forgotten_memory_selected: memoryFactIds.length,
    };

    process.stdout.write(
      JSON.stringify({ ok: true, dry_run: true, candidates }, null, 2) + '\n',
    );
  } finally {
    if (locked) {
      await releaseLock(prisma);
    }
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: {
        code: 'ai_runtime_maintenance_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }) + '\n',
  );
  process.exitCode = 1;
});
