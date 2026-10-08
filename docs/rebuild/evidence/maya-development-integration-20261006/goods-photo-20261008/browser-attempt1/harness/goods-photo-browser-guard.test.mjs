import test from 'node:test';
import assert from 'node:assert/strict';
import { admitted, localOrigin } from './goods-photo-browser-guard.mjs';
const origin='http://127.0.0.1:33111',scope={emails:['synthetic-photo@example.test']};
const uuid='321b40ad-c4ba-4a7a-8ea9-a4e7f88bbc11',revision='a'.repeat(64);
const req=(route,body,extras={})=>({url:origin+route,method:'POST',postData:JSON.stringify(body),...extras});
const context={requestId:uuid,source_revision:revision};
const proposal={goods_id:'123',store_id:'9',quantity:'2.5',unit_id:'11',unit_cost:'10.25',currency:'RUB',price_kind:'receipt_purchase_unit',received_at:'2026-10-08T09:00:00Z',photo_sha256:'b'.repeat(64),source_line:1,review_version:1};
test('only exact owned loopback and finite fixture login',()=>{
  assert.equal(localOrigin(origin),origin);
  for(const url of ['https://127.0.0.1:33111','http://localhost:33111','http://127.0.0.1:5432','http://127.0.0.1:33111/?x=1']) assert.throws(()=>localOrigin(url));
  assert.equal(admitted(req('/api/auth/email/start',{email:scope.emails[0]}),origin,scope),true);
  assert.equal(admitted(req('/api/auth/email/start',{email:'foreign@example.test'}),origin,scope),false);
});
test('preview permits bounded multipart transport only',()=>{
  const r=req('/api/ai/goods/photo-preview',undefined,{headers:{'Content-Type':'multipart/form-data; boundary=synthetic'}});
  assert.equal(admitted(r,origin,scope),true);
  assert.equal(admitted({...r,headers:{'Content-Type':'application/json'}},origin,scope),false);
  assert.equal(admitted({...r,postData:'x'.repeat(100000)},origin,scope),false);
});
test('native read requests require preserved-shaped witness and exact finite values',()=>{
  assert.equal(admitted(req('/api/ai/goods/search',{...context,query:'шампунь'}),origin,scope),true);
  assert.equal(admitted(req('/api/ai/goods/item-read',{...context,goods_id:'124'}),origin,scope),true);
  for(const body of [{requestId:uuid,query:'шампунь'},{...context,query:'foreign'},{...context,query:'шампунь',companyId:'5'},{...context,source_revision:'A'.repeat(64),query:'шампунь'}]) assert.equal(admitted(req('/api/ai/goods/search',body),origin,scope),false);
  assert.equal(admitted(req('/api/ai/goods/item-read',{...context,goods_id:'456'}),origin,scope),false);
});
test('review is closed manual purchase fields only',()=>{
  assert.equal(admitted(req('/api/ai/goods/receipt-review',{...context,proposal}),origin,scope),true);
  for(const change of [{price_kind:'sale_unit'},{unit_cost:'100'},{store_id:'8'},{review_version:3},{approvalId:uuid}]) assert.equal(admitted(req('/api/ai/goods/receipt-review',{...context,proposal:{...proposal,...change}}),origin,scope),false);
});
test('only sealed null-input approval intents, never direct approval or chat shortcut',()=>{
  const body={contract:'maya.widget.intent.submission/1',widget_id:uuid,intent_token:'synthetic-seal',inputs:null,client_nonce:uuid,profile_id:'pwa/1'};
  assert.equal(admitted(req('/api/widgets/intent',body),origin,scope),true);
  assert.equal(admitted(req('/api/widgets/intent',{...body,inputs:{service_ref:'fake'}}),origin,scope),false);
  for(const route of ['/api/ai/chat','/api/ai/approvals/'+uuid+'/approve','/api/tools/execute','/api/available-slots']) assert.equal(admitted(req(route,{}),origin,scope),false);
});
