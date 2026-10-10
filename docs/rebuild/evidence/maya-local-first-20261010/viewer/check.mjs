import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Browser } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-pricing-semantic-integration/maya-chat-shell/test/cdp-verify.mjs';
const root='/private/tmp/maya-local-first-viewer-20261010';
const r={contract:'maya.local-react-mock-viewer/1',origin:'http://127.0.0.1:8791',synthetic:true,realBackend:false,realCrm:false,modelCalls:0,status:'started',startedAt:new Date().toISOString()};
let browser,page;
try{
 browser=await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disable-quic']);
 page=await browser.newPage();await page.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await page.goto(r.origin+'/');
 const click=async name=>{assert(await page.waitFor(`Q.all('button').some(e=>Q.visible(e)&&Q.name(e)===${JSON.stringify(name)})`));assert(await page.click(`Q.all('button').find(e=>Q.visible(e)&&Q.name(e)===${JSON.stringify(name)})`));};
 await click('Войти по email');assert(await page.waitFor('!!Q.email()'));await page.fill('Q.email()','anna@example.test');await click('Получить код');assert(await page.waitFor('!!Q.code()'));await page.fill('Q.code()','246810');await click('Войти');
 r.composerVisible=Boolean(await page.waitFor('!!Q.composer()'));
 r.visibleText=await page.eval('document.body.innerText');r.status=r.composerVisible?'mock_login_pass':'mock_login_incomplete';
 r.requests=[...page.requests.values()].filter(q=>q.url.startsWith(r.origin+'/api/')).map(q=>({path:new URL(q.url).pathname,method:q.method,status:q.status}));
 const png=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(root+'/viewer.png',Buffer.from(png.data,'base64'));
}catch(e){r.status='failed';r.error=String(e).slice(0,500)}
finally{await browser?.close();r.browserClosed=true;r.finishedAt=new Date().toISOString();fs.writeFileSync(root+'/result.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2));}
