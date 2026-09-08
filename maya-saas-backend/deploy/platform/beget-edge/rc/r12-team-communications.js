// R12 transport only. Canonical User/tenant come from the authenticated feed;
// persisted request identities contain no raw Telegram or legacy conversation ID.
function mayaTeamTransport(scope, request, storage) {
  var prefix='maya-r12:'+scope.tenantId+':'+scope.userId+':';
  function read(kind){var raw=storage.getItem(prefix+kind);return raw?JSON.parse(raw):null;}
  function save(kind,value){storage.setItem(prefix+kind,JSON.stringify(value));return value;}
  function clear(kind){storage.removeItem(prefix+kind);}
  async function command(operation,body,key){var r=await request('/team-communications/commands/'+operation,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});if(!r||r.contract!=='maya.team-communications/1'||!r.actionExecutionId)throw Error('receipt_unknown');return r;}
  function intent(kind,operation,body){var pending=read(kind);if(pending){if(pending.operation!==operation||JSON.stringify(pending.body)!==JSON.stringify(body))throw Error('pending_intent_changed');return pending;}return save(kind,{operation:operation,body:body,key:crypto.randomUUID()});}
  function rejectTerminal(kind,r){if(r&&r.contract==='maya.team-communications/1'&&r.actionExecutionId&&['FAILED','NOT_EXECUTED'].includes(r.state)){clear(kind);throw Error('command_rejected');}}
  async function submit(kind,operation,body){var p=intent(kind,operation,body),r=await command(operation,p.body,p.key);rejectTerminal(kind,r);if(operation==='send'?r.status!=='SENT'||!r.messageId:operation==='withdraw'?r.status!=='WITHDRAWN'||!r.messageId:true)throw Error('receipt_unknown');clear(kind);return r;}
  async function retry(kind){var p=read(kind);if(!p)throw Error('no_pending');return submit(kind,p.operation,p.body);}
  async function upload(file,progress){
    var mime=(file.type||'application/octet-stream').toLowerCase().split(';')[0],kind=mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'file';
    if(!file.size||file.size>(kind==='video'?1073741824:21*1024*1024))throw Error('file_size');
    var digest=await mayaTeamFileHash(file),body={contentSha256:digest,declaredSize:file.size,kind:kind,mime:mime,filename:String(file.name||'attachment').normalize('NFC').trim(),retentionPolicyVersion:1};
    var p=read('upload');if(p&&JSON.stringify(p.reserve)!==JSON.stringify(body))throw Error('pending_file_changed');
    if(!p)p=save('upload',{reserve:body,reserveKey:crypto.randomUUID(),finalKey:crypto.randomUUID(),sendKey:crypto.randomUUID(),attachmentId:null,sealed:false});
    if(!p.attachmentId){var reserved=await command('reserve',p.reserve,p.reserveKey);rejectTerminal('upload',reserved);if(reserved.state!=='RESERVED'||!reserved.attachmentId)throw Error('receipt_unknown');p.attachmentId=reserved.attachmentId;save('upload',p);}
    if(!p.finalStarted){
      for(var i=0;i<Math.ceil(file.size/6291456);i++){
        var bytes=new Uint8Array(await file.slice(i*6291456,(i+1)*6291456).arrayBuffer()),binary='';for(var n=0;n<bytes.length;n+=32768)binary+=String.fromCharCode.apply(null,bytes.subarray(n,n+32768));
        var result=await request('/team-communications/attachments/'+encodeURIComponent(p.attachmentId)+'/chunks/'+i,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base64:btoa(binary)})});
        if(!result||result.contract!=='maya.team-communications/1'||result.attachmentId!==p.attachmentId||result.index!==i)throw Error('receipt_unknown');if(progress)progress(Math.round((i+1)/Math.ceil(file.size/6291456)*90));
      }
      p.finalStarted=true;save('upload',p);
    }
    return finishUpload(p,progress);
  }
  async function finishUpload(p,progress){
    if(!p||!p.attachmentId||!p.finalStarted)throw Error('select_original_file');
    if(!p.sealed){var final=await command('finalize',{attachmentId:p.attachmentId,expectedDigest:p.reserve.contentSha256},p.finalKey);rejectTerminal('upload',final);if(final.state!=='SEALED')throw Error('receipt_unknown');p.sealed=true;save('upload',p);}
    var sent=await command('send',{conversationKey:'team/main',text:'',attachmentId:p.attachmentId},p.sendKey);rejectTerminal('upload',sent);if(sent.status!=='SENT'||!sent.messageId)throw Error('receipt_unknown');clear('upload');if(progress)progress(100);return sent;
  }
  return{read:read,submit:submit,retry:retry,upload:upload,resumeUpload:function(progress){return finishUpload(read('upload'),progress);}};
}

