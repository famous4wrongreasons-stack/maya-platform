// Prepared finite admission checks; no network/browser invocation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { admitted } from './actual-ocr-browser-guard.mjs';
const origin='http://127.0.0.1:39877',scope={emails:['synthetic@example.invalid']};
const post=(route,body)=>({method:'POST',url:origin+route,postData:JSON.stringify(body)});
test('admits only the finite upload and existing auth/history reads',()=>{
  assert.equal(admitted({method:'GET',url:origin+'/api/ai/conversation'},origin,scope),true);
  assert.equal(admitted(post('/api/auth/email/start',{email:scope.emails[0]}),origin,scope),true);
  assert.equal(admitted(post('/api/auth/email/verify',{email:scope.emails[0],code:'123456'}),origin,scope),true);
  assert.equal(admitted(post('/api/widgets/resolve',{thread_page:{limit:20}}),origin,scope),true);
  assert.equal(admitted({method:'POST',url:origin+'/api/ai/goods/photo-preview',headers:{'Content-Type':'multipart/form-data; boundary=fixture'},postData:'synthetic'},origin,scope),true);
});
test('rejects business transitions and expanded resolve scope',()=>{
  for(const route of ['/api/ai/chat','/api/ai/goods/search','/api/ai/goods/item-read','/api/ai/goods/receipt-review','/api/widgets/intent','/api/ai/approvals/id/approve']) assert.equal(admitted(post(route,{}),origin,scope),false,route);
  for(const body of [{thread_page:{limit:50}},{thread_page:{limit:20,before:'other'}},{thread_page:{limit:20},rendered:{}},{thread_page:{limit:20},booking_receipt:{}}]) assert.equal(admitted(post('/api/widgets/resolve',body),origin,scope),false);
});
test('rejects foreign origins, emails, query strings and unbounded upload metadata',()=>{
  assert.equal(admitted({method:'GET',url:'https://example.invalid/api/ai/conversation'},origin,scope),false);
  assert.equal(admitted(post('/api/auth/email/start',{email:'foreign@example.invalid'}),origin,scope),false);
  assert.equal(admitted({method:'GET',url:origin+'/api/ai/conversation?tenant=foreign'},origin,scope),false);
  for(const request of [{method:'POST',url:origin+'/api/ai/goods/photo-preview',headers:{}},{method:'POST',url:origin+'/api/ai/goods/photo-preview',headers:{'content-type':'multipart/form-data; boundary=x'},postData:'x'.repeat(3*1024*1024+1)}]) assert.equal(admitted(request,origin,scope),false);
});

test('rejects non-string verification codes before regex coercion',()=>{
  for(const code of [[1234],1234,null,{},['123456']]) assert.equal(admitted(post('/api/auth/email/verify',{email:scope.emails[0],code}),origin,scope),false);
});
