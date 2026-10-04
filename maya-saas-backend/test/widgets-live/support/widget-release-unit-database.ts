import { assertProofDatabase } from './proof-db-guard';

/** Unit fixtures open no connections; their policy configuration still obeys the real DB fence. */
export function releaseUnitDatabase(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const ci =
    env.CI === 'true' &&
    env.GITHUB_ACTIONS === 'true' &&
    env.WIDGET_GATEWAY_PG === 'required';
  return assertProofDatabase({
    ...env,
    DATABASE_URL: ci
      ? env.DATABASE_URL
      : 'postgresql://proof@127.0.0.1:55729/maya_widget_gate_proof_unit_release',
  }).connectionString;
}
