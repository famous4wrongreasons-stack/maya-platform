// Bounded upgrade of the certified VPS consumer. Does not deploy, read secrets,
// alter PHP, or replace unrelated Chapter 7 consumer code.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),web=path.join(root,'сайт и приложение');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const canonical=fs.readFileSync(path.join(web,'app.html'),'utf8');
function overlay(original){
 assert.equal(hash(original),'204daaf2ce452ba5e1383750bded372683596cceade4c9f0f33dade3831b862a','Production baseline changed; reconcile exact diff first');
 let s=original;const changes=[];
 function range(start,end,value){const a=s.indexOf(start),b=s.indexOf(end,a);assert.ok(a>=0&&b>a,start);changes.push({start,oldHash:hash(s.slice(a,b)),newHash:hash(value)});s=s.slice(0,a)+value+s.slice(b);}
 function exact(old,value,count=1){assert.equal(s.split(old).length-1,count,old);s=s.split(old).join(value);changes.push({match:old,occurrences:count});}
 range('function SeedLogo({','function Wordmark({',fs.readFileSync(path.join(root,'scripts/maya-identity/react-components.js'),'utf8')+`\nfunction SeedLogo(p){return React.createElement(MayaMark,p);}\nfunction SeedLogoAnimated(p){return React.createElement(MayaMarkAnimated,p);}\nfunction MayaLoadingLogo(p){return React.createElement(MayaMarkAnimated,Object.assign({},p,{state:'thinking'}));}\n`);
 const a=canonical.indexOf('function meMayaConsentPendingKey()'),b=canonical.indexOf('window.AMayaConsent = AMayaConsent;',a);
 assert.ok(a>0&&b>a);
 // Existing shell mode selects presentation only. Verified canonical status,
 // never mode/profile/phone, authorizes eligibility. Backend authority unchanged.
 range('function AConsentGate()', 'window.AConsentGate = AConsentGate;',`function meAppAccessCurrentMode(){return window.__meCurMode==='staff'?'staff':'client';}\n`+canonical.slice(a,b)+`\nfunction AConsentGate(){return React.createElement(AMayaConsent);}\n`);
 range('  const typingDots =', '  const bubble =',"  const typingDots = e(MayaMarkAnimated,{size:48,state:'thinking'});\n");
 range("  (voiceMode || recState === 'recording') ? (function () {", '  // input bar',"  (voiceMode || recState === 'recording') ? e('div',{style:{display:'flex',justifyContent:'center',pointerEvents:'none'}},e(MayaMarkAnimated,{size:76,state:vmSpeaking?'responding':sending?'thinking':'recording'})) : null,\n");
 exact('const rms = Math.sqrt(sum / buf.length);','const rms = Math.sqrt(sum / buf.length);\n          window.__mayaAudioLevel = Math.min(1, rms * 6);',2);
 exact('function vmCleanup() {','function vmCleanup() {\n    window.__mayaAudioLevel = 0;');
 const tile=canonical.match(/window\.__ME_MAYA_HTML=[\s\S]*?<\/script>/)[0];
 s=s.replace(/window\.__ME_MAYA_HTML=[\s\S]*?<\/script>/,tile);changes.push({block:'generated Maya tile'});
 exact('</head>','<script id="maya-identity-source">\n'+fs.readFileSync(path.join(web,'assets/maya-identity.js'),'utf8')+'\n</script>\n</head>');
 s=s.replace(/((?:href|src)=["'](?:\.\/)?(?:apple-touch-icon|favicon-256|icon-192|icon-512)\.png)(?:\?[^"']*)?/g,'$1?v=maya-ribbon-v1');
 // One nonblocking, skippable launch animation, with static reduced-motion fallback.
 const splash=`<script id="maya-launch-identity">(function(){function launch(){var host=document.createElement('div');host.setAttribute('aria-label','Maya — запуск');host.style.cssText='position:fixed;inset:0;z-index:2147483000;background:white;display:flex;align-items:center;justify-content:center;pointer-events:none';var mark=document.createElement('div');mark.style.cssText='width:220px;height:220px';host.appendChild(mark);document.body.appendChild(host);var player=MayaIdentity.mount(mark,{state:'launch'});setTimeout(function(){player.destroy();host.remove();},window.matchMedia('(prefers-reduced-motion: reduce)').matches?200:2400);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',launch,{once:true});else launch();})();</script>`;
 exact('</body>',splash+'\n</body>');
 exact('@keyframes meSeedSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}.me-seedspin{animation:meSeedSpin 16s linear infinite}@media (prefers-reduced-motion:reduce){.me-seedspin{animation:none}}','');
 const verification=require(path.join(root,'maya-saas-backend/deploy/platform/chapter7-consumers/verify-pwa.cjs')).verifyPwa(s);
 assert.ok(!s.includes("'?action=consent_submit'"));assert.ok(!s.includes('meSeedSpin'));assert.ok(s.includes('status.linked===true'));
 return {source:s,evidence:{sourceHash:hash(original),resultHash:hash(s),changes,chapter7:verification,phpChanges:0,backendChanges:0}};
}
module.exports={overlay};
if(require.main===module){const result=overlay(fs.readFileSync(process.argv[2],'utf8'));fs.writeFileSync(process.argv[3],result.source);console.log(JSON.stringify(result.evidence,null,2));}
