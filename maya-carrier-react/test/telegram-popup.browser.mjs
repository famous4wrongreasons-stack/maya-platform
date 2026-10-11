// Actual emitted React/runtime/callback; all backend and Telegram responses are synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { Browser, Page } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { createReadWebServer } from '../../maya-saas-backend/scripts/local-yclients-read.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2];
assert.match(output ?? '', /^\/(?:private\/)?tmp\/maya-telegram-browser-[\w-]+$/);
assert.equal(fs.existsSync(output), false); fs.mkdirSync(output, { mode: 0o700 });
const verified = spawnSync(process.execPath,['build.mjs','--target=web','--verify-output'],{cwd:root,encoding:'utf8'});
fs.writeFileSync(path.join(output,'packaging.log'),verified.stdout+verified.stderr);
assert.equal(verified.status,0,'source-bound web payload required');
const report = { contract: 'maya.telegram-web-return.synthetic-browser/1', candidate: execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8'}).trim(),
  dirtySource: Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),
  networkBoundary:'CDP interception plus deny proxy/resolver; no OS-wide packet claim',
  actualReact:true,actualRuntime:true,actualCallback:true,actualLocalWebBoundary:true,actualBackend:false,realProvider:false,
  checks:[],starts:0,completes:0,externalRequestsDispatched:0,interceptedProvider:0,callbackRequests:[],
  sourceHashes:Object.fromEntries(['src/runtime/compose.ts','src/runtime/telegramPopup.ts','src/signin/SignIn.tsx','../maya-chat-shell/src/net/session.ts','../maya-saas-backend/deploy/platform/beget-edge/oauth-callback.html','../maya-saas-backend/scripts/local-telegram-return.mjs','../maya-saas-backend/scripts/local-yclients-read.mjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])) };
let origin,state,browser,page,popup,providerReady,deadline,web;
const errors=[];
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin);let raw='';for await(const chunk of req)raw+=chunk;
    if(req.method==='GET'&&url.pathname==='/api/mobile/pwa/search')return json(res,{items:[{name:'Synthetic salon',tenant_slug:'synthetic-salon',address:null}]});
    if(req.method==='POST'&&url.pathname==='/api/auth/oauth/telegram/start'){
      assert.deepEqual(JSON.parse(raw),{tenantSlug:'synthetic-salon',platform:'web',redirectUri:origin+'/oauth-callback.html'});
      state='te_synthetic_state_'+(++report.starts);return json(res,{ok:true,provider:'telegram',state,auth_url:'https://oauth.telegram.org/auth?client_id=1&state='+state});
    }
    if(req.method==='POST'&&url.pathname==='/api/auth/oauth/telegram/complete'){
      assert.deepEqual(JSON.parse(raw),{state,code:'synthetic-code'});report.completes++;
      return json(res,{access_token:'synthetic-only',refresh_token:'synthetic-only-refresh',expires_in:900,refresh_expires_at:'2099-01-01T00:00:00.000Z',user:{name:'Synthetic user',tenant:{name:'Synthetic salon'}},provider:'telegram',is_new_user:false},201);
    }
    if(req.method==='GET'&&url.pathname==='/api/ai/conversation')return json(res,{contract:'maya.conversation-history/1',conversationId:null,truncated:false,interrupted:false,turns:[]});
    if(req.method==='POST'&&url.pathname==='/api/widgets/resolve')return json(res,{tenant_bound:true,widgets:[]});
    res.writeHead(403);res.end();
  }catch(e){errors.push(e.message);if(!res.headersSent)res.writeHead(500);res.end();}
});
const button=text=>`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(text)}))`;
const check=async(expr,label,which=page)=>{assert.ok(await which.waitFor(expr),label);report.checks.push(label);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await pause(50);}throw new Error(label);};
async function intercept(sessionId,event){
  const url=new URL(event.request.url);
  if(url.origin===origin)return browser.send('Fetch.continueRequest',{requestId:event.requestId},sessionId);
  if(url.origin==='https://oauth.telegram.org'&&url.pathname==='/auth'){
    report.interceptedProvider++;
    const returning=url.searchParams.get('synthetic_callback');
    if(returning!==null){
      await browser.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:302,responseHeaders:[{name:'Location',value:origin+'/oauth-callback.html?'+returning},{name:'Cache-Control',value:'no-store'}],body:''},sessionId);return;
    }
    const body='<!doctype html><meta charset="utf-8"><title>Synthetic Telegram</title><p>Isolated provider fixture</p>';
    await browser.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'},{name:'Cache-Control',value:'no-store'}],body:Buffer.from(body).toString('base64')},sessionId);
    providerReady=true;return;
  }await browser.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'},sessionId);
}
async function start(){
  popup=null;providerReady=false;await page.goto(origin+'/');
  await check(`!!document.querySelector('textarea[aria-label="Название салона"]')`,'finder rendered');
  await page.fill('document.querySelector(\'textarea[aria-label="Название салона"]\')','Synthetic');
  assert.ok(await page.click(button('Найти салон')));await check(`!!${button('Synthetic salon')}`,'synthetic salon selectable');
  assert.ok(await page.click(button('Synthetic salon')));await until(()=>popup&&providerReady,'owned popup/provider fixture');
  await check('location.origin === "https://oauth.telegram.org"','actual cross-origin provider window',popup);
  assert.equal(await popup.eval('window.opener'),null,'provider has no opener');
  assert.equal(await page.eval('location.href'),origin+'/','parent retained');
  await check(`${button('Synthetic salon')}.getAttribute('aria-disabled') === 'false'`,'handoff releases busy UI');
}
async function land(query){await popup.eval('location.replace('+JSON.stringify('https://oauth.telegram.org/auth?synthetic_callback='+encodeURIComponent(query))+')');}
try{
  deadline=setTimeout(()=>{errors.push('deadline');void browser?.close();server.closeAllConnections();server.close();},90000);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const env={PORT:String(server.address().port),CORS_ALLOWED_ORIGINS:'http://127.0.0.1:59992'};
  web=createReadWebServer({diagnosticNoProvider:true},env);
  web.server.prependListener('request',req=>{
    if(req.url?.startsWith('/oauth-callback.html?'))report.callbackRequests.push({
      method:req.method,site:req.headers['sec-fetch-site']??null,
      mode:req.headers['sec-fetch-mode']??null,destination:req.headers['sec-fetch-dest']??null,
    });
  });
  await web.listen(0);origin='http://127.0.0.1:'+web.server.address().port;env.CORS_ALLOWED_ORIGINS=origin;
  browser=await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
    '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disable-quic','--disable-features=OptimizationHints,MediaRouter']);
  browser.listeners.add(msg=>{
    if(msg.method==='Fetch.requestPaused')void intercept(msg.sessionId,msg.params).catch(e=>errors.push(e.message));
    if(msg.method==='Target.attachedToTarget')void(async()=>{
      const p=msg.params;
      if (!page || p.targetInfo.targetId === page.targetId || p.targetInfo.type !== 'page' || p.targetInfo.browserContextId !== page.browserContextId) {
        await browser.send('Runtime.runIfWaitingForDebugger',{},p.sessionId); return;
      }
      const childPage = new Page(browser,p.sessionId,p.targetInfo.targetId,page.browserContextId);
      await childPage.enable();await childPage.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
      popup=childPage;await childPage.send('Runtime.runIfWaitingForDebugger');
    })().catch(e=>errors.push(e.message));
  });
  page=await browser.newPage();await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await browser.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'page',exclude:false},{exclude:true}]});
  await start();const firstMain=await page.eval('performance.timeOrigin');
  await page.eval('window.dispatchEvent(new CustomEvent("maya:oauth-callback",{detail:'+JSON.stringify({state,code:'synthetic-code'})+'}))');
  await page.eval('window.postMessage('+JSON.stringify({state,code:'synthetic-code'})+',location.origin)');
  await pause(250);assert.equal(report.completes,0);report.checks.push('web ignores injected native event and message');
  await land('state='+state+'&code=synthetic-code');
  await check("location.pathname === '/oauth-callback.html' && location.search === ''",'callback query erased in actual browser',popup);
  await page.send('Page.bringToFront');
  await check(`!!document.querySelector('[role="log"]')`,'real AChat opens after callback');
  assert.ok(report.callbackRequests.some(r=>r.method==='GET'&&r.site==='cross-site'&&r.mode==='navigate'&&r.destination==='document'));
  report.checks.push('actual provider cross-site document return admitted by launcher boundary');
  assert.equal(await page.eval('performance.timeOrigin'),firstMain);assert.equal(report.completes,1);report.checks.push('one completion; no parent reload');
  const shot=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'signed-in.png'),Buffer.from(shot.data,'base64'));
  await start();await land('state='+state+'&error=access_denied');await check("document.body.innerText.includes('Вход через Telegram отменён')",'decline shown');assert.equal(report.completes,1);
  await start();await land('state=te_synthetic_foreign&code=synthetic-code');await check("document.body.innerText.includes('Этот вход начали не здесь')",'substituted state refused');assert.equal(report.completes,1);
  await start();await browser.send('Target.closeTarget',{targetId:popup.targetId});await check("document.body.innerText.includes('Вход через Telegram отменён')",'manual close releases attempt');assert.equal(report.completes,1);
  await start();const abandonedState=state;await page.reload();await page.goto(origin+'/oauth-callback.html?state='+abandonedState+'&code=synthetic-code');
  await check("location.pathname === '/oauth-callback.html' && location.search === ''",'standalone callback query erased');await pause(500);assert.equal(report.completes,1);report.checks.push('reload/standalone cannot create session');
  assert.deepEqual(errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.message;report.screen=await page?.eval('document.body.innerText.slice(0,500)').catch(()=>null);process.exitCode=1;}
finally{clearTimeout(deadline);if(browser)await browser.close();if(web){web.server.closeAllConnections();await web.close();}server.closeAllConnections();await new Promise(r=>server.close(r));report.ownedBrowserStopped=!browser||browser.child.exitCode!==null||browser.child.signalCode!==null;report.listenerStopped=!server.listening&&(!web||!web.server.listening);report.errors=errors;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
