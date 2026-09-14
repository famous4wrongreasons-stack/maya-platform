/** Reuse the accepted B31/B32 executable PostgreSQL proofs, unchanged except
 * their exact owned-database allowlist. No production host or old DB accepted.
 * B31 child restart/race processes re-enter this same guarded wrapper.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const flavor = ['b31', 'b32'].includes(process.argv[2]) ? process.argv.splice(2, 1)[0] : 'b31';
const url = new URL(process.argv[3]);
if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55507' || url.pathname !== '/maya_ra_r01')
  throw Error('Only the fresh owned Wave R-A R01 database is allowed');
const originals = {
  b31: ['package5-b31-immutable-idempotency.probe.cjs', '55501', '/maya_c06_b31_fg'],
  b32: ['package5-b32-client-principal.probe.cjs', '55502', '/maya_c06_b32_proof'],
};
const [name, port, database] = originals[flavor];
const sourceFile = path.join(root, 'docs/rebuild/evidence', name);
let source = fs.readFileSync(sourceFile, 'utf8');
const replacements = [
  [`assert.equal(url.port, '${port}');`, "assert.equal(url.port, '55507');"],
  [`assert.equal(url.pathname, '${database}');`, "assert.equal(url.pathname, '/maya_ra_r01');"],
];
for (const [before, after] of replacements) {
  if (source.split(before).length !== 2) throw Error('Expected exact proof DB guard');
  source = source.replace(before, after);
}
// Provenance is emitted on stderr; stdout remains the original proof result.
process.stderr.write(JSON.stringify({proof: name, sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'), ownedDatabase: 'maya_ra_r01', guardChanges: 2}) + '\n');
module._compile(source, __filename);
