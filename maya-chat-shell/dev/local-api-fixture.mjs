#!/usr/bin/env node
// K5 dev — the ONE shell-owned fixture on the isolated proof DB (§2.5 step 3 and step 5).
//
//   node dev/local-api-fixture.mjs --env=<SCRATCH>/backend.local.env --create  --slug=shell-p1-YYYYMMDDHHMMSS
//   node dev/local-api-fixture.mjs --env=<SCRATCH>/backend.local.env --status  --slug=<same>
//   node dev/local-api-fixture.mjs --env=<SCRATCH>/backend.local.env --provoke-402 | --restore-402 --slug=<same>
//   node dev/local-api-fixture.mjs --env=<SCRATCH>/backend.local.env --remove  --slug=<same>
//
// The proof DB belongs to the gate programme: this script never migrates, seeds or truncates it. It
// creates one tenant (ACTIVE, no access window, trialFullAccess false, no plan, no entitlement row — so
// no `widgets.runtime`), one user with a random dev-only password and one membership, all in one
// transaction that re-reads the tenant, evaluates it with the backend's own
// `evaluateTenantAccessState` (dist, read-only) and ROLLS BACK unless `subscriptionRequired` is false.
// The credentials go to a scratch file (mode 0600), never into the repository.
//
// `--remove` deletes children first: every row carrying the fixture's tenant id (retrying the tables a
// foreign key still holds), then the tenant (users and memberships cascade), then the global auth
// rate-limit buckets whose HMAC subject — under this run's dev-only secret — is one the shell's runs
// used (listed in `rate-limit-subjects.json` next to the env file). All in one transaction: a delete
// guard or a leftover row rolls the whole teardown back and exits non-zero with the report.
//
// Fence: only slugs `shell-p1-<14 digits>` and users `shell-p1-<14 digits>@shell-fixture.local` are ever
// written; the database guard of local-api-env.mjs runs before `pg` is even loaded.

import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertProofDatabaseUrl, readEnvFile, verifyEnv, writeSecretFile } from './local-api-env.mjs';

const DEV_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(DEV_DIR, '..', '..', 'maya-saas-backend');
export const SLUG_PATTERN = /^shell-p1-\d{14}$/;
export const FIXTURE_EMAIL_DOMAIN = 'shell-fixture.local';
export const FIXTURE_TENANT_NAME = 'Shell P1 fixture';
export const FIXTURE_USER_NAME = 'Shell Fixture Owner';
export const FIXTURE_ROLE = 'business_owner';
const RATE_LIMIT_POLICY_KEYS = [
  'auth.password_login.preflight.ip.15m',
  'auth.password_login.preflight.identity.15m',
  'auth.email_start.preflight.ip.10m',
  'auth.email_start.preflight.identity.10m',
  'auth.email_verify.preflight.ip.10m',
  'auth.email_verify.preflight.identity.10m',
  'auth.refresh.preflight.ip.15m',
  'auth.refresh.preflight.identity.15m',
];

const requireBackend = createRequire(path.join(BACKEND_DIR, 'package.json'));

export function assertFixtureSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) throw new Error(`refused: slug ${JSON.stringify(slug)} is not shell-p1-<14 digits>`);
  return slug;
}

const fixtureEmail = (slug) => `${slug}@${FIXTURE_EMAIL_DOMAIN}`;
const cuidLike = () => `c${randomBytes(12).toString('hex').slice(0, 24)}`;