// Incremental SHA-256 keeps the existing 1 GiB video limit without allocating a
// 1 GiB ArrayBuffer. The proof compares every boundary with the platform digest.
async function mayaTeamFileHash(file){
  var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2],H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64);
  function r(x,n){return(x>>>n)|(x<<(32-n));}
  function block(bytes,at){for(var i=0;i<16;i++)w[i]=(bytes[at+4*i]<<24)|(bytes[at+4*i+1]<<16)|(bytes[at+4*i+2]<<8)|bytes[at+4*i+3];for(i=16;i<64;i++){var x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(r(x,7)^r(x,18)^(x>>>3))+w[i-7]+(r(y,17)^r(y,19)^(y>>>10)))>>>0;}var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];for(i=0;i<64;i++){var t=(h+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,u=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t)>>>0;d=c;c=b;b=a;a=(t+u)>>>0;}[a,b,c,d,e,f,g,h].forEach(function(v,i){H[i]=(H[i]+v)>>>0;});}
  var full=file.size-file.size%64;for(var at=0;at<full;at+=1048576){var end=Math.min(full,at+1048576),chunk=new Uint8Array(await file.slice(at,end).arrayBuffer());for(var p=0;p<chunk.length;p+=64)block(chunk,p);}
  var remaining=new Uint8Array(await file.slice(full).arrayBuffer()),tail=new Uint8Array(remaining.length<56?64:128);tail.set(remaining);tail[remaining.length]=128;var bits=file.size*8;new DataView(tail.buffer).setUint32(tail.length-8,Math.floor(bits/4294967296));new DataView(tail.buffer).setUint32(tail.length-4,bits>>>0);for(p=0;p<tail.length;p+=64)block(tail,p);return H.map(function(x){return x.toString(16).padStart(8,'0');}).join('');
}

// The same saved canonical session is used for binary transport. A fresh feed
// read with that credential must match the currently open User/tenant first.
async function mayaTeamPrivateBlob(scope,id){
  if(!/^[A-Za-z0-9_.:-]{1,160}$/.test(id))throw Error('attachment');
  var ctx=window.__ME_SAAS_CTX||{},base=String(ctx.api||'').replace(/\/+$/,''),auth=JSON.parse(localStorage.getItem('me_saas_auth_v2:'+ctx.ns)||'null');
  if(!base||!auth||!auth.token||(auth.tenant_slug&&String(auth.tenant_slug).toLowerCase()!==String(ctx.slug||'').toLowerCase())||(auth.api_base&&String(auth.api_base).replace(/\/+$/,'').toLowerCase()!==base.toLowerCase()))throw Error('session');
  var options={method:'GET',headers:{Authorization:'Bearer '+auth.token},cache:'no-store'},check=await fetch(base+'/team-communications/messages',options);if(!check.ok)throw Error('session');var verified=await check.json();
  if(verified.contract!=='maya.team-communications/1'||verified.tenantId!==scope.tenantId||verified.userId!==scope.userId)throw Error('session_changed');
  var response=await fetch(base+'/team-communications/attachments/'+encodeURIComponent(id),options);if(!response.ok)throw Error('media_unavailable');return response.blob();
}

