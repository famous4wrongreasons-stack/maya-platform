// The proof-database guard (plan §4.2). Evaluated before ANY connection the harness opens.
//
// The local PostgreSQL cluster holds databases that must never be touched (production clones, the
// owner's working databases), so the guard admits a database by name, host and parameters, and
// refuses everything else:
//   - `DATABASE_URL` missing or blank FAILS. A live suite that skipped would read as green.
//   - the host is exactly `127.0.0.1` (not `localhost`, not a socket path);
//   - the port is written in the URL. Without one the driver connects to 5432, and 5432 on a developer
//     machine is the shared cluster (G8 spec §4.2, G12 spec §6.2: a dedicated port). Locally 5432 is
//     refused; only CI mode (below) admits it, because there it is the job's own service container;
//   - CI mode is `CI=true`, `WIDGET_GATEWAY_PG=required` and `GITHUB_ACTIONS=true` together (the
//     widgets-live and widgets-mutation workflows run on GitHub Actions, which sets the first and the
//     third). In CI mode the only database is `maya_ci`, the workflow's service database; outside it the
//     database matches `^maya_widget_gate_proof_[a-z0-9_]+$` and `maya_ci` is refused;
//   - a name containing `prod`, `clone`, `maya_saas` or `postgres` is refused whatever else holds;
//   - `maya_widget_gate_proof_local` is refused BY NAME, in either mode. It matches the proof pattern
//     above and it sits on this very port, because it is the CONCURRENT shell workstream's proof
//     database (GATES-PLAN-V11 D-19). Until this line, the rule "never the shell workstream's
//     database" was upheld only by whatever `DATABASE_URL` the operator typed: the two workstreams
//     share 127.0.0.1:55611, so a stray environment variable let this harness seed and TRUNCATE the
//     other side's evidence with no objection from the fence built to prevent exactly that. The shell
//     side pins the mirror image of this rule in its own code; this is the half that was missing;
//   - the only query parameter admitted is Prisma's `schema`: libpq-style parameters such as `host`,
//     `hostaddr`, `port`, `dbname` or `service` would redirect the connection away from what the URL's
//     authority says, so the name and host checked above would not be the ones connected to.
//
// Refusals say what was refused and why; they never echo the password.

export const PROOF_DATABASE_PATTERN = /^maya_widget_gate_proof_[a-z0-9_]+$/;
export const CI_DATABASE = 'maya_ci';
/** PostgreSQL's default port: the shared local cluster on a developer machine. */
export const SHARED_CLUSTER_PORT = '5432';
const REFUSED_FRAGMENTS = ['prod', 'clone', 'maya_saas', 'postgres'] as const;
/**
 * The concurrent shell workstream's proof database, on the same cluster and the same port as this
 * one. It matches `PROOF_DATABASE_PATTERN`, so only naming it keeps it out.
 */
export const FOREIGN_WORKSTREAM_DATABASE = 'maya_widget_gate_proof_local';
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
  // Before the fragment scan, because this name breaks none of the other rules: it is a well-formed
  // proof database on the right host and the right port, and it belongs to somebody else.
  if (lowered === FOREIGN_WORKSTREAM_DATABASE)
    throw new ProofDatabaseRefused(
      `database ${JSON.stringify(database)} is the shell workstream's proof database on this same cluster (D-19); this harness uses its own`,
    );
  const fragment = REFUSED_FRAGMENTS.find((f) => lowered.includes(f));
  if (fragment)
    throw new ProofDatabaseRefused(
      `database ${JSON.stringify(database)} contains ${JSON.stringify(fragment)}`,
    );

  // WHATWG URL and the pg driver read the port alike (`05432` is 5432 to both); an empty port is the
  // driver's default, 5432.
  if (!url.port)
    throw new ProofDatabaseRefused(
      `DATABASE_URL names no port, so the driver would connect to ${SHARED_CLUSTER_PORT}; write the dedicated proof port`,
    );

  const ci =
    env.CI === 'true' &&
    env.WIDGET_GATEWAY_PG === 'required' &&
    env.GITHUB_ACTIONS === 'true';
  if (ci) {
    if (database !== CI_DATABASE)
      throw new ProofDatabaseRefused(
        `in CI mode (CI=true, WIDGET_GATEWAY_PG=required, GITHUB_ACTIONS=true) the only database admitted is ${CI_DATABASE}, not ${JSON.stringify(database)}`,
      );
  } else {
    if (url.port === SHARED_CLUSTER_PORT)
      throw new ProofDatabaseRefused(
        `port ${SHARED_CLUSTER_PORT} is the shared local cluster; outside CI mode a proof database must be on a dedicated port`,
      );
    if (!PROOF_DATABASE_PATTERN.test(database))
      throw new ProofDatabaseRefused(
        database === CI_DATABASE
          ? `${CI_DATABASE} is admitted only in CI mode (CI=true, WIDGET_GATEWAY_PG=required, GITHUB_ACTIONS=true)`
          : `database ${JSON.stringify(database)} does not match ${String(PROOF_DATABASE_PATTERN)}`,
      );
  }

  return Object.freeze({
    connectionString: raw,
    host: url.hostname,
    port: url.port,
    database,
    mode: ci ? 'ci' : 'local',
  });
}
