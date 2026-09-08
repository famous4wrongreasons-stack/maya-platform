// Verifies the actual composed production variants, not only source snippets.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../../..'),ts=require(repo+'/maya-saas-backend/node_modules/typescript');
const evidence=process.argv[2];assert(evidence);
const root=path.resolve(evidence),stage=path.join(root,'composed-v5');
const manifest=JSON.parse(fs.readFileSync(path.join(stage,'edge-manifest.json'),'utf8'));
const prior=JSON.parse(fs.readFileSync(path.join(root,'edge-current.private.json'),'utf8'));
function functions(source,html=true){const result=new Map();const parts=html?[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/application\/ld\+json/.test(m[1])).map(m=>m[2]):[source];for(const part of parts){if(!part.trim())continue;new Function(part);const sf=ts.createSourceFile('candidate.js',part,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);const walk=n=>{if(ts.isFunctionDeclaration(n)&&n.name){const name=n.name.text;result.set(name,[...(result.get(name)||[]),n.getText(sf)]);}ts.forEachChild(n,walk);};walk(sf);}return result;}
const snippetFiles=['r05-report-downloads.js','r08-native-feedback.js','r09-community-moderation.js','r11-governed-settings.js','r12-team-communications.js','r13-expense-intake.js','r14-cash-declaration.js'];
const snippets=new Map();for(const file of snippetFiles){const source=fs.readFileSync(path.join(repo,'maya-saas-backend/deploy/platform/beget-edge/rc',file),'utf8');const sf=ts.createSourceFile('source.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);for(const n of sf.statements){if(ts.isFunctionDeclaration(n)&&n.name&&n.name.text!=='ATeamChat')snippets.set(n.name.text,n.getText(sf));}}
let aliases=0,functionsChecked=0,nativeProtected=0;
for(const item of manifest.files.filter(i=>i.artifact.endsWith('.html'))){const text=fs.readFileSync(path.join(stage,'edge',item.artifact),'utf8');const actual=functions(text);for(const [name,source]of snippets){assert.deepEqual(actual.get(name),[source],item.file+': '+name);functionsChecked++;}
 const previous=prior.find(i=>i.target===item.file);if(previous){const old=functions(Buffer.from(previous.sourceBase64,'base64').toString());for(const name of ['AMayaConsent','meMayaConsentPendingKey','meMayaConsentPending','meMayaConsentTransition']){assert.deepEqual(actual.get(name),old.get(name),item.file+': security consent changed');if(old.has(name))nativeProtected++;}}
 assert(!text.includes('action=team_chat_media'));aliases++;
}
for(const name of ['salon/app/maya-native-api.php','mayaos/maya-platform-api.php']){const r=manifest.files.find(i=>i.file===name);assert(r&&r.before===r.after);}
console.log(JSON.stringify({status:'PASS',pwaAliases:aliases,exactCanonicalFunctions:functionsChecked,nativeSecurityFunctionsPreserved:nativeProtected,unchangedNativePHP:2,productionWrites:0}));
