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
  contract:'maya.companion.own-tasks-ui/1', realBackend:false, realProviders:false, realKeys:false,
  payload:Object.fromEntries([...files].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')])),
  checks:[], screenshots:[], externalRequests:0, unexpected:[] };
const cid='10000000-0000-4000-8000-000000000001';
const turns=[
  {id:'10000000-0000-4000-8000-000000000002',role:'user',text:'Maya, с чего начнём?',createdAt:'2026-10-13T09:00:00.000Z',completed:true},
  {id:'10000000-0000-4000-8000-000000000003',role:'assistant',text:'Привет! Давай посмотрим, что тебя интересует. Можем обсудить услуги или вернуться к истории визитов.',createdAt:'2026-10-13T09:00:01.000Z',completed:true},
];
const wire=[];
let browser, page, origin, taskMode='normal', taskPending=null;
const tasksBody=()=>({contract:'maya.operational-work/1',ok:true,read_only:true,tenant_id:'synthetic-tenant',current_user_id:'synthetic-user',tasks: taskMode==='empty'?[]:taskMode==='cap'?Array.from({length:50},(_,i)=>taskRow('done-'+i,true)):[taskRow('active',false),taskRow('done',true)]});
const taskRow=(id,done)=>({canonical:true,work_item_id:id,title:done?'Подготовить расписание':'Проверить расписание на завтра',detail:done?'Сохранённая завершённая задача':'Сверить свободное время мастеров. Это искусственный пример, без данных салона.',status:done?'COMPLETED':'OPEN',due_at:done?null:'2026-10-14T09:00:00.000Z',next_actions:done?[]:['done']});
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url.startsWith('/api/')) {
    const data=body?JSON.parse(body):null;wire.push({path:req.url,method:req.method,body:data});
    if(req.url==='/api/auth/login')return json(res,{access_token:'synthetic-only',refresh_token:'synthetic-only-refresh',expires_in:900,refresh_expires_at:'2099-01-01T00:00:00.000Z',user:{name:'Тестовый пользователь',tenant:{name:'Учебный салон'}}},201);
    if(req.url==='/api/ai/conversation')return json(res,{contract:'maya.conversation-history/1',conversationId:cid,truncated:false,interrupted:false,turns});
    if(req.url==='/api/operational-work'){
      if(taskMode==='delayed'){taskPending=res;return;}
      if(taskMode==='denied')return json(res,{message:'forbidden'},403);
      if(taskMode==='malformed')return json(res,{tasks:[]});
      return json(res,tasksBody());
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
  const loaded=()=>check("document.querySelector('.companion-task-list li h2')?.textContent==='Проверить расписание на завтра'",'canonical read rendered');
  const close=async()=>{await click('Вернуться к разговору');await check(`${composer}.getBoundingClientRect().height>0`,'composer visible after close');};
  await page.fill(composer,'Черновик разговора — не отправлять');
  const reads=()=>wire.filter(x=>x.path==='/api/operational-work');
  assert.equal(reads().length,0);report.checks.push('no task read before opening');
  await openTasks();await loaded();
  await check("document.activeElement.id==='maya-tasks-heading'",'workspace heading receives focus');
  await check(`${composer}.getBoundingClientRect().height===0`,'chat composer hidden and unreachable while tasks show');
  assert.deepEqual(reads(),[{path:'/api/operational-work',method:'GET',body:null}]);report.checks.push('one current-user GET, no body or caller scope');
  await check("document.querySelector('.companion-task-date').textContent.includes('09:00 UTC')",'due instant explicitly UTC; no invented local-day semantics');
  for(const [width,height] of [[393,852],[320,740],[427,952],[1280,900]]) {
    await size(width,height);
    await check("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.maya-chat-lane').scrollWidth<=document.querySelector('.maya-chat-lane').clientWidth",'tasks no horizontal overflow '+width);
    await screenshot('tasks-'+width);
  }
  await size(393,852);
  await page.eval(`document.querySelectorAll('.companion-tasks h2,.companion-tasks p,.companion-tasks button').forEach(el=>{el.dataset.previousFontSize=el.style.fontSize;el.style.fontSize=(parseFloat(getComputedStyle(el).fontSize)*2)+'px'})`);
  await check("document.querySelector('.maya-chat-lane').scrollWidth<=document.querySelector('.maya-chat-lane').clientWidth",'tasks wrap at 200 percent text');
  await screenshot('tasks-large-text');
  await page.eval(`document.querySelectorAll('[data-previous-font-size]').forEach(el=>{el.style.fontSize=el.dataset.previousFontSize;delete el.dataset.previousFontSize})`);
  await click('Готово · 1');
  await check("document.querySelector('.companion-task-list li h2')?.textContent==='Подготовить расписание'",'completed filter shows server state');
  assert.equal(reads().length,1);report.checks.push('filter sends no read or mutation');
  await check("!document.querySelector('.companion-task-list input,.companion-task-list button')",'task status has no fabricated action controls');
  await click('Открыть меню');await page.press('Escape');
  await check("!!document.querySelector('.companion-tasks') && !document.querySelector('.companion-menu').open",'menu Escape does not also close workspace');
  await page.focus("document.querySelector('#maya-tasks-heading')");await page.press('Escape');
  await check(`!document.querySelector('.companion-tasks') && document.activeElement===${composer} && ${composer}.value==='Черновик разговора — не отправлять'`,'workspace Escape restores chat focus and draft');
  await check("document.querySelectorAll('[data-chat-message]').length===2",'conversation identity/history unchanged');
  taskMode='denied';await openTasks();
  await check("document.querySelector('.companion-tasks-status').textContent==='Задачи недоступны для текущего входа.' && document.querySelectorAll('.companion-task-list li').length===0 && !document.querySelector('.companion-tasks-empty')",'403 explicit, no stale/empty success');
  await screenshot('tasks-denied');taskMode='malformed';await click('Обновить список');
  await check("document.querySelector('.companion-tasks-status').textContent.includes('Не удалось проверить')",'malformed success refuses');
  taskMode='cap';await click('Обновить список');
  await check("document.querySelector('.companion-tasks-status').textContent.includes('50 последних') && document.querySelector('.companion-tasks-empty h2').textContent==='В этой части списка задач нет'",'cap disclosed even when selected filter is empty');
  await screenshot('tasks-cap');await click('Готово · 50');
  await check("document.querySelectorAll('.companion-task-list li').length===50",'all fifty retained rows filter correctly');
  await page.eval("document.querySelector('.maya-chat-lane').scrollTop=900");
  await close();
  taskMode='delayed';await openTasks();
  await check("document.querySelector('.companion-tasks-status').textContent==='Загружаю ваши задачи…'",'pending read has loading status');
  await check("document.querySelector('.maya-chat-lane').scrollTop===0",'reopened workspace starts at heading after long list');
  await close();taskMode='normal';if(taskPending){json(taskPending,tasksBody());taskPending=null;}
  await check(`!document.querySelector('.companion-tasks') && ${composer}.value==='Черновик разговора — не отправлять'`,'late closed read cannot reopen surface or overwrite draft');
  taskMode='empty';await openTasks();
  await check("document.querySelector('.companion-tasks-empty h2')?.textContent==='Сейчас нет задач в работе'",'actual successful empty list distinct from refusal');
  await click('Приватность и данные');
  await check("!document.querySelector('.companion-tasks') && !!document.querySelector('[aria-label=\"Приватность\"]')",'canonical privacy navigation replaces task workspace');
  assert.equal(wire.filter(x=>x.path==='/api/ai/chat').length,0);report.checks.push('draft never submitted and no model call');
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
