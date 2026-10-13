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
  contract:'maya.companion.navigation-ui/1', realBackend:false, realProviders:false, realKeys:false,
  payload:Object.fromEntries([...files].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')])),
  checks:[], screenshots:[], externalRequests:0, unexpected:[] };
const cid='10000000-0000-4000-8000-000000000001';
const turns=[
  {id:'10000000-0000-4000-8000-000000000002',role:'user',text:'Maya, с чего начнём?',createdAt:'2026-10-13T09:00:00.000Z',completed:true},
  {id:'10000000-0000-4000-8000-000000000003',role:'assistant',text:'Привет! Давай посмотрим, что тебя интересует. Можем обсудить услуги или вернуться к истории визитов.',createdAt:'2026-10-13T09:00:01.000Z',completed:true},
];
const wire=[];
let pending=null, browser, page, origin, feedMode='normal', feedPending=null;
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url.startsWith('/api/')) {
    const data=body?JSON.parse(body):null;wire.push({path:req.url,method:req.method,body:data});
    if(req.url==='/api/auth/login')return json(res,{access_token:'synthetic-only',refresh_token:'synthetic-only-refresh',expires_in:900,refresh_expires_at:'2099-01-01T00:00:00.000Z',user:{name:'Тестовый пользователь',tenant:{name:'Учебный салон'}}},201);
    if(req.url==='/api/ai/conversation')return json(res,{contract:'maya.conversation-history/1',conversationId:cid,truncated:false,interrupted:false,turns});
    if(req.url==='/api/widgets/resolve')return json(res,{contract:'maya.widget.resolve/1',tenant_bound:true,widgets:[]});
    if(req.url==='/api/inbox') {
      if(feedMode==='delayed'){feedPending=res;return;}
      if(feedMode==='denied')return json(res,{},403);
      if(feedMode==='expired')return json(res,{},401);
      return json(res,{items:Array.from({length:8},(_,i)=>({id:'feed-'+i,type:'owner_alert',title:'Учебное уведомление '+(i+1),body_text:'Сохранённое уведомление. Это искусственный пример, без данных салона.',created_at:'2026-10-13T09:00:00.000Z',read_at:null}))});
    }
    if(req.url==='/api/operational-work')return json(res,{contract:'maya.operational-work/1',action_contract:'maya.operational-work.actions/1',can_create:true,ok:true,read_only:true,tenant_id:'synthetic-tenant',current_user_id:'synthetic-user',tasks:[]});
    if(req.url==='/api/analytics/valuations')return json(res,{contract:'c8.valuation.list/1',numericPredictionsAvailable:false,nextCursor:null,items:[]});
    if(req.url==='/api/owner-reports')return json(res,{reports:[]});
    if(req.url==='/api/auth/refresh')return json(res,{message:'session_revoked'},401);
    if(req.url==='/api/ai/chat') {
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
const painted=()=>page.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
const size=async(width,height)=>{await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await painted();};
const finish=()=>{assert.ok(pending);json(pending.res,{request_id:pending.data.requestId,reply:'Давай разберёмся вместе. Это тестовый ответ; никаких записей или отправок не выполнялось.',action_status:null,user_turn:{turnId:'10000000-0000-4000-8000-000000000004',conversationId:cid}},201);pending=null;};
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

  const nav="document.querySelector('.companion-navigation')";
  const navButton=text=>`Array.from(${nav}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
  // Record synthetic click targets only, to diagnose geometry failures without inspecting real tabs.
  await page.eval(`(() => {window.navigationProbe=[];for(const type of ['mousedown','mouseup','click'])document.addEventListener(type,e=>window.navigationProbe.push({type,target:e.target.tagName,text:e.target.textContent?.slice(0,60),x:e.clientX,y:e.clientY}),true);return true})()`);
  const choose=async text=>{report.lastClick={text,before:await page.eval(`(() => {const e=${navButton(text)},r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:innerWidth,pointer:matchMedia('(pointer:coarse)').matches,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,250)}})()`)};assert.ok(await page.click(navButton(text)),text);};
  const selected=async text=>check(`${nav}?.querySelector('[aria-current=page]')?.textContent.trim()===${JSON.stringify(text)}`,'current section is '+text);
  const reads=()=>wire.filter(x=>['/api/inbox','/api/operational-work','/api/analytics/valuations','/api/owner-reports'].includes(x.path));
  await check(`${nav}?.querySelectorAll('button').length===5`,'five real workspaces in navigation landmark');
  await selected('Чат');assert.equal(reads().length,0);report.checks.push('mounting navigation does not preload business data');
  await choose('Чат');assert.equal(reads().length,0);report.checks.push('active chat selection is inert');
  for(const [width,height] of [[393,852],[320,740],[427,952],[1280,900]]) {
    await size(width,height);
    await check(`(() => {const n=${nav}.getBoundingClientRect(),c=document.querySelector('.maya-composer-pill').getBoundingClientRect();return n.left>=0&&n.right<=innerWidth&&n.bottom<=innerHeight&&c.bottom<=n.top&&[...${nav}.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44})})()`,'navigation/composer fit and touch targets at '+width);
    await check(`document.documentElement.scrollWidth<=innerWidth`,'no horizontal overflow at '+width);
    await screenshot('navigation-chat-'+width);
  }
  await size(393,852);await page.fill(composer,'Черновик остаётся здесь');
  await check(`getComputedStyle(${nav}).display!=='none'`,'desktop text entry keeps navigation available');
  for(const [label,path,heading] of [['Лента','/api/inbox','Лента'],['Идеи','/api/analytics/valuations','Идеи'],['Задачи','/api/operational-work','Мои задачи'],['Файлы','/api/owner-reports','Библиотека']]) {
    const before=reads().length;await choose(label);await selected(label);
    await check(`document.querySelector('.maya-chat-lane').getAttribute('aria-label')===${JSON.stringify(heading)} && document.querySelector('.maya-chat-composer-dock').hidden`,'existing '+label+' surface opens without composer overlay');
    await check(`!document.querySelector('.companion-reads[aria-busy=true],.companion-ideas[aria-busy=true],.companion-tasks[aria-busy=true]')`,'settled '+label+' read');
    assert.equal(reads().length,before+1);assert.equal(reads().at(-1).path,path);assert.equal(reads().at(-1).method,'GET');assert.equal(reads().at(-1).body,null);
    report.checks.push(label+' delegates one exact existing read');
    await choose(label);assert.equal(reads().length,before+1);report.checks.push('active '+label+' does not refetch or reset');
    await screenshot('navigation-'+label.replace('Лента','feed').replace('Идеи','ideas').replace('Задачи','tasks').replace('Файлы','library'));
  }
  await choose('Задачи');await check(`!!${button('Новая задача +')} && !${button('Новая задача +')}.disabled`,'canonical task permission exposes existing form');
  await click('Новая задача +');await check("document.querySelector('.companion-task-dialog').open",'existing task modal opens');
  assert.equal(await page.focus(navButton('Чат')),false);report.checks.push('modal makes background navigation inert');
  await page.press('Escape');await check("!document.querySelector('.companion-task-dialog')",'Escape closes task form without a write');await selected('Задачи');
  await choose('Чат');await selected('Чат');
  await check(`${composer}.value==='Черновик остаётся здесь' && document.activeElement===document.querySelector('.maya-chat-lane') && document.querySelectorAll('[data-chat-message]').length===2`,'chat return preserves draft/history and focuses lane without summoning keyboard');
  await page.focus(navButton('Лента'));await page.press('Enter');await selected('Лента');
  await check(`document.activeElement.id==='maya-reads-heading'`,'keyboard navigation reaches existing workspace heading');
  await check(`document.querySelectorAll('.companion-feed-list li').length===8`,'long feed loaded');
  await page.eval(`document.querySelector('.maya-chat-lane').scrollTop=100000`);
  await check(`(() => {const n=${nav}.getBoundingClientRect(),b=document.querySelector('.companion-tasks-footer').getBoundingClientRect();return b.bottom<=n.top})()`,'last workspace controls scroll above navigation');
  await screenshot('navigation-feed-end');
  await page.eval(`document.querySelectorAll('.companion-navigation-label').forEach(el=>el.style.fontSize='22px')`);
  await check(`(() => {const n=${nav}.getBoundingClientRect();return n.height>66&&parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--maya-navigation-space'))>=n.height&&[...${nav}.querySelectorAll('button')].every(b=>b.scrollWidth<=b.clientWidth)})()`,'200 percent navigation text grows measured reserve and wraps');
  await page.eval(`document.querySelector('.maya-chat-lane').scrollTop=100000`);
  await check(`document.querySelector('.companion-tasks-footer').getBoundingClientRect().bottom<=${nav}.getBoundingClientRect().top`,'enlarged navigation still clears last controls');
  await screenshot('navigation-large-text');
  await page.eval(`document.querySelectorAll('.companion-navigation-label').forEach(el=>el.style.fontSize='')`);
  await choose('Чат');await check("document.activeElement===document.querySelector('.maya-chat-lane')",'chat return focus completed before touch input');
  // Hardware mouse keeps navigation; coarse-pointer editing hides it, no guessed keyboard height.
  await page.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await page.focus(composer);
  await check(`matchMedia('(pointer:coarse)').matches && getComputedStyle(${nav}).display==='none' && getComputedStyle(document.documentElement).getPropertyValue('--maya-navigation-space')==='0px'`,'touch text entry hides navigation and releases reserved space');
  await size(393,440);
  await check(`document.querySelector('.maya-composer-pill').getBoundingClientRect().bottom<=innerHeight && ${composer}.value==='Черновик остаётся здесь'`,'short editing viewport retains usable composer and draft');
  await screenshot('navigation-keyboard-height');
  await page.focus("document.querySelector('.maya-chat-lane')");await size(393,852);
  await check(`getComputedStyle(${nav}).display!=='none' && ${nav}.getBoundingClientRect().height>=66`,'leaving text entry restores touch navigation');
  await page.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await click('Открыть меню');await check("document.querySelector('.companion-menu').open",'existing menu remains available');
  await page.press('Escape');await check("document.activeElement.getAttribute('aria-label')==='Открыть меню'",'menu restores opener');
  await click('Открыть меню');await check("document.querySelector('.companion-menu').open",'menu opened for existing photo surface');
  assert.ok(await page.click("[...document.querySelectorAll('.companion-menu-row')].find(b=>b.textContent.startsWith('Товар по фото накладной'))"));
  await check(`!${nav} && !!${button('Закрыть и очистить поля фото')}`,'photo surface retains its own controls without navigation');
  await click('Закрыть и очистить поля фото');await selected('Чат');
  await click('Приватность и данные');
  await check(`!${nav} && !!document.querySelector('[aria-label="Приватность"]')`,'privacy retains its own return/confirmation controls');
  await click('Назад к разговору');await selected('Чат');
  feedMode='delayed';await choose('Лента');await selected('Лента');await check("document.querySelector('.companion-tasks-status').textContent==='Загружаю…'",'delayed feed read begins');
  await choose('Задачи');await selected('Задачи');if(feedPending){json(feedPending,{items:[]});feedPending=null;}
  await check("!!document.querySelector('.companion-tasks') && !document.querySelector('.companion-reads')",'late read cannot replace newly selected section');
  feedMode='denied';await choose('Лента');await selected('Лента');
  await check("document.querySelector('.companion-tasks-status').textContent.includes('недоступны') && !document.querySelector('.companion-feed-list li')",'navigation never substitutes permission denial with content');
  await choose('Чат');
  // A pending conversational turn has one writer even while switching workspaces.
  await click('Отправить');await check("document.querySelector('[data-maya-thinking-dock]')!==null",'canonical turn is pending');
  await choose('Файлы');await selected('Файлы');finish();
  await choose('Чат');await check("document.querySelectorAll('[data-chat-message]').length===4",'inflight turn completes once across workspace switch');
  assert.equal(wire.filter(x=>x.path==='/api/ai/chat').length,1);assert.equal(wire.filter(x=>x.path==='/api/ai/conversation').length,1);
  report.checks.push('switching does not create a second turn or history writer');
  assert.deepEqual(wire.filter(x=>x.method!=='GET').map(x=>x.path),['/api/auth/login','/api/widgets/resolve','/api/ai/chat']);
  report.checks.push('navigation performs no acknowledgement/task/provider writes');
  feedMode='expired';await choose('Лента');
  await check(`!${nav} && !document.querySelector('[data-chat-message]')`,'session revocation removes navigation and retained workspace presentation');
  assert.equal(reads().every(x=>x.method==='GET'&&x.body===null),true);
  assert.deepEqual(report.unexpected,[]);assert.equal(report.externalRequests,0);assert.deepEqual(page.exceptions,[]);
  assert.equal(page.issues.filter(i=>i.code==='ContentSecurityPolicyIssue').length,0);
  report.checks.push('zero unexpected API/network/CSP/JS errors');report.status='PASS';
} catch(error) {
  report.status='FAIL';report.failure=error.message;
  report.wire=wire.map(({path,method})=>({path,method}));
  if(page){report.navigationProbe=await page.eval('window.navigationProbe');report.geometry=await page.eval(`({active:document.activeElement?.outerHTML.slice(0,200),app:document.querySelector('.app')?.getBoundingClientRect().toJSON(),nav:document.querySelector('.companion-navigation')?.getBoundingClientRect().toJSON(),editing:document.querySelector('.maya-companion-chat')?.className,space:getComputedStyle(document.documentElement).getPropertyValue('--maya-navigation-space'),pointer:matchMedia('(pointer:coarse)').matches})`);await screenshot('failure').catch(()=>{});report.exceptions=page.exceptions;report.issues=page.issues;}
  process.exitCode=1;
} finally {
  if(browser)await browser.close();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,failure:report.failure,out}));
}
