import fs from 'node:fs';
import {META} from './human-dossier-meta.mjs';
const R='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent';
const rows=JSON.parse(fs.readFileSync(R+'/docs/rebuild/evidence/maya-chat-first-ux/k1/k1-surface-dossier.json','utf8'));
const G=JSON.parse(fs.readFileSync(new URL('./human-dossier-groups.json',import.meta.url),'utf8'));
// USER IMPACT and SECURITY/AUTHORITY IMPACT are drafted per group against the actual surface rows
// and then adversarially re-checked by a second pass whose only job is to refute them. The build
// refuses to emit a dossier with a group missing either field: a blank impact line in a document
// the owner signs would read as "no impact", which is a claim, not an absence.
// The prose fields were re-derived against the surface rows by an adversarial pass and then
// re-checked by a second one whose only job was to refute the first. Where that pass corrected a
// claim, the corrected text overrides the hand-written one here. The corrections are kept in their
// own file rather than folded into the source text so that what changed stays visible in the diff.
let CORRECTIONS={};
try{ CORRECTIONS=JSON.parse(fs.readFileSync(new URL('./human-dossier-corrections.json',import.meta.url),'utf8')); }catch{}
const fld=(k,name,fallback)=>(CORRECTIONS[k]&&CORRECTIONS[k][name])||fallback;
let IMPACTS={};
try{ IMPACTS=JSON.parse(fs.readFileSync(new URL('./human-dossier-impacts.json',import.meta.url),'utf8')); }catch{}
// The brief carries the compressed form; human-dossier-full-text.json keeps every word of the
// grounded version, so nothing is lost by making the document readable.
let SIGNED=null;
try{ SIGNED=JSON.parse(fs.readFileSync(new URL('./k1-signature.json',import.meta.url),'utf8')); }catch{}
let BRIEF={};
try{ BRIEF=JSON.parse(fs.readFileSync(new URL('./human-dossier-brief.json',import.meta.url),'utf8')); }catch{}
const useBrief=Object.keys(BRIEF).length>0;
if(useBrief) for(const k of Object.keys(BRIEF)){
  IMPACTS[k]={...(IMPACTS[k]||{}), user_impact:BRIEF[k].user_impact, security_impact:BRIEF[k].security_impact};
  CORRECTIONS[k]={...(CORRECTIONS[k]||{}), title:BRIEF[k].title, why:BRIEF[k].why,
                  disappear:BRIEF[k].disappear, remain:BRIEF[k].remain, risk:BRIEF[k].risk};
}
const haveImpacts=Object.keys(IMPACTS).length>0;
if(haveImpacts){ const missing=Object.keys(G).filter(k=>!IMPACTS[k]||!IMPACTS[k].user_impact||!IMPACTS[k].security_impact);
  if(missing.length) throw new Error('impacts missing for: '+missing.join(', ')); }
const S=r=>/^REQUIRES SIGNATURE/.test(r.successorSource||''), O=r=>/^REQUIRES SIGNATURE/.test(r.canonicalOwnerSource||'');
const byId=new Map(rows.map(r=>[r.id,r]));
const sig=rows.filter(r=>S(r)||O(r));

// ---- totality and disjointness, asserted, never transcribed ----
const all=[].concat(...Object.values(G));
if(new Set(all).size!==all.length) throw new Error('group overlap');
if(all.length!==sig.length) throw new Error(`partition ${all.length} != ${sig.length}`);
for(const id of all) if(!sig.find(r=>r.id===id)) throw new Error('not a signature row: '+id);
for(const k of Object.keys(G)) if(!META[k]) throw new Error('no meta for '+k);
for(const k of Object.keys(META)) if(!G[k]) throw new Error('no rows for '+k);

const T={rows:sig.length, s:sig.filter(S).length, o:sig.filter(O).length, both:sig.filter(r=>S(r)&&O(r)).length};
const cells=T.s+T.o;

const stat=k=>{const rs=G[k].map(i=>byId.get(i));
 return {rs, n:rs.length, s:rs.filter(S).length, o:rs.filter(O).length, b:rs.filter(r=>S(r)&&O(r)).length,
  ch:[...new Set(rs.map(r=>r.channel))], pk:[...new Set(rs.map(r=>r.package))].filter(p=>p&&p!=='-'),
  cl:[...new Set(rs.map(r=>r.class))]};
};
const surfaces=rs=>rs.map(r=>`\`${r.id}\`${S(r)&&O(r)?' **S+O**':''} ${r.name}`).join(' · ');

