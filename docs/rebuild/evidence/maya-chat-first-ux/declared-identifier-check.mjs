// Every identifier a normative clause names must be declared somewhere (F2).
import fs from 'node:fs';
const F='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const text=fs.readFileSync(F,'utf8'); const lines=text.split('\n');
const annexB=lines.findIndex(l=>l.startsWith('# Annex B'));
const norm=lines.slice(0,annexB);
// declared: anything appearing in a fenced block as a decl, a member, or an enum literal
let inF=false; const declared=new Set();
for(const l of lines){
  if(/^\s*```/.test(l)){inF=!inF;continue;}
  if(!inF) continue;
  for(const m of l.matchAll(/\b([A-Z][A-Za-z0-9_]{2,})\b/g)) declared.add(m[1]);
  for(const m of l.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*[?:]/gm)) declared.add(m[1]);
}
// also treat anything defined in a markdown table's first column as declared
for(const l of lines){ const m=l.match(/^\|\s*`?([A-Z][A-Z0-9_]{3,})`?\s*\|/); if(m) declared.add(m[1]); }
// SCREAMING_SNAKE identifiers cited in normative prose
const cited=new Map();
for(let i=0;i<annexB;i++){
  const l=norm[i]; if(/^\s*```/.test(l)) continue;
  for(const m of l.matchAll(/`([A-Z][A-Z0-9_]{3,})`/g)){
    if(!cited.has(m[1])) cited.set(m[1], i+1);
  }
}
const KNOWN_EXTERNAL=new Set(['ALLOW','DENY','SHADOW_ONLY','REQUIRED','NONE','OPTIONAL','FORBIDDEN',
 'ANONYMOUS','CHANNEL_IDENTITY','BOUND_CLIENT','SESSION_VERIFIED','STEP_UP_VERIFIED',
 'RICH_INTERACTIVE','TEXT_ONLY','ANNOUNCEMENT','KNOWN','NOT_MEASURED','PENDING','APPROVED',
 'CONFIRMED','SUPERSEDED','EXPIRED','CANCELLED','HISTORISED','BODY_DROPPED','REDACTED','LIVE',
 'CONSUMED','ACCEPTED','REFUSED','ADMIN','CLIENT_LIFECYCLE','OCCUPANCY','BUSINESS_INTELLIGENCE',
 'LOCAL','READ','PROPOSE_ONLY','AUDIT_RETAINED','CONVERSATION_CONTENT','CANONICAL_ELSEWHERE',
 'NORMATIVE','PUBLIC_READ','ANONYMOUS_CHAT','SECURE_SURFACE_ONLY','MONEY','BOOKING','CONSENT',
 'IDENTITY','MARKETING_FANOUT','TENANT_AUTHORITY','RUN_OPENING','SENSITIVE_DEST','FLOOR_EXEMPT',
 'NO_ACTION','COMMIT','NAVIGATE','REFINE','HANDOFF','CONTROL','DRAFT','REQUEST_APPROVAL','MUTATE',
 'EXECUTE','ERROR','INLINE','CARD','SHEET','SUBMITTED','NOT_CONFIRMED','EXPIRED_UNUSED','DELIVERED_ONLY']);
const missing=[...cited].filter(([k])=>!declared.has(k)&&!KNOWN_EXTERNAL.has(k));
console.log(`SCREAMING_SNAKE identifiers cited in normative prose: ${cited.size}`);
console.log(`cited but never seen in any declaration block or table key: ${missing.length}`);
for(const [k,ln] of missing) console.log(`  ${k}  (first cited line ${ln})`);
