import { releaseUnitDatabase } from '../../test/widgets-live/support/widget-release-unit-database';
import { assertProofDatabase } from '../../test/widgets-live/support/proof-db-guard';

const ci = {
  CI: 'true',
  GITHUB_ACTIONS: 'true',
  WIDGET_GATEWAY_PG: 'required',
  DATABASE_URL:
    'postgresql://maya_ci:maya_ci@127.0.0.1:5432/maya_ci?schema=public',
};

describe('release unit fixture database follows the unchanged proof fence', () => {
  it('uses the exact guarded CI service URL without rewriting environment or authority flags', () => {
    const before = { ...ci };
    const url = releaseUnitDatabase(ci);
    expect(url).toBe(ci.DATABASE_URL);
    expect(assertProofDatabase({ ...ci, DATABASE_URL: url }).mode).toBe('ci');
    expect(ci).toEqual(before);
  });

  it('keeps a dedicated non-connected local fixture outside full widget CI mode', () => {
    const url = releaseUnitDatabase({});
    expect(assertProofDatabase({ DATABASE_URL: url })).toMatchObject({
      mode: 'local',
      database: 'maya_widget_gate_proof_unit_release',
      port: '55729',
    });
  });

  it.each(['CI', 'GITHUB_ACTIONS', 'WIDGET_GATEWAY_PG'])(
    'does not pretend the CI service is isolated when %s is absent',
    (flag) => {
      const env: NodeJS.ProcessEnv = { ...ci };
      delete env[flag];
      const url = releaseUnitDatabase(env);
      expect(url).not.toBe(ci.DATABASE_URL);
      expect(assertProofDatabase({ ...env, DATABASE_URL: url }).mode).toBe(
        'local',
      );
    },
  );

  it.each([
    undefined,
    '',
    'postgresql://proof@127.0.0.1:55729/maya_widget_gate_proof_unit_release',
    'postgresql://proof@127.0.0.1:55729/maya_widget_gate_proof_local',
    'postgresql://maya_ci:maya_ci@localhost:5432/maya_ci',
    'postgresql://maya_ci:maya_ci@127.0.0.1:5432/maya_ci?host=other',
  ])('refuses invalid CI configuration without a local fallback: %s', (url) => {
    expect(() => releaseUnitDatabase({ ...ci, DATABASE_URL: url })).toThrow();
  });
});