/** `encryption/encryption.service.ts` encrypt: AES-256-GCM under sha256(CRM_ENCRYPTION_KEY). */
export function encryptName(plain, crmKey) {
  const key = createHash('sha256').update(crmKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

/** `auth/auth-rate-limit.service.ts` hashSubject, for a preflight (global) bucket. */
export function rateLimitSubjectHash(secret, policyKey, subject) {
  return createHmac('sha256', secret).update(`v1\0${policyKey}\0global\0${subject}`).digest('hex');
}

function evaluateAccess(row) {
  const { evaluateTenantAccessState } = requireBackend(path.join(BACKEND_DIR, 'dist', 'src', 'tenants', 'tenant-access-state.js'));
  return evaluateTenantAccessState(row, new Date());
}

async function connect(env) {
  // The guard runs on the same value the client receives, before `pg` is loaded.
  const admitted = assertProofDatabaseUrl(env.DATABASE_URL);
  const { Client } = requireBackend('pg');
  const url = new URL(env.DATABASE_URL);
  url.searchParams.delete('schema');
  const client = new Client({ connectionString: url.toString(), application_name: 'maya-chat-shell-fixture' });
  await client.connect();
  const probe = await client.query('select current_database() as db, inet_server_port() as port');
  if (probe.rows[0].db !== admitted.database || String(probe.rows[0].port) !== admitted.port) {
    await client.end();
    throw new Error(`refused: connected to ${probe.rows[0].db}:${probe.rows[0].port}, not the admitted proof DB`);
  }
  return client;
}

async function readTenant(client, slug) {
  const { rows } = await client.query(
    'select id, name, slug, status::text as status, "planId", "trialEndsAt", "trialFullAccess", "currentPeriodEnd", "pastDueAt", "graceEndsAt", "updatedAt" from "Tenant" where slug = $1',
    [slug],
  );
  return rows[0] ?? null;
}

async function accessReport(client, tenant) {
  const state = evaluateAccess(tenant);
  const entitlement = await client.query('select count(*)::int as n from "TenantEntitlement" where "tenantId" = $1 and "featureKey" = $2', [tenant.id, 'widgets.runtime']);
  return {
    status: tenant.status,
    planId: tenant.planId,
    trialEndsAt: tenant.trialEndsAt,
    currentPeriodEnd: tenant.currentPeriodEnd,
    trialFullAccess: tenant.trialFullAccess,
    accessState: state.accessState,
    subscriptionRequired: state.subscriptionRequired,
    widgetsRuntimeEntitlementRows: entitlement.rows[0].n,
  };
}

async function create(client, env, slug, credentialsFile) {
  const password = randomBytes(18).toString('base64url');
  const bcrypt = requireBackend('bcrypt');
  const passwordHash = await bcrypt.hash(password, 10);
  const tenantId = cuidLike();
  const userId = cuidLike();
  const membershipId = cuidLike();
  await client.query('begin');
  try {
    if (await readTenant(client, slug)) throw new Error(`refused: a tenant with slug ${slug} already exists`);
    await client.query(
      `insert into "Tenant" (id, name, slug, status, "trialEndsAt", "currentPeriodEnd", "trialFullAccess", "planId", "updatedAt")
       values ($1, $2, $3, 'active', null, null, false, null, now())`,
      [tenantId, FIXTURE_TENANT_NAME, slug],
    );
    await client.query(
      `insert into "User" (id, "tenantId", email, "encryptedName", "passwordHash", role, status, "updatedAt")
       values ($1, $2, $3, $4, $5, $6, 'active', now())`,
      [userId, tenantId, fixtureEmail(slug), encryptName(FIXTURE_USER_NAME, env.CRM_ENCRYPTION_KEY), passwordHash, FIXTURE_ROLE],
    );
    await client.query(
      `insert into "Membership" (id, "tenantId", "userId", role, status, "joinedAt", "updatedAt")
       values ($1, $2, $3, $4, 'active', now(), now())`,
      [membershipId, tenantId, userId, FIXTURE_ROLE],
    );
    const tenant = await readTenant(client, slug);
    const report = await accessReport(client, tenant);
    if (report.subscriptionRequired !== false || report.accessState !== 'active' || report.widgetsRuntimeEntitlementRows !== 0 || report.trialFullAccess !== false)
      throw new Error(`refused: the fixture tenant evaluates to ${JSON.stringify(report)}; rolled back`);
    await client.query('commit');
    const credentials = { slug, email: fixtureEmail(slug), password, tenantName: FIXTURE_TENANT_NAME, userName: FIXTURE_USER_NAME, role: FIXTURE_ROLE, tenantId, createdAt: new Date().toISOString(), access: report };
    const written = writeSecretFile(credentialsFile, `${JSON.stringify(credentials, null, 2)}\n`);
    return { tenantId, userId, membershipId, access: report, credentials: written };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function setTrialWindow(client, slug, pastDays) {
  const tenant = await readTenant(client, slug);
  if (!tenant) throw new Error(`no tenant ${slug}`);
  await client.query('update "Tenant" set "trialEndsAt" = $2, "updatedAt" = now() where id = $1 and slug = $3', [tenant.id, pastDays === null ? null : new Date(Date.now() - pastDays * 86_400_000), slug]);
  return accessReport(client, await readTenant(client, slug));
}

async function tenantTables(client) {
  const { rows } = await client.query(
    `select c.table_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
     where c.table_schema = 'public' and c.column_name = 'tenantId' and t.table_type = 'BASE TABLE' and c.table_name <> 'Tenant' order by 1`,
  );
  return rows.map((r) => r.table_name);
}

async function remove(client, env, slug, subjectsFile) {
  const tenant = await readTenant(client, slug);
  if (!tenant) return { removed: false, reason: `no tenant ${slug}` };
  const users = await client.query('select id, email from "User" where "tenantId" = $1', [tenant.id]);
  for (const u of users.rows)
    if (u.email !== fixtureEmail(slug)) throw new Error(`refused: tenant ${slug} holds a user outside the fixture fence (${u.email.replace(/^[^@]+/, '…')})`);
  const tables = await tenantTables(client);
  const count = async (table) => (await client.query(`select count(*)::int as n from "${table}" where "tenantId" = $1`, [tenant.id])).rows[0].n;
  const before = {};
  for (const table of tables) {
    const n = await count(table);
    if (n) before[table] = n;
  }

  const subjects = new Set(['127.0.0.1', JSON.stringify([slug, fixtureEmail(slug)]), JSON.stringify(['*', fixtureEmail(slug)]), JSON.stringify(['platform', fixtureEmail(slug)])]);
  if (subjectsFile && fs.existsSync(subjectsFile)) for (const s of JSON.parse(fs.readFileSync(subjectsFile, 'utf8')).subjects ?? []) subjects.add(String(s));
  const secret = env.AUTH_RATE_LIMIT_SECRET;
  const hashes = [...subjects].flatMap((subject) => RATE_LIMIT_POLICY_KEYS.map((key) => rateLimitSubjectHash(secret, key, subject)));

  const deleted = {};
  await client.query('begin');
  try {
    let pending = Object.keys(before);
    for (let pass = 0; pass < 25 && pending.length; pass += 1) {
      const next = [];
      for (const table of pending) {
        await client.query('savepoint fixture_delete');
        try {
          const res = await client.query(`delete from "${table}" where "tenantId" = $1`, [tenant.id]);
          await client.query('release savepoint fixture_delete');
          deleted[table] = (deleted[table] ?? 0) + res.rowCount;
        } catch (error) {
          await client.query('rollback to savepoint fixture_delete');
          if (error.code !== '23503') throw new Error(`delete from ${table} refused (${error.code}): ${error.message}`);
          next.push(table);
        }
      }
      if (next.length === pending.length) throw new Error(`no progress deleting ${next.join(', ')}`);
      pending = next;
    }
    const tenantDelete = await client.query('delete from "Tenant" where id = $1 and slug = $2', [tenant.id, slug]);
    deleted.Tenant = tenantDelete.rowCount;
    const buckets = await client.query('delete from "AuthRateLimitBucket" where "tenantId" is null and "subjectHash" = any($1::text[])', [hashes]);
    deleted['AuthRateLimitBucket(global, subject-matched)'] = buckets.rowCount;
    const left = {};
    for (const table of tables) {
      const n = await count(table);
      if (n) left[table] = n;
    }
    const usersLeft = (await client.query('select count(*)::int as n from "User" where email = $1', [fixtureEmail(slug)])).rows[0].n;
    if (Object.keys(left).length || usersLeft || (await readTenant(client, slug))) throw new Error(`rows left after teardown: ${JSON.stringify({ ...left, User: usersLeft })}`);
    await client.query('commit');
    return { removed: true, tenantId: tenant.id, before, deleted };
  } catch (error) {
    await client.query('rollback');
    throw new Error(`teardown rolled back: ${error.message}; rows found before: ${JSON.stringify(before)}`);
  }
}

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = /^--([a-z0-9-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`unknown argument ${a}`);
    args[m[1]] = m[2] ?? true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.env !== 'string') throw new Error('--env=<scratch backend.local.env> is required');
  const env = readEnvFile(args.env);
  const issues = verifyEnv(env);
  if (issues.length) throw new Error(`env refused:\n- ${issues.join('\n- ')}`);
  const slug = assertFixtureSlug(args.slug);
  const actions = ['create', 'status', 'provoke-402', 'restore-402', 'remove'].filter((a) => args[a]);
  if (actions.length !== 1) throw new Error('exactly one of --create, --status, --provoke-402, --restore-402, --remove');
  const scratch = path.dirname(path.resolve(args.env));
  const client = await connect(env);
  try {
    let result;
    switch (actions[0]) {
      case 'create':
        result = await create(client, env, slug, typeof args.credentials === 'string' ? args.credentials : path.join(scratch, `shell-fixture.${slug}.json`));
        break;
      case 'status': {
        const tenant = await readTenant(client, slug);
        result = tenant ? { slug, access: await accessReport(client, tenant) } : { slug, present: false };
        break;
      }
      case 'provoke-402':
        result = { slug, access: await setTrialWindow(client, slug, 30) };
        if (!result.access.subscriptionRequired) throw new Error(`provoke-402 did not yield subscriptionRequired: ${JSON.stringify(result)}`);
        break;
      case 'restore-402':
        result = { slug, access: await setTrialWindow(client, slug, null) };
        if (result.access.subscriptionRequired !== false) throw new Error(`restore-402 left subscriptionRequired: ${JSON.stringify(result)}`);
        break;
      case 'remove':
        result = await remove(client, env, slug, typeof args.subjects === 'string' ? args.subjects : path.join(scratch, 'rate-limit-subjects.json'));
        break;
      default:
        throw new Error('unreachable');
    }
    console.log(`local-api-fixture ${actions[0]}: ${JSON.stringify(result)}`);
    return 0;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`local-api-fixture: ${error.message}`);
      process.exit(1);
    },
  );
}
