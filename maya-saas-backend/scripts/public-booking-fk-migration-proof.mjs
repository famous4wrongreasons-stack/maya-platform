/**
 * Owner-approved 2026-10-13 forward FK correction. Synthetic databases only.
 * Run under the loopback-only qualification sandbox with two newly created DBs:
 * DATABASE_URL and PUBLIC_BOOKING_FK_FRESH_DATABASE_URL.
 * Neither URL is printed. No provider, secret store, owner DB or product grant.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const migration = '20261013120000_public_booking_restrict_parent_replacement';
const migrations = path.join(backend, 'prisma/migrations');
const targetNames = [
  'PublicBookingSession_tenantId_fkey',
  'PublicBookingQuote_sessionId_tenantId_fkey',
  'PublicBookingAttempt_quoteId_sessionId_tenantId_fkey',
];
const allMigrationNames = fs
  .readdirSync(migrations)
  .filter((n) => fs.statSync(path.join(migrations, n)).isDirectory())
  .sort();
const reviewedTail = [
  {
    name: '20261021170000_a22_customer_facts',
    sha256: '38c5435cbcb8faae2130d5c66828f1fd4f8c0933ae98c274ad69460a01dc237b',
  },
];
const migrationIndex = allMigrationNames.indexOf(migration);
// Keep the original FK boundary guard on the prefix. Later migrations are
// admitted only by the separately reviewed exact name-and-checksum tail.
const migrationNames = allMigrationNames.slice(0, migrationIndex + 1);
assert.equal(
  migrationNames.at(-1),
  migration,
  'extend this proof explicitly when later migrations exist',
);
assert.deepEqual(
  allMigrationNames.slice(migrationIndex + 1),
  reviewedTail.map((entry) => entry.name),
  'extend this proof explicitly when later migrations exist',
);
for (const entry of reviewedTail)
  assert.equal(
    createHash('sha256')
      .update(
        fs.readFileSync(path.join(migrations, entry.name, 'migration.sql')),
      )
      .digest('hex'),
    entry.sha256,
    'review later migration bytes explicitly before extending the proof',
  );
const urls = [
  process.env.DATABASE_URL,
  process.env.PUBLIC_BOOKING_FK_FRESH_DATABASE_URL,
];
for (const value of urls) {
  const u = new URL(value);
  assert.equal(u.protocol, 'postgresql:');
  assert.equal(u.hostname, '127.0.0.1');
  assert.equal(u.username, 'widget_proof');
  assert(!u.password && !u.search && !u.hash);
  assert(u.port && u.port !== '5432');
  assert.match(u.pathname, /^\/maya_widget_gate_proof_fk_[a-z0-9_]+$/);
}
assert.notEqual(urls[0], urls[1]);
const clients = urls.map(
  (connectionString) => new pg.Client({ connectionString }),
);
const stages = [];
const note = (name) => {
  stages.push(name);
  console.log('PASS ' + name);
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const hashes = () =>
  Object.fromEntries(
    allMigrationNames.map((n) => [
      n,
      sha(fs.readFileSync(path.join(migrations, n, 'migration.sql'))),
    ]),
  );
const initialHashes = hashes();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-fk-proof-'));
const schema = path.join(work, 'schema.prisma');
const config = path.join(work, 'prisma.config.mjs');
fs.writeFileSync(
  config,
  `export default {
  schema: ${JSON.stringify(schema)},
  migrations: {path: ${JSON.stringify(path.join(work, 'migrations'))}},
  datasource: {url: process.env.DATABASE_URL}
};\n`,
);
fs.copyFileSync(path.join(backend, 'prisma/schema.prisma'), schema);
fs.mkdirSync(path.join(work, 'migrations'));
fs.copyFileSync(
  path.join(migrations, 'migration_lock.toml'),
  path.join(work, 'migrations/migration_lock.toml'),
);
for (const n of migrationNames.filter((n) => n !== migration))
  fs.cpSync(path.join(migrations, n), path.join(work, 'migrations', n), {
    recursive: true,
  });
const cli = path.join(backend, 'node_modules/prisma/build/index.js');
function prisma(url, args) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: backend,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  });
}
const tables = [
  'Tenant',
  'PublicBookingSession',
  'PublicBookingQuote',
  'PublicBookingAttempt',
];
const ids = [
  'fk-proof-tenant',
  'fk-proof-session',
  'fk-proof-quote',
  'fk-proof-attempt',
];
const qi = (name) => '"' + name.replaceAll('"', '""') + '"';
const sqlrow = async (c, sql) => (await c.query(sql)).rows;
async function rows(c) {
  const result = {};
  for (const [i, t] of tables.entries())
    result[t] = (
      await c.query(
        'SELECT to_jsonb(t) AS row FROM ' + qi(t) + ' t WHERE id=$1',
        [ids[i]],
      )
    ).rows;
  return result;
}
async function metadata(c) {
  return {
    constraints: await sqlrow(
      c,
      `SELECT conname, conrelid::regclass::text AS child, confrelid::regclass::text AS parent,
      contype, conkey, confkey, confupdtype, confdeltype, confmatchtype,
      condeferrable, condeferred, convalidated
      FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname,conrelid::regclass::text`,
    ),
    triggers: await sqlrow(
      c,
      `SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
    ),
    indexes: await sqlrow(
      c,
      `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`,
    ),
    immutableFunction: await sqlrow(
      c,
      `SELECT pg_get_functiondef(oid) AS definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='public_booking_immutable_v1'`,
    ),
  };
}
async function seed(c) {
  await c.query(
    `INSERT INTO "Tenant"(id,name,slug,"updatedAt") VALUES($1,'Synthetic FK proof','synthetic-fk-proof',now())`,
    [ids[0]],
  );
  await c.query(
    `INSERT INTO "PublicBookingSession"(id,"tenantId","siteKey","configHash","secretHash","expiresAt")
    VALUES($1,$2,'synthetic-site','synthetic-config','synthetic-not-secret',now()+interval '1 day')`,
    [ids[1], ids[0]],
  );
  await c.query(
    `INSERT INTO "PublicBookingQuote"(id,"tenantId","sessionId","snapshotJson","expiresAt")
    VALUES($1,$2,$3,'{"synthetic":true}',now()+interval '1 day')`,
    [ids[2], ids[0], ids[1]],
  );
  await c.query(
    `INSERT INTO "PublicBookingAttempt"(id,"tenantId","sessionId","quoteId",nonce,"requestHash","intentHash","normalizedInputHash","targetRef")
    VALUES($1,$2,$3,$4,'synthetic-nonce','synthetic-request','synthetic-intent','synthetic-input','synthetic-target')`,
    [ids[3], ids[0], ids[1], ids[2]],
  );
}
async function transaction(c, sql, values, expectedConstraint) {
  await c.query('BEGIN');
  let error;
  try {
    await c.query(sql, values);
  } catch (e) {
    error = e;
  } finally {
    await c.query('ROLLBACK');
  }
  if (expectedConstraint) {
    assert.equal(error?.code, '23503');
    assert.equal(error?.constraint, expectedConstraint);
  } else if (error) throw error;
}
async function behaviour(c, restrict) {
  const before = await rows(c);
  for (let i = 0; i < 3; i++) {
    const table = qi(tables[i]),
      id = ids[i],
      constraint = targetNames[i];
    await transaction(
      c,
      'DELETE FROM ' + table + ' WHERE id=$1',
      [id],
      constraint,
    );
    const replace =
      'WITH gone AS (DELETE FROM ' +
      table +
      ' WHERE id=$1 RETURNING *) INSERT INTO ' +
      table +
      ' SELECT * FROM gone';
    await transaction(c, replace, [id], restrict ? constraint : undefined);
    // Updating an identity key must remain forbidden too (NO ACTION unchanged).
    await transaction(
      c,
      'UPDATE ' + table + ' SET id=$2 WHERE id=$1',
      [id, id + '-replaced'],
      undefined,
    ).then(
      () => {
        throw Error('identity update unexpectedly allowed');
      },
      (e) => {
        assert(['23503', 'P0001'].includes(e.code));
      },
    );
  }
  assert.deepEqual(await rows(c), before);
  note(
    restrict
      ? 'three replacement refusals; deletes and updates refused; rows unchanged'
      : 'old three replacements allowed; deletes and updates refused; rows unchanged',
  );
}
try {
  for (const c of clients) {
    await c.connect();
    assert.equal(
      (
        await c.query(
          `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'`,
        )
      ).rows[0].n,
      0,
      'proof requires a new empty database',
    );
  }
  prisma(urls[0], ['migrate', 'deploy', '--config', config]);
  await seed(clients[0]);
  const beforeRows = await rows(clients[0]),
    beforeMeta = await metadata(clients[0]);
  assert.equal(
    beforeMeta.constraints.filter(
      (c) => targetNames.includes(c.conname) && c.confdeltype === 'a',
    ).length,
    3,
  );
  await behaviour(clients[0], false);
  note('upgrade fixture exists under original migrations');
  // A DDL error after two corrected links must leave the entire old schema intact.
  const brokenDdl = fs
    .readFileSync(path.join(migrations, migration, 'migration.sql'), 'utf8')
    .replace(
      'REFERENCES "PublicBookingQuote"',
      'REFERENCES "SyntheticMissingQuote"',
    );
  await assert.rejects(clients[0].query(brokenDdl), (e) => e.code === '42P01');
  await clients[0].query('ROLLBACK');
  assert.deepEqual(await metadata(clients[0]), beforeMeta);
  assert.deepEqual(await rows(clients[0]), beforeRows);
  note(
    'mid-migration failure rolls back all constraint changes and retains data',
  );
  fs.cpSync(
    path.join(migrations, migration),
    path.join(work, 'migrations', migration),
    { recursive: true },
  );
  prisma(urls[0], ['migrate', 'deploy', '--config', config]);
  const afterMeta = await metadata(clients[0]);
  const expected = structuredClone(beforeMeta);
  for (const c of expected.constraints)
    if (targetNames.includes(c.conname)) c.confdeltype = 'r';
  assert.deepEqual(afterMeta, expected, 'only three delete actions may change');
  assert.deepEqual(await rows(clients[0]), beforeRows);
  note(
    'upgrade retains all fixture rows, keys, indexes, user triggers and immutable function',
  );
  await behaviour(clients[0], true);
  // Prove the FK correction against its historical prefix before applying A22.
  const a22Definition = async (c) => {
    const definitions = (
      await c.query(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid='"TenantBusinessConfigurationRevision"'::regclass
         AND conname='R11_config_contract_check'`,
      )
    ).rows;
    assert.equal(definitions.length, 1);
    return definitions[0].definition;
  };
  const a22Before = `CHECK (((namespace = ANY (ARRAY['business_rules'::text, 'client_capabilities'::text, 'staff_ai_provider'::text, 'c8_valuation'::text, 'c9_orchestration'::text])) AND ("contractVersion" = 1) AND (revision > 0) AND ("contentHash" ~ '^[a-f0-9]{64}$'::text) AND (((revision = 1) AND ("previousRevisionId" IS NULL)) OR ((revision > 1) AND ("previousRevisionId" IS NOT NULL)))))`;
  const a22After = a22Before.replace(
    "'c9_orchestration'::text]",
    "'c9_orchestration'::text, 'customer_facts'::text]",
  );
  assert.notEqual(a22After, a22Before);
  assert.equal(await a22Definition(clients[0]), a22Before);
  for (const entry of reviewedTail)
    fs.cpSync(
      path.join(migrations, entry.name),
      path.join(work, 'migrations', entry.name),
      { recursive: true },
    );
  prisma(urls[0], ['migrate', 'deploy', '--config', config]);
  assert.equal(await a22Definition(clients[0]), a22After);
  assert.deepEqual(await metadata(clients[0]), afterMeta);
  assert.deepEqual(await rows(clients[0]), beforeRows);
  await behaviour(clients[0], true);
  note('reviewed A22 tail follows FK correction; only namespace check expands');
  prisma(urls[1], ['migrate', 'deploy']);
  await seed(clients[1]);
  await behaviour(clients[1], true);
  assert.deepEqual(await metadata(clients[1]), afterMeta);
  assert.equal(await a22Definition(clients[1]), a22After);
  note('clean replay equals upgraded schema');
  for (let i = 0; i < 2; i++) {
    prisma(urls[i], ['migrate', 'deploy']);
    const diff = prisma(urls[i], [
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--script',
      '--exit-code',
    ]);
    assert.match(diff, /empty migration/i);
    const applied = (
      await clients[i].query(
        'SELECT migration_name,checksum,rolled_back_at,finished_at FROM "_prisma_migrations" ORDER BY migration_name',
      )
    ).rows;
    assert.equal(applied.length, allMigrationNames.length);
    for (const row of applied) {
      assert.equal(row.checksum, initialHashes[row.migration_name]);
      assert(row.finished_at);
      assert.equal(row.rolled_back_at, null);
    }
    note(
      (i ? 'fresh' : 'upgrade') +
        ' second replay, checksums and empty schema diff',
    );
  }
  // Counterfactual: remove each strengthened action, one at a time, inside a
  // rolled-back transaction; the very same refusal assertion must turn red.
  for (let i = 0; i < 3; i++) {
    const c = clients[0],
      child = qi(tables[i + 1]),
      constraint = targetNames[i];
    await c.query('BEGIN');
    try {
      const def = (
        await c.query(
          'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname=$1',
          [constraint],
        )
      ).rows[0].def;
      await c.query(
        'ALTER TABLE ' +
          child +
          ' DROP CONSTRAINT ' +
          qi(constraint) +
          ', ADD CONSTRAINT ' +
          qi(constraint) +
          ' ' +
          def.replace('ON DELETE RESTRICT', 'ON DELETE NO ACTION'),
      );
      let refused = false;
      try {
        const table = qi(tables[i]);
        await c.query(
          'WITH gone AS (DELETE FROM ' +
            table +
            ' WHERE id=$1 RETURNING *) INSERT INTO ' +
            table +
            ' SELECT * FROM gone',
          [ids[i]],
        );
      } catch (e) {
        if (e.code === '23503' && e.constraint === constraint) refused = true;
        else throw e;
      }
      assert.equal(
        refused,
        false,
        'counterfactual must allow replacement and kill refusal assertion',
      );
    } finally {
      await c.query('ROLLBACK');
    }
    assert.deepEqual(await rows(c), beforeRows);
    assert.deepEqual(await metadata(c), afterMeta);
    note(
      'counterfactual ' +
        constraint +
        ' kills replacement-refusal oracle and rolls back',
    );
  }
  assert.deepEqual(hashes(), initialHashes);
  note('all source migration hashes unchanged during execution');
  console.log(
    JSON.stringify({
      contract: 'maya.public-booking-fk-proof/1',
      passed: stages.length,
      stages,
      sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: backend,
        encoding: 'utf8',
      }).trim(),
      migrationSha256: initialHashes[migration],
      reviewedTail,
      migrationCount: allMigrationNames.length,
      upgradeOrder: [
        'historical-prefix',
        migration,
        ...reviewedTail.map((entry) => entry.name),
      ],
      certificate: 'NOT_ISSUED',
      realEffects: 0,
    }),
  );
} finally {
  for (const c of clients) await c.end();
  fs.rmSync(work, { recursive: true, force: true });
}
