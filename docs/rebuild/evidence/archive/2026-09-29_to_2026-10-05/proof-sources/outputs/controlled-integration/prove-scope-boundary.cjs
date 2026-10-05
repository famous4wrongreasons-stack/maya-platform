// Read-only diagnostic against the exact combined candidate. No keys, grants or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '../../work/maya-controlled-integration');
const backend = path.join(repo, 'maya-saas-backend');
const {certificate, RELEASE_CERT} = require(path.join(backend, 'dist/src/entitlements/widget-release.contract.js'));
const {WIDGET_RELEASE_CLAUSES} = require(path.join(backend, 'dist/src/entitlements/widget-release-clauses.js'));
const git = (...args) => cp.execFileSync('git', args, {cwd: repo, encoding: 'utf8'}).trim();
const auditPath = 'docs/rebuild/widget-release-programme/approved-release/current-audit.json';
const audit = JSON.parse(fs.readFileSync(path.join(repo, auditPath), 'utf8'));
const handoff = ['G6-6', 'G13-R8'];
const sha = git('rev-parse', 'HEAD');
git('merge-base', '--is-ancestor', 'e17b4acf12345bf6d6dcaf3e809ef476ad1b023e', sha);
const make = () => ({
  contract: RELEASE_CERT, environment: 'synthetic', scope: 'full165.closed-input', candidateSha: sha,
  buildDigest: 'a'.repeat(64), carrierDigest: 'b'.repeat(64), registryDigest: 'c'.repeat(64),
  evidenceDigest: 'd'.repeat(64), integrationDigest: 'e'.repeat(64), fbe2eDigest: 'f'.repeat(64),
  revocationProofDigest: '1'.repeat(64), issuedAt: '2026-09-29T21:00:00.000Z', expiresAt: '2026-09-29T22:00:00.000Z',
  matrix: WIDGET_RELEASE_CLAUSES.map(id => ({id, state: 'L', evidenceDigest: '2'.repeat(64)})),
});
const results = [];
const check = (id, fn) => { fn(); results.push({id, result: 'PASS'}); };
const denied = (value, reason) => assert.throws(() => certificate(value), error => error.message === 'widget_release_' + reason);
check('synthetic-parser-positive-control-NOT-A-RELEASE-CERTIFICATE', () => assert.equal(certificate(make()).matrix.length, 165));
for (const state of ['false', 'STOP']) check('HANDOFF-' + state + '-rejected-even-if-all-other-163-rows-pass', () => {
  const c = make(); c.matrix.forEach(row => {if (handoff.includes(row.id)) row.state = state;}); denied(c, 'threshold');
});
check('dropping-HANDOFF-rows-rejected', () => {const c = make(); c.matrix = c.matrix.filter(row => !handoff.includes(row.id)); denied(c, 'threshold');});
check('new-scope-string-rejected', () => {const c = make(); c.scope = 'closed-input.no-handoff'; denied(c, 'certificate');});
check('caller-exclusion-field-rejected', () => {const c = make(); c.excludedEffects = ['HANDOFF']; denied(c, 'shape');});
check('actual-progress-matrix-refused', () => {
  const c = make();
  c.matrix = audit.gates.flatMap(g => Object.entries(g.clauses).map(([id, row]) => ({
    id, state: row.state, evidenceDigest: '2'.repeat(64),
    ...(row.state === 'U' ? {u: {decisionDigest: '3'.repeat(64), absence: '4'.repeat(64), refusal: '5'.repeat(64), mechanism: '6'.repeat(64)}} : {}),
  })));
  // Hash literals only make the parser input complete. They attest to no evidence and are never signed.
  denied(c, 'threshold');
});
check('both-source-checkpoints-preserved-as-merge-parents-in-candidate-history', () => {
  const merge = 'e17b4acf12345bf6d6dcaf3e809ef476ad1b023e';
  assert.equal(git('show', '-s', '--format=%P', merge), 'f9e703e3265f31aa6f3e16eb0774b3349abf1fc0 36fc31d7fa1ba5af758254912fa324093b4d954b');
  const before = JSON.parse(fs.readFileSync(path.join(__dirname, 'PRE-MERGE-PROOF.json'), 'utf8'));
  assert.deepEqual(before.overlap, []);
  assert.equal(before.mergeTreeExitCode, 0);
  assert.equal(git('rev-parse', merge + '^{tree}'), before.mergeTreeOutput.trim());
});
check('presentation-identical-to-Claude', () => assert.equal(git('diff', '--name-only', '36fc31d7', 'HEAD', '--', 'maya-carrier-react', 'maya-ios-carrier'), ''));
check('backend-runtime-identical-only-approved-artifact-census-test-differs', () => assert.equal(git('diff', '--name-only', 'f9e703e3', 'HEAD', '--', 'maya-saas-backend'), 'maya-saas-backend/src/action-engine/beget-relay-release.architecture.spec.ts'));
check('no-uncommitted-candidate-changes', () => assert.equal(git('status', '--porcelain'), ''));
const sourcePaths = [
  'maya-saas-backend/src/entitlements/widget-release.contract.ts',
  'maya-saas-backend/src/entitlements/widget-release-policy.service.ts',
  'maya-saas-backend/src/entitlements/entitlements.service.ts',
  'maya-saas-backend/src/widgets/widgets.controller.ts',
  'maya-saas-backend/src/widgets/routing/effect-router.service.ts',
  'maya-saas-backend/src/widgets/routing/handoff-target.signer.ts',
  'maya-saas-backend/src/widgets/composition/typed-step0.ts',
  'maya-saas-backend/src/widgets/stores/timeline.store.ts',
  'maya-saas-backend/src/ai-tools/ai-core.service.ts',
  'maya-chat-shell/src/shell/conversation.ts',
];
console.log(JSON.stringify({contract: 'maya.controlled-integration-boundary-proof/1', candidateSha: sha,
  recordedAt: new Date().toISOString(), purpose: 'diagnostic only; no release certification',
  checks: results, sourceHashes: Object.fromEntries(sourcePaths.map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,p))).digest('hex')])),
  productionEffects: 0, otpEffects: 0, yclientsEffects: 0,
}, null, 2));
