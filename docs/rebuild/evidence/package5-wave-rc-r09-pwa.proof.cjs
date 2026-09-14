const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../..'),source=fs.readFileSync(path.join(repo,'maya-saas-backend/deploy/platform/beget-edge/rc/r09-community-moderation.js'),'utf8').split('function openMayaCommunityModeration')[0],storage=new Map();
function harness({tenant='tenant-a',user='moderator-a',lost=false,status='PENDING'}={}){
  const states=[],effects=[],calls=[];let index=0,installed=false;
  const React={useState(value){const n=index++;if(!(n in states))states[n]=value;return[states[n],value=>states[n]=value];},useEffect(fn){if(!installed){effects.push(fn);installed=true;}},createElement(type,props,...children){return{type,props:props||{},children:children.flat(Infinity)}}};
  const data={tenantId:tenant,userId:user,comments:[{id:'comment-a',contentHash:'a'.repeat(64),revision:2,status,sourceKind:'GUEST',author:'Гость',text:'Публичный комментарий',publicationKey:'known'}],nextCursor:null};
  const env={React,crypto:crypto.webcrypto,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{__meSaasAuthedFetch:async(url,options)=>{calls.push({url,options});if(options.method==='POST'){if(lost)throw Error('response lost');return{contract:'maya.public-community/1',actionExecutionId:'accepted'};}return data;}}};
  vm.createContext(env);vm.runInContext(source,env);
  function render(){index=0;return env.AMayaCommunityModeration();}
  function find(node,predicate){if(predicate(node))return node;for(const child of node?.children||[])if(child&&typeof child==='object'){const found=find(child,predicate);if(found)return found;}}
  return{states,calls,render,mutations:()=>calls.filter(c=>c.options.method==='POST'),async ready(){render();effects.splice(0).forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));},async click(label){const button=find(render(),n=>n?.type==='button'&&n.children.join('').includes(label));assert.ok(button,label);await button.props.onClick();},fill(value){find(render(),n=>n?.type==='textarea').props.onChange({target:{value}});}};
}
(async()=>{
  const first=harness({lost:true});await first.ready();assert.equal(first.mutations().length,0);await first.click('Опубликовать');assert.equal(first.mutations().length,0);await first.click('Подтвердить / повторить');const original=first.mutations()[0];assert.equal(storage.size,1);const command=JSON.parse(original.options.body);assert.deepEqual(command,{commentId:'comment-a',contentHash:'a'.repeat(64),expectedRevision:2,decision:'approve',reasonCode:'human_approve',text:null});
  const foreign=harness({tenant:'tenant-b'});await foreign.ready();assert.equal(foreign.states[1],null);assert.equal(foreign.mutations().length,0);
  const retry=harness();await retry.ready();await retry.click('Подтвердить / повторить');assert.equal(JSON.stringify(retry.mutations()[0]),JSON.stringify(original));assert.equal(storage.size,0);
  const answer=harness({status:'APPROVED'});await answer.ready();await answer.click('Ответить от имени бренда');answer.fill('  Спасибо\r\nза вопрос. ');await answer.click('Проверить ответ');assert.equal(answer.mutations().length,0);await answer.click('Подтвердить / повторить');const replied=JSON.parse(answer.mutations()[0].options.body);assert.equal(replied.text,'Спасибо\nза вопрос.');assert.equal(replied.decision,null);assert.equal(replied.reasonCode,null);assert.equal(answer.mutations()[0].url,'/public-community/moderation/reply');
  const cancel=harness();await cancel.ready();await cancel.click('Отклонить');await cancel.click('Вернуться');assert.equal(cancel.mutations().length,0);assert.equal(storage.size,0);
  console.log(JSON.stringify({package:'R09',proof:'actual moderator handlers in VM',result:'PASS',checks:5,productionEffects:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
