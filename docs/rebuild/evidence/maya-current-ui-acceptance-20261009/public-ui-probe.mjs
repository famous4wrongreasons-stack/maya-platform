import fs from 'node:fs';
import path from 'node:path';
import { Browser } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-pricing-semantic-integration/maya-chat-shell/test/cdp-verify.mjs';
const output='/tmp/maya-ui-acceptance-inventory-20261009';
const report={qualification:'PUBLIC_SIGNED_OUT_UI_ONLY',url:'https://mayaos.ru/',status:'running',requests:[],snapshots:{},modelCalls:0,crmMutations:0};
let browser,page;
try {
 browser=await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
 report.chromePid=browser.child.pid;
 page=await browser.newPage();
 const guard=async event=>{
  if(event.sessionId!==page.sessionId||event.method!=='Fetch.requestPaused')return;
  const {request,requestId}=event.params;
  const u=new URL(request.url);
  const allowed=request.method==='GET'&&u.origin==='https://mayaos.ru'&&!u.username&&!u.password&&(!u.pathname.startsWith('/api/')||u.pathname==='/api/health');
  report.requests.push({method:request.method,path:u.pathname,allowed});
  await page.send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId}:{requestId,errorReason:'BlockedByClient'});
 };
 browser.listeners.add(e=>{void guard(e).catch(error=>{report.guardError=String(error);});});
 await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 await page.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 for(const stage of ['initial','reload']){
  await page.goto(report.url);
  await page.waitFor('document.body.innerText.trim().length>15',{timeoutMs:10000});
  report.snapshots[stage]=await page.eval('({title:document.title,text:document.body.innerText,controls:Q.all("button,input,textarea").filter(Q.visible).map(el=>({tag:el.tagName,name:Q.name(el)})),scripts:Array.from(document.scripts).map(s=>s.src)})');
  const {data}=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(output,stage+'.png'),Buffer.from(data,'base64'));
 }
 report.health=await page.eval('(async()=>{const r=await fetch("/api/health");return {status:r.status,body:await r.text()};})()');
 report.status='observed';
}catch(e){report.status='failed';report.error=String(e);}
finally{
 try{await page?.close();}finally{await browser?.close();report.ownedBrowserClosed=true;}
 fs.writeFileSync(path.join(output,'public-ui.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,snapshots:report.snapshots,health:report.health,error:report.error,requests:report.requests,ownedBrowserClosed:report.ownedBrowserClosed},null,2));
}
