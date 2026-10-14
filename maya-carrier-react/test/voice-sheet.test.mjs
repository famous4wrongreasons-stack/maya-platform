import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VoiceSheet } from './.bundle.mjs';

const unexpected=()=>{throw Error('render must not capture, send, cancel or navigate');};
const markup=(view,enabled=true)=>renderToStaticMarkup(createElement(VoiceSheet,{open:true,view:{elapsedMs:20000,level:0,notice:null,unavailable:null,...view},enabled,port:{arm:unexpected,send:unexpected},close:unexpected,focusFallback:unexpected}));
test('voice sheet is passive in every runtime state and keeps held distinct from listening',()=>{
  for(const state of ['idle','arming','listening','held','recording','transcribing','unavailable']) {
    const html=markup({state});assert.ok(html.includes('aria-modal="true"'));assert.ok(!/<audio|<video|<iframe/.test(html));
    if(['arming','recording','transcribing'].includes(state))assert.match(html,/companion-voice-send" disabled=""/);
    if(state==='unavailable')assert.ok(!html.includes('companion-voice-send'));
  }
  assert.ok(markup({state:'listening'}).includes('Слушаю — ничего не отправляется'));
  assert.ok(markup({state:'held'}).includes('Прошло 20 секунд — запись остановлена и не отправлена'));
  assert.ok(markup({state:'held'}).includes('0:20'));
});
test('unavailable preserves and escapes the exact runtime Cell label without exposing internal evidence',()=>{
  const html=markup({state:'unavailable',unavailable:{state:'UNAVAILABLE',value:null,label:'<script>Голос недоступен</script>',fact_ref:'private-ref',evidence_refs:['private-proof']}});
  assert.ok(html.includes('&lt;script&gt;Голос недоступен&lt;/script&gt;'));
  assert.ok(!html.includes('private-ref')&&!html.includes('private-proof')&&!html.includes('<script>'));
});
test('current conversation disable blocks every voice action and notice never claims success',()=>{
  for(const state of ['idle','listening','held'])assert.match(markup({state},false),/companion-voice-send" disabled=""/);
  const html=markup({state:'idle',notice:'too_short'});
  assert.ok(html.includes('Запись слишком короткая — ничего не отправлено'));
  assert.ok(html.includes('Сказать голосом'));assert.ok(!html.includes('Отправить запись'));
});
