import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Browser } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010/maya-chat-shell/test/cdp-verify.mjs';
const root='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010';
const state=process.argv[2], output=process.argv[3];
assert.ok(state?.startsWith('/private/tmp/maya-yc-startup-diag-'));assert.ok(output?.startsWith('/tmp/maya-yc-startup-diagnostic-20261010/'));
const report={contract:'maya.local-yclients-read-actual-ui-readiness/1',result:'FAIL',http:[],screenshots:false,ownerCredentialsEntered:false,browserRequests:0,browserRefused:0};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let stage='wait_ready', child, browser, page, profile, listener, closed;
const bounded=async(p,ms=10000)=>{let t;try{return await Promise.race([p,new Promise((_,reject)=>{t=setTimeout(()=>reject(new Error('deadline')),ms)})]);}finally{clearTimeout(t)}};
try{
 let manifest;
 for(let n=0;n<240;n++){if(fs.existsSync(path.join(state,'manifest.json'))){manifest=JSON.parse(fs.readFileSync(path.join(state,'manifest.json'),'utf8'));if(manifest.status==='ready')break;assert.ok(!manifest.status.startsWith('failed'));}await delay(1000);}
 assert.equal(manifest.status,'ready');assert.equal(manifest.providerAdmission,'diagnostic_network_closed');assert.equal(manifest.diagnostic.credentialAccepted,false);
 report.source=manifest.source.head;const origin=new URL(manifest.webUrl).origin;assert.equal(new URL(origin).hostname,'127.0.0.1');const api=new URL(manifest.apiOrigin);assert.equal(api.hostname,'127.0.0.1');report.origin=origin;
 stage='http_readiness';
 for(const base of [api.origin,origin])for(const pathname of ['/api/health','/api/health/ready']){const r=await fetch(base+pathname,{redirect:'error',signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.length<65536);report.http.push({through:base===origin?'relay':'backend',path:pathname,status:r.status,sha256:hash(bytes)});}
 const index=await fetch(origin+'/?local_crm_setup=1',{redirect:'error',signal:AbortSignal.timeout(5000)});assert.equal(index.status,200);const html=await index.text();assert.ok(html.length<131072);assert.ok(index.headers.get('content-security-policy').includes("connect-src 'self'"));const script=/src="(\/m\/[A-Za-z0-9]+\/main\.js)"/.exec(html);assert.ok(script);const expected=fs.readFileSync(path.join(root,'maya-carrier-react/dist/web',script[1]));report.bundleSha256=hash(expected);
 const reply=await fetch(origin+script[1],{redirect:'error',signal:AbortSignal.timeout(5000)});assert.equal(reply.status,200);assert.equal(hash(Buffer.from(await reply.arrayBuffer())),report.bundleSha256);
 // Forbidden routes are real HTTP refusals; no provider body or auth material.
 for(const pathname of ['/api/integrations/crm/connect','/api/ai/chat']){const r=await fetch(api.origin+pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(5000)});assert.equal(r.status,403);await r.body.cancel();report.http.push({through:'backend',path:pathname,status:403});}
 stage='browser_start';
 const allocation=net.createServer();await new Promise(resolve=>allocation.listen(0,'127.0.0.1',resolve));const cdpPort=allocation.address().port;await new Promise(resolve=>allocation.close(resolve));
 profile=fs.mkdtempSync('/private/tmp/maya-yc-diag-chrome-');fs.chmodSync(profile,0o700);
 const policy=`(version 1)(allow default)(deny network*)(allow network-bind (local ip "localhost:${cdpPort}"))(allow network-inbound (local ip "localhost:${cdpPort}"))(allow network-outbound (remote ip "localhost:${new URL(origin).port}"))`;
 report.browserSandboxPolicy=policy;
 const args=['--headless=new','--js-flags=--max-old-space-size=256','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--disable-component-update','--disable-sync','--metrics-recording-only','--remote-debugging-port='+cdpPort,'--user-data-dir='+profile,'--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disable-quic','--disable-features=OptimizationHints,MediaRouter','about:blank'];
 child=spawn('/usr/bin/sandbox-exec',['-p',policy,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',...args],{detached:true,stdio:['ignore','ignore','ignore']});closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));report.chromePid=child.pid;
 let ws;
 for(let i=0;i<100;i++){assert.equal(child.exitCode,null);try{const r=await fetch(`http://127.0.0.1:${cdpPort}/json/version`,{signal:AbortSignal.timeout(500)});if(r.ok){const d=await r.json();ws=d.webSocketDebuggerUrl;break}}catch{}await delay(100)}
 assert.ok(ws?.startsWith(`ws://127.0.0.1:${cdpPort}/`));browser=new Browser(child,profile,ws);await bounded(browser.connect());page=await browser.newPage();
 listener=event=>{if(event.sessionId!==page.sessionId||event.method!=='Fetch.requestPaused')return;const {requestId,request}=event.params;const u=new URL(request.url);const allowed=request.method==='GET'&&u.origin===origin&&!u.username&&!u.password&&!u.hash&&(u.pathname==='/'&&u.search==='?local_crm_setup=1'||!u.search&&/^\/(?:styles\.css|manifest\.webmanifest|favicon\.ico|icons\/[a-z0-9-]+\.png|m\/[A-Za-z0-9]+\/main\.js)$/.test(u.pathname));if(allowed)report.browserRequests++;else report.browserRefused++;void page.send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId}:{requestId,errorReason:'BlockedByClient'});};
 browser.listeners.add(listener);await page.send('Network.setBypassServiceWorker',{bypass:true});await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 stage='react_render';await page.goto(origin+'/?local_crm_setup=1');assert.ok(await page.waitFor('document.body.innerText.includes("Создать бизнес") && document.body.innerText.includes("Войти по паролю")'));
 const entry=[...page.requests.values()].find(r=>new URL(r.url).pathname===script[1]);assert.ok(entry&&entry.status===200);const body=await page.responseBody(entry.requestId);assert.equal(hash(body),report.bundleSha256);assert.equal(report.browserRefused,0);
 Object.assign(report,{result:'PASS',currentReactRendered:true,normalSignupAndPasswordEntryVisible:true,actualServedBundleMatchesBuild:true,providerDispatch:'OS network denied; no provider action performed'});
}catch{report.failedStage=stage;process.exitCode=1;}
finally{
 if(browser&&listener)browser.listeners.delete(listener);if(page)await bounded(page.close(),2000).catch(()=>{});if(browser)await bounded(browser.close(),5000).catch(()=>{});
 if(child?.pid){try{process.kill(-child.pid,'SIGTERM')}catch{}await delay(200);try{process.kill(-child.pid,'SIGKILL')}catch{}if(closed)await bounded(closed,3000).catch(()=>{});try{process.kill(-child.pid,0);report.chromeGroupAbsent=false}catch(e){report.chromeGroupAbsent=e.code==='ESRCH'}}
 if(profile&&fs.existsSync(profile))fs.rmSync(profile,{recursive:true,force:true});
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
