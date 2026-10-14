// Real emitted carrier/runtime/capture/encoder; synthetic audio and loopback API only.
// The native microphone is replaced before application code and is never opened.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Browser } from '../../maya-chat-shell/test/cdp-verify.mjs';
import { readTree } from '../tools/payload-files.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=process.argv[2];
assert.match(out??'',/^\/(?:private\/)?tmp\/maya-companion-[\w-]+$/);assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{mode:0o700});
const files=readTree(path.join(root,'dist/web'));
const report={contract:'maya.companion.voice-sheet.synthetic-browser/1',candidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirtySource:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),realBackend:false,realProviders:false,realKeys:false,realMicrophone:false,payload:Object.fromEntries([...files].map(([n,b])=>[n,createHash('sha256').update(b).digest('hex')])),checks:[],screenshots:[],externalRequests:0,unexpected:[]};
const cid='10000000-0000-4000-8000-000000000001';
const turns=[{id:'10000000-0000-4000-8000-000000000002',role:'user',text:'Начнём разговор',createdAt:'2026-10-14T09:00:00.000Z',completed:true},{id:'10000000-0000-4000-8000-000000000003',role:'assistant',text:'Слушаю тебя. Можно написать или отправить голосовую запись.',createdAt:'2026-10-14T09:00:01.000Z',completed:true}];
const wire=[];let transcribe=null,chat=null,browser,page,origin;
const json=(res,body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{
 let body='';for await(const b of req)body+=b;
 if(req.url.startsWith('/api/')) {
  const data=body?JSON.parse(body):null;wire.push({path:req.url,body:data});
  if(req.url==='/api/auth/login')return json(res,{access_token:'synthetic-only',refresh_token:'synthetic-only-refresh',expires_in:900,refresh_expires_at:'2099-01-01T00:00:00.000Z',user:{name:'Тестовый пользователь',tenant:{name:'Учебный салон'}}},201);
  if(req.url==='/api/ai/conversation')return json(res,{contract:'maya.conversation-history/1',conversationId:cid,truncated:false,interrupted:false,turns});
  if(req.url==='/api/widgets/resolve')return json(res,{contract:'maya.widget.resolve/1',tenant_bound:true,widgets:[]});
  if(req.url==='/api/ai/transcribe'){transcribe={res,data};return;}
  if(req.url==='/api/ai/chat'){chat={res,data};return;}
  report.unexpected.push(req.url);return json(res,{message:'synthetic_route_refused'},403);
 }
 const file=req.url==='/'?'index.html':req.url.slice(1),bytes=files.get(file);
 if(req.method!=='GET'||!bytes){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('webmanifest')?'application/manifest+json':'text/html','Cache-Control':'no-store'});res.end(bytes);
});
// Finite test platform. No reference to the original capture functions is retained.
const fakeAudio=`(() => {
 const f=window.__voiceFixture={arms:0,starts:0,stops:0,liveTracks:0,contexts:0,mode:'ready',duration:1,holdDecode:false,constraints:[]};
 const stream=()=>{f.liveTracks++;let live=true;return {getTracks:()=>[{stop:()=>{if(live){live=false;f.liveTracks--;}}}]};};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:constraints=>{
  f.arms++;f.constraints.push(constraints);
  if(f.mode==='pending')return new Promise(resolve=>{f.permission=()=>resolve(stream());});
  if(f.mode==='denied')return Promise.reject(new DOMException('synthetic denial','NotAllowedError'));
  return Promise.resolve(stream());
 }}});
 window.MediaRecorder=class extends EventTarget {
  static isTypeSupported(mime){return mime==='audio/webm;codecs=opus';}
  constructor(){super();this.state='inactive';}
  start(){this.state='recording';f.starts++;}
  stop(){if(this.state==='inactive')return;this.state='inactive';f.stops++;queueMicrotask(()=>{const e=new Event('dataavailable');e.data=new Blob(['synthetic-audio'],{type:'audio/webm;codecs=opus'});this.dispatchEvent(e);this.dispatchEvent(new Event('stop'));});}
 };
 window.AudioContext=class {
  constructor(){this.state='running';f.contexts++;}
  close(){if(this.state!=='closed'){this.state='closed';f.contexts--;}return Promise.resolve();}
  createAnalyser(){return {fftSize:512,getFloatTimeDomainData:frame=>frame.fill(0.03)};}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
  decodeAudioData(data,resolve){const decoded={duration:f.duration};if(f.holdDecode){return new Promise(done=>{f.decode=()=>{resolve(decoded);done(decoded);};});}resolve(decoded);return Promise.resolve(decoded);}
 };
 window.OfflineAudioContext=class {
  constructor(channels,frames,rate){this.frames=frames;this.destination={};f.offline={channels,frames,rate};}
  createBufferSource(){return {connect(){},start(){}};}
  startRendering(){return Promise.resolve({getChannelData:()=>new Float32Array(this.frames).fill(0.03)});}
 };
})()`;
const sheet=`document.querySelector('.companion-voice-sheet')`,composer=`document.querySelector('textarea[aria-disabled]')`;
const button=text=>`Array.from(document.querySelectorAll('button')).find(b=>b.getClientRects().length>0&&(b.getAttribute('aria-label')||b.textContent.trim())===${JSON.stringify(text)})`;
const send=`${sheet}.querySelector('.companion-voice-send')`;
const click=async text=>assert.ok(await page.click(button(text)),text);
const check=async(expr,name,timeoutMs=8000)=>{assert.ok(await page.waitFor(expr,{timeoutMs}),name);report.checks.push(name);};
const counts=()=>({transcribe:wire.filter(w=>w.path==='/api/ai/transcribe').length,chat:wire.filter(w=>w.path==='/api/ai/chat').length});
const unchanged=(before,name)=>{assert.deepEqual(counts(),before);report.checks.push(name);};
const screenshot=async name=>{const {data}=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));report.screenshots.push(name+'.png');};
const size=(width,height)=>page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
const arm=async()=>{await click('Сказать голосом');await check(`${sheet}.open && ${sheet}.textContent.includes('Слушаю — ничего не отправляется')`,'trusted gesture arms real capture owner and opens sheet');};
const aged=()=>page.waitFor(`${sheet}.querySelector('.companion-voice-time')?.textContent!=='0:00'`,{timeoutMs:3000});
const sendClip=async()=>{await aged();await click('Отправить запись');await check(`${sheet}.querySelector('.companion-voice-status')?.textContent==='Распознаю…'`,'explicit second gesture sends clip for transcription');assert.ok(transcribe);};
const answer=(body,status=200)=>{assert.ok(transcribe);json(transcribe.res,body,status);transcribe=null;};
try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await Browser.launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disable-quic']);
 page=await browser.newPage();browser.listeners.add(msg=>{
  if(msg.method!=='Fetch.requestPaused')return;const url=new URL(msg.params.request.url);
  if(url.origin===origin||url.protocol==='data:')void browser.send('Fetch.continueRequest',{requestId:msg.params.requestId},msg.sessionId);
  else {report.externalRequests++;void browser.send('Fetch.failRequest',{requestId:msg.params.requestId,errorReason:'BlockedByClient'},msg.sessionId);}
 });
 await page.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});await page.send('Page.addScriptToEvaluateOnNewDocument',{source:fakeAudio});await size(393,852);await page.goto(origin+'/');
 await check(`!!${button('Войти по паролю')}`,'emitted carrier sign-in');await click('Войти по паролю');
 await page.fill('document.querySelector(\'input[type="text"]\')','synthetic-salon');await page.fill('document.querySelector(\'input[type="email"]\')','owner@example.invalid');await page.fill('document.querySelector(\'input[type="password"]\')','synthetic-password');await click('Войти');
 await check(`document.querySelectorAll('[data-chat-message]').length===2 && ${composer}?.readOnly===false`,'canonical conversation restored');
 await check(`!${sheet}.open && __voiceFixture.arms===0`,'render does not arm or open voice');
 await page.eval(`${button('Сказать голосом')}.click()`);
 await check(`!${sheet}.open && __voiceFixture.arms===0`,'untrusted synthetic click cannot arm');
 const empty=counts();await arm();
 await check(`document.activeElement.id==='maya-voice-title' && __voiceFixture.liveTracks===1`,'modal receives focus while capture listens');
 await page.eval(`${send}.click()`);unchanged(empty,'untrusted sheet click cannot send');
 await check(`${sheet}.querySelector('[role="status"]')===null && document.querySelectorAll('[role="status"]').length>=1`,'sheet avoids duplicate live-region announcement');
 for(const [w,h]of[[393,852],[320,740],[427,952],[1280,900]]){
  await size(w,h);await check(`${sheet}.scrollWidth<=${sheet}.clientWidth && document.documentElement.scrollWidth<=innerWidth`,'voice wraps at '+w);
  await screenshot('voice-listening-'+w);
 }
 await size(393,852);await page.focus(`Array.from(${sheet}.querySelectorAll('button')).at(-1)`);await page.press('Tab');
 await check(`document.activeElement.getAttribute('aria-label')==='Закрыть голосовой ввод'`,'forward Tab stays in voice sheet');await page.press('Tab',{shift:true});
 await check(`document.activeElement.textContent==='Отменить голосовой ввод'`,'backward Tab stays in voice sheet');
 await page.eval(`(() => {for(const el of ${sheet}.querySelectorAll('h2,p,button')){el.dataset.previousFont=el.style.fontSize;el.style.fontSize=(parseFloat(getComputedStyle(el).fontSize)*2)+'px';}})()`);
 await size(320,440);await check(`${sheet}.scrollWidth<=${sheet}.clientWidth && ${sheet}.clientHeight<innerHeight`,'200% text at short height scrolls without horizontal overflow');
 await page.focus(`${sheet}.querySelector('h2')`);await page.press('Tab');await page.press('Tab');await page.press('Tab');await check(`document.activeElement.getBoundingClientRect().bottom<=innerHeight`,'large-text cancel remains keyboard-reachable');await screenshot('voice-large-text-320');
 await page.eval(`document.querySelectorAll('[data-previous-font]').forEach(el=>{el.style.fontSize=el.dataset.previousFont;delete el.dataset.previousFont})`);await size(393,852);
 await page.press('Escape');await check(`!${sheet}.open && __voiceFixture.liveTracks===0 && __voiceFixture.contexts===0 && document.activeElement.getAttribute('aria-label')==='Сказать голосом'`,'Escape stops capture and restores opener');unchanged(empty,'layout and cancellation never transmit');
 // Pending browser permission may settle after cancellation: every late track must close.
 await page.eval(`__voiceFixture.mode='pending'`);await click('Сказать голосом');
 await check(`${sheet}.open && ${sheet}.textContent.includes('Жду разрешения на микрофон') && ${send}.disabled`,'pending permission is honest and send disabled');await screenshot('voice-arming');await click('Отменить голосовой ввод');
 await page.eval(`__voiceFixture.permission()`);await check(`!${sheet}.open && __voiceFixture.liveTracks===0 && __voiceFixture.contexts===0`,'late permission cannot revive cancelled capture');unchanged(empty,'late permission creates no request');await page.eval(`__voiceFixture.mode='ready'`);
 // Visibility cancellation is owned by runtime, and now closes the presentation sheet too.
 await arm();const other=await browser.send('Target.createTarget',{url:'about:blank',browserContextId:page.browserContextId});await browser.send('Target.activateTarget',{targetId:other.targetId});
 await check(`document.hidden && !${sheet}.open && __voiceFixture.liveTracks===0`,'background capture is cancelled and sheet closes');await browser.send('Target.activateTarget',{targetId:page.targetId});await browser.send('Target.closeTarget',{targetId:other.targetId});unchanged(empty,'background capture never sends');
 // Actual runtime 20-second cap, no clock replacement and no implicit send.
 await arm();await check(`${sheet}.textContent.includes('Прошло 20 секунд') && __voiceFixture.liveTracks===0`,'20-second cap holds without transmission',23000);unchanged(empty,'held clip stays local');await screenshot('voice-held');await click('Отменить голосовой ввод');
 // Cancellation during the real encoder's async decode cannot reach transport.
 await page.eval(`__voiceFixture.holdDecode=true`);await arm();await aged();await click('Отправить запись');
 await check(`${sheet}.textContent.includes('Отправляю запись на распознавание') && typeof __voiceFixture.decode==='function'`,'encoder pending state is visible');await screenshot('voice-encoding');await click('Отменить голосовой ввод');await page.eval(`(() => { __voiceFixture.decode(); __voiceFixture.holdDecode=false; })()`);
 await check(`!${sheet}.open && __voiceFixture.contexts===0`,'cancelled encoder releases capture');unchanged(empty,'late encoder continuation creates no request');
 // Decode result too short: not a blank/fake successful turn.
 await page.eval(`__voiceFixture.duration=0.1`);await arm();await aged();await click('Отправить запись');
 await check(`${sheet}.textContent.includes('Запись слишком короткая — ничего не отправлено') && !${send}.disabled`,'too-short clip gives honest retry');await screenshot('voice-too-short');unchanged(empty,'too-short clip cannot transcribe or chat');await click('К разговору');await page.eval(`__voiceFixture.duration=1`);
 // Abort an in-flight transcription; a late response must not become a user turn.
 await arm();await sendClip();await check(`__voiceFixture.liveTracks===0 && ${send}.disabled`,'encoding stops tracks and transcription cannot be double-sent');await screenshot('voice-transcribing');await click('Отменить голосовой ввод');answer({transcript:'Поздний отменённый текст'});
 await check(`!${sheet}.open && document.querySelectorAll('[data-chat-message]').length===2`,'cancelled transcription returns to unchanged timeline');assert.equal(counts().chat,0);report.checks.push('late transcription creates no chat');
 // Failure is not transformed into success; retry is explicit.
 await arm();await sendClip();answer({message:'Synthetic speech rejection',error:{code:'speech_not_recognized'}},400);
 await check(`${sheet}.textContent.includes('Не расслышала — повторите или напишите сообщение') && !${send}.disabled`,'not-recognized is visible with explicit retry');await screenshot('voice-not-recognized');assert.equal(counts().chat,0);await click('К разговору');
 // Spoken and typed share the same canonical writer; preserve unrelated typed draft.
 const transcript='Покажи мои визиты, пожалуйста.';await page.fill(composer,'Несохранённый текст');await arm();await sendClip();
 assert.match(transcribe.data.audioBase64,/^data:audio\/wav;base64,/);const wav=Buffer.from(transcribe.data.audioBase64.split(',')[1],'base64');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(24),16000);report.checks.push('real carrier encoder sends mono 16k WAV through canonical transport');
 answer({transcript});await check(`!${sheet}.open && document.querySelectorAll('[data-chat-message]').length===3`,'transcript becomes one user turn and sheet closes');assert.ok(chat);assert.deepEqual(chat.data.messages.at(-1),{role:'user',content:transcript});assert.equal(chat.data.conversationId,cid);assert.equal(counts().chat,1);report.checks.push('transcript reaches one existing conversation request verbatim');
 json(chat.res,{request_id:chat.data.requestId,reply:'Это искусственный ответ на голосовой вопрос.',action_status:null,user_turn:{turnId:'10000000-0000-4000-8000-000000000004',conversationId:cid}},201);chat=null;
 await check(`document.querySelectorAll('[data-chat-message]').length===4 && ${composer}.value==='Несохранённый текст'`,'spoken response has no duplicate and retains typed draft');await screenshot('voice-return-chat');
 await click('Отправить');await check(`document.querySelectorAll('[data-chat-message]').length===5`,'ordinary typed turn still works');assert.ok(chat);assert.deepEqual(chat.data.messages.at(-1),{role:'user',content:'Несохранённый текст'});assert.equal(chat.data.conversationId,cid);assert.equal(counts().chat,2);
 json(chat.res,{request_id:chat.data.requestId,reply:'Искусственный ответ на текст.',action_status:null,user_turn:{turnId:'10000000-0000-4000-8000-000000000005',conversationId:cid}},201);chat=null;
 await check(`${composer}.value==='' && document.querySelectorAll('[data-chat-message]').length===6`,'same writer completes ordinary typed turn');
 // Provider unavailable is the runtime Cell; no retry that pretends service exists.
 await arm();await sendClip();answer({message:'Synthetic provider unavailable',error:{code:'speech_provider_unavailable'}},503);
 await check(`${sheet}.textContent.includes('Голос недоступен на этом устройстве — напишите сообщение') && !${send}`,'unavailable preserves exact runtime Cell and offers text');await screenshot('voice-unavailable');await click('К разговору');
 await check(`!${sheet}.open && document.activeElement.getAttribute('aria-label')==='Голосовой ввод недоступен' && __voiceFixture.liveTracks===0 && __voiceFixture.contexts===0`,'unavailable sheet closes without retained audio');
 const constraints=await page.eval('__voiceFixture.constraints');assert.ok(constraints.length>5);assert.ok(constraints.every(c=>JSON.stringify(c)===JSON.stringify({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}})));report.checks.push('existing capture constraints unchanged');
 assert.deepEqual(report.unexpected,[]);assert.equal(report.externalRequests,0);assert.deepEqual(page.exceptions,[]);assert.equal(page.issues.filter(i=>i.code==='ContentSecurityPolicyIssue').length,0);report.checks.push('zero unexpected API/network/CSP/JS errors');report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.message;if(page){await screenshot('failure').catch(()=>{});report.exceptions=page.exceptions;report.issues=page.issues;}process.exitCode=1;
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,failure:report.failure,out}));}
