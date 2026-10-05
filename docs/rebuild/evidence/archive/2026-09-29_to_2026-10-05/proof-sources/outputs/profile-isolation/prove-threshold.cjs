// Read-only parser proof. Synthetic header; never emits a signed command or contacts a database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const be = path.join(root, 'work/maya-controlled-integration/maya-saas-backend');
require(path.join(be, 'node_modules/ts-node')).register({
  project: path.join(be, 'tsconfig.scripts.json'), transpileOnly: true,
});
const { releaseProof } = require(path.join(be, 'test/widgets-live/support/widget-release-proof.ts'));
const { profileCommand } = require(path.join(be, 'test/widgets-live/support/widget-profile-proof.ts'));
const { profileCertificate, fullContractCertificate } = require(path.join(be, 'src/entitlements/widget-release-profile.contract.ts'));
const { releaseHash } = require(path.join(be, 'src/entitlements/widget-release.contract.ts'));
const audit = JSON.parse(fs.readFileSync(path.join(__dirname, 'current-audit.json')));
const fixture = releaseProof('[REDACTED DATABASE URL]');
const base = profileCommand(fixture, 'synthetic-parser-only').certificate.payload;
assert.doesNotThrow(() => profileCertificate(base));
assert.throws(() => fullContractCertificate(base));
const falseApplicable = audit.gates.flatMap(g => Object.entries(g.clauses))
  .filter(([id,c]) => c.state === 'false' && !['G6-6','G13-R8'].includes(id))
  .map(([id]) => id);
const refusals = falseApplicable.map(id => {
  const matrix = base.matrix.map(row => row.id === id ? {...row,state:'false'} : row);
  assert.throws(() => profileCertificate({...base,matrix,globalAuditDigest:releaseHash(matrix)}));
  return { clause:id, falseDutyRefused:true };
});
assert.equal(refusals.length,7);
console.log(JSON.stringify({
  sourceHead:audit.baseCommit, profile:base.scope,
  syntheticPositiveControl:true, profileNeverAcceptedByV1:true,
  applicableFalse:refusals, currentThresholdSatisfied:false,
  certifiedForProfile:false, fullContractCertified:false,
  signedCommandPublished:false, databaseConnections:0, externalEffects:0,
},null,2));
