// Local-only UI fixture. No production requests or production identities.
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'../..');
const out=path.join(root,'output/playwright/maya-identity');fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(root,'сайт и приложение/app.html'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const react=scripts.filter(s=>s.includes('@license React'));
const consent=html.slice(html.indexOf('function meMayaConsentPendingKey()'),html.indexOf('window.AMayaConsent = AMayaConsent;'));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maya identity preview</title><style>body{margin:0;font-family:system-ui;background:#fff;color:#172336}main{padding:32px;display:flex;align-items:center;gap:28px;flex-wrap:wrap}button{padding:12px;border:1px solid #dbe3ec;border-radius:12px;background:white;font:inherit}button:focus-visible,input:focus-visible{outline:3px solid #0069f5;outline-offset:4px}</style><div id="root"></div><script>${react.join('\n')}</script><script>${fs.readFileSync(path.join(root,'сайт и приложение/assets/maya-identity.js'),'utf8')}</script><script>${fs.readFileSync(path.join(root,'scripts/maya-identity/react-components.js'),'utf8')}</script><script>
const BODY='system-ui',DISPLAY='system-ui';window.__ME_SAAS_CTX={ns:'synthetic-tenant',userId:'synthetic-account'};
function meSaasCurrentBundle(){return{user:{id:'synthetic-account'}};}
function meAppAccessCurrentMode(){return'client';}
function meAppAccessFindMode(){return{access:'full',profile_linked:false};}
window.__meAppAccess={};window.__proofCalls=[];
window.__meSaasAuthedFetch=async(path,init)=>{window.__proofCalls.push({path,method:init&&init.method,body:init&&JSON.parse(init.body)});if(path==='/client-channel/status')return{linked:true,privacy:false,marketing_decided:false};if(path==='/client-channel/consent')return{privacy:{accepted:true},marketing:{accepted:true}};throw Error('Unexpected local fixture route');};
${consent}
function MayaLoadingLogo(p){return React.createElement(MayaMarkAnimated,Object.assign({},p,{state:'thinking'}));}
function Demo(){const[state,set]=React.useState('idle'),[show,consent]=React.useState(new URLSearchParams(location.search).get('consent')==='1');return React.createElement(React.Fragment,null,React.createElement('main',null,React.createElement(MayaMarkAnimated,{size:280,state:state}),['idle','launch','thinking','recording','responding','done'].map(s=>React.createElement('button',{key:s,onClick:()=>set(s)},s)),React.createElement('button',{onClick:()=>consent(true)},'Consent')),show?React.createElement(AMayaConsent):null);}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Demo));
</script>`);console.log(out);
