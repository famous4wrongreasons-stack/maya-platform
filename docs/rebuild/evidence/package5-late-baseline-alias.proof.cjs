// Exact known alias bytes; existing pure R01 boundary. No application/network imports.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const [s,r,scratch]=process.argv.slice(2);
assert.ok(s&&r&&scratch,'Pass evidence scratch directory, repository, and prior wave scratch parent');
const boundary=require(r+'/maya-saas-backend/deploy/platform/beget-edge/client-initiator-boundary.cjs');
const edge=JSON.parse(fs.readFileSync(s+'/edge.json','utf8'));
const manifest=JSON.parse(fs.readFileSync(scratch+'/package5-wave-rb-implementation/composed-v4/edge/manifest.json','utf8'));
const rows=[];
for (const row of edge.rows) {
 const artifact=manifest.files.find(x=>x.destination===row.path);
 const p=artifact ? scratch+'/package5-wave-rb-implementation/composed-v4/edge/'+artifact.artifact :
 row.target==='mayaos/maya-platform-api.php' ? r+'/maya-saas-backend/deploy/platform/beget-edge/maya-platform-api.php' :
 scratch+'/package5-wave-ra-implementation/edge-candidate/'+row.target;
 const source=fs.readFileSync(p,'utf8');assert.equal(crypto.createHash('sha256').update(source).digest('hex'),row.currentSha256);
 let result;
 if (row.target.endsWith('.html')) result=boundary.assertRetiredPwa(source);
 else if (row.target.includes('/api-proxy')) result=boundary.assertRetiredPhp(source);
 else {
  assert.ok(source.includes("'Idempotency-Key'"));assert.ok(source.indexOf('maya_forwarded_idempotency_key($requestHeaders')<source.indexOf('curl_init('));
  assert.equal((source.match(/curl_exec\(/g)||[]).length,1);
  assert.ok(source.includes("'https://maya.111.88.148.206.nip.io/api'"));
  result='exact relay bytes; helper equivalence/parser proof recorded separately';
 }
 rows.push({target:row.target,sha256:row.currentSha256,result});
}
assert.equal(rows.length,9);assert.equal(new Set(rows.map(x=>x.target)).size,9);
const proof={status:'PASS',aliases:rows,applicationImports:0,networkCalls:0,providerCalls:0,databaseConnections:0};
fs.writeFileSync(s+'/alias-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:'PASS',aliases:rows.length}));
