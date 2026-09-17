#!/usr/bin/env node
// K5 dev — the local-API environment for the EXISTING backend binary on the isolated proof DB (§2.5).
//
//   node dev/local-api-env.mjs --out=<SCRATCH>/backend.local.env      write a fresh env file (mode 0600)
//   node dev/local-api-env.mjs --verify=<SCRATCH>/backend.local.env   check one; exit 0 only if admitted
//
// Every secret is 32 random bytes of hex, generated here, for this machine, for one run. None is a
// real secret and none may ever be written inside a git work tree: `--out` refuses such a path.
//
// The guard (below) runs before anything connects: host exactly 127.0.0.1, port exactly 55611, database
// exactly maya_widget_gate_proof_local, no prod/clone in the name, and no query parameter other than
// Prisma's `schema` (libpq parameters could redirect the connection away from what the URL names).
// Port 5432 — the owner's shared cluster — is refused like every other port.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEV_DIR = path.dirname(fileURLToPath(import.meta.url));

export const PROOF_DB = Object.freeze({
  protocol: 'postgresql:',
  host: '127.0.0.1',
  port: '55611',
  database: 'maya_widget_gate_proof_local',
  user: 'maya',
});
export const PROOF_DATABASE_URL = `postgresql://${PROOF_DB.user}@${PROOF_DB.host}:${PROOF_DB.port}/${PROOF_DB.database}?schema=public`;
export const BACKEND_PORT = '3310';
export const BACKEND_HOST = '127.0.0.1';

const REFUSED_FRAGMENTS = ['prod', 'clone', 'maya_saas', 'postgres'];

export class ProofDatabaseRefused extends Error {
  constructor(reason) {
    super(`proof-DB guard: ${reason}`);
    this.name = 'ProofDatabaseRefused';
  }
}

/** Admit exactly the isolated proof database, or throw. Never echoes a password. */
export function assertProofDatabaseUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') throw new ProofDatabaseRefused('DATABASE_URL is not set');
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ProofDatabaseRefused('DATABASE_URL is not a URL');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:')
    throw new ProofDatabaseRefused(`protocol ${url.protocol} is not postgresql:`);
  if (url.hostname !== PROOF_DB.host)
    throw new ProofDatabaseRefused(`host ${JSON.stringify(url.hostname)} is not exactly ${PROOF_DB.host}`);
  // WHATWG URL drops a default or empty port; an absent port means the driver's 5432.
  if (!url.port) throw new ProofDatabaseRefused(`no port: the driver would connect to 5432; the proof port is ${PROOF_DB.port}`);
  if (url.port === '5432') throw new ProofDatabaseRefused('port 5432 is the shared local cluster and is never used');
  if (url.port !== PROOF_DB.port) throw new ProofDatabaseRefused(`port ${url.port} is not exactly ${PROOF_DB.port}`);
  for (const name of url.searchParams.keys())
    if (name !== 'schema') throw new ProofDatabaseRefused(`query parameter ${JSON.stringify(name)} is not admitted (only "schema")`);
  let database;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new ProofDatabaseRefused('the database name is not decodable');
  }
  const lowered = database.toLowerCase();
  const fragment = REFUSED_FRAGMENTS.find((f) => lowered.includes(f));
  if (fragment) throw new ProofDatabaseRefused(`database ${JSON.stringify(database)} contains ${JSON.stringify(fragment)}`);
  if (database !== PROOF_DB.database)
    throw new ProofDatabaseRefused(`database ${JSON.stringify(database)} is not exactly ${PROOF_DB.database}`);
  return Object.freeze({ host: url.hostname, port: url.port, database, user: decodeURIComponent(url.username) });
}

/** The secrets the binary reads. Each is 32 random bytes, hex. */
export const SECRET_KEYS = Object.freeze([
  'JWT_SECRET',
  'AUTH_REFRESH_TOKEN_SECRET',
  'AUTH_SESSION_METADATA_SECRET',
  'AUTH_RATE_LIMIT_SECRET',
  'CLIENT_IDENTITY_HASH_SECRET',
  'CRM_ENCRYPTION_KEY',
  'PHONE_AUTH_SECRET',
  'EMAIL_AUTH_SECRET',
  // Boot validators of the loyalty, referral and gift-certificate modules (32..256 characters).
  'MAYA_LOYALTY_REDEMPTION_CODE_PEPPER',
  'MAYA_REFERRAL_REWARD_PRESENTATION_KEY',
  'MAYA_REFERRAL_REWARD_CLAIM_SECRET',
  'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY',
  'MAYA_GIFT_CERTIFICATE_CLAIM_SECRET',
]);

