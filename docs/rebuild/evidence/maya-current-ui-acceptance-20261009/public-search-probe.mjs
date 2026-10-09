import fs from 'node:fs';
import path from 'node:path';
import { Browser } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-pricing-semantic-integration/maya-chat-shell/test/cdp-verify.mjs';
const output='/tmp/maya-ui-acceptance-inventory-20261009';
const report={qualification:'PUBLIC_SIGNED_OUT_BUSINESS_SEARCH_ONLY',url:'https://mayaos.ru/',status:'running',requests:[],snapshots:{},modelCalls:0,crmMutations:0};
let browser,page;
try {
 browser=await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
 report.chromePid=browser.child.pid;
 page=await browser.newPage();
 const guard=async event=>{
  if(event.sessionId!==page.sessionId||event.method!=='Fetch.requestPaused')return;
  const {request,requestId}=event.params;
  const u=new URL(request.url);
  const allowed=request.method==='GET'&&u.origin==='https://mayaos.ru'&&!u.username&&!u.password&&(!u.pathname.startsWith('/api/')||(u.pathname==='/api/mobile/pwa/search'&&u.searchParams.get('q')==='Мужская Эстетика'&&Array.from(u.searchParams.keys()).every(k=>k==='q')));
  report.requests.push({method:request.method,path:u.pathname,allowed});
  await page.send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId}:{requestId,errorReason:'BlockedByClient'});
 };
 browser.listeners.add(e=>{void guard(e).catch(error=>{report.guardError=String(error);});});
 await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 await page.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await page.goto(report.url);
 await page.waitFor('!!Q.byName("button",/^Найти$/)');
 report.before=await page.eval('({text:document.body.innerText,controls:Q.all("button,input").filter(Q.visible).map(el=>({tag:el.tagName,name:Q.name(el)}))})');
 await page.fill('Q.all("input").find(el=>Q.name(el)==="Название или город")','Мужская Эстетика');
 await page.click('Q.byName("button",/^Найти$/)');
 await page.waitFor('Q.all("[role=alert]").some(el=>Q.text(el)) || /Нет связи|недоступ|не удалось|Ошибка/.test(document.body.innerText)',{timeoutMs:20000});
 report.after=await page.eval('({text:document.body.innerText,controls:Q.all("button,input").filter(Q.visible).map(el=>({tag:el.tagName,name:Q.name(el)}))})');
 report.api=[];
 for(const req of page.apiRequests('/mobile/pwa/search')){
  let responseBody;
  if(req.finishedAt) responseBody=await page.responseBody(req.requestId);
  report.api.push({method:req.method,status:req.status,failed:req.failed,responseBody});
 }
 const {data}=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 fs.writeFileSync(path.join(output,'business-search.png'),Buffer.from(data,'base64'));
 report.status='observed';
}catch(e){report.status='failed';report.error=String(e);}
finally{
 try{await page?.close();}finally{await browser?.close();report.ownedBrowserClosed=true;}
 fs.writeFileSync(path.join(output,'public-search.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,before:report.before,after:report.after,api:report.api,error:report.error,requests:report.requests,ownedBrowserClosed:report.ownedBrowserClosed},null,2));
}
