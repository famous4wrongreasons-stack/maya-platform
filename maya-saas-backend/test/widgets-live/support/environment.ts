// The widgets-live environment (plan §4.2; GATES-PLAN-V11 I-HAR, IR-H1): the test literals of
// `.github/workflows/platform-ci.yml`, the declared widgets-live extras, and nothing else.
//
// No `.env` file is read, and nothing from the developer's shell reaches the application under test:
// `applyWidgetsLiveEnvironment` removes every variable that is not a process-level one or one of the
// literals below, then sets the literals. `DATABASE_URL` is the one application variable taken from
// outside, and only after `assertProofDatabase` has admitted it. Locally the proof database is
// `maya_widget_gate_proof_gates` on 127.0.0.1:55611 (GATES-PLAN-V11 D-19; never the shell workstream's
// `maya_widget_gate_proof_local`); in CI it is the job's own `maya_ci`.
//
// The platform-ci literals are copied from the `platform-backend` job's `env` block. The extras are the keys
// `AppModule` cannot be constructed without and Platform CI does not carry: the referral, gift-certificate and
// loyalty boot validators, and the Action Engine identity secrets (which otherwise fall back to
// `CRM_ENCRYPTION_KEY`). `harness.live-spec.ts` reads the workflow files and asserts that platform-ci carries
// exactly the first set and that `widgets-live.yml` and `widgets-mutation.yml` carry exactly their union (HAR-4),
// so a change on either side fails there instead of drifting silently. All of them are CI test literals, not
// secrets: they are public in the repository and grant nothing outside a proof database.

import fs from 'node:fs';
import path from 'node:path';

import { assertProofDatabase, type ProofDatabase } from './proof-db-guard';

/** `platform-ci.yml` → `jobs.platform-backend.env`, minus `DATABASE_URL` (see above). */
export const PLATFORM_CI_TEST_LITERALS: Readonly<Record<string, string>> =
  Object.freeze({
    AUTH_RATE_LIMIT_SECRET: 'test-auth-rate-limit-secret-for-ci-only',
    AUTH_REFRESH_TOKEN_SECRET: 'test-refresh-token-secret-for-ci-only',
    AUTH_SESSION_METADATA_SECRET: 'test-session-metadata-secret-for-ci-only',
    CRM_ENCRYPTION_KEY: 'test-crm-encryption-key-for-ci-only',
    JWT_SECRET: 'test-jwt-signing-secret-for-ci-only',
    NODE_ENV: 'test',
    PHONE_AUTH_SECRET: 'test-phone-auth-secret-for-ci-only',
    SEED_DEMO_TENANT_ADMIN_EMAIL: 'admin@demo-business.local',
    SEED_DEMO_TENANT_ADMIN_PASSWORD: 'test-demo-tenant-password-for-ci',
    SEED_PLATFORM_OWNER_EMAIL: 'owner@maya.local',
    SEED_PLATFORM_OWNER_PASSWORD: 'test-platform-owner-password-for-ci',
  });

/**
 * IR-H1: the declared widgets-live extras. Each satisfies its module's boot validator (32..256 characters for a
 * key or a claim secret, `^[A-Za-z0-9._:-]{1,64}$` for a key version, at least 32 characters for the pepper and
 * the Action Engine secrets), and each value names itself a widgets-live test literal.
 */
export const WIDGETS_LIVE_EXTRA_LITERALS: Readonly<Record<string, string>> =
  Object.freeze({
    ACTION_ENGINE_IDENTITY_SECRET:
      'test-action-engine-identity-secret-for-widgets-live-only',
    ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET:
      'test-action-engine-payload-secret-for-widgets-live-only',
    MAYA_GIFT_CERTIFICATE_CLAIM_SECRET:
      'test-gift-certificate-claim-secret-for-widgets-live-only',
    MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY:
      'test-gift-certificate-presentation-key-for-widgets-live-only',
    MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION: 'widgets-live-test-1',
    MAYA_LOYALTY_REDEMPTION_CODE_PEPPER:
      'test-loyalty-redemption-code-pepper-for-widgets-live-only',
    MAYA_REFERRAL_REWARD_CLAIM_SECRET:
      'test-referral-reward-claim-secret-for-widgets-live-only',
    MAYA_REFERRAL_REWARD_PRESENTATION_KEY:
      'test-referral-reward-presentation-key-for-widgets-live-only',
    MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION: 'widgets-live-test-1',
  });

