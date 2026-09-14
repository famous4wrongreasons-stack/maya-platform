/** Pure parse/execute proof of actual published PWA helper candidates. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../../../../node_modules/typescript');
const {sha}=require('./canonical-staff-overlay.cjs');
const repo=path.resolve(__dirname,'../../../../..');
const [candidate,output]=process.argv.slice(2);
const manifest=JSON.parse(fs.readFileSync(path.join(repo,'docs/rebuild/evidence/package5-wave-ra-r02-edge-overlay-manifest.json'),'utf8'));
const targets=[];let checks=0;
for(const row of manifest.overlays.filter(x=>x.kind==='pwa')){
 const source=fs.readFileSync(path.join(candidate,row.target),'utf8');if(sha(source)!==row.candidateSha256)throw Error('Unpinned PWA');
 const functions={};let scripts=0;
 for(const script of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  const ast=ts.createSourceFile('candidate.js',script[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);if(ast.parseDiagnostics.length)throw Error('PWA syntax failure');scripts++;
  function walk(node){if(ts.isFunctionDeclaration(node)&&['canonicalMayaTok','meSaasCurrentBundle','authReq','authPayload'].includes(node.name?.text))functions[node.name.text]=node.getText(ast);ts.forEachChild(node,walk)}walk(ast);
 }
 const runtime={window:{__meCurMode:'staff',Telegram:{WebApp:{initData:'raw'}}},tgInitData:()=> 'raw',tgAuth:()=>({id:100}),webTok:()=> 'legacy'};
 if(functions.canonicalMayaTok)runtime.canonicalMayaTok=()=> 'jwt';
 if(functions.meSaasCurrentBundle)runtime.meSaasCurrentBundle=()=>({token:'jwt'});
 const supported=!!(functions.canonicalMayaTok||functions.meSaasCurrentBundle);
 const panel=vm.runInNewContext('('+functions.authReq+')({})',runtime);const chat=vm.runInNewContext('('+functions.authPayload+')({})',runtime);
 if(supported){if(panel.headers.Authorization!=='Bearer jwt'||JSON.parse(panel.body).maya_token!=='jwt'||chat.payload.maya_token!=='jwt')throw Error('Canonical token missing');}
 else {if(panel.headers.Authorization||JSON.parse(panel.body).maya_token||chat.payload.maya_token)throw Error('Invented canonical auth');}
 if(chat.payload.mode!=='staff')throw Error('Lost requested mode');checks+=4;
 targets.push({target:row.target,sha256:row.candidateSha256,inlineScriptsParsed:scripts,canonicalAuthenticationExists:supported,behavior:supported?'Existing canonical token preserved before raw channel metadata':'No invented staff credential; server requires canonical sign-in',checks:4});
}
fs.writeFileSync(output,JSON.stringify({pass:true,checks,productionEffects:0,targets},null,2)+'\n');
process.stdout.write(JSON.stringify({pass:true,checks,targets:targets.length})+'\n');
