const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../..'),text=fs.readFileSync(path.join(repo,'maya-saas-backend/deploy/platform/beget-edge/rc/r11-governed-settings.js'),'utf8');
const code=text.slice(0,text.indexOf('function openMayaGovernedSettings('));let checks=0;
const store=new Map();
function harness({tenant='tenant-a',user='user-a',revision=0,storage=store,fail=false}={}) {
 const values=[],effects=[],calls=[];let cursor=0, effectSet=false, mode=fail?'lost':'success';
 const React={useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>values[i]=typeof v==='function'?v(values[i]):v]},useEffect(fn){if(!effectSet){effects.push(fn);effectSet=true}},createElement(type,props,...children){return {type,props:props||{},children:children.flat(Infinity)}}};
 const environment={React,URLSearchParams,crypto:crypto.webcrypto,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{location:{search:'?governed_settings=staff_notifications&proposal=120',pathname:'/app/'},__meSaasAuthedFetch:async(p,o)=>{calls.push([p,o]);if(o?.method==='POST'){if(mode==='lost')throw Error('lost_response');if(mode==='denied')throw Object.assign(Error('stale'),{status:409});return {actionExecutionId:'same-execution'};}return {tenantId:tenant,userId:user,config:{schema_version:1,membershipId:'member-'+user,telegramMutedUntil:null},expectedGeneration:revision};}}};
 vm.createContext(environment);vm.runInContext(code,environment);
 function render(){cursor=0;return environment.AMayaGovernedSettings({});}
 function find(node,pred){if(node&&pred(node))return node;for(const child of node?.children||[])if(child&&typeof child==='object'){const found=find(child,pred);if(found)return found;}}
 async function settle(){await new Promise(resolve=>setImmediate(resolve));}
 return {calls,values,setMode:v=>mode=v,async ready(){render();effects.splice(0).forEach(fn=>fn());await settle();render();},async confirm(){const button=find(render(),n=>n.type==='button'&&/Подтвердить|Повторить/.test(n.children.join('')));assert.ok(button);await button.props.onClick();await settle();},render,storage};
}
(async()=>{
 const first=harness({fail:true});await first.ready();assert.equal(first.calls.filter(c=>c[1]?.method==='POST').length,0);checks++;
 await first.confirm();const original=first.calls.find(c=>c[1]?.method==='POST');assert.equal(JSON.parse(original[1].body).durationMinutes,120);checks++;
 assert.equal(store.size,1);const restart=harness({revision:9});await restart.ready();await restart.confirm();const retry=restart.calls.find(c=>c[1]?.method==='POST');assert.equal(JSON.stringify(retry),JSON.stringify(original));assert.equal(store.size,0);checks++;
 const second=harness({fail:true});await second.ready();await second.confirm();const other=harness({tenant:'tenant-b',fail:true});await other.ready();await other.confirm();const [a,b]=[second,other].map(h=>h.calls.find(c=>c[1]?.method==='POST'));assert.notEqual(a[1].headers['Idempotency-Key'],b[1].headers['Idempotency-Key']);checks++;
 second.setMode('denied');await second.confirm();assert.equal([...store.keys()].filter(k=>k.includes('tenant-a')).length,0);assert.equal(second.calls.filter(c=>c[1]?.method==='POST').length,2);checks++;
 console.log(JSON.stringify({package:'R11',proof:'actual PWA confirmation component',checks,result:'PASS',productionEffects:0}));
})().catch(error=>{console.error(error);process.exitCode=1});
