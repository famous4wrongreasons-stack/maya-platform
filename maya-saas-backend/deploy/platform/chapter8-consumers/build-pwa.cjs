'use strict';
// Exact owned consumers only. Never replace unrelated production identity/auth/visual code.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require('typescript');
const {verifyPwa}=require('../chapter7-consumers/verify-pwa.cjs');
function build(source){
  verifyPwa(source);assert(!source.includes('function AMayaValuationPanel'));
  const retired=['renderSimpleGoal','renderDayPlan'];const seen=[];
  source=source.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,(all,open,js,close)=>{
    if(!js.trim()||/application\/ld\+json/.test(open))return all;
    const file=ts.createSourceFile('pwa.js',js,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);const edits=[];
    function visit(node){if(ts.isFunctionDeclaration(node)&&node.name&&retired.includes(node.name.text)){
      seen.push(node.name.text);edits.push([node.body.pos,node.body.end," { return e('p', {style:{fontFamily:BODY,fontSize:12,lineHeight:1.5,color:t.dim},'data-c8-retired':'legacy-growth'}, 'Прогноз и потенциал роста недоступны: необходимы проверенные данные и подтверждённые правила. Факты и оценки Maya доступны в разделе аналитики.'); }"]);
    }ts.forEachChild(node,visit);}visit(file);
    for(const [a,b,body] of edits.sort((a,b)=>b[0]-a[0]))js=js.slice(0,a)+body+js.slice(b);
    return open+js+close;
  });
  assert.deepEqual(seen.sort(),retired.sort());
  const anchor="function meMeasurementValue(";assert.equal(source.split(anchor).length,2);
  source=source.replace(anchor,fs.readFileSync(path.join(__dirname,'panel.js'),'utf8')+'\n'+anchor);
  const call=/React\.createElement\('div',\s*\{\s*style:\s*\{\s*display:\s*'flex',\s*flexWrap:\s*'wrap',\s*gap:\s*8\s*\}\s*\},\s*cards\),/g;
  let n=0;source=source.replace(call,m=>{n++;return m+`\nReact.createElement(AMayaValuationPanel,{key:(saasReadSession()||{}).token||'signed-out',t:t,request:function(path,body){return ensureLocalSession().then(function(sess){return localBookingFetch(path,{headers:Object.assign({Authorization:'Bearer '+sess.token},body?{'Content-Type':'application/json'}:{}),method:body?'POST':'GET',body:body?JSON.stringify(body):undefined}).then(function(value){if((saasReadSession()||{}).token!==sess.token)throw new Error('c8_session_changed');return value;});});}}),`;});
  assert.equal(n,1);verifyPwa(source);return source;
}
module.exports={build};
if(require.main===module){const out=build(fs.readFileSync(process.argv[2],'utf8'));fs.writeFileSync(process.argv[3],out);console.log(JSON.stringify({status:'PASS',ownedConsumers:3,retiredScorers:2}));}
