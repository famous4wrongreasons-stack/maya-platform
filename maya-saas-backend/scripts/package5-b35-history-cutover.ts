/** Operational cutover only. No history backfill, campaign creation or delivery. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';

type CutoverEvidence = {
  contract: 'maya.bulk-history-cutover/1';
  release: string;
  structuralVerification: 'PASS';
  legacySendersRetired: true;
  canonicalJournalActive: true;
  productionMessages: 0;
  files: Array<{ path: string; sha256: string }>;
};
async function main() {
  const args = process.argv.slice(2);
  assert(
    args.length === 2 && args[0] === '--apply-evidence',
    'Explicit verified cutover evidence required',
  );
  const raw = readFileSync(args[1], 'utf8');
  const evidence = JSON.parse(raw) as CutoverEvidence;
  assert.equal(evidence.contract, 'maya.bulk-history-cutover/1');
  assert.equal(evidence.structuralVerification, 'PASS');
  assert.equal(evidence.legacySendersRetired, true);
  assert.equal(evidence.canonicalJournalActive, true);
  assert.equal(evidence.productionMessages, 0);
  assert.match(evidence.release, /^[a-zA-Z0-9_-]{1,100}$/);
  const required = [
    resolve('dist/src/marketing/canonical-bulk.service.js'),
    resolve(
      'dist/src/communication-delivery/communication-bulk-delivery.service.js',
    ),
    '/home/botadmin/barbershop-bot/webhook_server.py',
    '/home/botadmin/barbershop-bot/bot.py',
    '/home/botadmin/barbershop-bot/legacy_marketing_bulk_bridge.py',
  ];
  for (const path of required) {
    const record = evidence.files.find((f) => f.path === path);
    assert(record, `Missing active file evidence: ${path}`);
    assert.equal(
      createHash('sha256').update(readFileSync(path)).digest('hex'),
      record.sha256,
    );
  }
  for (const path of ['/api/health', '/api/health/ready']) {
    const response = await fetch(`http://127.0.0.1:3107${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
  }
  const db = new PrismaService(new ConfigService());
  try {
    const migrations = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) FROM "_prisma_migrations" WHERE migration_name='20260907120000_b35_canonical_bulk_foundation'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.equal(Number(migrations[0].count), 1);
    const tenants = await db.tenant.findMany({
      where: { status: { in: ['active', 'trial', 'past_due'] } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    let established = 0,
      preserved = 0;
    for (const tenant of tenants) {
      const changed = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${tenant.id} FOR UPDATE`;
        const current = await tx.marketingPolicy.findUnique({
          where: { tenantId: tenant.id },
        });
        if (current?.canonicalHistoryStartedAt) return false;
        const policy = await tx.marketingPolicy.upsert({
          where: { tenantId: tenant.id },
          create: {
            tenantId: tenant.id,
            canonicalHistoryStartedAt: new Date(),
            updatedAt: new Date(),
          },
          update: {
            canonicalHistoryStartedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        // The SQL guard supplies current database time. No supplied historical date.
        await tx.auditLog.create({
          data: {
            scope: 'tenant',
            tenantId: tenant.id,
            action: 'marketing.canonical_history_started',
            entityType: 'MarketingPolicy',
            entityId: tenant.id,
            metadataJson: {
              contract: evidence.contract,
              release: evidence.release,
              evidenceHash: createHash('sha256').update(raw).digest('hex'),
              canonicalHistoryStartedAt:
                policy.canonicalHistoryStartedAt!.toISOString(),
              historicalBackfill: false,
              legacySendersRetired: true,
            },
          },
        });
        return true;
      });
      if (changed) established++;
      else preserved++;
    }
    console.log(
      JSON.stringify({
        status: 'PASS',
        established,
        preserved,
        historicalBackfill: 0,
        productionMessages: 0,
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error('B35_CUTOVER_FAILED');
  process.exitCode = 1;
});