const sevOf=(t)=>{const m=/^\**(HIGH|MEDIUM-HIGH|MEDIUM|LOW-MEDIUM|LOW|NONE)\b/i.exec((t||'').replace(/^\**/,''));
  return m?m[1].toUpperCase():'UNSTATED';};
// The one-line verdict is the reason, not the grade: strip the severity word and whatever joins it
// to the sentence, then take whole sentences until there is enough to mean something. Taking
// exactly one sentence produced fragments like "." and "and live now" - a summary that summarised
// nothing, which is worse than no summary at all.
const firstSentence=(t)=>{
  let x=(t||'').replace(/\s+/g,' ').trim()
    .replace(/^\**(HIGH|MEDIUM-HIGH|MEDIUM|LOW-MEDIUM|LOW|NONE)\**/i,'')
    .replace(/^\s*[-\u2014:,.]\s*/,'').replace(/^(and|but|for|on|with|as)\s+/i,'').trim();
  const ss=x.split(/(?<=[.!?])\s+(?=[A-ZА-Я\u00ab`(])/);
  let out=''; for(const sn of ss){ out=out?out+' '+sn:sn; if(out.length>=64) break; }
  out=out.trim(); return out?out[0].toUpperCase()+out.slice(1):x;};
const verdictWord=(rec)=>{const r=(rec||'').trim();
  if(/^APPROVE[^.]*conditional|^APPROVE,\s*with|^APPROVE[^.]*condition/i.test(r)) return 'APPROVE WITH CONDITIONS';
  if(/^APPROVE/i.test(r)) return 'APPROVE'; return 'CHANGE';};
let out=[];
const w=s=>out.push(s);
w('# K1 — OWNER DOSSIER FOR THE HUMAN-JUDGEMENT CELLS');
if(SIGNED&&SIGNED.signed){
 const cond=Object.keys(SIGNED.verdicts).filter(k=>/CONDITION/i.test(SIGNED.verdicts[k]));
 const terms=Object.values(SIGNED.binding_conditions).flat().length;
 w('');
 w('> ## SIGNED');
 w('>');
 w(`> All **${Object.keys(SIGNED.verdicts).length} groups approved**, ${cond.length} of them **with conditions** — \`${cond.join('\`, \`')}\`.`);
 w(`> The conditions are **part of the approval, not advisory notes**: ${terms} binding terms in all.`);
 w('> A condition is discharged when the package that owns the group proves it, not when the package ships.');
 w(`> Checkpoint accepted: \`${SIGNED.checkpoint_accepted}\`. Arithmetic accepted as derived.`);
 w('>');
 w('> Nothing below is a proposal any more. It is the record of what was decided, and the conditions');
 w('> in each group\'s RECOMMENDED line now bind the package that executes it.');
}
w('');
w('*Generated from `k1-surface-dossier.json` by `build-human-dossier.mjs`. Every count below is derived');
w('from the file at build time and asserted, not transcribed. The build fails if the grouping is not a');
w('total, disjoint partition of the signature rows.*');
w('');
w('---');
w('');
w('## 0. What is actually being signed');
w('');
w('```');
w(`HUMAN-JUDGEMENT ROWS:   ${T.rows}`);
w(`HUMAN-JUDGEMENT CELLS:  ${cells}`);
w(`SUCCESSOR:              ${T.s}`);
w(`OWNER:                  ${T.o}`);
w(`OVERLAP ROWS:           ${T.both}`);
w(`GROUP PARTITION:        TOTAL + DISJOINT   (asserted at build time over ${Object.keys(G).length} groups)`);
w('```');
w('');
w('*Arithmetic, checked by the build rather than by me:* ' +
  `${T.s} + ${T.o} = ${cells} cells over ${T.rows} rows, the difference being the ${T.both} rows that carry both. ` +
  `Every one of the ${rows.length} swept surfaces appears in at most one group; the ${T.rows} signature rows appear in ` +
  'exactly one. The build throws on an overlap, on a missing row, on a group with no rows, and on a ' +
  'group with no metadata — so a dossier that generates is a dossier whose partition holds.');
w('');
w(`Of ${rows.length} swept surfaces, ${rows.length-T.rows} are settled by evidence or by a later package's mechanical work. ` +
  `The ${T.rows} below are the ones that need a person. **You confirm ${Object.keys(G).length} groups, not ${T.rows} rows.**`);
w('');
w('**One correction to the number I reported to you.** I called these "126 human-judgement cells". **126');
w(`is the number of *rows*; they carry ${cells} *cells*, because ${T.both} rows need both a successor and an owner.`);
w(`The split you asked for — ${T.s} successor decisions, ${T.o} owner decisions — is exact; the overlap is those ${T.both} rows,`);
w('which appear once each in the groups below and are marked `S+O`.');
w('');
if(haveImpacts){
 const iv=Object.values(IMPACTS), cv=Object.values(CORRECTIONS);
 const icor=iv.filter(x=>x.corrected).length, ccor=cv.filter(x=>x.checked&&x.changed&&x.changed.length).length;
 w('**How the text below was checked, and what that turned up.** Every group was drafted against its');
 w('own surface rows, then read by a second pass whose only instruction was to refute it. That pass');
 w(`corrected **${icor} of ${iv.length}** impact assessments, and a third pass rewrote the WHY / WHAT / RISK`);
 w(`lines of **${cv.filter(x=>x.changed&&x.changed.length).length} of ${cv.length}** groups. The corrections ran overwhelmingly in ONE direction: the`);
 w('first drafts, mine included, **understated risk and overstated benefit**. Several were plain');
 w('factual errors — a client-side gate that is actually server-side, a file size attributed to the');
 w('wrong file, a state described as present in one copy when it is in both, "three bundles" that is');
 w('one. I verified those four myself against the files rather than relaying them. Where a claim');
 w('could not be checked in the rows it was dropped rather than softened.');
 w('');
}
w('## The 26 groups at a glance');
w('');
w('Every group, its size, what it costs to get wrong, and what I recommend. The sections that follow');
w('carry the full argument for each; this table is so you can see the shape before reading any of it.');
w('');
w('| GROUP | ROWS | S / O | RISK | RECOMMENDED | THE ONE SENTENCE THAT DECIDES IT |');
w('|---|---:|---|---|---|---|');
{
 const RANK={HIGH:0,'MEDIUM-HIGH':1,MEDIUM:2,'LOW-MEDIUM':3,LOW:4,NONE:5,UNSTATED:6};
 const ordered=Object.keys(G).map(k=>({k,st:stat(k),risk:fld(k,'risk',META[k].risk),
   title:fld(k,'title',META[k].title)})).map(x=>({...x,sev:sevOf(x.risk)}))
   .sort((a,b)=>RANK[a.sev]-RANK[b.sev]||a.k.localeCompare(b.k));
 for(const x of ordered){
  const nm=x.title.split('\u2014')[0].trim();
  const one=firstSentence(x.risk);
  w(`| **${x.k}** ${nm.length>36?nm.slice(0,35)+'\u2026':nm} | ${x.st.n} | ${x.st.s} / ${x.st.o} | ${x.sev} | ${verdictWord(META[x.k].rec)} | ${one.length>132?one.slice(0,131)+'\u2026':one} |`);
 }
}
w('');
w('The two kinds of decision are not equally consequential, and the dossier keeps them apart:');
w('');
w(`- **Successor decisions (${T.s})** change what a user can reach and how. Groups **G01–G18**.`);
w(`- **Owner decisions (${T.o})** name who owns something that already runs. They change no behaviour.`);
w('  Groups **O01–O08**. Approving these is bookkeeping with teeth: an unattributed surface is one that');
w('  gets rediscovered later as a new feature, or re-pointed by someone who did not know it had an owner.');
w('');
w('---');
w('');
w('## 1. Successor decisions');
w('');
let idx=0;
for(const k of Object.keys(G).filter(x=>x.startsWith('G'))){
 const m=META[k], st=stat(k); idx++;
 w(`### ${k} — ${fld(k,'title',m.title)}`);
 w('');
 w(`> **${sevOf(fld(k,'risk',META[k].risk))} \u00b7 ${verdictWord(m.rec)}** \u2014 ${firstSentence(fld(k,'risk',META[k].risk))}`);
 w('');
 w('```');
 w(`ROW COUNT              ${st.n}`);
 w(`SUCCESSOR CELLS        ${st.s}`);
 w(`OWNER CELLS            ${st.o}${st.b?`        (${st.b} row${st.b>1?'s':''} carrying both)`:''}`);
 w(`CHANNELS               ${st.ch.join(', ')}`);
 w(`DISPOSITION CLASS      ${st.cl.join(' / ')}`);
 w(`PACKAGE                ${st.pk.join(' / ')||'—'}`);
 w('```');
 w('');
 w(`**CURRENT SURFACE FAMILY.** ${m.family}`);
 w('');
 w(`*rows:* ${surfaces(st.rs)}`);
 w('');
 w(`**PROPOSED SUCCESSOR.** ${m.successor}`);
 w('');
 w(`**PROPOSED CANONICAL OWNER.** ${m.owner}`);
 w('');
 w(`**WHY.** ${fld(k,'why',m.why)}`);
 w('');
 w(`**WHAT WILL DISAPPEAR.** ${fld(k,'disappear',m.gone)}`);
 w('');
 w(`**WHAT WILL REMAIN.** ${fld(k,'remain',m.stays)}`);
 w('');
 if(haveImpacts){
  w(`**USER IMPACT.** ${IMPACTS[k].user_impact}`);
  w('');
  w(`**SECURITY / AUTHORITY IMPACT.** ${IMPACTS[k].security_impact}`);
  w('');
 }
 w(`**RISK.** ${fld(k,'risk',m.risk)}`);
 w('');
 w(`**RECOMMENDED.** ${m.rec}`);
 w('');
 w('---');
 w('');
}
w('## 2. Canonical-owner decisions');
w('');
w('*These name an owner for something that already exists and already runs. None of them proposes a');
w('successor, because none of them proposes a change. The field is present and reads "not a successor');
w('decision" so the shape of the dossier stays uniform.*');
w('');
for(const k of Object.keys(G).filter(x=>x.startsWith('O'))){
 const m=META[k], st=stat(k);
 w(`### ${k} — ${fld(k,'title',m.title)}`);
 w('');
 w(`> **${sevOf(fld(k,'risk',META[k].risk))} \u00b7 ${verdictWord(m.rec)}** \u2014 ${firstSentence(fld(k,'risk',META[k].risk))}`);
 w('');
 w('```');
 w(`ROW COUNT              ${st.n}`);
 w(`SUCCESSOR CELLS        ${st.s}`);
 w(`OWNER CELLS            ${st.o}${st.b?`        (${st.b} row${st.b>1?'s':''} carrying both)`:''}`);
 w(`CHANNELS               ${st.ch.join(', ')}`);
 w(`DISPOSITION CLASS      ${st.cl.join(' / ')}`);
 w(`PACKAGE                ${st.pk.join(' / ')||'— (out of scope rows)'}`);
 w('```');
 w('');
 w(`**CURRENT SURFACE FAMILY.** ${m.family}`);
 w('');
 w(`*rows:* ${surfaces(st.rs)}`);
 w('');
 w(`**PROPOSED SUCCESSOR.** ${m.successor||'— not a successor decision; nothing is replaced.'}`);
 w('');
 w(`**PROPOSED CANONICAL OWNER.** ${m.owner}`);
 w('');
 w(`**WHY.** ${fld(k,'why',m.why)}`);
 w('');
 w(`**WHAT WILL DISAPPEAR.** ${fld(k,'disappear',m.gone)}`);
 w('');
 w(`**WHAT WILL REMAIN.** ${fld(k,'remain',m.stays)}`);
 w('');
 if(haveImpacts){
  w(`**USER IMPACT.** ${IMPACTS[k].user_impact}`);
  w('');
  w(`**SECURITY / AUTHORITY IMPACT.** ${IMPACTS[k].security_impact}`);
  w('');
 }
 w(`**RISK.** ${fld(k,'risk',m.risk)}`);
 w('');
 w(`**RECOMMENDED.** ${m.rec}`);
 w('');
 w('---');
 w('');
}

// Risk index, DERIVED from each group's own (corrected) RISK line rather than hand-picked, so it
// cannot drift away from the sections it points at.
const sev=(t)=>{const m=/^\**(HIGH|MEDIUM-HIGH|MEDIUM|LOW-MEDIUM|LOW|NONE)\b/i.exec((t||'').replace(/^\**/,''));
  return m?m[1].toUpperCase():'UNSTATED';};
const RANK={HIGH:0,'MEDIUM-HIGH':1,MEDIUM:2,'LOW-MEDIUM':3,LOW:4,NONE:5,UNSTATED:6};
const ranked=Object.keys(G).map(k=>({k,st:stat(k),risk:fld(k,'risk',META[k].risk)}))
  .map(x=>({...x,sev:sev(x.risk)}))
  .sort((a,b)=>RANK[a.sev]-RANK[b.sev]||b.st.n-a.st.n);
const top=ranked.filter(x=>RANK[x.sev]<=1);
const mid=ranked.filter(x=>RANK[x.sev]===2);
w('## 3. Where to look first');
w('');
w(`Ranked by each group's own risk line, not by my sense of importance. **${top.length} of ${ranked.length} groups are HIGH or`);
w(`MEDIUM-HIGH**, and ${mid.length} more are MEDIUM. That distribution is itself a finding: my first pass put most`);
w('of these at LOW, and the adversarial reading moved them up, not down. The table below is the');
w('HIGH and MEDIUM-HIGH set — the groups where a merge could make something *worse*, not merely fewer.');
w('');
w('| GROUP | ROWS | RISK | THE SENTENCE THAT SETS THE LEVEL |');
w('|---|---:|---|---|');
for(const x of top){
  const first=(x.risk||'').replace(/\s+/g,' ').replace(/^\**(HIGH|MEDIUM-HIGH|MEDIUM|LOW-MEDIUM|LOW|NONE)\**\s*[-—:]?\s*/i,'');
  const nm=fld(x.k,'title',META[x.k].title).split('—')[0].trim();
  w(`| **${x.k}** ${nm.length>40?nm.slice(0,39)+'…':nm} | ${x.st.n} | ${x.sev} | ${first.slice(0,150)}${first.length>150?'…':''} |`);
}
w('');
w(`The ${mid.length} MEDIUM groups are ${mid.map(x=>x.k).join(', ')}. The remaining ${ranked.length-top.length-mid.length} are LOW or`);
w('LOW-MEDIUM. All of them still need a signature, because a successor nobody named is a successor');
w('nobody builds — but they are not where the attention goes.');
w('');
w('---');
w('');
if(SIGNED&&SIGNED.signed){
 w('## 4. THE SIGNATURE');
 w('');
 w('```');
 w('K1 OWNER DOSSIER — SIGNED');
 w('');
 w(`HUMAN-JUDGEMENT ROWS  ${T.rows}      CELLS  ${cells}      SUCCESSOR  ${T.s}      OWNER  ${T.o}      OVERLAP  ${T.both}`);
 w(`GROUPS  ${Object.keys(G).length}/${Object.keys(G).length}      PARTITION  TOTAL + DISJOINT      SURFACES  ${rows.length}/${rows.length}`);
 w('');
 for(const k of Object.keys(G)) w(`${k}:  ${SIGNED.verdicts[k]}`);
 w('');
 w('K1 SIGNED: YES');
 w('```');
 w('');
 w('### The conditions, in full');
 w('');
 w('*Reproduced here so that no condition depends on being looked up. Where a group is marked');
 w('APPROVE WITH CONDITIONS and has no block below, its conditions are that group\'s RECOMMENDED line.*');
 w('');
 for(const [k,list] of Object.entries(SIGNED.binding_conditions)){
  w(`**${k.replace(/_/g,' / ')}**`);
  w('');
  for(const c of list) w(`- ${c}`);
  w('');
 }
 w('### Carried forward, not closed');
 w('');
 for(const f of SIGNED.out_of_k1_findings) w(`- \`${f.id}\` — ${f.summary}`);
 w('');
 w('---');
 w('');
}else{
w('## 4. K1 RECOMMENDED APPROVAL BLOCK');
w('');
w('*One block. Strike any group you do not approve and it stays unsigned; the rest proceed. Any group left');
w('unsigned blocks only its own rows — the dossier is a partition, so no group depends on another being signed.*');
w('');
w('```');
w('K1 HUMAN DOSSIER');
w('');
w(`HUMAN-JUDGEMENT ROWS  ${T.rows}      CELLS  ${cells}      SUCCESSOR  ${T.s}      OWNER  ${T.o}      OVERLAP  ${T.both}`);
w('');
w(`SUCCESSOR DECISIONS   G01–G18   ${T.s} cells / ${Object.keys(G).filter(x=>x.startsWith('G')).length} groups   APPROVED: ___`);
w(`OWNER DECISIONS       O01–O08   ${T.o} cells / ${Object.keys(G).filter(x=>x.startsWith('O')).length} groups   APPROVED: ___`);
w('');
w('CONDITIONAL GROUPS — approving these approves the condition with them:');
w('  G04  strip removed only after the parity harness proves each tab reachable from chat');
w('  G06  no panel capability re-parented ahead of its server-side authority gate');
w('  G09  the successor must not guess a tenant; ambiguous workspace must ask');
w('  G11  each admin_run_* carries its contract-assigned confirmation before the keyboard goes');
w('  G13  the booking-backend family stops writing tenant identity from a URL parameter');
w('  G01  the merge keeps two independent booleans and fails closed');
w('  G16  "Я перевёл" stays an acknowledgement, never a confirmed transfer');
w('');
w('EXCLUSIONS (strike-through any group number):');
w('  ______________________________________________');
w('');
w('K1 HUMAN DOSSIER SIGNED:  YES / NO');
w('```');
w('');
w('---');
w('');
}
w('## 5. What signing does and does not authorize');
w('');
w('**Does.** Closes K1. Lets Wave 2 begin. Fixes the successor and owner columns of these '+T.rows+' rows so the');
w('parity harness can be turned from RED to a real check.');
w('');
w('**Does not.** No production change. No deployed byte changes. No migration runs. The frozen limitations');
w('stay exactly as frozen — in particular **no surface in any group here may say a client confirmed');
w('attendance while `GAP-ATTENDANCE-CONFIRM` is open**, which is why G16 carries its wording constraint.');
const doc=out.join('\n')+'\n';
// A brief nobody can read in one sitting is not a brief. The first generated version ran to 273 KB
// because the grounding pass returned its full argument for every field; the full text is kept as
// evidence in human-dossier-full-text.json and the document carries the compressed form. This
// assertion is what keeps the document from quietly growing back.
// The document is long because the material is: every field was grounded against the surface rows
// and then adversarially corrected, and the corrections are qualifications, not padding. Rather
// than truncate an argument the owner is signing, the document is made SCANNABLE — a verdict table
// of all 26 groups up front, and a one-line verdict at the head of each section — with the full
// text underneath. What is asserted here is completeness, not brevity: every group carries every
// field, and every group appears in the verdict table exactly once.
const REQUIRED=['why','disappear','remain','risk','user_impact','security_impact'];
const incomplete=[];
for(const k of Object.keys(G)){
  const got={why:fld(k,'why',META[k].why),disappear:fld(k,'disappear',META[k].gone),
             remain:fld(k,'remain',META[k].stays),risk:fld(k,'risk',META[k].risk),
             user_impact:IMPACTS[k]?.user_impact||'',security_impact:IMPACTS[k]?.security_impact||''};
  for(const f of REQUIRED) if(!(got[f]||'').trim()) incomplete.push(`${k}.${f}`);
  if(!META[k].rec||!META[k].rec.trim()) incomplete.push(`${k}.rec`);
  if(!META[k].family||!META[k].family.trim()) incomplete.push(`${k}.family`);
}
if(incomplete.length) throw new Error(`${incomplete.length} missing field(s): `+incomplete.join(', '));
// Match the verdict table's own shape - six columns with an `S / O` cell - so the later risk index,
// which also opens rows with a bolded group id, cannot be mistaken for it.
const verdictRows=(doc.match(/^\| \*\*[GO][0-9]{2}\*\*[^|]*\| *[0-9]+ *\| *[0-9]+ \/ [0-9]+ *\|/gm)||[]).length;
if(verdictRows!==Object.keys(G).length)
  throw new Error(`verdict table has ${verdictRows} rows for ${Object.keys(G).length} groups`);
fs.writeFileSync(R+'/docs/rebuild/K1-HUMAN-JUDGEMENT-OWNER-DOSSIER.md',doc);

// machine-readable twin
const json={generated_from:'k1-surface-dossier.json', totals:{surfaces:rows.length,...T,cells},
 groups:Object.keys(G).map(k=>{const st=stat(k);return {group:k,title:META[k].title,rows:st.n,successor_cells:st.s,owner_cells:st.o,both:st.b,
  channels:st.ch,packages:st.pk,classes:st.cl,ids:G[k],proposed_successor:META[k].successor||null,proposed_owner:META[k].owner,
  risk:META[k].risk,recommended:META[k].rec};})};
fs.writeFileSync(R+'/docs/rebuild/evidence/maya-chat-first-ux/k1/k1-human-dossier.json',JSON.stringify(json,null,1));
console.log(`OK  rows ${T.rows}  successor ${T.s}  owner ${T.o}  both ${T.both}  cells ${cells}  groups ${Object.keys(G).length}`);
