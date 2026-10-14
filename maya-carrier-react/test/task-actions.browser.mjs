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
  contract:'maya.companion.task-actions-ui/1', realBackend:false, realProviders:false, realKeys:false,
  payload:Object.fromEntries([...files].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')])),
  checks:[], screenshots:[], externalRequests:0, unexpected:[] };
const cid='10000000-0000-4000-8000-000000000001';
const turns=[
  {id:'10000000-0000-4000-8000-000000000002',role:'user',text:'Maya, с чего начнём?',createdAt:'2026-10-13T09:00:00.000Z',completed:true},
  {id:'10000000-0000-4000-8000-000000000003',role:'assistant',text:'Привет! Давай посмотрим, что тебя интересует. Можем обсудить услуги или вернуться к истории визитов.',createdAt:'2026-10-13T09:00:01.000Z',completed:true},
];
const wire=[];
let browser, page, origin, taskMode='normal', taskPending=null;
let taskRows=[], writeMode='normal', held=null, mutations=0, canCreate=true;
const receipts=new Map();
const taskRow=(id,done)=>({canonical:true,work_item_id:id,task_id:'inbox-'+id,title:done?'Подготовить расписание':'Проверить расписание на завтра',detail:'Сверить свободное время мастеров. Искусственный пример.',status:done?'COMPLETED':'OPEN',due_at:null,next_actions:done?[]:['done']});
taskRows=[taskRow('active',false)];
const tasksBody=()=>({contract:'maya.operational-work/1',action_contract:'maya.operational-work.actions/1',can_create:canCreate,ok:true,read_only:true,tenant_id:'synthetic-tenant',current_user_id:'synthetic-user',tasks:taskRows});
const ownerReceipt=(kind,target)=>({actionClass:kind==='create'?'create_operational_task':'complete_operational_task',actionExecutionId:'ae-'+kind+'-'+target,targetRef:target,targetGeneration:kind==='create'?0:1,noOp:false,settingMutations:0,workItemMutations:1,unknownApplicable:false,providerWrites:0});
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url.startsWith('/api/')) {
    const data=body?JSON.parse(body):null;wire.push({path:req.url,method:req.method,body:data,key:req.headers['idempotency-key']});
    if(req.url==='/api/auth/login')return json(res,{access_token:'synthetic-only',refresh_token:'synthetic-only-refresh',expires_in:900,refresh_expires_at:'2099-01-01T00:00:00.000Z',user:{name:'Тестовый пользователь',tenant:{name:'Учебный салон'}}},201);
    if(req.url==='/api/ai/conversation')return json(res,{contract:'maya.conversation-history/1',conversationId:cid,truncated:false,interrupted:false,turns});
    if(req.url==='/api/operational-work')return json(res,tasksBody());
    if(['/api/operational-work/create','/api/operational-work/complete'].includes(req.url)) {
      const key=req.headers['idempotency-key'];assert.match(key,/^companion-task:/);assert.equal(req.method,'POST');
      let value=receipts.get(key);
      if(!value){
        const kind=req.url.endsWith('/create')?'create':'complete';
        let target;
        if(kind==='create') { assert.equal(data.assigneeUserId,'synthetic-user');assert.equal(data.dueAt,null);assert.deepEqual(Object.keys(data).sort(),['assigneeUserId','bodyText','dueAt','title']);target='created-'+mutations;taskRows.unshift({...taskRow(target,false),title:data.title,detail:data.bodyText}); }
        else {assert.deepEqual(Object.keys(data),['inboxItemId']);const row=taskRows.find(r=>r.task_id===data.inboxItemId);assert.ok(row);target=row.work_item_id;row.status='COMPLETED';row.next_actions=[];}
        mutations++;value=kind==='create'?{result:ownerReceipt(kind,target),projected:1,projectionPending:false}:{...ownerReceipt(kind,target),projectionPending:false};receipts.set(key,value);
      }
      if(writeMode==='held'){held={res,value};return;}
      if(writeMode==='lost')return json(res,{message:'synthetic_response_lost'},502);
      if(writeMode==='substitute')return json(res,{...value,targetRef:'foreign-target'});
      return json(res,value,201);
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

  const openTasks=async()=>{await click('Открыть меню');assert.ok(await page.click("[...document.querySelectorAll('.companion-menu-row')].find(b=>b.textContent.startsWith('Мои задачи'))"));};
  await page.fill(composer,'Черновик сохранён');await openTasks();
  await check("!!document.querySelector('button[aria-label=\"Завершить: Проверить расписание на завтра\"]')",'server-declared completion visible');
  await click('Новая задача +');
  await check("document.querySelector('dialog.companion-task-dialog').open && document.activeElement===document.querySelector('.companion-task-dialog input')",'native dialog opens with focus');
  await check("document.querySelector('.companion-task-dialog').matches(':modal') && document.querySelector('.companion-task-dialog').getAttribute('aria-describedby')==='new-task-scope' && document.querySelector('#new-task-scope').textContent==='Для вас · без срока'",'task sheet announces exact self-only no-deadline scope');
  assert.equal(await page.focus("document.querySelector('.companion-navigation button')"),false);report.checks.push('task sheet keeps underlying navigation inert');
  await check(`${button('Создать задачу +')}.disabled`,'empty form cannot submit');
  await check("document.querySelector('.companion-task-dialog input').maxLength===160",'title uses actual executor maximum');
  await check("document.querySelector('.companion-task-dialog textarea').maxLength===4000 && !document.querySelector('.companion-task-dialog select,.companion-task-dialog input[type=date]')",'description bound preserved without deadline or assignment authority');
  await page.focus(button('Закрыть новую задачу'));await page.press('Tab',{shift:true});
  await check("document.activeElement.id==='maya-new-task-detail'",'empty form reverse Tab skips disabled submit and wraps to description');
  await page.press('Tab');await check("document.activeElement.getAttribute('aria-label')==='Закрыть новую задачу'",'empty form forward Tab stays inside sheet');
  await page.fill("document.querySelector('.companion-task-dialog input')",'Подготовить рабочую неделю');
  await page.fill("document.querySelector('.companion-task-dialog textarea')",'Сверить график и записать вопросы к планёрке.');
  await page.focus(button('Создать задачу +'));await page.press('Tab');await check("document.activeElement.getAttribute('aria-label')==='Закрыть новую задачу'",'filled form forward Tab wraps from submit to close');
  await page.press('Tab',{shift:true});await check(`document.activeElement===${button('Создать задачу +')}`,'filled form reverse Tab wraps to submit');
  for(const [width,height] of [[393,852],[320,740],[427,952],[1280,900],[393,400]]){
    await size(width,height);
    await check("(()=>{const d=document.querySelector('.companion-task-dialog'),r=d.getBoundingClientRect(),f=document.querySelector('.companion-task-fields');return document.documentElement.scrollWidth<=innerWidth&&d.scrollWidth<=d.clientWidth&&f.scrollWidth<=f.clientWidth&&r.top>=0&&Math.abs(r.bottom-innerHeight)<1&&r.left>=0&&r.right<=innerWidth})()",'task sheet fits bottom of visible viewport '+width+'x'+height);
    if(width<600)await check("Math.abs(document.querySelector('.companion-task-dialog').getBoundingClientRect().width-innerWidth)<1 && document.querySelector('.companion-task-dialog').getBoundingClientRect().left===0",'mobile sheet fills viewport '+width+'x'+height);
    await screenshot('new-task-'+width+'x'+height);
  }
  await size(393,852);
  await page.focus("document.querySelector('#maya-new-task-name')");
  await page.eval("(()=>{Object.defineProperties(visualViewport,{height:{configurable:true,value:320},offsetTop:{configurable:true,value:38}});visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'))})()");
  await check("(()=>{const r=document.querySelector('.companion-task-dialog').getBoundingClientRect();return r.top>=38&&Math.abs(r.bottom-358)<1&&document.querySelector('.companion-task-fields').clientHeight>=44})()",'task sheet follows existing visible viewport height and offset above keyboard');
  await page.press('Tab');await page.press('Tab');
  await check(`(()=>{const b=${button('Создать задачу +')},r=b.getBoundingClientRect(),f=document.querySelector('.companion-task-fields').getBoundingClientRect();return document.activeElement===b&&r.top>=f.top&&r.bottom<=f.bottom+1})()`,'submit is keyboard reachable inside reduced visible viewport');
  await screenshot('new-task-keyboard-viewport');
  await page.eval("(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'))})()");
  await size(320,740);
  await page.eval("document.querySelectorAll('.companion-task-dialog h2,.companion-task-dialog p,.companion-task-dialog label,.companion-task-dialog input,.companion-task-dialog textarea,.companion-task-dialog button').forEach(e=>{e.dataset.oldFont=e.style.fontSize;e.style.fontSize=parseFloat(getComputedStyle(e).fontSize)*2+'px'})");
  await page.focus("document.querySelector('#maya-new-task-name')");
  await check("document.querySelector('.companion-task-dialog').scrollWidth<=document.querySelector('.companion-task-dialog').clientWidth && document.querySelector('.companion-task-fields').scrollWidth<=document.querySelector('.companion-task-fields').clientWidth",'task sheet wraps at 200 percent text');await screenshot('new-task-large-text');
  await page.focus(button('Создать задачу +'));await check(`(()=>{const r=${button('Создать задачу +')}.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1})()`,'large text submit remains reachable by keyboard');
  await page.eval("document.querySelectorAll('[data-old-font]').forEach(e=>{e.style.fontSize=e.dataset.oldFont;delete e.dataset.oldFont})");
  assert.equal(wire.filter(r=>r.method==='POST'&&r.path.startsWith('/api/operational-work')).length,0);report.checks.push('opening editing and changing viewport never sends a task command');
  await size(393,852);await page.press('Escape');
  await check(`!document.querySelector('dialog.companion-task-dialog') && document.activeElement===${button('Новая задача +')}`,'Escape closes only task form and returns focus');
  await click('Новая задача +');
  await check("document.querySelector('#maya-new-task-name').value==='' && document.querySelector('#maya-new-task-detail').value===''",'closing unsubmitted draft clears only task form fields');
  await page.fill("document.querySelector('.companion-task-dialog input')",'Подготовить рабочую неделю');await page.fill("document.querySelector('.companion-task-dialog textarea')",'Сверить график и записать вопросы к планёрке.');
  writeMode='held';await click('Создать задачу +');
  await check(`${button('Создать задачу +')}.disabled && document.querySelectorAll('.companion-task-list li').length===1`,'pending disables double send and never inserts optimistic row');
  await page.press('Tab');await check("document.activeElement.getAttribute('aria-label')==='Закрыть новую задачу'",'pending Tab skips disabled fields and submit');
  await page.press('Tab',{shift:true});await check("document.activeElement.getAttribute('aria-label')==='Закрыть новую задачу'",'pending reverse Tab stays on available close');
  await page.press('Escape');await check("!document.querySelector('.companion-task-dialog') && document.activeElement.id==='maya-tasks-heading' && document.querySelector('.companion-task-command').textContent.includes('Сохраняю')",'closing pending form restores heading when opener disabled and retains operation');
  await page.focus(button('Вернуться к разговору'));
  assert.equal(wire.filter(r=>r.path==='/api/operational-work/create').length,1);assert.ok(held);writeMode='normal';json(held.res,held.value,201);held=null;
  await check("!document.querySelector('dialog.companion-task-dialog') && document.querySelectorAll('.companion-task-list li').length===2",'receipt then fresh list shows created task');
  await check(`document.activeElement===${button('Вернуться к разговору')}`,'late confirmation never steals focus after user closed sheet');
  assert.equal(mutations,1);report.checks.push('one creation via existing DTO, no date/assignment picker');await screenshot('created-task');
  writeMode='lost';await click('Завершить: Подготовить рабочую неделю');
  await check("document.querySelector('.companion-task-command').textContent.includes('Результат пока не подтверждён')",'lost completion response stays uncertain');
  await check("document.querySelectorAll('.companion-task-list li').length===2 && !document.querySelector('.companion-task-mark.is-done')",'lost response is not optimistic completion');
  const first=wire.filter(r=>r.path.endsWith('/complete'))[0];assert.equal(first.body.inboxItemId,'inbox-created-0');assert.equal(mutations,2);
  await click('Вернуться к разговору');await openTasks();
  await check(`!!${button('Повторить ту же операцию')} && !${button('Повторить ту же операцию')}.disabled`,'uncertain operation survives workspace return');
  writeMode='normal';await click('Повторить ту же операцию');
  await check("document.querySelector('.companion-task-command').textContent.includes('Задача завершена.')",'same-operation replay confirms canonical receipt');
  const replay=wire.filter(r=>r.path.endsWith('/complete'))[1];assert.equal(replay.key,first.key);assert.deepEqual(replay.body,first.body);assert.equal(mutations,2);report.checks.push('same identity replay creates no second effect in synthetic owner');
  await click('Готово · 1');await check("document.querySelectorAll('.companion-task-list li').length===1 && !!document.querySelector('.companion-task-mark.is-done')",'done tab derives state only from fresh server list');await screenshot('task-done');
  await click('В работе · 1');writeMode='substitute';await click('Завершить: Проверить расписание на завтра');
  await check("document.querySelector('.companion-task-command').textContent.includes('Результат пока не подтверждён')",'foreign target receipt is refused as unconfirmed');writeMode='normal';await click('Повторить ту же операцию');
  await check("document.querySelector('.companion-task-command').textContent.includes('Задача завершена.')",'same operation resolves with correct target');
  const beforeUnknown=mutations, beforeUnknownPosts=wire.filter(r=>r.path.endsWith('/create')).length;
  await click('Новая задача +');
  await check("document.querySelector('.companion-task-dialog').open",'previous confirmed command does not dismiss new draft');
  await page.fill("document.querySelector('#maya-new-task-name')",'Проверить материалы');await page.fill("document.querySelector('#maya-new-task-detail')",'Подготовить список вопросов. Искусственная задача.');
  writeMode='lost';await click('Создать задачу +');
  await check("document.querySelector('.companion-task-dialog .companion-task-command').textContent.includes('Результат пока не подтверждён')",'lost create response remains in sheet without success claim');
  await check(`${button('Создать задачу +')}.disabled && document.querySelector('#maya-new-task-name').disabled && document.querySelector('#maya-new-task-detail').disabled && !${button('Повторить ту же операцию')}.disabled`,'unknown create locks draft and exposes only same-operation retry');
  await page.focus(button('Закрыть новую задачу'));await page.press('Tab',{shift:true});await check(`document.activeElement===${button('Повторить ту же операцию')}`,'unknown reverse Tab skips disabled fields and submit');
  await page.press('Tab');await check("document.activeElement.getAttribute('aria-label')==='Закрыть новую задачу'",'unknown forward Tab wraps to close');await screenshot('new-task-unknown');
  const unknownFirst=wire.filter(r=>r.path.endsWith('/create'))[beforeUnknownPosts];assert.equal(mutations,beforeUnknown+1);
  writeMode='normal';await click('Повторить ту же операцию');
  await check("!document.querySelector('.companion-task-dialog') && document.querySelector('.companion-task-command').textContent.includes('Задача создана.') && document.querySelectorAll('.companion-task-list li').length===1",'canonical retry receipt closes sheet and reread exposes one created row');
  const unknownReplay=wire.filter(r=>r.path.endsWith('/create'))[beforeUnknownPosts+1];assert.equal(unknownReplay.key,unknownFirst.key);assert.deepEqual(unknownReplay.body,unknownFirst.body);assert.equal(mutations,beforeUnknown+1);report.checks.push('create retry preserves exact identity and body with one synthetic owner mutation');
  canCreate=false;taskRows=[{...taskRow('projection-pending',false),task_id:null,next_actions:[]}];await click('Обновить список');
  await check(`!${button('Новая задача +')} && !document.querySelector('.companion-task-list button')`,'staff/no binding receives no fabricated create/complete controls');
  await click('Вернуться к разговору');await check(`${composer}.value==='Черновик сохранён' && document.querySelectorAll('[data-chat-message]').length===2`,'chat draft and identity unchanged');
  assert.equal(wire.filter(r=>r.path==='/api/ai/chat').length,0);assert.deepEqual(report.unexpected,[]);assert.equal(report.externalRequests,0);assert.deepEqual(page.exceptions,[]);assert.equal(page.issues.filter(i=>i.code==='ContentSecurityPolicyIssue').length,0);
  report.checks.push('zero provider/model requests, CSP and JS errors');report.status='PASS';
} catch(error) {
  report.status='FAIL';report.failure=error.message;
  if(page){await screenshot('failure').catch(()=>{});report.geometry=await page.eval("(()=>{const d=document.querySelector('.companion-task-dialog'),f=document.querySelector('.companion-task-fields'),b=document.querySelector('.companion-task-dialog .companion-task-add');return {dialog:d?.getBoundingClientRect().toJSON(),fields:f?.getBoundingClientRect().toJSON(),submit:b?.getBoundingClientRect().toJSON(),scroll:f?.scrollTop,scrollHeight:f?.scrollHeight,active:document.activeElement?.id,viewportHeight:visualViewport.height,viewportTop:visualViewport.offsetTop}})()").catch(()=>null);report.exceptions=page.exceptions;report.issues=page.issues;}
  process.exitCode=1;
} finally {
  if(browser)await browser.close();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,failure:report.failure,out}));
}
