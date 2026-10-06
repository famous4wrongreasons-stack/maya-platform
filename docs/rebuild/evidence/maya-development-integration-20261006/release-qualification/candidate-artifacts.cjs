const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const backend = process.cwd();
const root = path.resolve('..');
const { WidgetReleasePolicy } = require(path.join(backend, 'dist/src/entitlements/widget-release-policy.service'));
const { ConfigService } = require(path.join(backend, 'node_modules/@nestjs/config'));
const profile = require(path.join(backend, 'dist/src/entitlements/widget-release-profile.contract'));
const { WIDGET_RELEASE_CLAUSES } = require(path.join(backend, 'dist/src/entitlements/widget-release-clauses'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const filehash = file => sha(fs.readFileSync(file));
const git = args => cp.execFileSync('git', args, { encoding: 'utf8' }).trim();
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const payloads = Object.fromEntries(['web', 'capacitor'].map(mode => {
  const dir = path.join(root, 'maya-carrier-react/dist', mode);
  return [mode, Object.fromEntries(walk(dir).sort().map(file => [path.relative(dir, file), filehash(file)]))];
}));
const prior = JSON.parse(fs.readFileSync(path.join(root, 'docs/rebuild/evidence/maya-development-integration-20261006/runtime-heavy/carrier-artifact-hashes.json')));
if (JSON.stringify(payloads) !== JSON.stringify(prior.payloads)) throw Error('Carrier bytes changed');
const runtimeSourceSha = 'be7a4a5f08fe34369c11d548741724bae13a2618';
if (git(['diff', runtimeSourceSha, 'HEAD', '--', 'src', 'prisma', '../maya-carrier-react/src', '../maya-chat-shell/src'])) throw Error('Runtime or schema changed');
console.log(JSON.stringify({
  contract: 'maya.development.release-qualification-artifacts/1',
  candidateSha: git(['rev-parse', 'HEAD']), sourceTree: git(['rev-parse', 'HEAD^{tree}']), runtimeSourceSha,
  runtimeAndSchemaDiffEmpty: true, buildDigest: new WidgetReleasePolicy(new ConfigService()).buildDigest(),
  contractDocumentSha256: filehash(path.join(root, 'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md')),
  profileId: profile.NO_HANDOFF_PROFILE, profileDigest: profile.PROFILE_DIGEST, registryDigest: profile.PROFILE_REGISTRY_DIGEST,
  globalClauseIds: WIDGET_RELEASE_CLAUSES, applicableClauses: 163, excludedClauses: ['G6-6', 'G13-R8'],
  scheduleEditor: 'NOT_USER_REACHABLE', payloads, carrierBytesEqualPriorCheckpoint: true, nativeVerified: false,
  governance: 'single-operator', independentHumanReview: false, reviewerId: null, certificateStatus: 'NOT_ISSUED',
  authorityGranted: false, productionExecutionAuthorized: false,
  lockfiles: { backend: filehash('package-lock.json'), react: filehash('../maya-carrier-react/package-lock.json'), shell: null },
  shellPackageSha256: filehash('../maya-chat-shell/package.json'),
  note: 'No shell package-lock exists. Exact local artifact inventory, not a ProfileCertificate or release authorization.'
}, null, 2));
