const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../../..'), crypto = require('node:crypto');
const source = fs.readFileSync(path.join(repo, 'maya-saas-backend/deploy/platform/beget-edge/rc/r09-public-community.js'), 'utf8');
const memory = new Map(), effects = [], state = { version: 0, liked: false, scope: 'a'.repeat(64), fail: false, receipt: new Map(), comments: 0 };
function page() {
  const context = vm.createContext({ crypto, sessionStorage: { getItem:k => memory.get(k) ?? null, setItem:(k,v) => memory.set(k,v), removeItem:k => memory.delete(k) }, setTimeout: fn => fn(), Date, console });
  context.k = async (action, body) => {
    for (const forbidden of ['auth_data','session_token','tenantId','clientId','userId','visitor','network']) assert.ok(!(forbidden in body));
    const reply = (data, status=200) => ({ ok:status>=200 && status<300, status, json:async()=>data });
    if (action === 'site_event_status') return reply({ contract:'maya.public-community/1', ok:true, sourceScope:state.scope, stats:{version:state.version,liked:state.liked,likes:state.liked?1:0}, comments:[], form_token:'1800000000.signed-fixture' });
    effects.push(JSON.parse(JSON.stringify(body)));
    if (!state.receipt.has(body.request_key)) {
      if (action === 'site_event_like') { assert.equal(body.expected_version,state.version); state.version++;state.liked=body.liked; }
      if (action === 'site_event_comment') state.comments++;
      state.receipt.set(body.request_key,{contract:'maya.public-community/1',ok:true,status:'pending',version:state.version});
    }
    if (state.fail) { state.fail=false;throw Error('synthetic response loss'); }
    return reply(state.receipt.get(body.request_key));
  };
  vm.runInContext(source, context); return context.MayaPublicCommunity;
}
(async()=>{
  let api=page(); state.fail=true;
  const lost=await api.command('like','known',{liked:true},{}); assert.equal(lost.status,503);assert.equal(state.version,1);assert.equal(memory.size,1);
  api=page(); const retried=await api.command('like','known',{liked:true},{});assert.equal(retried.status,200);assert.deepEqual(effects[0],effects[1]);assert.equal(state.version,1);assert.equal(memory.size,0);
  state.fail=true; await api.command('like','known',{liked:false},{});
  const calls=effects.length, changed=await api.command('like','known',{liked:true},{});assert.equal(changed.status,409);assert.equal(effects.length,calls);
  await api.command('like','known',{liked:false},{});assert.equal(state.version,2);
  state.fail=true;await api.command('comment','known',{text:'Текст\r\nответа',display_name:'Гость',consent:true},{form_token:'1800000000.signed-fixture'});
  api=page();await api.command('comment','known',{text:'Текст\nответа',display_name:'Гость',consent:true},{form_token:'1900000000.new-transport-token'});assert.equal(state.comments,1);
  const last=effects.slice(-2);assert.equal(last[0].request_key,last[1].request_key);assert.equal(last[0].text,last[1].text);assert.equal(last[0].consent_policy_version,'public-comment-consent/1');
  state.fail=true;await api.command('like','known',{liked:true},{});const oldKey=effects.at(-1).request_key;
  state.scope='b'.repeat(64);await api.command('like','known',{liked:true},{});assert.notEqual(effects.at(-1).request_key,oldKey);
  const before=effects.length;await api.status('known');assert.equal(effects.length,before);
  console.log(JSON.stringify({package:'R09',publicFunctions:'PASS',checks:6,proof:'lost response/reload/changed intent/normalized comment/anonymous scope/read-only',productionEffects:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
