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
  contract:'maya.companion.synthetic-ui/1', realBackend:false, realProviders:false, realKeys:false,
  payload:Object.fromEntries([...files].map(([name,bytes])=>[name,createHash('sha256').update(bytes).digest('hex')])),
  checks:[], screenshots:[], externalRequests:0, unexpected:[] };
const cid='10000000-0000-4000-8000-000000000001';
const turns=[
  {id:'10000000-0000-4000-8000-000000000002',role:'user',text:'Maya, с чего начнём?',createdAt:'2026-10-13T09:00:00.000Z',completed:true},
  {id:'10000000-0000-4000-8000-000000000003',role:'assistant',text:'Привет! Давай посмотрим, что тебя интересует. Можем обсудить услуги или вернуться к истории визитов.',createdAt:'2026-10-13T09:00:01.000Z',completed:true},
];
const wire=[];
let pending=null, browser, page, origin, fault=false, failOnce=true;
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url.startsWith('/api/')) {
    const data=body?JSON.parse(body):null;wire.push({path:req.url,body:data});
    if(req.url==='/api/auth/login')return json(res,{access_token:'synthetic-only',refresh_token:'synthetic-only-refresh',expires_in:900,refresh_expires_at:'2099-01-01T00:00:00.000Z',user:{name:'Тестовый пользователь',tenant:{name:'Учебный салон'}}},201);
    if(req.url==='/api/ai/conversation')return json(res,{contract:'maya.conversation-history/1',conversationId:cid,truncated:false,interrupted:false,turns});
    if(req.url==='/api/widgets/resolve')return json(res,{contract:'maya.widget.resolve/1',tenant_bound:true,widgets:[]});
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
  await check(`document.querySelector('.companion-business')?.textContent==='Учебный салон'`,'tenant display is server-supplied; no invented owner role');
  await check(`document.querySelector('.companion-stage')?.dataset.state==='idle'`,'history restoration does not celebrate a business outcome');
  await check(`getComputedStyle(document.querySelector('.companion-identity')).backgroundColor==='rgba(0, 0, 0, 0)' && getComputedStyle(document.querySelector('.companion-identity')).borderTopWidth==='0px'`,'character button has no browser-default frame');
  await check(`(() => {const robot=document.querySelector('.companion').getBoundingClientRect();const caption=document.querySelector('.companion-caption').getBoundingClientRect();return Math.abs((robot.left+robot.right)-(caption.left+caption.right))<2 && caption.top>=robot.bottom-4})()`,'name pill is centered below the character');
  await check(`document.querySelector('.maya-chat-lane').getBoundingClientRect().top===0 && getComputedStyle(document.querySelector('.companion-header')).position==='absolute'`,'header reserve is counted once in the single chat scroller');
  for(const [width,height] of [[393,852],[320,740],[427,952],[1280,900]]) {
    await size(width,height);
    await check(`document.documentElement.scrollWidth<=innerWidth && document.querySelector('.maya-chat-lane').scrollWidth<=document.querySelector('.maya-chat-lane').clientWidth`,'no horizontal overflow at '+width);
    await screenshot('chat-'+width);
  }
  await size(393,852);
  // Enlarge text, not just the screenshot. Header/lane geometry must remeasure.
  await page.eval(`(() => {
    for (const el of document.querySelectorAll('.companion-caption,.companion-business,[data-chat-message] > div:first-child > div')) {
      el.dataset.previousFontSize=el.style.fontSize;
      el.style.fontSize=(parseFloat(getComputedStyle(el).fontSize)*2)+'px';
    }
  })()`);
  await check(`parseFloat(getComputedStyle(document.querySelector('.maya-chat-lane')).paddingTop)>=document.querySelector('.companion-header').getBoundingClientRect().height`,'200% text grows header without covering timeline');
  await check(`document.querySelector('.maya-chat-lane').scrollWidth<=document.querySelector('.maya-chat-lane').clientWidth`,'200% text wraps without horizontal overflow');
  await screenshot('large-text-393');
  await page.eval(`document.querySelectorAll('[data-previous-font-size]').forEach(el=>{el.style.fontSize=el.dataset.previousFontSize;delete el.dataset.previousFontSize})`);
  await size(393,440);
  await check(`document.querySelector('.companion-header').getBoundingClientRect().height<110 && ${composer}.getBoundingClientRect().bottom<=innerHeight`,'short keyboard viewport keeps composer visible');
  await screenshot('keyboard-height-393');await size(393,852);
  await click('Открыть меню');await check(`document.querySelector('.companion-menu').open`,'menu opens as native modal');
  await screenshot('menu-393');
  await page.focus(`Array.from(document.querySelectorAll('.companion-menu button')).at(-1)`);
  await page.press('Tab');
  await check(`document.activeElement.getAttribute('aria-label')==='Закрыть меню'`,'menu traps forward Tab');
  await page.press('Tab',{shift:true});
  await check(`document.activeElement.getAttribute('aria-label')==='Движения Maya'`,'menu traps backward Tab');
  await page.press('Escape');await check(`!document.querySelector('.companion-menu').open && document.activeElement.getAttribute('aria-label')==='Открыть меню'`,'Escape closes menu and restores focus');
  await click('Открыть меню');await click('Движения Maya');
  await check(`document.querySelector('.companion').dataset.motion==='off'`,'session motion preference disables animations');
  await page.press('Escape');
  await check(`[...document.querySelectorAll('.companion *')].every(el=>getComputedStyle(el).animationName==='none')`,'motion off is static, expression retained');
  await click('Открыть меню');await click('Движения Maya');await page.press('Escape');
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await check(`[...document.querySelectorAll('.companion *')].every(el=>getComputedStyle(el).animationName==='none')`,'system reduced motion overrides enabled UI');
  await page.send('Emulation.setEmulatedMedia',{features:[]});
  const otherPage=await browser.send('Target.createTarget',{url:'about:blank',browserContextId:page.browserContextId});
  await browser.send('Target.activateTarget',{targetId:otherPage.targetId});
  await check(`document.hidden && document.querySelector('.companion').dataset.paused==='true' && getComputedStyle(document.querySelector('.companion-float')).animationPlayState==='paused'`,'background tab pauses decorative animation');
  await browser.send('Target.activateTarget',{targetId:page.targetId});
  await check(`!document.hidden && document.querySelector('.companion').dataset.paused==='false'`,'visible tab resumes decorative animation');
  await browser.send('Target.closeTarget',{targetId:otherPage.targetId});
  await page.fill(composer,'Хочу узнать об услугах');
  await check(`document.querySelector('.companion-stage').dataset.state==='attentive'`,'typing renders attentive state');
  await click('Отправить');
  await check(`document.querySelector('.companion-stage').dataset.state==='thinking'`,'real request is pending; thinking shown');
  await click('Отправить');
  assert.equal(wire.filter(x=>x.path==='/api/ai/chat').length,1,'double click creates one turn');
  report.checks.push('double send remains one canonical request');
  await screenshot('thinking-393');finish();
  await check(`document.querySelectorAll('[data-chat-message]').length===4 && ${composer}.value===''`,'one user and assistant turn; draft cleared only after sent');
  await check(`document.querySelector('.companion-stage').dataset.state==='reply'`,'answer cues reply, not business success');
  fault=true;await page.fill(composer,'Повторная проверка');await click('Отправить');
  await check(`!!${button('Повторить отправку')}`,'real failed turn retains canonical retry');
  await check(`${composer}.value==='Повторная проверка' && document.querySelector('.companion-stage').dataset.state==='error'`,'failed turn retains draft and shows error expression');
  await screenshot('failure-393');await click('Повторить отправку');
  await check(`document.querySelector('.companion-stage').dataset.state==='thinking'`,'retry uses pending context');
  const requests=wire.filter(x=>x.path==='/api/ai/chat');assert.equal(requests[1].body.requestId,requests[2].body.requestId);finish();
  await check(`document.querySelectorAll('[data-chat-message]').length===6`,'retry creates no duplicate message');
  report.checks.push('retry preserves request identity');
  await click('Приватность и данные');await check(`!!document.querySelector('[aria-label="Приватность"]')`,'existing privacy route remains reachable');
  assert.deepEqual(report.unexpected,[]);assert.equal(report.externalRequests,0);
  assert.deepEqual(page.exceptions,[]);
  assert.equal(page.issues.filter(i=>i.code==='ContentSecurityPolicyIssue').length,0);
  report.checks.push('zero unexpected API/network/CSP/JS errors');
  report.status='PASS';
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
