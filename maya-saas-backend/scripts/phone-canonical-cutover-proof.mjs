#!/usr/bin/env node
// Read-only local evidence collection. Does not build, deploy, read private
// environment files, inspect Keychain, contact a server or operate a database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { FROM, TO, PROFILE, canonicalCutoverPlan, verifyCutoverPlan, verifyHistoricalObservation } from './phone-canonical-cutover-plan.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const BUILD = 'a7f07289450289f4669bcd3dfbfc1218fb7e9df4a7c60de4734142c9e14955bf';
const git = (root, args) => execFileSync('/usr/bin/git', ['-C', root, ...args], { maxBuffer: 16 * 1024 * 1024 });
const treeReceipt = files => [...files].sort(([a], [b]) => a.localeCompare(b))
  .map(([name, bytes]) => ({ path: name, size: bytes.length, sha256: sha(bytes) }));
export function verifySourceBoundParity(web, cap, sourceVerifiedWeb, owners) {
  owners.assertFiles(web, sourceVerifiedWeb);
  owners.verifyParity(web, cap, 'https://phone-test.mayaos.ru/api');
}
function assertClean(root) {
  assert.equal(git(root, ['rev-parse', 'HEAD']).toString().trim(), TO, 'wrong frozen candidate');
  assert.equal(git(root, ['status', '--porcelain']).toString(), '', 'frozen source is dirty');
}
export function migrationInventory(root, revision) {
  assert.ok([FROM, TO].includes(revision));
  return git(root, ['ls-tree', '-r', '--name-only', revision, '--', 'maya-saas-backend/prisma/migrations'])
    .toString().trim().split('\n').filter(name => name.endsWith('/migration.sql')).sort()
    .map(name => ({ path: name, sha256: sha(git(root, ['show', revision + ':' + name])) }));
}

