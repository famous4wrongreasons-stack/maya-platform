// Read-only installed-binary preflight for the existing NO_UPSTREAM_ONLY proof.
// No environment file, credential, server, service user, DB or network is opened.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function localProofProfile({
  pgBin,
  platform = process.platform,
  nodeVersion = process.versions.node,
  readVersion = (file) =>
    execFileSync(file, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 4096,
      env: { LANG: 'C', TZ: 'UTC' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
} = {}) {
  // Keep the already exercised local default; never guess a remote install path.
  pgBin ??=
    platform === 'darwin' ? '/opt/homebrew/opt/postgresql@16/bin' : undefined;
  assert.ok(
    pgBin && path.isAbsolute(pgBin),
    'candidate_absolute_pg_bin_required',
  );
  assert.match(nodeVersion, /^24\./, 'candidate_node_24_required');
  const directory = fs.realpathSync(pgBin);
  assert.ok(fs.statSync(directory).isDirectory(), 'candidate_pg_bin_directory');
  const binaries = {};
  let pgVersion;
  for (const name of ['postgres', 'initdb', 'pg_ctl', 'createdb']) {
    const file = fs.realpathSync(path.join(directory, name));
    assert.equal(
      path.dirname(file),
      directory,
      'candidate_pg_binary_outside_install',
    );
    assert.ok(fs.statSync(file).isFile(), 'candidate_pg_binary_file');
    fs.accessSync(file, fs.constants.R_OK | fs.constants.X_OK);
    const output = readVersion(file).trim();
    const match = output.match(
      new RegExp('^' + name + ' \\(PostgreSQL\\) (16\\.\\d+)(?:[ (].*)?$'),
    );
    assert.ok(match, 'candidate_postgres_16_required');
    pgVersion ??= match[1];
    assert.equal(match[1], pgVersion, 'candidate_pg_install_version_mismatch');
    binaries[name] = {
      path: file,
      version: match[1],
      sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    };
  }
  return {
    contract: 'maya.current-candidate-local-proof-profile/1',
    mode: 'NO_UPSTREAM_ONLY',
    observedAt: new Date().toISOString(),
    platform,
    architecture: process.arch,
    node: { path: process.execPath, version: nodeVersion },
    pgBin: directory,
    binaries,
    resources: {
      runnerHeapMb: 256,
      brokerHeapMb: 256,
      backendJestHeapMb: 3072,
      jestWorkers: 1,
      pgSharedBuffersMb: 64,
      pgWorkMemMb: 4,
      pgMaxConnections: 30,
      observedTotalMemoryBytes: os.totalmem(),
      observedFreeMemoryBytes: os.freemem(),
      memoryQualification: 'OBSERVATION_ONLY_NOT_PEAK_RSS_OR_ADMISSION',
    },
    paidAuthorized: false,
    remoteServerQualified: false,
    credentialsRead: false,
    resourcesCreated: false,
  };
}