/**
 * Fixed settings. `EMAIL_AUTH_PROVIDER=debug` makes `/auth/email/start` return `debug_code`
 * (email-auth-delivery.service.ts `resolveProvider`), so no mail leaves the machine. The schedulers whose
 * switch exists are off: a local shell run must not advance billing states, send reminders or run
 * retention over the gate programme's rows. No provider key is set: `AI_CORE_PROVIDER=safe` answers
 * without a model, and transcription answers 503 (voice is verified with mocks).
 */
export const FIXED_SETTINGS = Object.freeze({
  NODE_ENV: 'development',
  PORT: BACKEND_PORT,
  HOST: BACKEND_HOST,
  DATABASE_URL: PROOF_DATABASE_URL,
  AI_CORE_PROVIDER: 'safe',
  EMAIL_LOGIN_ENABLED: 'true',
  EMAIL_AUTH_PROVIDER: 'debug',
  PHONE_LOGIN_ENABLED: 'false',
  SWAGGER_ENABLED: 'false',
  BILLING_SCHEDULER_ENABLED: 'false',
  OWNER_REPORTS_SCHEDULER_ENABLED: 'false',
  APPOINTMENT_REMINDERS_SCHEDULER_ENABLED: 'false',
  INGESTION_QUARANTINE_RETENTION_ENABLED: 'false',
  CRM_RECONCILIATION_SCHEDULER_ENABLED: 'false',
  MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION: 'dev-local-1',
  MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION: 'dev-local-1',
});

/** Keys the file must not carry: real provider credentials or delivery channels. */
export const FORBIDDEN_KEYS = Object.freeze([
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'YANDEX_SPEECHKIT_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'YCLIENTS_PARTNER_TOKEN',
  'SMSRU_API_ID',
  'YOOKASSA_SECRET_KEY',
  'MAYA_LEGACY_BRIDGE_TOKEN',
  'TELEGRAM_CLIENT_SECRET',
  'YANDEX_CLIENT_SECRET',
]);

export function buildEnv(random = (n) => randomBytes(n).toString('hex')) {
  const env = { ...FIXED_SETTINGS };
  for (const key of SECRET_KEYS) env[key] = random(32);
  return env;
}

export function serializeEnv(env, generatedAt = new Date().toISOString()) {
  const lines = [
    `# dev-only, random, generated ${generatedAt} by maya-chat-shell/dev/local-api-env.mjs`,
    '# Not a real secret. Scratch only; never inside a repository.',
  ];
  for (const [key, value] of Object.entries(env)) lines.push(`${key}=${value}`);
  return `${lines.join('\n')}\n`;
}

/** The subset of dotenv syntax `serializeEnv` writes: KEY=VALUE lines and comments. */
export function parseEnvFile(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) throw new Error(`not a KEY=VALUE line: ${JSON.stringify(line.slice(0, 40))}`);
    env[line.slice(0, eq).trim()] = line.slice(eq + 1);
  }
  return env;
}

/** Every reason the env would not be admitted; empty when it is. */
export function verifyEnv(env) {
  const issues = [];
  try {
    assertProofDatabaseUrl(env.DATABASE_URL);
  } catch (error) {
    issues.push(error.message);
  }
  for (const [key, value] of Object.entries(FIXED_SETTINGS))
    if (key !== 'DATABASE_URL' && env[key] !== value) issues.push(`${key} must be ${JSON.stringify(value)}`);
  for (const key of SECRET_KEYS) if (!/^[0-9a-f]{64}$/.test(env[key] ?? '')) issues.push(`${key} must be 64 hex characters`);
  for (const key of FORBIDDEN_KEYS) if (key in env) issues.push(`${key} must not be set`);
  return issues;
}

/** The repository this shell lives in (maya-chat-shell's parent). Secrets are never written below it. */
export const REPOSITORY_ROOT = path.resolve(DEV_DIR, '..', '..');

const nearestExisting = (target) => {
  let dir = path.resolve(target);
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return dir;
    dir = parent;
  }
  return fs.statSync(dir).isDirectory() ? dir : path.dirname(dir);
};

const within = (root, target) => {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * True when `target` (or its nearest existing ancestor) is inside a git work tree. FAILS CLOSED: git is
 * asked with every GIT_* variable removed (GIT_DIR / GIT_WORK_TREE / GIT_CEILING_DIRECTORIES could point
 * it elsewhere), only git's own "not a git repository" answer means outside, and anything else — git
 * missing, a crash, an unexpected answer — throws (integration finding: every git failure used to mean
 * "outside", so a missing git admitted a path inside the repository).
 */
export function insideGitWorkTree(target) {
  const dir = nearestExisting(target);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) throw new Error(`cannot tell whether ${dir} is inside a git work tree (git: ${r.error.code ?? r.error.message})`);
  const out = (r.stdout ?? '').trim();
  if (r.status === 0 && out === 'true') return true;
  if (r.status === 0 && out === 'false') return false; // inside a .git directory: not a work tree
  if (r.status !== 0 && /not a git repository/i.test(r.stderr ?? '')) return false;
  throw new Error(`cannot tell whether ${dir} is inside a git work tree (git exit ${r.status}: ${(r.stderr || out).trim().slice(0, 120)})`);
}

