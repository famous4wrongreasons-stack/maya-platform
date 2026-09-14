/**
 * Chapter 9 / P01 production structural proof — READ ONLY.
 * Runs inside the deployed release on the VPS. Opens no transaction that
 * writes, creates no C9 row, touches no business/provider/message surface.
 */
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const TABLES = [
  'C9Run',
  'C9StrategyRevision',
  'C9PlanStep',
  'C9StepBinding',
  'C9WorkReceipt',
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const out = { status: 'PASS', contract: 'maya.c9-p01-production-structural/1' };

  out.columns = await prisma.$queryRawUnsafe(
    `SELECT table_name, count(*)::int AS n FROM information_schema.columns
     WHERE table_schema='public' AND table_name = ANY($1::text[])
     GROUP BY 1 ORDER BY 1`,
    TABLES,
  );
  out.fieldTotal = out.columns.reduce((a, r) => a + Number(r.n), 0);

  out.functions = await prisma.$queryRawUnsafe(
    `SELECT p.proname AS name,
            encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS hash
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname LIKE 'C9%' ORDER BY 1`,
  );

  out.constraints = await prisma.$queryRawUnsafe(
    `SELECT c.conname AS name, c.contype::text AS kind, c.convalidated AS valid,
            pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint c
     WHERE c.conrelid::regclass::text = ANY($1::text[])
        OR c.conrelid::regclass::text = ANY($2::text[])
     ORDER BY 1`,
    TABLES,
    TABLES.map((t) => `"${t}"`),
  );
  out.constraintCounts = out.constraints.reduce((a, r) => {
    a[r.kind] = (a[r.kind] || 0) + 1;
    return a;
  }, {});
  out.constraintsAllValid = out.constraints.every((r) => r.valid === true);
  out.cascadeReferences = out.constraints.filter(
    (r) => r.kind === 'f' && /CASCADE/.test(r.definition),
  ).length;
  out.restrictReferences = out.constraints.filter(
    (r) => r.kind === 'f' && /ON DELETE RESTRICT/.test(r.definition),
  ).length;

  out.indexes = await prisma.$queryRawUnsafe(
    `SELECT indexname AS name, indexdef AS definition FROM pg_indexes
     WHERE schemaname='public' AND tablename = ANY($1::text[]) ORDER BY 1`,
    TABLES,
  );

  out.triggers = await prisma.$queryRawUnsafe(
    `SELECT t.tgname AS name, c.relname AS table_name
     FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE NOT t.tgisinternal AND c.relname = ANY($1::text[]) ORDER BY 2,1`,
    TABLES,
  );

  const counts = {};
  for (const t of TABLES) {
    const r = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
    counts[t] = Number(r[0].n);
  }
  out.rows = counts;
  out.productionProofEffects = Object.values(counts).reduce((a, b) => a + b, 0);

  out.migration = await prisma.$queryRawUnsafe(
    `SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NULL AS clean
     FROM _prisma_migrations WHERE migration_name='20260913160000_chapter9_orchestration_foundation'`,
  );
  const applied = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  out.appliedMigrations = Number(applied[0].n);

  out.retentionPolicyPresent = (
    await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='C9_retention_claim'`,
    )
  )[0].n === 1;

  if (
    out.fieldTotal !== 123 ||
    out.columns.length !== 5 ||
    out.functions.length !== 8 ||
    out.triggers.length !== 10 ||
    out.restrictReferences !== 11 ||
    out.cascadeReferences !== 0 ||
    !out.constraintsAllValid ||
    out.productionProofEffects !== 0 ||
    out.migration.length !== 1 ||
    out.migration[0].finished !== true ||
    out.migration[0].clean !== true
  ) {
    out.status = 'FAIL';
  }

  process.stdout.write('C9_P01_STRUCTURAL_JSON=' + JSON.stringify(out) + '\n');
  await prisma.$disconnect();
  if (out.status !== 'PASS') process.exit(1);
}

main().catch((e) => {
  process.stdout.write('C9_P01_STRUCTURAL_JSON=' + JSON.stringify({ status: 'ERROR', error: String(e && e.message) }) + '\n');
  process.exit(1);
});
