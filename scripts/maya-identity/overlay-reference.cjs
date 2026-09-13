// Bounded follow-up: reference renderer and voice presentation width only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const before=fs.readFileSync(process.argv[2],'utf8');
assert.equal(hash(before),'2d85dbe8a0d6afa3b0c5c10a4afae31bcbaf1b7c987c2016d60bc9877a245f80');
const pattern=/<script id="maya-identity-source">[\s\S]*?<\/script>/g;
assert.equal([...before.matchAll(pattern)].length,1);
const voice="e(MayaMarkAnimated,{size:76,state:vmSpeaking?'responding':sending?'thinking':'recording'})";
const wide="e(MayaMarkAnimated,{size:76,style:{width:'min(340px, calc(100vw - 32px))'},state:vmSpeaking?'responding':sending?'thinking':'recording'})";
assert.equal(before.split(voice).length,2);
const block='<script id="maya-identity-source">\n'+fs.readFileSync(path.join(root,'сайт и приложение/assets/maya-identity.js'),'utf8')+'\n</script>';
const after=before.replace(pattern,()=>block).replace(voice,wide);
assert.equal(before.replace(pattern,'').replace(voice,''),after.replace(pattern,'').replace(wide,''));
const chapter7=require(path.join(root,'maya-saas-backend/deploy/platform/chapter7-consumers/verify-pwa.cjs')).verifyPwa(after);
const reference=hash(fs.readFileSync(path.join(root,'сайт и приложение/maya-motion-reference.png')));
assert.equal(reference,'b57b04948f6b029ba9eb10ed186cf03e408cb78ea8911103eed83eb4f35ef385');
fs.writeFileSync(process.argv[3],after);
console.log(JSON.stringify({before:hash(before),after:hash(after),reference,changedBlocks:2,unchangedOutsideMotionAndVoiceWidth:true,chapter7},null,2));
