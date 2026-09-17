// The proof-database guard (plan §4.2). Evaluated before ANY connection the harness opens.
//
// The local PostgreSQL cluster holds databases that must never be touched (production clones, the
// owner's working databases), so the guard admits a database by name, host and parameters, and
// refuses everything else:
//   - `DATABASE_URL` missing or blank FAILS. A live suite that skipped would read as green.
//   - the host is exactly `127.0.0.1` (not `localhost`, not a socket path);
//   - the database is `maya_ci` only when `CI=true` and `WIDGET_GATEWAY_PG=required` (the widgets-live
//     workflow's service database); otherwise it matches `^maya_widget_gate_proof_[a-z0-9_]+$`;
//   - a name containing `prod`, `clone`, `maya_saas` or `postgres` is refused whatever else holds;
//   - the only query parameter admitted is Prisma's `schema`: libpq-style parameters such as `host`,
//     `hostaddr`, `port`, `dbname` or `service` would redirect the connection away from what the URL's
//     authority says, so the name and host checked above would not be the ones connected to.
//
// Refusals say what was refused and why; they never echo the password.

export const PROOF_DATABASE_PATTERN = /^maya_widget_gate_proof_[a-z0-9_]+$/;
export const CI_DATABASE = 'maya_ci';
const REFUSED_FRAGMENTS = ['prod', 'clone', 'maya_saas', 'postgres'] as const;
const ADMITTED_PARAMETERS = new Set(['schema']);

export interface ProofDatabase {
  readonly connectionString: string;
  readonly host: string;
  readonly port: string;
  readonly database: string;
  readonly mode: 'ci' | 'local';
}

export class ProofDatabaseRefused extends Error {
  constructor(reason: string) {
    super(`widgets-live proof-database guard: ${reason}`);
    this.name = 'ProofDatabaseRefused';
  }
}

export function assertProofDatabase(
  env: NodeJS.ProcessEnv = process.env,
): ProofDatabase {
  const raw = env.DATABASE_URL?.trim();
  if (!raw)
    throw new ProofDatabaseRefused(
      'DATABASE_URL is not set. The live suite fails rather than skips; point it at a guarded proof database',
    );

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProofDatabaseRefused('DATABASE_URL is not a URL');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:')
    throw new ProofDatabaseRefused(
      `protocol ${url.protocol} is not postgresql:`,
    );
  if (url.hostname !== '127.0.0.1')
    throw new ProofDatabaseRefused(
      `host ${JSON.stringify(url.hostname)} is not exactly 127.0.0.1`,
    );

  for (const name of url.searchParams.keys())
    if (!ADMITTED_PARAMETERS.has(name))
      throw new ProofDatabaseRefused(
        `query parameter ${JSON.stringify(name)} is not admitted (only "schema")`,
      );

  let database: string;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new ProofDatabaseRefused('the database name is not decodable');
  }
  if (!database || database.includes('/'))
    throw new ProofDatabaseRefused('no single database name in DATABASE_URL');

  const lowered = database.toLowerCase();
  const fragment = REFUSED_FRAGMENTS.find((f) => lowered.includes(f));
  if (fragment)
    throw new ProofDatabaseRefused(
      `database ${JSON.stringify(database)} contains ${JSON.stringify(fragment)}`,
    );

  const ci = env.CI === 'true' && env.WIDGET_GATEWAY_PG === 'required';
  if (ci) {
    if (database !== CI_DATABASE)
      throw new ProofDatabaseRefused(
        `with CI=true and WIDGET_GATEWAY_PG=required the only database admitted is ${CI_DATABASE}, not ${JSON.stringify(database)}`,
      );
  } else if (!PROOF_DATABASE_PATTERN.test(database)) {
    throw new ProofDatabaseRefused(
      database === CI_DATABASE
        ? `${CI_DATABASE} is admitted only with CI=true and WIDGET_GATEWAY_PG=required`
        : `database ${JSON.stringify(database)} does not match ${String(PROOF_DATABASE_PATTERN)}`,
    );
  }

  return Object.freeze({
    connectionString: raw,
    host: url.hostname,
    port: url.port || '5432',
    database,
    mode: ci ? 'ci' : 'local',
  });
}
