// Actual emitted React + runtime, isolated synthetic HTTP only. No retained DB or keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { bodyHash } from '../../maya-chat-shell/src/integrity/h7.ts';
import { readTree } from '../tools/payload-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
assert.match(out ?? '', /^\/(?:private\/)?tmp\/maya-companion-[\w-]+$/);
assert.equal(fs.existsSync(out), false);
fs.mkdirSync(out, { mode:0o700 });
const files = readTree(path.join(root, 'dist/web'));
const report = { candidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  dirtySource:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),
  contract:'maya.companion.schedule-shortcut/1', realBackend:false, realProviders:false, realKeys:false,
  payload:Object.fromEntries([...files].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')])),
  checks:[], screenshots:[], externalRequests:0, unexpected:[] };
const cid='10000000-0000-4000-8000-000000000001';
const turns=[
  {id:'10000000-0000-4000-8000-000000000002',role:'user',text:'Maya, с чего начнём?',createdAt:'2026-10-13T09:00:00.000Z',completed:true},
  {id:'10000000-0000-4000-8000-000000000003',role:'assistant',text:'Привет! Давай посмотрим, что тебя интересует. Можем обсудить услуги или вернуться к истории визитов.',createdAt:'2026-10-13T09:00:01.000Z',completed:true},
];
const wire=[];
let pending=null, browser, page, origin, fault=false, failOnce=true, detailPending=null, turnSequence=4;
const envelope=JSON.parse(fs.readFileSync(path.join(root,'../maya-chat-shell/dev/fixtures/envelopes/h7/invariant/kind-schedule.json')));
// Existing renderer corpus, never a claim that this fixture is an NS-1 backend emission.
const detail=structuredClone(envelope);detail.widget_id='01M2Q9G7M0AAAAAAAAAAAAAAAA';detail.correlation.parent_widget_id=envelope.widget_id;detail.intents[0].target={class:'w',ref:'w.journal.parent'};detail.integrity.body_hash=bodyHash(detail);
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url.startsWith('/api/')) {
    const data=body?JSON.parse(body):null;wire.push({path:req.url,body:data});
    if(req.url==='/api/auth/login')return json(res,{access_token:'synthetic-only',refresh_token:'synthetic-only-refresh',expires_in:900,refresh_expires_at:'2099-01-01T00:00:00.000Z',user:{name:'Тестовый пользователь',tenant:{name:'Учебный салон'}}},201);
    if(req.url==='/api/ai/conversation')return json(res,{contract:'maya.conversation-history/1',conversationId:cid,truncated:false,interrupted:false,turns});
    if(req.url==='/api/widgets/resolve')return json(res,{contract:'maya.widget.resolve/1',tenant_bound:true,widgets:[]});
    if(req.url==='/api/owner-reports')return json(res,{reports:[]});
    if(req.url==='/api/auth/refresh')return json(res,{},401);
    if(req.url==='/api/widgets/intent'){detailPending={res,data};return;}
    if(req.url==='/api/ai/chat') {
      if(fault&&failOnce){failOnce=false;return json(res,{message:'ai_model_tool_step_limit'},503);}
      pending={res,data};return;
    }
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
const finish=()=>{assert.ok(pending);turnSequence++;json(pending.res,{request_id:pending.data.requestId,reply:'Давай разберёмся вместе. Это тестовый ответ; никаких записей или отправок не выполнялось.',action_status:null,user_turn:{turnId:'10000000-0000-4000-8000-'+String(turnSequence).padStart(12,'0'),conversationId:cid}},201);pending=null;};
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

  const schedule=button('Спросить Maya о расписании на сегодня');
  const chats=()=>wire.filter(x=>x.path==='/api/ai/chat');
  const intentButton="document.querySelector('.maya-chat-lane [data-ref=\"intent:i1\"]')";
  await check(`!!${schedule} && !${schedule}.disabled`,'explicit schedule shortcut exists after canonical sign-in');
  assert.equal(chats().length,0);report.checks.push('mounting does not ask the model or preload journal');
  const question='Покажи расписание на сегодня';
  // Deliberately equal draft catches clearing by text equality rather than turn ownership.
  await page.fill(composer,question);
  await page.focus(schedule);await page.press('Enter');
  await check(`!!document.querySelector('[data-maya-thinking-dock]') && ${schedule}.disabled`,'keyboard shortcut enters existing pending turn and disables repeated activation');
  await check(`!document.querySelector('dialog.fullscreen[open]') && ${composer}.value===${JSON.stringify(question)}`,'request does not fabricate fullscreen or consume equal draft');
  await page.eval(`(() => {${schedule}.click();${schedule}.click();return true})()`);
  await check("document.querySelectorAll('[data-chat-message]').length===3",'exactly one visible user turn while pending');
  assert.equal(chats().length,1);assert.equal(chats()[0].body.messages.at(-1).content,question);
  assert.equal(chats()[0].body.conversationId,cid);
  assert.ok(chats()[0].body.requestId);
  assert.ok(!JSON.stringify(chats()[0].body).match(/operations\.journal|fs\.calendar|tenant_id|client_id|capability|timezone/));
  report.checks.push('shortcut uses one existing chat writer with no caller-authored authority/date');
  json(pending.res,{request_id:pending.data.requestId,reply:'Вот учебное расписание. Подробности можно открыть в карточке.',action_status:null,user_turn:{turnId:'10000000-0000-4000-8000-000000000004',conversationId:cid},resolution:{matched:true,receipt:{widget_id:envelope.widget_id,envelope_seal:envelope.integrity.envelope_seal,envelope},dismiss_widget_id:null}},201);pending=null;
  await check(`!!${intentButton} && ${composer}.value===${JSON.stringify(question)}`,'server envelope draws canonical schedule without erasing the unrelated draft');
  await check("!document.querySelector('dialog.fullscreen[open]')",'receipt alone does not infer fullscreen from kind or text');
  await screenshot('schedule-card-393');
  await page.click(intentButton);
  await check("document.querySelector('.fullscreen-progress')!==null",'canonical NAVIGATE opens PROGRESS');
  assert.ok(detailPending);json(detailPending.res,{contract:'maya.widget.intent/1',outcome:'terminate',code:null,next_envelope:detail,resolved_widget:null,receipt_outcome:'ACCEPTED'});detailPending=null;
  await check("document.querySelector('dialog.fullscreen[open]') && !document.querySelector('.fullscreen-progress')",'server-bound detail resolves PROGRESS into fullscreen');
  const messageCount=await page.eval("document.querySelectorAll('.maya-chat-lane [data-chat-message]').length");
  await screenshot('schedule-detail-393');
  await page.press('Escape');
  await check(`!document.querySelector('dialog.fullscreen[open]') && document.activeElement===${intentButton}`,'Escape uses existing close owner and restores actual widget opener');
  assert.equal(await page.eval("document.querySelectorAll('.maya-chat-lane [data-chat-message]').length"),messageCount);
  report.checks.push('opening/closing detail creates no timeline duplication');
  // A substituted principal in an otherwise valid response cannot acquire fullscreen.
  await page.click(intentButton);await check("document.querySelector('.fullscreen-progress')!==null",'substitution probe awaits canonical detail response');
  const foreign=structuredClone(detail);foreign.integrity.principal_proof_hash='b'.repeat(64);foreign.integrity.body_hash=bodyHash(foreign);
  assert.ok(detailPending);json(detailPending.res,{contract:'maya.widget.intent/1',outcome:'terminate',code:null,next_envelope:foreign,resolved_widget:null,receipt_outcome:'ACCEPTED'});detailPending=null;
  await check("!document.querySelector('dialog.fullscreen[open]')",'foreign principal detail is refused without fullscreen');
  assert.equal(await page.eval("document.querySelectorAll('.maya-chat-lane [data-chat-message]').length"),messageCount);
  report.checks.push('substituted detail cannot pollute timeline');
  // A backend refusal remains a refusal. No local calendar fallback.
  await page.click(intentButton);await check("document.querySelector('.fullscreen-progress')!==null",'second explicit detail request awaits server');
  assert.ok(detailPending);json(detailPending.res,{contract:'maya.widget.intent/1',outcome:'terminate',code:'AUTHORITY_DENIED',next_envelope:null,resolved_widget:null,receipt_outcome:'REFUSED',reason_text:'Расписание сейчас недоступно.'});detailPending=null;
  await check("!document.querySelector('dialog.fullscreen[open]')",'denied detail leaves no fabricated calendar');
  // Shortcut failure/retry is the ordinary conversation policy, without altering its draft.
  fault=true;await page.click(schedule);
  await check(`!!${button('Повторить отправку')}`,'failed shortcut exposes existing same-request retry');
  await check(`${composer}.value===${JSON.stringify(question)}`,'failed shortcut preserves original draft');
  const failedId=chats().at(-1).body.requestId;await click('Повторить отправку');
  await check("!!document.querySelector('[data-maya-thinking-dock]')",'retry is pending');
  assert.equal(chats().at(-1).body.requestId,failedId);finish();
  await check(`!document.querySelector('[data-maya-thinking-dock]') && ${composer}.value===${JSON.stringify(question)}`,'successful retry still preserves equal unrelated draft');
  report.checks.push('same-operation retry retains request identity and does not clear a shortcut-unowned draft');
  // From an existing workspace, the same explicit question returns to chat once.
  await click('Файлы');await check("!!document.querySelector('.companion-reads')",'existing workspace opened');
  const beforeWorkspace=chats().length;await page.click(schedule);
  await check("!document.querySelector('.companion-reads') && !!document.querySelector('[data-maya-thinking-dock]')",'shortcut returns to chat through canonical root');
  assert.equal(chats().length,beforeWorkspace+1);finish();
  await check(`!document.querySelector('[data-maya-thinking-dock]') && ${composer}.value===${JSON.stringify(question)}`,'workspace shortcut also keeps draft');
  for(const [width,height] of [[320,740],[393,852],[427,952],[1280,900]]) {
    await size(width,height);
    await check(`(() => {const r=${schedule}.getBoundingClientRect();return r.width>=44&&r.height>=44&&document.documentElement.scrollWidth<=innerWidth})()`,'calendar target and layout at '+width);
    await screenshot('schedule-header-'+width);
  }
  await click('Открыть меню');await click('Приватность и данные');
  await check(`${schedule}.disabled && !!document.querySelector('[aria-label="Приватность"]')`,'privacy remains available and shortcut cannot interrupt erasure owner');
  const beforePrivacy=chats().length;await page.eval(`${schedule}.click()`);assert.equal(chats().length,beforePrivacy);
  await click('Назад к разговору');
  await page.click(schedule);await check("!!document.querySelector('[data-maya-thinking-dock]')",'final shortcut pending before session revocation');
  json(pending.res,{},401);pending=null;
  await check(`!${schedule} && !document.querySelector('[data-chat-message]')`,'expired session clears shortcut and retained content');
  assert.equal(wire.filter(x=>x.path==='/api/ai/conversation').length,1);
  assert.equal(wire.filter(x=>x.path==='/api/widgets/intent').length,3);
  assert.deepEqual(report.unexpected,[]);assert.equal(report.externalRequests,0);assert.deepEqual(page.exceptions,[]);
  assert.equal(page.issues.filter(i=>i.code==='ContentSecurityPolicyIssue').length,0);
  report.checks.push('zero unexpected APIs/external traffic/JS/CSP errors; no mirror history writer');report.status='PASS';
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