function ATeamChat(){
  var e=React.createElement,dark=window.__meDark,INK=dark?'#f3ede1':'#1f1c16',PAGE_BG=dark?'#0c0c10':'#ffffff',OWN_FILL='#a19e9b',IN_FILL=dark?'#262629':'#e9e9eb',OWN_INK='#ffffff',IN_INK=INK,BUBBLE_SHADOW='none';
  var CHAT_FONT='-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
  var BUBBLE_TAIL_PATH='M10.0206 12.9416C9.78651 11.7287 9.66391 10.4761 9.66391 9.19488V0.402926H29.3165V28.8475C24.5575 28.8475 20.1936 27.1559 16.7932 24.3413C13.4008 26.6012 7.96114 28.7495 1.38911 27.5546C3.19922 26.7788 10.1811 22.1243 9.92249 12.8151C9.95387 12.8583 9.9866 12.9004 10.0206 12.9416Z';
  // R12_BUBBLE_REFERENCE is replaced with the unchanged existing bubble helper.
  var MessageBubble;
  var s=React.useState(null),loaded=s[0],setLoaded=s[1],ts=React.useState(''),text=ts[0],setText=ts[1],bs=React.useState(false),busy=bs[0],setBusy=bs[1],ss=React.useState(''),status=ss[0],setStatus=ss[1],ps=React.useState(0),progress=ps[0],setProgress=ps[1],rs=React.useState(false),recording=rs[0],setRecording=rs[1],vs=React.useState(null),voice=vs[0],setVoice=vs[1];
  var recorder=React.useRef(null),streams=React.useRef([]),urls=React.useRef([]),scroller=React.useRef(null),busyRef=React.useRef(false),scopeRef=React.useRef(null),uploadRef=React.useRef(null);
  var button={font:'inherit',padding:'9px 13px',borderRadius:18,border:'1px solid '+(dark?'#48484a':'#d8d8da'),color:INK,background:'transparent',minHeight:44};
  function request(path,options){if(typeof window.__meSaasAuthedFetch!=='function')return Promise.reject(Error('session'));return window.__meSaasAuthedFetch(path,options||{method:'GET'});}
  function transport(){if(!loaded)throw Error('session');return mayaTeamTransport(loaded,request,sessionStorage);}
  async function load(before){try{var result=await request('/team-communications/messages'+(before?'?before='+encodeURIComponent(before):''));if(!result||result.contract!=='maya.team-communications/1'||!result.userId||!result.tenantId)throw Error('session');var current=result.tenantId+':'+result.userId;
    if(scopeRef.current&&scopeRef.current!==current){setText('');setVoice(null);urls.current.forEach(URL.revokeObjectURL);urls.current=[];}scopeRef.current=current;
    setLoaded(function(old){if(before&&old&&old.tenantId===result.tenantId&&old.userId===result.userId)result.messages=old.messages.concat(result.messages.filter(function(m){return!old.messages.some(function(x){return x.id===m.id;});}));return result;});
  }catch(_){setStatus('Не удалось открыть командный чат. Проверьте вход в MAYA.');}}
  async function perform(work){if(busyRef.current)return;busyRef.current=true;setBusy(true);setStatus('');try{await work();await load();}catch(error){setStatus(error.message==='command_rejected'?'Запрос отклонён. Можно исправить данные и отправить новый.':error.message==='select_original_file'?'Выберите тот же файл для продолжения загрузки.':error.message==='pending_file_changed'||error.message==='pending_intent_changed'?'Предыдущая отправка ещё не подтверждена. Продолжите её с исходными параметрами.':'Результат не подтверждён. Исходный запрос сохранён; повторите его.');}finally{busyRef.current=false;setBusy(false);}}
  function send(){var value=text.normalize('NFC').replace(/\r\n?/g,'\n').trim();if(!value)return;return perform(async function(){await transport().submit('message','send',{conversationKey:'team/main',text:value,attachmentId:null});setText('');});}
  function withdraw(message){if(!message.own||message.status!=='SENT')return;return perform(async function(){if(!await meConfirmDialog({kind:'team-message',title:'Отозвать сообщение?',message:'Оно исчезнет из будущих просмотров. Уже прочитанные копии отозвать нельзя.',confirmLabel:'Отозвать'}))return;await transport().submit('withdrawal','withdraw',{messageId:message.id,expectedRevision:message.revision});});}
  function upload(file){if(!file)return;uploadRef.current=file;return perform(async function(){await transport().upload(file,setProgress);uploadRef.current=null;setVoice(null);});}
  async function startRecording(){if(busy||recording)return;try{var stream=await navigator.mediaDevices.getUserMedia({audio:true});streams.current.push(stream);var candidates=['audio/mp4','audio/webm;codecs=opus','audio/ogg;codecs=opus'],mime=candidates.find(function(m){return MediaRecorder.isTypeSupported(m);}),rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];rec.ondataavailable=function(event){if(event.data.size)chunks.push(event.data);};rec.onstop=function(){stream.getTracks().forEach(function(t){t.stop();});var type=rec.mimeType.split(';')[0]||'audio/webm',file=new File(chunks,'voice.'+(type==='audio/mp4'?'m4a':type==='audio/ogg'?'ogg':'webm'),{type:type});setVoice(file);setRecording(false);};rec.start();recorder.current=rec;setRecording(true);}catch(_){setStatus('Не удалось открыть микрофон. Можно приложить готовую аудиозапись.');}}
  function stopRecording(){if(recorder.current&&recorder.current.state!=='inactive')recorder.current.stop();}
  function download(message){return perform(async function(){var blob=await mayaTeamPrivateBlob(loaded,message.attachment.id),url=URL.createObjectURL(blob);urls.current.push(url);var a=document.createElement('a');a.href=url;a.download=message.attachment.filename;a.click();});}
  React.useEffect(function(){load();var timer=setInterval(function(){if(!busyRef.current)load();},10000);return function(){clearInterval(timer);if(recorder.current&&recorder.current.state!=='inactive')recorder.current.stop();streams.current.forEach(function(s){s.getTracks().forEach(function(t){t.stop();});});urls.current.forEach(URL.revokeObjectURL);};},[]);
  React.useEffect(function(){window.__meActiveRootBg=PAGE_BG;if(window.__meApplyRootBg)window.__meApplyRootBg();return function(){if(window.__meActiveRootBg===PAGE_BG)delete window.__meActiveRootBg;if(window.__meApplyRootBg)window.__meApplyRootBg();};},[PAGE_BG]);
  var pending=loaded?transport():null,messages=loaded?(loaded.messages||[]).slice().reverse():[];
  return e('section',{'aria-label':'Командный чат',style:{background:PAGE_BG,color:INK,fontFamily:CHAT_FONT,minHeight:360,display:'flex',flexDirection:'column',padding:'16px 20px calc(16px + env(safe-area-inset-bottom))',gap:12}},
    e('div',null,e('strong',null,'Команда'),e('div',{style:{fontSize:12,opacity:.65}},'Сообщения — 365 дней · Вложения — 48 часов')),
    loaded&&loaded.nextCursor?e('button',{style:button,disabled:busy,onClick:function(){load(loaded.nextCursor);}},'Ранее'):null,
    e('div',{ref:scroller,style:{display:'flex',flexDirection:'column',gap:12,overflowY:'auto',minHeight:180,maxHeight:'60vh',padding:'8px 6px'}},messages.length?messages.map(function(m){return e('div',{key:m.id,style:{display:'flex',flexDirection:'column',gap:4}},e(MessageBubble,{side:m.own?'right':'left'},e('div',{style:{fontSize:12,opacity:.8}},m.own?'Вы':m.senderName||'Сотрудник'),e('div',{style:{fontSize:17,lineHeight:1.3,whiteSpace:'pre-wrap',overflowWrap:'break-word'}},m.status==='WITHDRAWN'?'Сообщение отозвано':m.text),m.attachment?e('button',{style:button,disabled:busy,onClick:function(){download(m);}},m.attachment.filename+' · скачать'):null),m.own&&m.status==='SENT'?e('button',{style:{...button,alignSelf:'flex-end',minHeight:30,padding:'2px 8px',fontSize:12},disabled:busy,onClick:function(){withdraw(m);}},'Отозвать'):null); }):e('p',{style:{opacity:.65}},loaded?'Новых сообщений пока нет.':'Открываю чат…')),
    status?e('p',{role:'status'},status):null,
    pending&&pending.read('message')?e('button',{style:button,disabled:busy,onClick:function(){perform(async function(){await transport().retry('message');setText('');});}},'Повторить сохранённое сообщение'):null,
    pending&&pending.read('withdrawal')?e('button',{style:button,disabled:busy,onClick:function(){perform(function(){return transport().retry('withdrawal');});}},'Продолжить отзыв'):null,
    pending&&pending.read('upload')?e('button',{style:button,disabled:busy,onClick:function(){if(uploadRef.current)upload(uploadRef.current);else perform(function(){return transport().resumeUpload(setProgress);});}},'Продолжить вложение'):null,
    e('textarea',{value:text,maxLength:2000,disabled:busy||!loaded||recording,placeholder:'Сообщение команде',onChange:function(ev){setText(ev.target.value);},style:{font:CHAT_FONT,fontSize:17,borderRadius:18,padding:'10px 14px',background:IN_FILL,color:INK,border:'none',resize:'vertical'}}),
    e('div',{style:{display:'flex',flexWrap:'wrap',gap:8}},e('button',{style:button,disabled:busy||!loaded||!text.trim()||recording,onClick:send},busy?'Подождите…':'Отправить'),e('label',{style:button},'Прикрепить',e('input',{type:'file',disabled:busy||!loaded||recording,style:{display:'block',maxWidth:220},onChange:function(ev){var file=ev.target.files&&ev.target.files[0];ev.target.value='';upload(file);}})),e('button',{style:button,disabled:busy||!loaded,onClick:recording?stopRecording:startRecording},recording?'Остановить запись':'Записать голос')),
    voice?e('div',null,'Аудиозапись готова. ',e('button',{style:button,disabled:busy,onClick:function(){upload(voice);}},'Отправить запись'),e('button',{style:button,disabled:busy,onClick:function(){setVoice(null);}},'Отменить')):null,
    busy&&progress?e('div',{role:'status'},'Вложение: '+progress+'%'):null);
}
function openMayaTeamCommunications(){if(new URLSearchParams(window.location.search).get('team')!=='main')return;var host=document.createElement('div');host.id='maya-team-communications';Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'2147483000',overflow:'auto',background:window.__meDark?'#0c0c10':'#fff',paddingTop:'env(safe-area-inset-top)'});document.body.appendChild(host);var close=React.createElement('a',{href:window.location.pathname,style:{display:'block',padding:16,color:'inherit'}},'Закрыть');var view=React.createElement(React.Fragment,null,close,React.createElement(ATeamChat));if(typeof ReactDOM.createRoot==='function')ReactDOM.createRoot(host).render(view);else ReactDOM.render(view,host);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openMayaTeamCommunications);else openMayaTeamCommunications();