/**
 * Admit a secret's destination only outside this repository AND outside every git work tree. The
 * repository prefix is checked first and without git, so no git answer can admit a path in the tree.
 */
export function assertScratchPath(file) {
  const resolved = path.resolve(file);
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const realTarget = path.join(real(nearestExisting(resolved)), path.relative(nearestExisting(resolved), resolved));
  if (within(real(REPOSITORY_ROOT), realTarget) || within(REPOSITORY_ROOT, resolved))
    throw new Error(`refused: ${resolved} is inside the repository ${REPOSITORY_ROOT}; dev secrets are written to scratch only`);
  let inside;
  try {
    inside = insideGitWorkTree(path.dirname(resolved));
  } catch (error) {
    throw new Error(`refused: ${resolved}: ${error.message}; dev secrets are written to scratch only`);
  }
  if (inside) throw new Error(`refused: ${resolved} is inside a git work tree; dev secrets are written to scratch only`);
  return resolved;
}

/** The preload that checks the EFFECTIVE environment before the backend binary loads. */
export const GUARD_MODULE = path.join(DEV_DIR, 'local-api-guard.mjs');
export const BACKEND_MAIN = path.join(REPOSITORY_ROOT, 'maya-saas-backend', 'dist', 'src', 'main.js');

/**
 * The launch command for the existing backend binary (§2.5 step 4, §2.6 entry). Node gives an INHERITED
 * variable precedence over `--env-file`, so the file alone cannot pin DATABASE_URL: the command verifies
 * the file and starts node, both with an emptied environment (`env -i`, only PATH and HOME kept), and preloads
 * `local-api-guard.mjs`, which refuses unless the effective DATABASE_URL, HOST, PORT and fixed settings
 * are the proof-DB ones (integration finding).
 */
export function launchCommand({ envFile, cwd, main = BACKEND_MAIN }) {
  for (const value of [envFile, cwd, main, DEV_DIR]) if (String(value).includes("'")) throw new Error(`a launch path may not contain a single quote: ${value}`);
  return [
    `env -i PATH="$PATH" HOME="$HOME" node '${path.join(DEV_DIR, 'local-api-env.mjs')}' --verify='${envFile}'`,
    `mkdir -p '${cwd}'`,
    `cd '${cwd}'`,
    `exec env -i PATH="$PATH" HOME="$HOME" node --env-file='${envFile}' --import='${GUARD_MODULE}' '${main}'`,
  ].join(' && ');
}

export function writeSecretFile(file, content) {
  const resolved = assertScratchPath(file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  fs.writeFileSync(resolved, content, { mode: 0o600 });
  fs.chmodSync(resolved, 0o600);
  return resolved;
}

export function readEnvFile(file) {
  return parseEnvFile(fs.readFileSync(path.resolve(file), 'utf8'));
}

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`unknown argument ${a}`);
    args[m[1]] = m[2] ?? true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.out === 'string') {
    const env = buildEnv();
    const issues = verifyEnv(env);
    if (issues.length) throw new Error(`generated env refused:\n- ${issues.join('\n- ')}`);
    const written = writeSecretFile(args.out, serializeEnv(env));
    console.log(`local-api-env: wrote ${written} (mode 0600; ${SECRET_KEYS.length} dev-only random secrets)`);
    console.log(`local-api-env: DATABASE_URL admitted: ${PROOF_DB.host}:${PROOF_DB.port}/${PROOF_DB.database}`);
    return 0;
  }
  if (typeof args.verify === 'string') {
    const issues = verifyEnv(readEnvFile(args.verify));
    // AppModule reads .env.local and .env from its working directory (ConfigModule envFilePath); the
    // §2.6 launch entry starts the binary inside maya-saas-backend, so their presence is refused.
    // Existence only: the files are never opened.
    for (const name of ['.env.local', '.env'])
      if (fs.existsSync(path.resolve(DEV_DIR, '..', '..', 'maya-saas-backend', name)))
        issues.push(`maya-saas-backend/${name} exists: the binary would read it; start it from a directory without env files`);
    if (issues.length) {
      console.error(`local-api-env: REFUSED ${path.resolve(args.verify)}\n- ${issues.join('\n- ')}`);
      return 1;
    }
    console.log(`local-api-env: admitted ${path.resolve(args.verify)}`);
    return 0;
  }
  console.error('usage: node dev/local-api-env.mjs --out=<scratch file> | --verify=<scratch file>');
  return 2;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`local-api-env: ${error.message}`);
      process.exit(1);
    },
  );
}