/** Every literal the widgets-live environment sets: platform-ci's ∪ the declared extras (disjoint by name). */
export const WIDGETS_LIVE_TEST_LITERALS: Readonly<Record<string, string>> =
  Object.freeze({
    ...PLATFORM_CI_TEST_LITERALS,
    ...WIDGETS_LIVE_EXTRA_LITERALS,
  });

/**
 * The harness's own variables (the evidence manifest switch and its directory, `support/evidence.ts`). A jest
 * suite keeps them; the application under test never receives them (`widgetsLiveChildEnvironment` drops them).
 */
export const HARNESS_ONLY_VARIABLES: readonly string[] = Object.freeze([
  'WIDGETS_EVIDENCE',
  'WIDGETS_EVIDENCE_DIR',
]);

/** Process-level variables a Node test run needs. None of them configures the application. */
const PROCESS_VARIABLES = new Set([
  'CI',
  'COLORTERM',
  'FORCE_COLOR',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LOGNAME',
  'NO_COLOR',
  'PATH',
  'PWD',
  'SHELL',
  'TERM',
  'TMP',
  'TEMP',
  'TMPDIR',
  'TZ',
  'USER',
  'WIDGET_GATEWAY_PG',
  'DATABASE_URL',
  ...HARNESS_ONLY_VARIABLES,
]);
const PROCESS_PREFIXES = ['JEST_', 'NODE_', 'GITHUB_', 'RUNNER_'];

const keep = (name: string): boolean =>
  PROCESS_VARIABLES.has(name) ||
  PROCESS_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
  Object.prototype.hasOwnProperty.call(WIDGETS_LIVE_TEST_LITERALS, name);

/**
 * Scrub the environment down to process variables, admit `DATABASE_URL` through the proof guard, and
 * set the widgets-live literals. Returns the admitted database. Throws, never skips, when the guard refuses.
 */
export function applyWidgetsLiveEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ProofDatabase {
  for (const name of Object.keys(env)) if (!keep(name)) delete env[name];
  const database = assertProofDatabase(env);
  for (const [name, value] of Object.entries(WIDGETS_LIVE_TEST_LITERALS))
    env[name] = value;
  return database;
}

/**
 * The environment of a child process that runs the application (the BIN runner's `dist/src/main`): a COPY
 * of `source` scrubbed and guarded exactly as `applyWidgetsLiveEnvironment` does for a jest suite, without the
 * harness's own variables, then the caller's fixed test settings. `source` is left unchanged. `DATABASE_URL` is
 * refused as a setting: it reaches the child only through the guard.
 */
export function widgetsLiveChildEnvironment(
  source: NodeJS.ProcessEnv,
  settings: Readonly<Record<string, string>>,
): { env: NodeJS.ProcessEnv; database: ProofDatabase } {
  if (Object.prototype.hasOwnProperty.call(settings, 'DATABASE_URL'))
    throw new Error(
      'widgets-live: DATABASE_URL is not a child setting; it is admitted only through the proof-database guard',
    );
  const env: NodeJS.ProcessEnv = { ...source };
  const database = applyWidgetsLiveEnvironment(env);
  for (const name of HARNESS_ONLY_VARIABLES) delete env[name];
  return { env: { ...env, ...settings }, database };
}

/**
 * `AppModule` configures `ConfigModule.forRoot({ envFilePath: ['.env.local', '.env'] })` relative to
 * the working directory. The harness cannot change that module, so it refuses to boot it while either
 * file exists. Only existence is checked; the files are never opened.
 */
export function assertNoEnvFiles(cwd: string = process.cwd()): void {
  const present = ['.env.local', '.env'].filter((name) =>
    fs.existsSync(path.join(cwd, name)),
  );
  if (present.length > 0)
    throw new Error(
      `widgets-live refuses to boot AppModule while ${present.join(' and ')} exists in ${cwd}: ` +
        'the application would read it, and the harness admits only the widgets-live literals',
    );
}