export async function prepare({ source, app, out }) {
  source = fs.realpathSync(source); app = fs.realpathSync(app);
  assertClean(source);
  assert.ok(path.isAbsolute(out) && !fs.existsSync(out), 'fresh absolute output directory required');
  out = path.join(fs.realpathSync(path.dirname(out)), path.basename(out));
  const toolRepository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  for (const protectedRoot of [source, app, toolRepository])
    assert.ok(path.relative(protectedRoot, out).startsWith('..' + path.sep), 'output must be outside source/artifact trees');
  const backend = path.join(source, 'maya-saas-backend');
  const load = relative => import(pathToFileURL(path.join(source, relative)).href);
  // Check preparation/build entrypoints against pinned Git. The complete source
  // tree must also remain clean. This does not claim dependency reinstallation.
  const sources = [
    'maya-saas-backend/scripts/phone-staging-plan.mjs', 'maya-saas-backend/scripts/phone-catalog-plan.mjs',
    'maya-saas-backend/scripts/phone-ai-plan.mjs', 'maya-saas-backend/scripts/staging-carrier-preflight.mjs',
    'maya-saas-backend/scripts/local-onboarding-profile.mjs', 'maya-saas-backend/compose.staging.yml',
    'maya-saas-backend/deploy/staging/Caddyfile', 'maya-saas-backend/Dockerfile',
    'maya-saas-backend/package-lock.json', 'maya-carrier-react/tools/release.mjs',
    'maya-carrier-react/tools/payload-files.mjs', 'maya-carrier-react/tools/native-api-target.mjs',
    'maya-carrier-react/build.mjs', 'maya-carrier-react/tools/ratchets.mjs', 'maya-carrier-react/tools/design-assets.mjs',
  ];
  const sourceBindings = sources.map(name => {
    const bytes = fs.readFileSync(path.join(source, name));
    assert.ok(bytes.equals(git(source, ['show', TO + ':' + name])), 'local preparation source changed');
    return { path: name, sha256: sha(bytes) };
  });
  const { privatePhonePlan } = await load('maya-saas-backend/scripts/phone-staging-plan.mjs');
  const { phoneCatalogSetupGatewayPlan } = await load('maya-saas-backend/scripts/phone-catalog-plan.mjs');
  const { phoneAiPlan } = await load('maya-saas-backend/scripts/phone-ai-plan.mjs');
  const { verifyParity, verifyNativeFiles, checkNativeConfig } = await load('maya-carrier-react/tools/release.mjs');
  const { readTree, assertFiles } = await load('maya-carrier-react/tools/payload-files.mjs');
  const require = createRequire(path.join(backend, 'package.json'));
  const { WidgetReleasePolicy } = require(path.join(backend, 'dist/src/entitlements/widget-release-policy.service.js'));
  const { fixedProfile } = require(path.join(backend, 'dist/src/entitlements/widget-release-profile.contract.js'));
  const previousCwd = process.cwd(); let buildDigest;
  try { process.chdir(backend); buildDigest = new WidgetReleasePolicy().buildDigest(true); }
  finally { process.chdir(previousCwd); }
  assert.equal(buildDigest, BUILD, 'compiled bytes differ from the measured frozen binary');
  const web = readTree(path.join(source, 'maya-carrier-react/dist/web'));
  // Parity alone accepts an identically stale/tampered pair. Reconstruct the
  // expected web bytes through the existing owner, in memory, without repairing
  // dist. Keep the same snapshot before/after that check.
  const carrierVerification = execFileSync(process.execPath, ['build.mjs', '--target=web', '--verify-output'], {
    cwd: path.join(source, 'maya-carrier-react'), timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', LANG: 'C', TZ: 'UTC', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assertFiles(readTree(path.join(source, 'maya-carrier-react/dist/web')), web);
  const native = readTree(path.join(app, 'public')), cap = new Map(native);
  cap.delete('cordova.js'); cap.delete('cordova_plugins.js');
  verifyNativeFiles(native, cap); // The only ignored bridge placeholders must be empty.
  const nativeConfig = JSON.parse(fs.readFileSync(path.join(app, 'capacitor.config.json'), 'utf8'));
  checkNativeConfig(nativeConfig);
  assert.deepEqual(nativeConfig.packageClassList, ['AppPlugin', 'KeyboardPlugin', 'StatusBarPlugin']);
  verifySourceBoundParity(web, cap, web, { assertFiles, verifyParity });
  // Counterfactual: a correlated edit passes old parity but must not be labelled
  // as the source-verified candidate. No artifact file is changed for this proof.
  const changedWeb = new Map(web), changedCap = new Map(cap);
  for (const files of [changedWeb, changedCap]) {
    const js = [...files.keys()].find(name => name.endsWith('.js'));
    files.set(js, Buffer.concat([files.get(js), Buffer.from('\n/* synthetic foreign payload */\n')]));
  }
  verifyParity(changedWeb, changedCap, 'https://phone-test.mayaos.ru/api');
  assert.throws(() => verifySourceBoundParity(changedWeb, changedCap, web, { assertFiles, verifyParity }));
  const webInventory = treeReceipt(web), capacitorInventory = treeReceipt(cap);
  const composeText = fs.readFileSync(path.join(backend, 'compose.staging.yml'), 'utf8');
  const caddy = fs.readFileSync(path.join(backend, 'deploy/staging/Caddyfile'));
  const catalog = phoneCatalogSetupGatewayPlan(privatePhonePlan(FROM, composeText, caddy), composeText, caddy);
  // Synthetic scope hash only: no historical secret/scope is read or claimed current.
  const expectedAi = phoneAiPlan(catalog.compose, sha('synthetic cutover comparison fixture, not an execution scope'));
  const input = { historical: { compose: expectedAi, environment: catalog.environment, privateEnvironmentKeys: catalog.privateEnvironmentKeys },
    bindings: { sourceCandidate: FROM, targetCandidate: TO, profile: PROFILE, profileDigest: fixedProfile(PROFILE).digest,
      buildDigest, webTreeDigest: sha(JSON.stringify(webInventory)), capacitorTreeDigest: sha(JSON.stringify(capacitorInventory)) },
    previousMigrations: migrationInventory(source, FROM), targetMigrations: migrationInventory(source, TO) };
  const plan = canonicalCutoverPlan(input);
  verifyCutoverPlan(plan, input);
  // Real generator-derived shape, not the unit test's hand-built fixture.
  for (const mutate of [
    p => p.canonicalReadonlyDraft.compose.services.backend.command = ['sh', '-c', 'npx prisma migrate deploy'],
    p => p.canonicalReadonlyDraft.compose.services.backend.networks.push('edge'),
    p => p.canonicalReadonlyDraft.compose.services.backend.entrypoint = ['node', '/app/scripts/phone-ai-entry.mjs'],
    p => p.rollback.reverse(), p => p.readyForExecution = true,
  ]) { const changed = structuredClone(plan); mutate(changed); assert.throws(() => verifyCutoverPlan(changed, input)); }
  const changedObservation = structuredClone(expectedAi); changedObservation.services.backend.privileged = true;
  assert.throws(() => verifyHistoricalObservation(plan, changedObservation));
  assertClean(source);
  const proof = { contract: 'maya.phone-canonical-cutover-local-proof/1', observedAt: new Date().toISOString(),
    status: 'PREPARATION_PASS', candidate: TO, buildDigest, sourceBindings,
    webInventory, capacitorInventory, previousMigrations: input.previousMigrations.length,
    targetMigrations: input.targetMigrations.length, addedMigrationsInGit: plan.migrations.addedInGit.length,
    canonicalMainDraft: true, implicitMigrationRefused: true, sixGeneratorDerivedNegativesPassed: true,
    sourceVerifiedWeb: true, carrierVerificationStdoutSha256: sha(carrierVerification),
    correlatedPayloadSubstitutionRefused: true,
    pwaPhonePayloadParity: true, nativeCodeSigningVerified: false, actualPhoneInstallation: false,
    historicalBaseline: 'reconstructed fixture with synthetic scope digest; not a live inventory',
    serverRead: false, currentDatabaseInspected: false, rollbackExecuted: false,
    providerTransportProven: false, certificate: 'NOT_ISSUED', readyForExecution: false,
    planSha256: sha(JSON.stringify(plan, null, 2) + '\n'), effects: plan.effects };
  fs.mkdirSync(out, { mode: 0o700 });
  for (const [name, value] of [['PLAN.json', plan], ['PROOF.json', proof]])
    fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { status: proof.status, candidate: TO, output: out, addedMigrationsInGit: proof.addedMigrationsInGit,
    pwaPhonePayloadParity: true, readyForExecution: false, readyForBooking: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ strict: true, options: { source: { type: 'string' }, app: { type: 'string' }, out: { type: 'string' } } });
    assert.ok(values.source && values.app && values.out, 'source, app and out required');
    console.log(JSON.stringify(await prepare(values)));
  } catch {
    console.error('CUTOVER PREPARATION REFUSED. No remote, database, credential or release operation performed.');
    process.exitCode = 1;
  }
}
