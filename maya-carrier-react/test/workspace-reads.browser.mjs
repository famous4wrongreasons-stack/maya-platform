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
  contract:'maya.companion.workspace-reads-ui/1', realBackend:false, realProviders:false, realKeys:false,
  payload:Object.fromEntries([...files].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')])),
  checks:[], screenshots:[], externalRequests:0, unexpected:[] };
const cid='10000000-0000-4000-8000-000000000001';
const turns=[
  {id:'10000000-0000-4000-8000-000000000002',role:'user',text:'Maya, с чего начнём?',createdAt:'2026-10-13T09:00:00.000Z',completed:true},
  {id:'10000000-0000-4000-8000-000000000003',role:'assistant',text:'Привет! Давай посмотрим, что тебя интересует. Можем обсудить услуги или вернуться к истории визитов.',createdAt:'2026-10-13T09:00:01.000Z',completed:true},
];
const wire=[];
const markNetwork=[];
let browser, page, origin, mode='normal', pending=null, markMode='normal', marked=false, pendingMark=null;
const reportId='20000000-0000-4000-8000-000000000001', otherId='20000000-0000-4000-8000-000000000002';
const summary={runId:reportId,reportType:'daily_report',periodLocalDate:'2026-10-12',title:'Итоги дня: всё важное рядом'};
const longTitle=('Итоги дня: '+ 'очень подробный сохранённый отчёт '.repeat(6)).slice(0,160);
const reportBody={contract:'maya.owner-report-snapshot/1',...summary,timezone:'Europe/Moscow',content:{title:summary.title,bodyText:'Это сохранённый отчёт для учебного салона.\n\nДень завершён. Команда подготовила расписание на завтра и проверила остатки материалов.\n\nЭто искусственные данные: они не относятся к реальному салону. <script>Никакого исполнения</script>',payload:{private:'MUST NOT REACH DOM'},deepLink:'https://blocked.invalid'}};
const feedBody=()=>({items:mode==='empty'?[]:Array.from({length:mode==='cap'?50:2},(_,i)=>({id:'feed-'+i,type:'owner_alert',title:i===0?'Расписание на завтра готово':'Итоги дня уже в библиотеке',body_text:i===0?'Команда завершила подготовку. Время мастеров сверено — можно спокойно планировать следующий день.':'Сохранённый обзор доступен получателям отчёта. Это учебный пример, без данных салона.',created_at:'2026-10-13T09:00:00.000Z',read_at:i===0&&!marked?null:'2026-10-13T10:00:00.000Z',payload:{private:'MUST NOT REACH DOM'},deep_link:'https://blocked.invalid'}))});
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url.startsWith('/api/')) {
    const data=body?JSON.parse(body):null;wire.push({path:req.url,method:req.method,body:data});
    if(req.url==='/api/auth/login')return json(res,{access_token:'synthetic-only',refresh_token:'synthetic-only-refresh',expires_in:900,refresh_expires_at:'2099-01-01T00:00:00.000Z',user:{name:'Тестовый пользователь',tenant:{name:'Учебный салон'}}},201);
    if(req.url==='/api/ai/conversation')return json(res,{contract:'maya.conversation-history/1',conversationId:cid,truncated:false,interrupted:false,turns});
    if(req.url==='/api/inbox/feed-0/read'){
      if(markMode==='delayed'){pendingMark=res;return;}
      if(markMode==='denied')return json(res,{},403);
      if(markMode==='limited'){res.setHeader('Retry-After','2');return json(res,{},429);}
      if(markMode==='lost'){marked=true;res.destroy();return;}
      if(markMode==='normal')marked=true;
      return json(res,{ok:true});
    }
    if(req.url==='/api/inbox'){
      if(mode==='delayed'){pending=res;return;}
      if(mode==='denied')return json(res,{},403);
      if(mode==='malformed')return json(res,{items:[{}]});
      return json(res,feedBody());
    }
    if(req.url==='/api/owner-reports')return json(res,{reports:mode==='empty'?[]:mode==='long-title'?[{...summary,title:longTitle}]:mode==='long'? [...Array.from({length:20},(_,i)=>({...summary,runId:'30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),title:'Сохранённый отчёт '+i})),summary]:[summary,{...summary,runId:otherId,title:'Анализ недели'}]});
    if(req.url==='/api/owner-reports/'+reportId+'/snapshot'){
      if(mode==='delayed'){pending=res;return;}
      if(mode==='denied')return json(res,{},403);
      if(mode==='substituted')return json(res,{...reportBody,runId:otherId});
      if(mode==='long-title')return json(res,{...reportBody,content:{...reportBody.content,title:longTitle}});
      if(mode==='long-body')return json(res,{...reportBody,content:{...reportBody.content,bodyText:Array.from({length:40},(_,i)=>'Учебный раздел '+(i+1)+'. '+reportBody.content.bodyText).join('\n\n')}});
      return json(res,reportBody);
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
const size=async(width,height)=>{await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await page.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
    '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disable-quic']);
  page=await browser.newPage();
  browser.listeners.add(msg=>{
    if(msg.method==='Network.requestWillBeSent' && msg.params.request.url.endsWith('/api/inbox/feed-0/read')) markNetwork.push({requestId:msg.params.requestId,method:msg.params.request.method,type:msg.params.type});
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
  const loadedFeed=()=>check("document.querySelector('.companion-feed-list li h2')?.textContent==='Расписание на завтра готово'",'retained feed rendered');
  const loadedLibrary=()=>check("document.querySelectorAll('.companion-report-list li').length===2",'retained reports rendered');
  const readReport=async()=>assert.ok(await page.click("[...document.querySelectorAll('.companion-report-list button')].find(b=>b.textContent.includes('Итоги дня'))"));
  const reads=()=>wire.filter(x=>x.path==='/api/inbox'||x.path.startsWith('/api/owner-reports'));
  await page.fill(composer,'Черновик — сохранить');assert.equal(reads().length,0);report.checks.push('no workspace reads on chat mount');
  await open('Лента');await loadedFeed();
  await check("document.activeElement.id==='maya-reads-heading'",'heading focused');
  await check(`${composer}.getBoundingClientRect().height===0`,'composer hidden in workspace');
  await check("document.querySelector('.companion-read-meta').textContent.includes('09:00 UTC')",'feed instant explicit UTC');
  assert.equal(reads().length,1);
  await click('Непрочитанные');await check("document.querySelectorAll('.companion-feed-list li').length===1",'unread filter reflects stored state');assert.equal(reads().length,1);report.checks.push('filter does not acknowledge or mutate');
  await click('Все');
  for(const [width,height] of [[393,852],[320,740],[427,952],[1280,900]]){
    await size(width,height);await check("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.maya-chat-lane').scrollWidth<=document.querySelector('.maya-chat-lane').clientWidth",'feed fits '+width);await screenshot('feed-'+width);
  }
  await size(393,852);await open('Библиотека');await loadedLibrary();
  await check("document.querySelector('.companion-tasks-scope').textContent.includes('последних 100')",'library discloses pre-filter source cap');
  await screenshot('library-list-393');
  const beforePreferences=reads().length;
  await click('Вид библиотеки');
  await check("document.querySelector('.companion-library-menu').matches(':modal') && document.activeElement.id==='maya-library-view-title'",'library settings open as native modal with heading focus');
  assert.equal(await page.focus("document.querySelector('.companion-navigation button')"),false);report.checks.push('library settings make background navigation inert');
  await page.press('Tab');await check("document.activeElement.getAttribute('aria-label')==='Закрыть вид библиотеки'",'settings first tab reaches close');
  await page.press('Tab',{shift:true});await check("document.activeElement.textContent==='Готово'",'settings reverse tab wraps to Done');
  await page.press('Tab');await check("document.activeElement.getAttribute('aria-label')==='Закрыть вид библиотеки'",'settings forward tab stays inside');
  await click('По названию');
  await check("document.querySelector('.companion-report-title').textContent==='Анализ недели'",'local title ordering');
  await click('Сетка');assert.equal(reads().length,beforePreferences);report.checks.push('view/sort do not fetch');
  await check("document.querySelector('.companion-library-menu [aria-label=\"Сетка\"]').getAttribute('aria-pressed')==='true' && document.querySelector('.companion-library-menu [aria-label=\"По названию\"]').getAttribute('aria-pressed')==='true'",'settings reflect exact runtime layout and order');
  for(const [width,height] of [[393,852],[320,740],[427,952],[1280,900],[393,400]]) {
    await size(width,height);await check("(()=>{const d=document.querySelector('.companion-library-menu'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+1&&d.scrollWidth<=d.clientWidth})()",'library settings fit '+width+'x'+height);await screenshot('library-settings-'+width+'x'+height);
  }
  await size(320,740);
  await page.eval("document.querySelectorAll('.companion-library-menu h2,.companion-library-menu p,.companion-library-menu button').forEach(e=>{e.dataset.oldFont=e.style.fontSize;e.style.fontSize=parseFloat(getComputedStyle(e).fontSize)*2+'px'})");
  await check("document.querySelector('.companion-library-menu').scrollWidth<=document.querySelector('.companion-library-menu').clientWidth",'library settings wrap at 200 percent text');await screenshot('library-settings-large-text');
  await click('Готово');await check("!document.querySelector('.companion-library-menu').open && document.activeElement.getAttribute('aria-label')==='Вид библиотеки'",'Done closes preferences and restores opener');
  await page.eval("document.querySelectorAll('[data-old-font]').forEach(e=>{e.style.fontSize=e.dataset.oldFont;delete e.dataset.oldFont})");
  await click('Вид библиотеки');await check("document.querySelector('.companion-library-menu [aria-label=\"Сетка\"]').getAttribute('aria-pressed')==='true'",'reopening preserves chosen layout');
  await page.press('Escape');await check("!!document.querySelector('.companion-reads') && !document.querySelector('.companion-library-menu').open && document.activeElement.getAttribute('aria-label')==='Вид библиотеки'",'settings Escape closes only sheet and keeps library');
  assert.equal(reads().length,beforePreferences);report.checks.push('open close and reopen preferences have zero requests');
  for(const [width,height] of [[393,852],[320,740],[427,952],[1280,900]]){
    await size(width,height);await check("document.querySelector('.maya-chat-lane').scrollWidth<=document.querySelector('.maya-chat-lane').clientWidth",'library grid fits '+width);await screenshot('library-grid-'+width);
  }
  await size(393,852);await readReport();
  await check("document.querySelector('.companion-report-body')?.textContent.includes('День завершён')",'exact snapshot opens as retained report');
  await check("document.querySelector('.companion-report-sheet').textContent.includes('Europe/Moscow') && document.querySelector('.companion-report-sheet').textContent.includes('12.10.2026')",'canonical local period/timezone preserved');
  await check("!document.querySelector('.companion-report-reader script,.companion-report-reader a') && !document.body.textContent.includes('MUST NOT REACH DOM')",'plain text, no payload link or executable HTML');
  await check("document.querySelector('.companion-report-sheet').matches(':modal') && document.querySelectorAll('.companion-report-list li').length===2",'native modal keeps underlying library mounted');
  await check("document.activeElement===document.querySelector('.companion-report-heading h2')",'sheet heading receives focus');
  await page.focus("document.querySelector('#maya-reads-heading')");
  await check("document.activeElement===document.querySelector('.companion-report-heading h2')",'background library cannot take modal focus');
  await page.focus("document.querySelector('.companion-navigation button')");
  await check("document.activeElement===document.querySelector('.companion-report-heading h2')",'background navigation cannot take modal focus');
  await page.press('Tab');await check("document.activeElement.getAttribute('aria-label')==='Закрыть отчёт'",'Tab enters close control');
  await page.press('Tab',{shift:true});await check("document.activeElement.textContent==='← К списку отчётов'",'reverse Tab wraps inside sheet');
  await page.press('Tab');await check("document.activeElement.getAttribute('aria-label')==='Закрыть отчёт'",'forward Tab wraps inside sheet');
  for(const [width,height] of [[393,852],[320,740],[427,952],[1280,900],[393,400]]){
    await size(width,height);
    await check("(()=>{const d=document.querySelector('.companion-report-sheet'),r=d.getBoundingClientRect();return r.x>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight+1 && d.scrollWidth<=d.clientWidth && document.querySelector('.companion-report-reader').scrollWidth<=document.querySelector('.companion-report-reader').clientWidth})()",'sheet fits visible viewport '+width+'x'+height);
    await screenshot('report-'+width+'x'+height);
  }
  await size(393,852);
  await page.eval(`document.querySelectorAll('.companion-report-sheet h2,.companion-report-sheet p,.companion-report-sheet button').forEach(el=>{el.dataset.previousFontSize=el.style.fontSize;el.style.fontSize=(parseFloat(getComputedStyle(el).fontSize)*2)+'px'})`);
  await check("document.querySelector('.companion-report-reader').scrollWidth<=document.querySelector('.companion-report-reader').clientWidth && document.querySelector('.companion-report-reader').clientHeight>=44",'reader wraps at 200 percent text');await screenshot('report-large-text');
  await page.eval(`document.querySelectorAll('[data-previous-font-size]').forEach(el=>{el.style.fontSize=el.dataset.previousFontSize;delete el.dataset.previousFontSize})`);
  await page.press('Escape');await loadedLibrary();
  await check("!document.querySelector('.companion-report-sheet').open && document.activeElement.closest('.companion-report-list') && document.activeElement.textContent.includes('Итоги дня')",'Escape closes canonical detail and restores exact opener');
  await check("document.querySelector('.companion-library-menu [aria-label=\"Сетка\"]').getAttribute('aria-pressed')==='true'",'back preserves library view');
  await page.focus("document.querySelector('#maya-reads-heading')");await page.press('Escape');
  await check(`!document.querySelector('.companion-reads') && document.activeElement===${composer} && ${composer}.value==='Черновик — сохранить'`,'Escape returns chat focus/draft');
  await check("document.querySelectorAll('[data-chat-message]').length===2",'no report insertion or timeline duplication');
  mode='long';await open('Библиотека');await check("document.querySelectorAll('.companion-report-list li').length===21",'long library loaded');
  await page.eval("[...document.querySelectorAll('.companion-report-list button')].find(b=>b.textContent.includes('Итоги дня')).scrollIntoView({block:'center'})");
  const libraryScroll=await page.eval("document.querySelector('.maya-chat-lane').scrollTop");report.libraryScrollBeforeSheet=libraryScroll;assert.ok(libraryScroll>0);
  await readReport();
  await check(`!!document.querySelector('.companion-report-body') && document.querySelector('.maya-chat-lane').scrollTop===${libraryScroll} && document.querySelector('.companion-report-reader').scrollTop===0`,'sheet starts at top without moving scrolled library');
  await click('← К списку отчётов');await check(`!document.querySelector('.companion-report-sheet').open && document.querySelectorAll('.companion-report-list li').length===21 && document.querySelector('.maya-chat-lane').scrollTop===${libraryScroll} && !!document.activeElement.closest('.companion-report-list')`,'back restores exact list item and unchanged library scroll');
  mode='long-body';await readReport();await check("document.querySelector('.companion-report-body')?.textContent.includes('Учебный раздел 40')",'long canonical text loaded');
  await page.focus("document.querySelector('.companion-report-heading button')");await page.press('Tab');
  await check("document.activeElement===document.querySelector('.companion-report-reader')",'report body is reachable for keyboard scrolling');
  await page.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'PageDown',code:'PageDown',windowsVirtualKeyCode:34});
  await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'PageDown',code:'PageDown',windowsVirtualKeyCode:34});
  await check("document.querySelector('.companion-report-reader').scrollTop>0",'PageDown scrolls long report through native keyboard event');
  await check(`document.querySelector('.companion-report-reader').scrollTop>0 && document.querySelector('.maya-chat-lane').scrollTop===${libraryScroll}`,'long report scroll is independent of library');await screenshot('report-long-scroll');
  await click('Закрыть отчёт');await check(`!document.querySelector('.companion-report-sheet').open && document.querySelector('.maya-chat-lane').scrollTop===${libraryScroll}`,'visible close preserves library position');
  mode='normal';await readReport();await check("!!document.querySelector('.companion-report-body') && document.querySelector('.companion-report-reader').scrollTop===0",'reopened report begins at top with no stale scroll');await click('Закрыть отчёт');
  mode='long-title';await click('Обновить список');await check("document.querySelectorAll('.companion-report-list li').length===1",'maximum-length title fixture loaded');await readReport();
  await size(320,740);
  await page.eval(`document.querySelectorAll('.companion-report-sheet h2,.companion-report-sheet p,.companion-report-sheet button').forEach(el=>{el.dataset.previousFontSize=el.style.fontSize;el.style.fontSize=(parseFloat(getComputedStyle(el).fontSize)*2)+'px'})`);
  await check("document.querySelector('.companion-report-heading h2').textContent.length===160 && document.querySelector('.companion-report-reader').clientHeight>=44 && document.querySelector('.companion-report-sheet').scrollWidth<=320 && document.querySelector('.companion-report-heading').scrollWidth<=document.querySelector('.companion-report-heading').clientWidth",'maximum canonical title leaves body reachable at 320 and 200 percent text');
  await screenshot('report-long-title-320-large-text');
  await click('Закрыть отчёт');await check("!document.querySelector('.companion-report-sheet').open",'close remains reachable with maximum title and enlarged text');await size(393,852);await close();
  mode='denied';await open('Лента');await check("document.querySelector('.companion-tasks-status').textContent.includes('недоступны') && !document.querySelector('.companion-feed-list li,.companion-tasks-empty')",'feed denial distinct from empty');await screenshot('feed-denied');
  mode='malformed';await click('Обновить список');await check("document.querySelector('.companion-tasks-status').textContent.includes('Не удалось проверить')",'malformed feed refused');
  mode='cap';await click('Обновить список');await check("document.querySelectorAll('.companion-feed-list li').length===50 && document.querySelector('.companion-tasks-status').textContent.includes('50 последних')",'feed cap explicit');
  await page.eval("document.querySelector('.maya-chat-lane').scrollTop=900");
  mode='normal';await open('Библиотека');await loadedLibrary();await check("document.querySelector('.maya-chat-lane').scrollTop===0",'workspace switch resets scroll');
  mode='substituted';await readReport();await check("document.querySelector('.companion-tasks-status').textContent.includes('Не удалось проверить') && !document.querySelector('.companion-report-body,.companion-report-list li')",'substituted snapshot clears cached titles');
  await check("!document.querySelector('.companion-report-sheet').open && document.activeElement.id==='maya-reads-heading'",'substitution closes modal and focuses refusal');
  mode='normal';await click('Обновить список');await loadedLibrary();mode='denied';await readReport();await check("document.querySelector('.companion-tasks-status').textContent.includes('недоступны') && !document.querySelector('.companion-report-body,.companion-report-list li')",'authority denial clears library');
  await check("!document.querySelector('.companion-report-sheet').open && document.activeElement.id==='maya-reads-heading'",'denial closes modal without retaining report');
  mode='normal';await click('Обновить список');await loadedLibrary();mode='delayed';await readReport();await check("document.querySelector('.companion-report-reader [role=status]').textContent==='Открываю отчёт…'",'pending detail visible');
  await check("document.querySelector('.companion-report-sheet').matches(':modal') && document.querySelector('.companion-report-sheet').getAttribute('aria-busy')==='true' && !document.querySelector('.companion-report-body')",'loading sheet shows no previous body');
  await click('← К списку отчётов');await loadedLibrary();if(pending){json(pending,reportBody);pending=null;}
  await check("!document.querySelector('.companion-report-body') && !document.querySelector('.companion-report-sheet').open",'late report cannot reopen reader');
  mode='empty';await click('Обновить список');await check("document.querySelector('.companion-tasks-empty h2').textContent.includes('В этой части библиотеки')",'bounded empty library honest');await screenshot('library-empty');
  await close();await open('Лента');await check("document.querySelector('.companion-tasks-empty h2').textContent==='В этой части ленты пока пусто'",'successful feed empty distinct');

  const marks=()=>wire.filter(x=>x.path==='/api/inbox/feed-0/read');
  mode='normal';await click('Обновить список');await loadedFeed();assert.equal(marks().length,0);
  report.checks.push('opening filtering and reading never acknowledges automatically');
  markMode='delayed';await click('Отметить прочитанным');
  await check("document.querySelector('.companion-tasks-status').textContent.includes('Сохраняю') && document.querySelector('.companion-feed-list button').disabled && document.querySelector('.companion-feed-dot').classList.contains('is-unread')",'pending mark retains unread and disables duplicate');
  await screenshot('feed-read-pending-393');
  assert.equal(marks().length,1);assert.equal(pendingMark!==null,true);
  assert.ok(await page.eval(`${button('Обновить список')}.disabled`));
  await page.click("document.querySelector('.companion-feed-list button')");assert.equal(marks().length,1);
  marked=true;json(pendingMark,{ok:true});pendingMark=null;
  await check("document.querySelector('.companion-tasks-status').textContent.includes('Отмечено') && !document.querySelector('.companion-feed-list button,.companion-feed-dot.is-unread')",'persisted reread confirms mark');
  await check("document.activeElement.id==='maya-reads-heading'",'mark completion restores focus');
  assert.equal(marks().length,1);assert.deepEqual(marks()[0].body,{});assert.equal(marks()[0].method,'POST');
  report.checks.push('one exact mark POST with empty body, no tenant user or business action');
  await screenshot('feed-read-confirmed-393');
  marked=false;await click('Обновить список');await loadedFeed();
  markMode='no-change';await click('Отметить прочитанным');
  await check("document.querySelector('.companion-tasks-status').textContent.includes('Не удалось подтвердить') && !!document.querySelector('.companion-feed-dot.is-unread')",'ok alone cannot fabricate read state');
  await screenshot('feed-read-unconfirmed-393');
  markMode='lost';await click('Непрочитанные');await click('Отметить прочитанным');
  await check("document.querySelector('.companion-tasks-status').textContent.includes('Отмечено') && document.querySelectorAll('.companion-feed-list li').length===0 && document.querySelector('.companion-tasks-empty h2').textContent.includes('нет непрочитанных')",'lost response resolved through read with unread filter preserved');
  const deliveredAfterLoss=marks().length;
  assert.equal(markNetwork.length,3);assert.ok(deliveredAfterLoss>=3);
  // Chrome may retry an unacknowledged socket write within one Fetch request. The application
  // issues only one Fetch per gesture; the existing server mark-read is state-idempotent.
  report.acknowledgementDelivery={logicalFetches:markNetwork.length,httpDeliveries:deliveredAfterLoss,socketLossInjected:true};
  report.checks.push('lost response triggers no new application Fetch; transport redelivery is explicitly recorded');
  await click('Все');await check("document.querySelectorAll('.companion-feed-list li').length===2 && !document.querySelector('.companion-feed-dot.is-unread')",'all filter reflects persisted read');
  marked=false;await click('Обновить список');await loadedFeed();markMode='denied';await click('Отметить прочитанным');
  await check("document.querySelector('.companion-tasks-status').textContent.includes('недоступны') && !document.querySelector('.companion-feed-list li')",'mark denial clears retained notification content');
  markMode='normal';await click('Обновить список');await loadedFeed();markMode='limited';await click('Отметить прочитанным');
  await check(`${button('Обновить список')}.disabled && !document.querySelector('.companion-feed-list li')`,'mark rate limit clears content and blocks refresh');
  await check(`!${button('Обновить список')}.disabled`,'rate limit becomes manually retryable');assert.equal(marks().length,deliveredAfterLoss+2);assert.equal(markNetwork.length,5);
  report.checks.push('rate limit expiry sends no automatic write');
  markMode='delayed';await click('Обновить список');await loadedFeed();await click('Отметить прочитанным');
  await check("document.querySelector('.companion-tasks-status').textContent.includes('Сохраняю')",'late mark started');
  await close();if(pendingMark){json(pendingMark,{ok:true});pendingMark=null;}
  await check(`document.activeElement===${composer} && ${composer}.value==='Черновик — сохранить' && !document.querySelector('.companion-reads')`,'late mark cannot reopen workspace or lose draft');
  await open('Лента');await loadedFeed();assert.equal(marks().length,deliveredAfterLoss+3);assert.equal(markNetwork.length,6);
  await check("!!document.querySelector('.companion-feed-dot.is-unread')",'reopen rereads real state after cancelled acknowledgement');
  await click('Приватность и данные');await check("!document.querySelector('.companion-reads') && !!document.querySelector('[aria-label=\"Приватность\"]')",'canonical privacy replaces workspace');
  assert.ok(reads().every(r=>r.method==='GET'&&r.body===null));report.checks.push('list and report requests remain GET; only explicit bounded mark-read POST added');
  assert.equal(wire.filter(x=>x.path==='/api/ai/chat').length,0);report.checks.push('draft never submitted and no model call');
  assert.deepEqual(report.unexpected,[]);assert.equal(report.externalRequests,0);assert.deepEqual(page.exceptions,[]);
  assert.equal(page.issues.filter(i=>i.code==='ContentSecurityPolicyIssue').length,0);
  report.checks.push('zero unexpected API/network/CSP/JS errors');report.status='PASS';
} catch(error) {
  report.status='FAIL';report.failure=error.message;report.syntheticWire=wire;report.markNetwork=markNetwork;
  if(page){await screenshot('failure').catch(()=>{});report.exceptions=page.exceptions;report.issues=page.issues;report.failureLayout=await page.eval("({laneScroll:document.querySelector('.maya-chat-lane')?.scrollTop,sheetOpen:document.querySelector('.companion-report-sheet')?.open,activeTag:document.activeElement.tagName,activeText:document.activeElement.textContent,activeClass:document.activeElement.className,libraryCount:document.querySelectorAll('.companion-report-list li').length})");}
  process.exitCode=1;
} finally {
  if(browser)await browser.close();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,failure:report.failure,out}));
}
