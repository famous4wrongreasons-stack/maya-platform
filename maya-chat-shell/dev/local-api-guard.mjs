// K5 dev — the backend launch fence, preloaded with `node --import` (§2.5 step 4, §2.6).
//
//   exec env -i PATH="$PATH" HOME="$HOME" node --env-file=<SCRATCH>/backend.local.env \
//        --import=<SH>/dev/local-api-guard.mjs <maya-saas-backend>/dist/src/main.js
//
// `local-api-env.mjs --verify` checks the env FILE, but Node gives an inherited variable precedence over
// `--env-file`: a DATABASE_URL exported by whatever started the process would win and the binary would
// connect there — including the shared cluster on :5432 — while the file check reports "admitted"
// (integration finding). This module runs after the env file is applied and before main.js is loaded,
// reads the EFFECTIVE environment, and exits 1 unless it is the proof-DB environment. It opens no
// connection and prints no secret.

import { BACKEND_HOST, BACKEND_PORT, FIXED_SETTINGS, FORBIDDEN_KEYS, assertProofDatabaseUrl } from './local-api-env.mjs';

export function effectiveEnvProblems(env = process.env) {
  const problems = [];
  try {
    assertProofDatabaseUrl(env.DATABASE_URL);
  } catch (error) {
    problems.push(`effective DATABASE_URL: ${error.message}`);
  }
  if (env.HOST !== BACKEND_HOST) problems.push(`effective HOST must be ${BACKEND_HOST}, is ${JSON.stringify(env.HOST ?? null)}`);
  if (env.PORT !== BACKEND_PORT) problems.push(`effective PORT must be ${BACKEND_PORT}, is ${JSON.stringify(env.PORT ?? null)}`);
  for (const [key, value] of Object.entries(FIXED_SETTINGS))
    if (key !== 'DATABASE_URL' && key !== 'HOST' && key !== 'PORT' && env[key] !== value) problems.push(`effective ${key} must be ${JSON.stringify(value)}`);
  for (const key of FORBIDDEN_KEYS) if (key in env) problems.push(`${key} must not be set in the effective environment`);
  if (env.NODE_OPTIONS) problems.push('NODE_OPTIONS must not be set: it could load code before this fence');
  return problems;
}

const problems = effectiveEnvProblems();
if (problems.length) {
  process.stderr.write(`local-api-guard: REFUSED before the backend loads\n- ${problems.join('\n- ')}\n`);
  process.exit(1);
}
