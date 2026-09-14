// Follow-up to the certified identity release: one inline motion block only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const before=fs.readFileSync(process.argv[2],'utf8');
assert.equal(hash(before),'59bd3301dc16ae6f16828a8def6ed1d3c978a205af07e70e4a8cbb2624b03077');
const pattern=/<script id="maya-identity-source">[\s\S]*?<\/script>/g;
assert.equal([...before.matchAll(pattern)].length,1);
const block='<script id="maya-identity-source">\n'+fs.readFileSync(path.join(root,'сайт и приложение/assets/maya-identity.js'),'utf8')+'\n</script>';
const after=before.replace(pattern,()=>block);
assert.equal(before.replace(pattern,''),after.replace(pattern,''));
const chapter7=require(path.join(root,'maya-saas-backend/deploy/platform/chapter7-consumers/verify-pwa.cjs')).verifyPwa(after);
fs.writeFileSync(process.argv[3],after);
console.log(JSON.stringify({before:hash(before),after:hash(after),changedBlocks:1,unchangedOutsideMotion:true,chapter7},null,2));
