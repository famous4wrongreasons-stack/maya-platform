// Actual emitted React + runtime, isolated synthetic HTTP only. No retained DB or keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { readTree } from '../tools/payload-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
assert.match(out ?? '', /^\/(?:private\/)?tmp\/maya-companion-[\w-]+$/);
assert.equal(fs.existsSync(out), false);
fs.mkdirSync(out, { mode:0o700 });
const files = readTree(path.join(root, 'dist/web'));
const report = { candidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  dirtySource:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),
  contract:'maya.companion.ideas-ui/1', realBackend:false, realProviders:false, realKeys:false,
  payload:Object.fromEntries([...files].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')])),
  checks:[], screenshots:[], externalRequests:0, unexpected:[] };
const cid='10000000-0000-4000-8000-000000000001';
const turns=[
  {id:'10000000-0000-4000-8000-000000000002',role:'user',text:'Maya, с чего начнём?',createdAt:'2026-10-13T09:00:00.000Z',completed:true},
  {id:'10000000-0000-4000-8000-000000000003',role:'assistant',text:'Привет! Давай посмотрим, что тебя интересует. Можем обсудить услуги или вернуться к истории визитов.',createdAt:'2026-10-13T09:00:01.000Z',completed:true},
];
const wire=[];
let browser, page, origin, mode='normal', pending=null;
const item=(patch={})=>({contract:'c8.valuation.read/1',version:1,id:'result-one',revision:1,snapshotHash:'a'.repeat(64),mode:'immutable_snapshot',kind:'OBSERVED_VALUE',subject:{kind:'tenant',id:'PRIVATE_TENANT'},current:true,available:true,asOf:'2026-10-13T08:00:00.000Z',expiresAt:'2099-10-14T10:00:00.000Z',period:{from:'2026-10-01T00:00:00.000Z',to:'2026-10-13T08:00:00.000Z',timezone:'Europe/Moscow'},completeness:'PARTIAL',qualification:'VERIFIED',message:'Результат рассчитан по указанным фактам и подтверждённому правилу.',boundaries:{factIsPrediction:false,predictionIsPolicy:false,valueImpliesConsent:false,rankingImpliesContactPermission:false,rankingImpliesActionAuthority:false,opportunityImpliesExecution:false},numericPrediction:null,activation:'DISABLED',values:[{value:'PRIVATE_AMOUNT'}],ranking:{members:[{id:'PRIVATE_CLIENT'}]},...patch});
const ideasBody=()=>({contract:'c8.valuation.list/1',numericPredictionsAvailable:false,nextCursor:mode==='cap'?'more':null,items:mode==='empty'?[]:mode==='long'?Array.from({length:25},(_,i)=>item({id:'result-'+i})):[item(mode==='substituted'?{snapshotHash:'b'.repeat(64)}:mode==='expiry'?{expiresAt:new Date(Date.now()+2000).toISOString()}:{}),item({id:'prediction',kind:'PREDICTION',available:false,message:'Прогноз пока недоступен — недостаточно проверенных данных.'})]});
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url.startsWith('/api/')) {
    const data=body?JSON.parse(body):null;wire.push({path:req.url,method:req.method,body:data});
    if(req.url==='/api/auth/login')return json(res,{access_token:'synthetic-only',refresh_token:'synthetic-only-refresh',expires_in:900,refresh_expires_at:'2099-01-01T00:00:00.000Z',user:{name:'Тестовый пользователь',tenant:{name:'Учебный салон'}}},201);
    if(req.url==='/api/ai/conversation')return json(res,{contract:'maya.conversation-history/1',conversationId:cid,truncated:false,interrupted:false,turns});
    if(req.url==='/api/analytics/valuations'){
      if(mode==='delayed'){pending=res;return;}
      if(mode==='denied')return json(res,{},403);
      if(mode==='malformed')return json(res,{contract:'forged',items:[]});
      return json(res,ideasBody());
    }
    if(req.url==='/api/widgets/resolve')return json(res,{contract:'maya.widget.resolve/1',tenant_bound:true,widgets:[]});
    report.unexpected.push(req.url);return json(res,{message:'synthetic_route_refused'},403);
  }
  const file=req.url==='/'?'index.html':req.url.slice(1);
  const bytes=files.get(file);
  if(req.method!=='GET'||!bytes){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('webmanifest')?'application/manifest+json':'text/html','Cache-Control':'no-store'});
  res.end(bytes);
});
const button=text=>`Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent.trim())===${JSON.stringify(text)})`;
const composer=`document.querySelector('textarea[aria-disabled]')`;
const check=async(expression,name)=>{assert.ok(await page.waitFor(expression),name);report.checks.push(name);};
const click=async(name)=>assert.ok(await page.click(button(name)),name);
const screenshot=async name=>{
  const {data}=await page.send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));report.screenshots.push(name+'.png');
};
const size=async(width,height)=>page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
    '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disable-quic']);
  page=await browser.newPage();
  browser.listeners.add(msg=>{
    if(msg.method!=='Fetch.requestPaused')return;
    const url=new URL(msg.params.request.url);
    if(url.origin===origin||url.protocol==='data:')void browser.send('Fetch.continueRequest',{requestId:msg.params.requestId},msg.sessionId);
    else {report.externalRequests++;void browser.send('Fetch.failRequest',{requestId:msg.params.requestId,errorReason:'BlockedByClient'},msg.sessionId);}
  });
  await page.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});await size(393,852);
  await page.goto(origin+'/');await check(`!!${button('Войти по паролю')}`,'real emitted sign-in');
  await screenshot('signin-393');
  await click('Войти по паролю');
  await page.fill('document.querySelector(\'input[type="text"]\')','synthetic-salon');
  await page.fill('document.querySelector(\'input[type="email"]\')','owner@example.invalid');
  await page.fill('document.querySelector(\'input[type="password"]\')','synthetic-password');
  await click('Войти');
  await check(`document.querySelectorAll('[data-chat-message]').length===2 && ${composer}?.readOnly===false`,'history restored through canonical runtime');

  const open=async(name)=>{await click('Открыть меню');assert.ok(await page.click(`[...document.querySelectorAll('.companion-menu-row')].find(b=>b.textContent.startsWith(${JSON.stringify(name)}))`));};
  const close=async()=>{await click('Вернуться к разговору');await check(`${composer}.getBoundingClientRect().height>0`,'composer visible after close');};
  const loaded=()=>check("document.querySelectorAll('.companion-ideas-list li').length===2",'canonical retained metadata rendered');
  const read=()=>click('Посмотреть основание ↗');
  const reads=()=>wire.filter(x=>x.path==='/api/analytics/valuations');
  await page.fill(composer,'Черновик — сохранить');assert.equal(reads().length,0);report.checks.push('no Ideas reads on mount');
  await open('Идеи');await loaded();
  await check("document.activeElement.id==='maya-ideas-heading'",'Ideas heading focused');
  await check(`${composer}.getBoundingClientRect().height===0`,'composer hidden in Ideas');
  await check("!document.body.innerText.includes('PRIVATE_')",'raw C8 source data absent from DOM');
  await check("document.body.innerText.includes('Готовые рекомендации и планы действий пока не подключены')",'no pretend actionable ideas');
  for(const width of [320,393,427,1280]){await size(width,852);await check("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.companion-ideas').scrollWidth<=document.querySelector('.companion-ideas').clientWidth",'no overflow '+width);await screenshot('ideas-'+width);}
  await size(393,852);const before=reads().length;await read();
  await check("!!document.querySelector('.companion-idea-detail')",'exact detail shown');assert.equal(reads().length,before+1);report.checks.push('opening detail rereads current source');
  await check("document.body.innerText.includes('Europe/Moscow') && document.body.innerText.includes('Часть данных отсутствует')",'source timezone and partial coverage shown');
  await screenshot('ideas-detail-393');await page.press('Escape');await loaded();
  await check("document.activeElement.id==='maya-ideas-heading'",'back restores heading');await page.press('Escape');
  await check(`${composer}===document.activeElement && ${composer}.value==='Черновик — сохранить'`,'close restores draft and composer focus');
  await open('Идеи');await loaded();mode='substituted';await read();await check("!document.querySelector('.companion-idea-detail') && document.querySelector('[role=status]').textContent.includes('больше недоступен')",'digest substitution cannot open detail');
  mode='normal';await click('Обновить расчёты');await loaded();mode='denied';await read();await check("!document.querySelector('.companion-ideas-list li,.companion-idea-detail') && document.querySelector('[role=status]').textContent.includes('недоступны')",'denial clears all cached content');await screenshot('ideas-denied');
  mode='malformed';await click('Обновить расчёты');await check("document.querySelector('[role=status]').textContent.includes('Не удалось проверить') && !document.querySelector('.companion-tasks-empty')",'malformed response not empty success');
  mode='normal';await click('Обновить расчёты');await loaded();mode='delayed';await read();await check("document.querySelector('[role=status]').textContent.includes('Проверяю')",'pending read explicit');await close();if(pending){json(pending,ideasBody());pending=null;}await check("!document.querySelector('.companion-ideas')",'late response cannot reopen Ideas');
  mode='long';await open('Идеи');await check("document.querySelectorAll('.companion-ideas-list li').length===25",'bounded long list');
  await page.eval("document.querySelector('.maya-chat-lane').scrollTop=1100");
  await page.click("document.querySelectorAll('.companion-ideas-list button')[8]");
  await check("!!document.querySelector('.companion-idea-detail') && document.querySelector('.maya-chat-lane').scrollTop===0",'detail opens at top from scrolled list');
  await click('← К расчётам');await check("document.querySelector('.maya-chat-lane').scrollTop>900",'list scroll restored');await close();
  mode='cap';await open('Идеи');await loaded();await check("document.body.innerText.includes('Это часть списка.')",'pre-filter page boundary disclosed');
  mode='expiry';await click('Обновить расчёты');await loaded();await read();await check("!!document.querySelector('.companion-idea-detail')",'short-lived retained detail opens');await check("!document.querySelector('.companion-idea-detail') && document.querySelectorAll('.companion-ideas-list li').length===1 && document.body.innerText.includes('истёк')",'expiry removes detail and card locally');
  mode='empty';await click('Обновить расчёты');await check("document.querySelector('.companion-tasks-empty h3')?.textContent==='Пока нет доступных расчётов'",'successful bounded empty state');await screenshot('ideas-empty');
  await close();await check(`${composer}.value==='Черновик — сохранить'`,'draft survives all failure and empty states');
  assert.ok(reads().every(x=>x.method==='GET'&&x.body===null));report.checks.push('all Ideas traffic GET-only without body/query/compute');
  assert.equal(wire.filter(x=>x.path==='/api/ai/chat').length,0);report.checks.push('no model or conversation writer');
  assert.deepEqual(report.unexpected,[]);assert.equal(report.externalRequests,0);assert.deepEqual(page.exceptions,[]);
  assert.equal(page.issues.filter(i=>i.code==='ContentSecurityPolicyIssue').length,0);
  report.checks.push('zero unexpected API/network/CSP/JS errors');report.status='PASS';
} catch(error) {
  report.status='FAIL';report.failure=error.message;
  if(page){await screenshot('failure').catch(()=>{});report.exceptions=page.exceptions;report.issues=page.issues;}
  process.exitCode=1;
} finally {
  if(browser)await browser.close();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,failure:report.failure,out}));
}
