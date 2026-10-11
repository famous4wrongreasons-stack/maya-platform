// Read-only reproduction: real runtime + source-derived host navigation + real callback script.
// No browser, provider, database or persistent browser store is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = process.argv[2];
assert.ok(root);
const rels = ['maya-carrier-react/src/runtime/compose.ts', 'maya-chat-shell/src/net/session.ts', 'maya-saas-backend/deploy/platform/beget-edge/oauth-callback.html'];
const sources = Object.fromEntries(rels.map(r => [r, fs.readFileSync(path.join(root, r), 'utf8')]));
const composition = sources[rels[0]].match(/const origin = window\.location\.origin;\nconst net = createNet\(\{[\s\S]*?\n\}\);/)[0];
const callbackScript = sources[rels[2]].match(/<script>([\s\S]*?)<\/script>/)[1];
const storageTouches = [];
for (const k of ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore']) Object.defineProperty(globalThis, k, {get(){ storageTouches.push(k); throw new Error('unexpected persistent store'); }});
const {createNet} = await import(pathToFileURL(path.join(root, rels[1])).href);
const state = 'te_synthetic_navigation_20261011';
const code = 'synthetic-provider-code';
const auth = `https://oauth.telegram.org/auth?client_id=1&state=${state}`;
let requests = [];
globalThis.fetch = async (url, init) => {
  requests.push({url: String(url), body: JSON.parse(init.body)});
  if (String(url) === '/api/auth/oauth/telegram/start') return Response.json({ok:true,provider:'telegram',state,auth_url:auth});
  if (String(url) === '/api/auth/oauth/telegram/complete') return Response.json({
    access_token:'synthetic-not-a-real-token', refresh_token:'synthetic-not-a-real-refresh', expires_in:900,
    refresh_expires_at:'2099-01-01T00:00:00.000Z', user:{name:'Synthetic',tenant:{name:'Synthetic tenant'}}, is_new_user:false, provider:'telegram'
  }, {status:201});
  throw new Error('Unexpected request; no external network is permitted');
};
const page = () => {
  const navigations=[];
  const context = vm.createContext({createNet, WEB_CALLBACK_FILE:'oauth-callback.html', window:{location:{origin:'https://mayaos.ru', assign:url=>navigations.push(url)}}});
  vm.runInContext(composition+'\nglobalThis.heldNet = net;',context);
  return {net:context.heldNet,navigations};
};
const first = page();
assert.equal((await first.net.session.startTelegram('synthetic-salon')).step,'handed_off');
assert.deepEqual(first.navigations,[auth]);
let destination=null;
vm.runInNewContext(callbackScript, {URLSearchParams,encodeURIComponent,document:{getElementById:()=>({textContent:''})},location:{search:`?state=${state}&code=${code}`,replace:target=>destination=target}});
assert.equal(destination,`/#oauth=telegram&state=${state}&code=${code}`);
const fragment=destination.slice(1);
const fresh = page(); // location.assign -> provider -> callback -> location.replace('/') creates a new document.
const before=requests.length;
const freshResult=await fresh.net.session.completeTelegram(fragment);
assert.deepEqual(freshResult,{step:'failed',failure:{state:'callback_unsolicited'}});
assert.equal(requests.length,before,'fresh page refuses before backend complete');
const heldResult=await first.net.session.completeTelegram(fragment);
assert.equal(heldResult.step,'signed_in','control: same callback succeeds on initiating live session');
assert.equal(requests.filter(r=>r.url.endsWith('/complete')).length,1);
const replay=await first.net.session.completeTelegram(fragment);
assert.deepEqual(replay,{step:'failed',failure:{state:'callback_unsolicited'}});
assert.equal(requests.filter(r=>r.url.endsWith('/complete')).length,1);
const foreign = page();
await foreign.net.session.startTelegram('synthetic-salon');
const foreignResult=await foreign.net.session.completeTelegram(fragment.replace(state,'te_synthetic_foreign_state'));
assert.deepEqual(foreignResult,{step:'failed',failure:{state:'callback_unsolicited'}});
assert.deepEqual(storageTouches,[]);
const report={
  contract:'maya.telegram-web-navigation-preflight/1',
  candidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  executedAt:new Date().toISOString(),node:process.version,
  method:'Node runtime and VM execution of actual composition factory and callback script; page replacement simulated by a new composition instance; not browser acceptance',
  sourceHashes:Object.fromEntries(rels.map(r=>[r,createHash('sha256').update(sources[r]).digest('hex')])),
  result:'DEFECT_REPRODUCED',
  observations:{sourceNavigation:'window.location.assign',callbackNavigation:'location.replace to app root with fragment',newDocument:freshResult,initiatingDocument:heldResult.step,replay:replay.failure.state,foreignState:foreignResult.failure.state,completeRequests:1,persistentStoreTouches:0},
  externalRequests:0,databaseWrites:0,productChanges:0,
  limitation:'Does not qualify Telegram current provider configuration, loopback callback acceptance, iOS behavior or real browser acceptance.'
};
console.log(JSON.stringify(report,null,2));
