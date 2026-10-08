import assert from 'node:assert/strict';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => record(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value,key));
export function localOrigin(raw) {
  const url = new URL(raw);
  assert.equal(url.protocol,'http:'); assert.equal(url.hostname,'127.0.0.1');
  assert.ok(url.port && !['5432','55611'].includes(url.port));
  assert.equal(url.username+url.password+url.search+url.hash,''); assert.equal(url.pathname,'/');
  return url.origin;
}
export function admitted(request,origin,scope) {
  try {
    const url = new URL(request.url);
    if(url.origin!==localOrigin(origin)||url.username||url.password||url.search||url.hash)return false;
    if(request.method==='GET')return /^\/(?:api\/ai\/conversation|index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]+\/main\.js)?$/.test(url.pathname);
    if(request.method!=='POST')return false;
    if(url.pathname==='/api/ai/goods/photo-preview') {
      const type=Object.entries(request.headers??{}).find(([key])=>key.toLowerCase()==='content-type')?.[1];
      return typeof type==='string' && /^multipart\/form-data; boundary=/.test(type) && (request.postData===undefined||request.postData.length<=3*1024*1024);
    }
    const body=JSON.parse(request.postData);
    if(url.pathname==='/api/auth/email/start')return keys(body,['email'])&&scope.emails.includes(body.email);
    if(url.pathname==='/api/auth/email/verify')return keys(body,['email','code'])&&scope.emails.includes(body.email)&&typeof body.code==='string'&&/^\d{4,8}$/.test(body.code);
    if(url.pathname==='/api/auth/refresh')return keys(body,['refreshToken'])&&typeof body.refreshToken==='string'&&body.refreshToken.length>0&&body.refreshToken.length<=8192;
    if(url.pathname==='/api/widgets/resolve')return keys(body,['thread_page'])&&keys(body.thread_page,['limit'])&&body.thread_page.limit===20;
    return false; // No chat, search, item read, review, decisions or other POST.
  } catch { return false; }
}
export async function installGuard(page,origin,scope) {
  localOrigin(origin); assert.equal(scope.emails.length,1);
  const blocked=[],errors=[];
  const listener=event=>{
    if(event.sessionId!==page.sessionId||event.method!=='Fetch.requestPaused')return;
    const {requestId,request}=event.params,allow=admitted(request,origin,scope);
    if(!allow)blocked.push({method:request.method,path:new URL(request.url).pathname});
    void page.send(allow?'Fetch.continueRequest':'Fetch.failRequest',{requestId,...(allow?{}:{errorReason:'BlockedByClient'})}).catch(()=>errors.push('request_interception_failed'));
  };
  page.browser.listeners.add(listener);
  await page.send('Network.setBypassServiceWorker',{bypass:true});
  await page.send('Network.setBlockedURLs',{urls:['ws://*','wss://*']});
  await page.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  return {blocked,errors};
}
