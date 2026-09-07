const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),ts=require(root+'/maya-saas-backend/node_modules/typescript');
const html=fs.readFileSync(root+'/сайт и приложение/app.html','utf8');
function readFunction(name,source=html){let found;for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){const sf=ts.createSourceFile('app.js',m[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name){assert.equal(found,undefined);found=n.getText(sf)}ts.forEachChild(n,walk)}walk(sf)}return found;}
const helper=readFunction('meCanonicalWorkCommand');let checks=0;
function check(value,label){assert.ok(value,label);checks++}
function context(ns='tenant-a',user='user-a') {const calls=[];const ctx={window:{__ME_SAAS_CTX:{ns,api:'https://synthetic.invalid/api'}},crypto:crypto.webcrypto,TextEncoder,Promise,Uint8Array,Array,JSON,Error,String,meWidgetAf:(...args)=>{calls.push(args);return Promise.resolve({executionId:'synthetic'})}};vm.createContext(ctx);vm.runInContext(helper,ctx);return{calls,run:(body={title:'Task'},logical='signal-a')=>ctx.meCanonicalWorkCommand(logical,'create',body,user),ctx};}
(async()=>{
 const a=context();await Promise.all(Array.from({length:4},()=>a.run()));check(new Set(a.calls.map(c=>c[1].headers['Idempotency-Key'])).size===1,'same tab concurrent identity');
 const b=context();await b.run();check(a.calls[0][1].headers['Idempotency-Key']===b.calls[0][1].headers['Idempotency-Key'],'independent tab/restart same identity');
 await b.run({title:'Changed'});check(b.calls[0][1].headers['Idempotency-Key']===b.calls[1][1].headers['Idempotency-Key'],'changed business input same identity for owner conflict');
 check(JSON.parse(b.calls[1][1].body).title==='Changed','changed input not silently replayed as old intent');
 for(const other of [context('tenant-b'),context('tenant-a','user-b')]){await other.run();check(other.calls[0][1].headers['Idempotency-Key']!==a.calls[0][1].headers['Idempotency-Key'],'scope separation')}
 const bad=context();bad.ctx.window.__ME_SAAS_CTX={};let rejected=false;try{await bad.run()}catch{rejected=true}check(rejected&&bad.calls.length===0,'missing canonical scope no dispatch');
 check(!helper.includes('randomUUID')&&!helper.includes('localStorage'),'no non-atomic identity allocation');
 const {transform}=require('./package5-wave-rb-r04-pwa-overlay.cjs');
 const baseline=process.argv[2],targets=[];
 if(baseline){for(const row of JSON.parse(fs.readFileSync(baseline))){const source=fs.readFileSync(row.path,'utf8');check(crypto.createHash('sha256').update(source).digest('hex')===row.sha256,'exact baseline');const candidate=transform(source,root);let parsed=0;for(const m of candidate.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(m[1].trim()&&!/type=['"]application\/ld\+json/.test(m[0].slice(0,m[0].indexOf('>')))){new Function(m[1]);parsed++}}
 const auth=/function\s+(canonicalMayaTok|meSaasCurrentBundle)\s*\(/.test(source);
 check(!!readFunction('meCanonicalWorkCommand',candidate)===auth,'historical aliases retain no-auth retirement');
 if(!auth){for(const name of ['runAutonomyTick','createControlFromSignal','updateStaffTask']){const fn=readFunction(name,candidate);if(fn)check(!/fetch\(|meWidgetAf\(|gfetch\(/.test(fn),'historical control no request')}}
 targets.push({target:row.target,before:row.sha256,after:crypto.createHash('sha256').update(candidate).digest('hex'),inlineScripts:parsed,canonicalAuthentication:auth,changed:candidate!==source});}}
 console.log(JSON.stringify({package:'R04',status:'PASS',checks,targets,productionEffects:0},null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
