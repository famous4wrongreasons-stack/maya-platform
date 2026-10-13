// This dedicated suite uses a fresh staging-named synthetic database. It does NOT
// expand widgetProofEnvironment, the existing proof guard, or fixture grant authority.
import { WIDGETS_LIVE_TEST_LITERALS, assertNoEnvFiles } from './environment';
export function assertStagingProofDatabase(raw: string | undefined): string {
  const db = new URL(raw ?? 'invalid:');
  if (
    !['postgres:', 'postgresql:'].includes(db.protocol) ||
    db.hostname !== '127.0.0.1' ||
    !db.port ||
    db.port === '5432' ||
    db.search ||
    db.hash ||
    !/^\/maya_widget_release_staging_proof_[a-f0-9]{12}$/.test(db.pathname)
  )
    throw new Error(
      'local staging proof requires a dedicated loopback staging proof database',
    );
  return raw!;
}
export function stagingProofEnvironment(): NodeJS.ProcessEnv {
  assertNoEnvFiles();
  const env: NodeJS.ProcessEnv = {
    ...WIDGETS_LIVE_TEST_LITERALS,
    DATABASE_URL: assertStagingProofDatabase(process.env.DATABASE_URL),
    LANG: 'C',
    TZ: 'UTC',
  };
  for (const key of ['PATH', 'HOME', 'TMPDIR'])
    if (process.env[key]) env[key] = process.env[key];
  return env;
}
export default function setup(): void {
  const env = stagingProofEnvironment();
  for (const key of Object.keys(process.env))
    if (!(key in env) && !key.startsWith('JEST_')) delete process.env[key];
  Object.assign(process.env, env);
}
