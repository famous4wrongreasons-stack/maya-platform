// K1 — the navigation re-dispositions. Reproduces the authorized figure from the data
// rather than inheriting it, and proposes a target for every row that still holds an entry.
import fs from 'node:fs';
const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const REMOVES=new Set(['RETIRE FROM PRIMARY NAVIGATION','MERGE','MOVE INTO CHAT WIDGET']);
const TARGET=5;
const nav=r=>r.primaryNav&&r.mayaOwned;
const pwa=rows.filter(r=>nav(r)&&r.channel==='pwa');
const all=rows.filter(nav);
const stayPwa=pwa.filter(r=>!REMOVES.has(r.class));
const stayAll=all.filter(r=>!REMOVES.has(r.class));

// the five that survive, and why each is not a capability
const SURVIVORS=[
 {n:'Maya',            why:'the conversation itself; every capability is reached by asking'},
 {n:'Account',         why:'who you are to this tenant - an identity surface, not a capability'},
 {n:'Connections',     why:'which channels and providers are bound; a SOURCE_STATUS reconnect HANDOFFs here'},
 {n:'Privacy & Data',  why:'the class-s destination for consent and erasure - the one place a consent decision can be made, because FR-6a forbids a widget from conferring it'},
 {n:'Notifications',   why:'delivery preferences, re-read at delivery time rather than at compose time'},
];
// proposed re-disposition per surviving class
const PROPOSE={
 'KEEP AS CAPABILITY':          {to:'RETIRE FROM PRIMARY NAVIGATION', why:'the capability stays; only its launcher leaves. It is reached by asking, and a launcher for it is a nav entry the chat-first model does not need.'},
 'KEEP AS FULLSCREEN DETAIL':   {to:'RETIRE FROM PRIMARY NAVIGATION', why:'the detail surface stays and is reached by a fullscreen_intent HANDOFF from the conversation; a nav entry duplicates that route.'},
 'SECURITY/AUTHORITY ONLY':     {to:'RETIRE FROM PRIMARY NAVIGATION', why:'it has no UI to navigate to; the fence is server-side and the entry is vestigial.'},
 'SETTINGS / SECURITY ONLY':    {to:'FOLD INTO A CLASS-S DESTINATION', why:'it belongs behind one of the four service entries rather than beside them.'},
 'KEEP AS FULLSCREEN SECONDARY':{to:'RETIRE FROM PRIMARY NAVIGATION', why:'secondary by disposition; a primary-nav entry contradicts that.'},
};
const mk=r=>({
  id:r.id, name:r.name, channel:r.channel, file:r.file,
  currentClass:r.class, currentlyPrimaryNav:true,
  proposedRedisposition:PROPOSE[r.class]?.to ?? 'REQUIRES SIGNATURE',
  rationale:PROPOSE[r.class]?.why ?? 'no rule covers this class; the owner decides',
  successorAfterRedisposition:r.successor,
  decision:'PENDING OWNER SIGNATURE',
});
const out={
  contract:'maya.k1.nav-redisposition/1',
  method:'derived from the K1 dossier; a row leaves primary navigation by its own disposition only when that disposition is RETIRE FROM PRIMARY NAVIGATION, MERGE, or MOVE INTO CHAT WIDGET',
  target:TARGET,
  survivors:SURVIVORS,
  authorizedScope:{
    scope:'pwa', entries:pwa.length, removedByDisposition:pwa.length-stayPwa.length,
    stillAssigned:stayPwa.length, target:TARGET, redispositionsNeeded:stayPwa.length-TARGET,
    note:'this reproduces the authorized figure of 34 from the data. 89 pwa primary-nav entries, 50 removed by disposition, 39 still assigned, 39 - 5 = 34.',
  },
  allMayaOwnedChannels:{
    scope:'every Maya-owned channel', entries:all.length, removedByDisposition:all.length-stayAll.length,
    stillAssigned:stayAll.length, target:TARGET, redispositionsNeeded:stayAll.length-TARGET,
    note:'the authorized 34 is pwa-scoped and correct for that scope. Across every Maya-owned channel the figure is larger, because seven further entries live outside the pwa. They are listed so the owner sees the whole number, not only the one the ratchet was sized against.',
    nonPwaRows:stayAll.filter(r=>r.channel!=='pwa').map(mk),
  },
  redispositions:stayPwa.map(mk),
};
fs.writeFileSync(process.argv[3], JSON.stringify(out,null,1));
console.log('pwa   : entries',pwa.length,'removed',pwa.length-stayPwa.length,'still',stayPwa.length,'-> redispositions',stayPwa.length-TARGET,'(authorized: 34)');
console.log('all   : entries',all.length,'removed',all.length-stayAll.length,'still',stayAll.length,'-> redispositions',stayAll.length-TARGET);
console.log('needs signature in the pwa set:', out.redispositions.filter(r=>r.proposedRedisposition==='REQUIRES SIGNATURE').length);
