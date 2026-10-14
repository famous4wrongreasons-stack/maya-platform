// Emitted React/runtime; finite synthetic HTTP only. No real file, OCR, model or provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { readTree } from '../tools/payload-files.mjs';
import { preview, search, item, conversationId as cid, proposal } from '../../maya-chat-shell/test/goods-photo-fixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=process.argv[2];
assert.match(out??'',/^\/(?:private\/)?tmp\/maya-companion-[\w-]+$/);assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{mode:0o700});
const files=readTree(path.join(root,'dist/web'));
const report={contract:'maya.companion.goods-photo-sheet.synthetic-browser/1',candidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirtySource:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),realBackend:false,realProviders:false,realKeys:false,realDocuments:false,payload:Object.fromEntries([...files].map(([n,b])=>[n,createHash('sha256').update(b).digest('hex')])),checks:[],screenshots:[],externalRequests:0,unexpected:[]};
const turns=[{id:'10000000-0000-4000-8000-000000000002',role:'user',text:'Начнём разговор',createdAt:'2026-10-14T09:00:00.000Z',completed:true},{id:'10000000-0000-4000-8000-000000000003',role:'assistant',text:'Можно проверить накладную.',createdAt:'2026-10-14T09:00:01.000Z',completed:true}];
const wire=[];let browser,page,origin,pending=null,mode='preview',sequence=10;
const json=(res,body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const responseTurn=value=>({...value,conversationId:cid,user_turn:{conversationId:cid,turnId:'10000000-0000-4000-8000-'+String(++sequence).padStart(12,'0')}});
const server=http.createServer(async(req,res)=>{
 let bytes=Buffer.alloc(0);for await(const b of req)bytes=Buffer.concat([bytes,b]);
 if(req.url.startsWith('/api/')) {
  const multipart=req.headers['content-type']?.startsWith('multipart/form-data');
  const data=multipart?{multipart:true,byteLength:bytes.length}:bytes.length?JSON.parse(bytes):null;
  wire.push({path:req.url,body:data});
  if(req.url==='/api/auth/login')return json(res,{access_token:'synthetic-only',refresh_token:'synthetic-only-refresh',expires_in:900,refresh_expires_at:'2099-01-01T00:00:00.000Z',user:{name:'Тестовый пользователь',tenant:{name:'Учебный салон'}}},201);
  if(req.url==='/api/ai/conversation')return json(res,{contract:'maya.conversation-history/1',conversationId:cid,truncated:false,interrupted:false,turns});
  if(req.url==='/api/widgets/resolve')return json(res,{contract:'maya.widget.resolve/1',tenant_bound:true,widgets:[]});
  if(req.url==='/api/auth/refresh')return json(res,{},401);
  if(req.url==='/api/ai/goods/photo-preview') {
   if(mode==='delay'){pending=res;return;}
   if(mode==='expired')return json(res,{},401);
   if(mode==='unavailable')return json(res,{code:'goods_photo_ocr_unavailable'},503);
   return json(res,preview(),201);
  }
  if(req.url==='/api/ai/goods/search')return json(res,responseTurn(search()),201);
  if(req.url==='/api/ai/goods/item-read')return json(res,responseTurn(item()),201);
  if(req.url==='/api/ai/goods/receipt-review'){pending=res;return;}
  report.unexpected.push(req.url);return json(res,{message:'synthetic_route_refused'},403);
 }
 const name=req.url==='/'?'index.html':req.url.slice(1),b=files.get(name);if(req.method!=='GET'||!b){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':name.endsWith('webmanifest')?'application/manifest+json':'text/html','Cache-Control':'no-store'});res.end(b);
});
const sheet="document.querySelector('.companion-photo-sheet')",composer="document.querySelector('textarea[aria-disabled]')";
const button=text=>`[...document.querySelectorAll('button')].find(b=>b.getClientRects().length>0&&(b.getAttribute('aria-label')||b.textContent.trim())===${JSON.stringify(text)})`;
const field=label=>`[...${sheet}.querySelectorAll('label')].find(l=>l.textContent.startsWith(${JSON.stringify(label)}))?.querySelector('input')`;
const check=async(expr,name)=>{assert.ok(await page.waitFor(expr),name);report.checks.push(name);};
const click=async name=>{assert.ok(await page.focus(button(name)),name);await page.press('Enter');};
const size=async(w,h)=>{await page.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await page.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');};
const shot=async name=>{const {data}=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));report.screenshots.push(name+'.png');};
const received=async()=>{const end=Date.now()+8000;while(!pending&&Date.now()<end)await new Promise(r=>setTimeout(r,20));assert.ok(pending,'synthetic server received the expected request');};
const count=suffix=>wire.filter(x=>x.path==='/api/ai/goods/'+suffix).length;
const upload=async(name,bytes)=>{
 const file=path.join(out,name);fs.writeFileSync(file,bytes);
 const {root:doc}=await page.send('DOM.getDocument');const {nodeId}=await page.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'.companion-photo-sheet input[type=file]'});
 await page.send('DOM.setFileInputFiles',{nodeId,files:[file]});
};
const png=Buffer.from('89504e470d0a1a0a0000000049454e44','hex'); // transport fixture, never decoded by a real OCR
const open=async()=>{await click('Товар по фото накладной');await check(`${sheet}.matches(':modal') && document.activeElement.id==='maya-photo-title'`,'photo phase opens native modal with title focus');};
try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disable-quic']);
 page=await browser.newPage();browser.listeners.add(msg=>{if(msg.method!=='Fetch.requestPaused')return;const u=new URL(msg.params.request.url);if(u.origin===origin||u.protocol==='data:')void browser.send('Fetch.continueRequest',{requestId:msg.params.requestId},msg.sessionId);else{report.externalRequests++;void browser.send('Fetch.failRequest',{requestId:msg.params.requestId,errorReason:'BlockedByClient'},msg.sessionId);}});
 await page.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});await size(393,852);await page.goto(origin+'/');
 await check(`!!${button('Войти по паролю')}`,'real emitted sign-in');await click('Войти по паролю');
 await page.fill('document.querySelector(\'input[type="text"]\')','synthetic-salon');await page.fill('document.querySelector(\'input[type="email"]\')','owner@example.invalid');await page.fill('document.querySelector(\'input[type="password"]\')','synthetic-password');await click('Войти');
 await check(`${composer}?.readOnly===false && document.querySelectorAll('[data-chat-message]').length===2`,'history restored through existing runtime');
 await page.fill(composer,'Черновик не относится к накладной');const start=wire.length;
 await open();assert.equal(wire.length,start);report.checks.push('opening has no API, model or automatic file selection');
 await check(`${sheet}.querySelectorAll('input[type=file]').length===1 && ${sheet}.querySelector('input[type=file]').accept==='image/png,image/jpeg,image/webp' && !${sheet}.querySelector('input[type=file]').multiple`,'one existing bounded photo picker, no generic document upload');
 await page.press('Tab',{shift:true});await check("document.activeElement.textContent==='Закрыть и очистить поля фото'",'backward focus from title reaches last close control');await page.press('Tab');await check("document.activeElement.getAttribute('aria-label')==='Закрыть фото и очистить поля'",'forward focus wraps to header close');
 for(const [w,h] of [[320,740],[393,852],[427,952],[1280,900]]){await size(w,h);await check(`(()=>{const d=${sheet},r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&d.scrollWidth<=d.clientWidth&&[...d.querySelectorAll('button,input')].every(e=>e.getBoundingClientRect().height>=44)})()`,'photo geometry and 44px controls at '+w);await shot('photo-'+w);}
 await size(393,852);await page.press('Escape');await check(`!${sheet}.open && ${sheet}.querySelectorAll('input').length===0 && document.activeElement.getAttribute('aria-label')==='Товар по фото накладной'`,'Escape clears ephemeral picker and returns to actual plus opener');
 await check(`${composer}.value==='Черновик не относится к накладной'`,'photo open/close preserves conversation draft');
 await open();await upload('rejected.txt',Buffer.alloc(20));await check(`${sheet}.textContent.includes('Нужен один файл')`,'wrong MIME refused');assert.equal(count('photo-preview'),0);
 await upload('too-large.png',Buffer.alloc(2*1024*1024+1));await check(`${sheet}.textContent.includes('Нужен один файл')`,'oversize photo refused');assert.equal(count('photo-preview'),0);report.checks.push('invalid files never reach transport');
 mode='delay';await upload('late.png',png);await check(`${sheet}.textContent.includes('Извлекаю предварительные строки') && ${sheet}.querySelector('input[type=file]').disabled`,'upload locks picker under existing owner');await received();
 await check(`${sheet}.querySelector('input[type=file]').value===''`,'filename cleared immediately after gesture');
 const late=pending;pending=null;await page.press('Escape');await check(`!${sheet}.open`,'Escape cancels pending preview');json(late,preview(),201);
 mode='preview';await open();await check(`!${sheet}.textContent.includes('Предварительные строки') && ${sheet}.querySelector('input[type=file]').value===''`,'late response cannot restore cancelled lines');
 await upload('invoice.png',png);await check(`${sheet}.textContent.includes('Предварительные строки')`,'synthetic preview arrives through real transport projection');
 await check(`${sheet}.textContent.includes('Цена продажи (не закупочная)') && !${sheet}.textContent.includes('0.4')`,'OCR confidence and sale price do not become purchase authority');
 await click('Выбрать строку 1');await page.fill(field('Название, артикул или штрихкод'),'шампунь');await click('Найти товар в YCLIENTS');await check(`${sheet}.textContent.includes('Шампунь · товар №22')`,'explicit search preserves selected source');
 await click('Шампунь · товар №22');await check(`${sheet}.textContent.includes('Проверка: Шампунь')`,'catalogue item opens review in same sheet');
 await check(`[...${sheet}.querySelectorAll('input')].filter(i=>i!==${field('Название, артикул или штрихкод')}).every(i=>i.value==='')`,'catalogue prices and OCR do not fill purchase fields');
 await check(`${button('Подготовить предложение прихода')}.disabled`,'review requires explicit purchase-price check');
 await size(320,440);await page.eval(`(()=>{[...${sheet}.querySelectorAll('h2,h3,p,label,button,span')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]).forEach(([e,n])=>{e.dataset.originalFont=e.style.fontSize;e.style.fontSize=(n*2)+'px'});return true})()`);
 await page.focus(field('Закупочная цена за выбранную единицу'));await check(`(()=>{const d=${sheet},r=document.activeElement.getBoundingClientRect();return d.scrollWidth<=d.clientWidth&&r.top>=0&&r.bottom<=innerHeight+1})()`,'long review scrolls to focused field at 320px/short viewport/enlarged text');await shot('photo-review-large-text');
 await page.eval(`(()=>{${sheet}.querySelectorAll('[data-original-font]').forEach(e=>{e.style.fontSize=e.dataset.originalFont;delete e.dataset.originalFont});return true})()`);await size(393,852);
 for(const [label,value] of [['Номер склада в YCLIENTS','3'],['Количество прихода','1.250'],['Закупочная цена за выбранную единицу','12.30'],['Валюта закупочной цены','RUB'],['Дата и время прихода с часовым поясом','2026-10-08T10:00:00+03:00']])await page.fill(field(label),value);
 await click('шт · единица №1');await click('Проверено: это закупочная цена за единицу');await shot('photo-review');
 await click('Подготовить предложение прихода');await check(`${sheet}.textContent.includes('Готовлю предложение для проверки')`,'explicit review uses existing conversation operation');
 await received();assert.equal(count('receipt-review'),1);assert.deepEqual(wire.find(w=>w.path.endsWith('receipt-review')).body.proposal,proposal());report.checks.push('exact explicit proposal and original source identity sent once');
 json(pending,{},500);pending=null;await check(`${sheet}.textContent.includes('повторная отправка отключена') && ${button('Подготовить предложение прихода')}.disabled`,'lost review response stays uncertain and blocks automatic repeat');
 await page.eval(`${button('Подготовить предложение прихода')}.click()`);assert.equal(count('receipt-review'),1);report.checks.push('uncertain disabled review cannot replay');
 await page.focus("document.querySelector('[aria-label=\"Закрыть фото и очистить поля\"]')");await page.press('Tab');await check("document.activeElement.textContent==='Закрыть и очистить поля фото'",'focus skips all locked fields and controls');
 await click('Закрыть и очистить поля фото');await check(`!${sheet}.open && !${sheet}.textContent.includes('Шампунь') && ${composer}.value==='Черновик не относится к накладной'`,'close clears source/review fields and preserves unrelated draft');
 mode='expired';await open();await upload('expired.png',png);await check(`!document.querySelector('.companion-photo-sheet') && !document.querySelector('[data-chat-message]')`,'session expiry removes sheet and retained chat content');
 assert.equal(wire.filter(w=>w.path==='/api/ai/chat').length,0);assert.equal(wire.filter(w=>w.path==='/api/widgets/intent').length,0);assert.equal(wire.filter(w=>w.path==='/api/ai/conversation').length,1);
 assert.deepEqual(report.unexpected,[]);assert.equal(report.externalRequests,0);assert.deepEqual(page.exceptions,[]);assert.equal(page.issues.filter(i=>i.code==='ContentSecurityPolicyIssue').length,0);
 report.checks.push('no mirror writer, booking/COMMIT, unexpected API, external traffic or JS/CSP errors');report.status='PASS';
} catch(e){report.status='FAIL';report.failure=e.message;if(page){await shot('failure').catch(()=>{});report.exceptions=page.exceptions;}process.exitCode=1;}
finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,failure:report.failure,out}));}
