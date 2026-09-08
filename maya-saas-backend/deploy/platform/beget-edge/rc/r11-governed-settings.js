// R11 confirmation surface. Browser proposals carry no actor/tenant authority.
function AMayaGovernedSettings(props) {
  var e=React.createElement, query=new URLSearchParams(window.location.search);
  var initial=query.get('governed_settings') || 'business_rules';
  var nsState=React.useState(initial),ns=nsState[0],setNs=nsState[1];
  var state=React.useState(null),loaded=state[0],setLoaded=state[1];
  var textState=React.useState(''),text=textState[0],setText=textState[1];
  var choiceState=React.useState(''),choice=choiceState[0],setChoice=choiceState[1];
  var statusState=React.useState(''),status=statusState[0],setStatus=statusState[1];
  var pendingState=React.useState(null),pending=pendingState[0],setPending=pendingState[1];
  var busyState=React.useState(false),busy=busyState[0],setBusy=busyState[1];
  var button={font:'inherit',padding:'10px 14px',border:'1px solid currentColor',borderRadius:12,background:'transparent',color:'inherit'};
  function request(path,options) {
    if(typeof window.__meSaasAuthedFetch!=='function')return Promise.reject(new Error('session'));
    return window.__meSaasAuthedFetch(path,options || {method:'GET'});
  }
  async function load(namespace) {
    setBusy(true);setStatus('');setLoaded(null);setPending(null);
    try {
      var personal=await request('/governed-settings/personal');
      if(!personal || !personal.tenantId || !personal.userId)throw Error('session');
      var snapshot=namespace==='staff_notifications' ? personal : await request('/governed-settings/tenant/'+namespace);
      var storageKey='maya-r11:'+personal.tenantId+':'+personal.userId+':'+namespace;
      var saved=sessionStorage.getItem(storageKey), previous=saved?JSON.parse(saved):null;
      if(previous && (typeof previous.key!=='string' || !previous.command || previous.namespace!==namespace))throw Error('pending');
      setLoaded({snapshot:snapshot,storageKey:storageKey});setPending(previous);
      var proposal=query.get('governed_settings')===namespace ? query.get('proposal') : null;
      if(namespace==='business_rules')setText((snapshot.content.rules || []).map(function(row){return row.text;}).concat(proposal?[proposal]:[]).join('\n'));
      if(namespace==='client_capabilities')setChoice(proposal==='on'?'on':proposal==='off'?'off':snapshot.content.client_self_visit_history?'on':'off');
      if(namespace==='staff_ai_provider')setChoice(['claude','openai'].includes(proposal)?proposal:snapshot.content&&snapshot.content.provider || '');
      if(namespace==='staff_notifications')setChoice(proposal==='off'?'off':/^\d+$/.test(proposal || '')?proposal:'120');
    }catch(_){setStatus('Не удалось открыть настройки. Нужен действующий вход в Maya и доступ к этому бизнесу.');}
    finally{setBusy(false);}
  }
  async function confirm() {
    if(!loaded)return;
    setBusy(true);setStatus('');
    try {
      var intent=pending;
      if(!intent) {
        var command, snapshot=loaded.snapshot;
        if(ns==='staff_notifications')command={confirmed:true,expectedGeneration:snapshot.expectedGeneration,durationMinutes:choice==='off'?null:Number(choice)};
        else {
          var content;
          if(ns==='business_rules') {
            var old=snapshot.content.rules || [], used={};
            content={rules:text.split('\n').map(function(value){return value.trim();}).filter(Boolean).map(function(value){
              var match=old.find(function(row){return row.text===value&&!used[row.id];});if(match)used[match.id]=true;
              return {id:match?match.id:null,text:value};
            })};
          } else content=ns==='client_capabilities'?{client_self_visit_history:choice==='on'}:{provider:choice};
          command={confirmed:true,namespace:ns,expectedRevision:snapshot.revision,previousRevisionId:snapshot.previousRevisionId,content:content};
        }
        intent={key:crypto.randomUUID(),namespace:ns,command:command};
        sessionStorage.setItem(loaded.storageKey,JSON.stringify(intent));setPending(intent);
      }
      var result=await request('/governed-settings/'+(ns==='staff_notifications'?'personal':'tenant'),{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':intent.key},body:JSON.stringify(intent.command)});
      if(!result || !result.actionExecutionId)throw Error('unresolved');
      sessionStorage.removeItem(loaded.storageKey);setPending(null);await load(ns);setStatus('Изменение подтверждено и сохранено.');
    }catch(error){
      if(error && [400,403,409].includes(error.status)) {
        sessionStorage.removeItem(loaded.storageKey);setPending(null);await load(ns);
        setStatus('Изменение отклонено. Проверьте параметры и текущую версию перед новым подтверждением.');
      } else setStatus('Результат не подтверждён. Повторите этот же запрос; его параметры и ключ сохранены.');
    }
    finally{setBusy(false);}
  }
  React.useEffect(function(){load(ns);},[ns]);
  var labels={business_rules:'Правила бизнеса',client_capabilities:'История посещений в чате',staff_ai_provider:'AI для советов сотрудникам',staff_notifications:'Мои уведомления Telegram'};
  return e('section',{'aria-label':'Подтверждение настроек Maya',style:{fontFamily:'Manrope, sans-serif',maxWidth:620,margin:'20px auto',padding:20}},
    e('h2',null,'Настройки Maya'),e('p',null,'Изменение применяется после подтверждения к вашему аккаунту или текущему бизнесу.'),
    e('label',null,'Раздел ',e('select',{value:ns,disabled:busy||!!pending,onChange:function(ev){setNs(ev.target.value);},style:button},Object.keys(labels).map(function(key){return e('option',{key:key,value:key},labels[key]);}))),
    loaded?e('div',{style:{marginTop:16}},
      ns==='business_rules'?e('label',null,'Правила: одно на строку, до 40 правил.',e('textarea',{rows:9,value:text,disabled:busy||!!pending,onChange:function(ev){setText(ev.target.value);},style:{display:'block',width:'100%',font:'inherit',marginTop:8}})):
      ns==='client_capabilities'?e('label',null,'Клиент видит только собственную историю ',e('select',{value:choice,disabled:busy||!!pending,onChange:function(ev){setChoice(ev.target.value);},style:button},e('option',{value:'off'},'Выключено'),e('option',{value:'on'},'Включено'))):
      ns==='staff_ai_provider'?e('label',null,'Провайдер ',e('select',{value:choice,disabled:busy||!!pending,onChange:function(ev){setChoice(ev.target.value);},style:button},e('option',{value:''},'Выберите'),e('option',{value:'claude'},'Claude'),e('option',{value:'openai'},'OpenAI'))):
      e('div',null,e('p',null,'Mute действует только на необязательные рабочие уведомления Telegram, максимум 24 часа.'),e('label',null,'Минуты или off для отключения ',e('input',{value:choice,disabled:busy||!!pending,onChange:function(ev){setChoice(ev.target.value);},style:button}))),
      pending?e('p',null,'Ожидается результат ранее подтверждённого запроса. Повтор сохраняет исходное намерение.'):null,
      e('button',{type:'button',disabled:busy,onClick:confirm,style:Object.assign({},button,{marginTop:16})},pending?'Повторить подтверждённый запрос':'Подтвердить изменение')):null,
    status?e('p',{role:'status'},status):null,
    e('a',{href:window.location.pathname,style:{display:'inline-block',marginTop:16}},'Вернуться в Maya'));
}
function openMayaGovernedSettings() {
  var query=new URLSearchParams(window.location.search);
  if(!['business_rules','client_capabilities','staff_ai_provider','staff_notifications'].includes(query.get('governed_settings')))return;
  var host=document.createElement('div');host.id='maya-governed-settings';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'2147483000',overflow:'auto',background:'#fff',color:'#171717',paddingTop:'env(safe-area-inset-top)'});
  document.body.appendChild(host);
  if(typeof ReactDOM.createRoot==='function')ReactDOM.createRoot(host).render(React.createElement(AMayaGovernedSettings));
  else ReactDOM.render(React.createElement(AMayaGovernedSettings),host);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openMayaGovernedSettings,{once:true});
else openMayaGovernedSettings();
