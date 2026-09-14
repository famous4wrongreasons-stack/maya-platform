// R14: confirmed human observation; never an accounting/reconciliation claim.
function AMayaCashDeclaration() {
  var e=React.createElement, state=React.useState(null),session=state[0],setSession=state[1];
  var bs=React.useState(''),branchId=bs[0],setBranch=bs[1],ds=React.useState(''),day=ds[0],setDay=ds[1];
  var vs=React.useState(null),view=vs[0],setView=vs[1],ts=React.useState(''),time=ts[0],setTime=ts[1];
  var as=React.useState(''),amount=as[0],setAmount=as[1],rs=React.useState(''),reason=rs[0],setReason=rs[1];
  var ks=React.useState('COUNT'),kind=ks[0],setKind=ks[1],ps=React.useState(null),pending=ps[0],setPending=ps[1];
  var cs=React.useState(null),card=cs[0],setCard=cs[1],ss=React.useState(''),status=ss[0],setStatus=ss[1];
  var busyState=React.useState(false),busy=busyState[0],setBusy=busyState[1];
  var control={font:'inherit',padding:'10px 14px',border:'1px solid currentColor',borderRadius:12,background:'transparent',color:'inherit',maxWidth:'100%'};
  function request(path,options){if(typeof window.__meSaasAuthedFetch!=='function')throw Error('session');return window.__meSaasAuthedFetch(path,options||{method:'GET'});}
  function scope(data){return 'maya-r14:'+data.tenantId+':'+data.userId;}
  async function load(){try{var data=await request('/cash-declarations/branches');if(!data.tenantId||!data.userId)throw Error('session');setSession(data);var saved=sessionStorage.getItem(scope(data));if(saved){var intent=JSON.parse(saved);if(!intent.key||!intent.command||!['declare','correct'].includes(intent.operation))throw Error('pending');setPending(intent);setCard(intent);setBranch(intent.command.branchId);setDay(intent.command.businessDay);}}catch(_){setStatus('Нужен действующий доступ к кассовым наблюдениям выбранного бизнеса.');}}
  async function read(){setBusy(true);setCard(null);setView(null);try{var data=await request('/cash-declarations?branchId='+encodeURIComponent(branchId)+'&businessDay='+encodeURIComponent(day));setView(data);setStatus('');}catch(_){setStatus('Не удалось прочитать выбранный филиал и день.');}finally{setBusy(false);}}
  function prepare(){try{
    if(!session||!view||view.branch.id!==branchId||view.businessDay!==day)throw Error('scope');
    var branch=session.branches.find(function(b){return b.id===branchId;}),countedAt=new Date(time).toISOString();
    var localDay=new Intl.DateTimeFormat('en-CA',{timeZone:branch.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(countedAt));
    if(localDay!==day||Date.parse(countedAt)>Date.now())throw Error('time');
    var latest=view.revisions[0],kopecks=null;
    if(kind==='COUNT'){if(!/^\d+(?:[.,]\d{1,2})?$/.test(amount))throw Error('amount');var parts=amount.replace(',','.').split('.');kopecks=Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0'));if(!Number.isSafeInteger(kopecks)||kopecks>1000000000)throw Error('amount');}
    if(!latest&&kind!=='COUNT'||latest&&!reason.trim())throw Error('reason');
    setCard({operation:latest?'correct':'declare',branchName:branch.name,command:{confirmed:true,branchId:branch.id,businessDay:day,timezone:branch.timezone,countedAt:countedAt,currency:'RUB',countedCashKopecks:kopecks,declarationKind:kind,expectedRevision:latest?latest.revision:0,previousDeclarationId:latest?latest.id:null,reason:reason.trim()||null}});setStatus('');
  }catch(_){setStatus('Проверьте филиал, день, время и сумму. Для исправления или отзыва нужна причина.');}}
  async function confirm(){if(!session||!card)return;setBusy(true);try{var intent=pending;if(!intent){intent=Object.assign({},card,{key:crypto.randomUUID()});sessionStorage.setItem(scope(session),JSON.stringify(intent));setPending(intent);}
    var result=await request('/cash-declarations/'+intent.operation,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':intent.key},body:JSON.stringify(intent.command)});
    if(!result||!result.declarationId||!result.actionExecutionId)throw Error('unresolved');
    sessionStorage.removeItem(scope(session));setPending(null);setCard(null);setView(null);setStatus('Наблюдение сохранено. Перечитайте историю выбранного дня.');
  }catch(error){if(error&&[400,403,409].includes(error.status)){sessionStorage.removeItem(scope(session));setPending(null);setCard(null);setView(null);setStatus('Запрос отклонён. Перечитайте историю перед новым подтверждением.');}else setStatus('Результат не подтверждён. Повторите тот же запрос: его ключ и параметры сохранены.');}finally{setBusy(false);}}
  React.useEffect(function(){load();},[]);
  var locked=busy||!!pending||!!card;
  function input(label,value,setter,type){return e('label',{style:{display:'block',marginTop:12}},label,e('input',{type:type||'text',value:value,disabled:locked,onChange:function(ev){setter(ev.target.value);},style:Object.assign({},control,{display:'block'})}));}
  return e('section',{'aria-label':'Подтверждение физической наличности',style:{fontFamily:'Manrope, sans-serif',maxWidth:620,margin:'20px auto',padding:20}},
    e('h2',null,'Физическая наличность'),e('p',null,'Личный пересчёт наличных в выбранном филиале. Это наблюдение, без расчёта прибыли или сверки с выручкой.'),
    session?e('div',null,e('label',null,'Филиал ',e('select',{value:branchId,disabled:locked,onChange:function(ev){setBranch(ev.target.value);setView(null);},style:control},e('option',{value:''},'Выберите филиал'),session.branches.map(function(branch){return e('option',{key:branch.id,value:branch.id},branch.name+' — '+branch.timezone);}))),
      input('День в часовом поясе филиала',day,function(value){setDay(value);setView(null);},'date'),
      e('button',{type:'button',disabled:locked||!branchId||!day,onClick:read,style:control},'Прочитать историю'),
      view?e('div',null,e('p',null,view.state==='DECLARED'?'Есть подтверждённое наблюдение. Изменение создаст новую ревизию.':view.state==='WITHDRAWN'?'Последнее наблюдение отозвано. Новое значение будет исправлением.':'Подтверждённых наблюдений нет.'),
        view.revisions.map(function(row){return e('p',{key:row.id},'Ревизия '+row.revision+': '+(row.kind==='WITHDRAWAL'?'отозвана':(row.countedCashKopecks/100).toFixed(2)+' ₽')+'; пересчёт '+row.countedAt+'; записано '+row.createdAt+'; автор '+row.declaredByUserId+(row.reason?'; '+row.reason:''));}),
        input('Время пересчёта (часовой пояс этого устройства)',time,setTime,'datetime-local'),
        view.revisions.length?e('label',null,'Действие ',e('select',{value:kind,disabled:locked,onChange:function(ev){setKind(ev.target.value);},style:control},e('option',{value:'COUNT'},'Исправить сумму'),e('option',{value:'WITHDRAWAL'},'Отозвать наблюдение'))):null,
        kind==='COUNT'?input('Физически пересчитанная сумма, рубли',amount,setAmount):null,input('Причина / пояснение',reason,setReason),
        e('button',{type:'button',disabled:locked,onClick:prepare,style:control},'Проверить карточку')):null):null,
    card?e('div',null,e('h3',null,'Подтверждение'),e('p',null,(card.branchName||card.command.branchId)+'; '+card.command.businessDay+'; '+card.command.timezone+'; время '+card.command.countedAt),e('p',null,card.command.declarationKind==='WITHDRAWAL'?'Отозвать наблюдение; сумма станет недоступна.':'Подтверждаю пересчёт: '+(card.command.countedCashKopecks/100).toFixed(2)+' ₽'),e('p',null,'Исходная ревизия: '+card.command.expectedRevision+'. '+(card.command.reason||'')),e('button',{type:'button',disabled:busy,onClick:confirm,style:control},pending?'Повторить подтверждённый запрос':'Подтвердить наблюдение'),!pending?e('button',{type:'button',onClick:function(){setCard(null);},style:control},'Исправить карточку'):null):null,
    status?e('p',{role:'status'},status):null,e('a',{href:window.location.pathname,style:{display:'block',marginTop:16}},'Вернуться в Maya'));
}
function openMayaCashDeclaration(){if(new URLSearchParams(window.location.search).get('cash_declaration')!=='1')return;var host=document.createElement('div');host.id='maya-cash-declaration';Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'2147483000',overflow:'auto',background:'#fff',color:'#171717',paddingTop:'env(safe-area-inset-top)'});document.body.appendChild(host);if(typeof ReactDOM.createRoot==='function')ReactDOM.createRoot(host).render(React.createElement(AMayaCashDeclaration));else ReactDOM.render(React.createElement(AMayaCashDeclaration),host);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openMayaCashDeclaration,{once:true});else openMayaCashDeclaration();
