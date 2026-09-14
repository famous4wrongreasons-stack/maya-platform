// Exact e5ec27fd AMayaConsent base; only the approved component and three helpers.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),ts=require(root+'/maya-saas-backend/node_modules/typescript');
const hash=(text)=>crypto.createHash('sha256').update(text).digest('hex');
function fn(html,name){let found;for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){const sf=ts.createSourceFile('pwa.js',m[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name){assert(!found);found=n.getText(sf)}ts.forEachChild(n,walk)}walk(sf)}return found;}
function transform(source){const previous=fn(source,'AMayaConsent');assert(previous);assert.equal(hash(previous),'e9ba9707491c12bddefd370bd16c3987a6e60ea070a70247bdd674a2b2252cd3');
 const canonical=fs.readFileSync(root+'/сайт и приложение/app.html','utf8');
 const names=['meMayaConsentPendingKey','meMayaConsentPending','meMayaConsentTransition'];for(const name of names)assert(!fn(source,name));
 const replacement=[...names,'AMayaConsent'].map(name=>{const code=fn(canonical,name);assert(code);return code;}).join('\n');
 const candidate=source.replace(previous,replacement);assert.equal(candidate.replace(replacement,previous),source,'Unrelated bytes changed');
 let scripts=0;for(const m of candidate.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!m[2].trim()||/type=['"]application\/ld\+json/.test(m[1]))continue;new Function(m[2]);scripts++;}
 return {candidate,proof:{expectedComponent:hash(previous),resultComponent:hash(fn(candidate,'AMayaConsent')),unrelatedByteChanges:0,inlineScripts:scripts,before:hash(source),after:hash(candidate)}};
}
module.exports={transform};
