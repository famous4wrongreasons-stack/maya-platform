// The proof-database guard for the events live suite. Evaluated before ANY connection it opens.
//
// This suite WRITES: it creates a tenant, a mirror row and domain events, then deletes them. The
// local PostgreSQL cluster holds databases that must never be touched — production clones, the
// owner's working databases, and the other workstreams' proof databases — so the guard admits a
// database and refuses everything else.
//
// 🔴 Why this is not `test/widgets-live/support/proof-db-guard.ts`. That guard is stronger and came
// first, and reusing it was the first choice. It cannot be reused as it stands: its CI mode requires
// `WIDGET_GATEWAY_PG=required` alongside `CI` and `GITHUB_ACTIONS`, and outside CI mode it admits
// only `^maya_widget_gate_proof_…$` and refuses `maya_ci` BY NAME. Platform CI — which is where this
// regression has to run, because it is a required check — sets neither that flag nor that database.
// Setting `WIDGET_GATEWAY_PG=required` in Platform CI to borrow the guard would be asserting
// something untrue about that job. So the properties are reproduced and the naming differs; the
// policy below is deliberately the same shape, and any hardening there is worth repeating here.
//
// The rules, and the reason for each:
//   - `DATABASE_URL` missing or blank FAILS. A live suite that skipped would read as green.
//   - the host is exactly `127.0.0.1` — not `localhost`, not a socket path, not a remote address.
//     Without this the name check below decides nothing: a production URL whose database happens to
//     be called something innocuous would pass.
//   - the port is written in the URL, so the connection cannot silently fall back to 5432.
//   - the only query parameter admitted is Prisma's `schema`. libpq-style parameters — `host`,
//     `hostaddr`, `port`, `dbname`, `service` — are copied into the connection config by
//     `pg-connection-string` BEFORE the URL's own authority is applied, so
//     `…@127.0.0.1:5432/maya_ci?host=<elsewhere>` would pass every other check and connect
//     elsewhere.
//   - the database is admitted by ALLOWLIST, not by denylist: `maya_ci` in CI, and
//     `maya_events_proof_<something>` locally. A denylist is the wrong shape here — it has to
//     enumerate every dangerous name, and it silently admits the one nobody thought of
//     (`maya_staging`, `maya_replica`, a colleague's `maya_ra_r10`).
//   - names carrying `prod`, `clone`, `maya_saas` or `postgres` are refused whatever else holds,
//     so a disposable name cannot be built around a production one.
//
// Refusals say what was refused and why, and never echo the password.

export const PROOF_DATABASE_PATTERN = /^maya_events_proof_[a-z0-9_]+$/;
export const CI_DATABASE = 'maya_ci';
const REFUSED_FRAGMENTS = ['prod', 'clone', 'maya_saas', 'postgres'] as const;
const ADMITTED_PARAMETERS = new Set(['schema']);

export interface ProofDatabase {
  readonly host: string;
  readonly port: string;
  readonly database: string;
  readonly mode: 'ci' | 'local';
}

export class ProofDatabaseRefused extends Error {
  constructor(reason: string) {
    super(`events-live proof-database guard: ${reason}`);
    this.name = 'ProofDatabaseRefused';
  }
}

export function assertEventsProofDatabase(
  env: NodeJS.ProcessEnv = process.env,
): ProofDatabase {
  const raw = env.DATABASE_URL?.trim();
  if (!raw)
    throw new ProofDatabaseRefused(
      'DATABASE_URL is not set. This suite writes, and it fails rather than skips; point it at a disposable proof database',
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

  if (!url.port)
    throw new ProofDatabaseRefused(
      'the port is not written in DATABASE_URL; without it the driver falls back to 5432',
    );

  for (const name of url.searchParams.keys())
    if (!ADMITTED_PARAMETERS.has(name))
      throw new ProofDatabaseRefused(
        `query parameter ${JSON.stringify(name)} is not admitted (only "schema"): it can redirect the connection away from the host this URL names`,
      );

  let database: string;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new ProofDatabaseRefused('the database name is not decodable');
  }

  for (const fragment of REFUSED_FRAGMENTS)
    if (database.toLowerCase().includes(fragment))
      throw new ProofDatabaseRefused(
        `database ${JSON.stringify(database)} contains ${JSON.stringify(fragment)}`,
      );

  // GitHub Actions sets both; the service container's database is the only one admitted there.
  const ci = env.CI === 'true' && env.GITHUB_ACTIONS === 'true';
  const mode: 'ci' | 'local' = ci ? 'ci' : 'local';

  if (ci) {
    if (database !== CI_DATABASE)
      throw new ProofDatabaseRefused(
        `in CI the only admitted database is ${CI_DATABASE}, not ${JSON.stringify(database)}`,
      );
  } else if (!PROOF_DATABASE_PATTERN.test(database)) {
    throw new ProofDatabaseRefused(
      `database ${JSON.stringify(database)} is not a disposable proof database. ` +
        `Create one and point DATABASE_URL at it, for example:\n` +
        `  createdb maya_events_proof_local\n` +
        `  DATABASE_URL="postgresql://$USER@127.0.0.1:5432/maya_events_proof_local?schema=public" npx prisma migrate deploy\n` +
        `  DATABASE_URL="postgresql://$USER@127.0.0.1:5432/maya_events_proof_local?schema=public" npm run test:events:live`,
    );
  }

  return { host: url.hostname, port: url.port, database, mode };
}
