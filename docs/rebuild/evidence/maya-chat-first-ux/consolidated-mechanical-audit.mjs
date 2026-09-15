import fs from 'node:fs';
const F='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const text=fs.readFileSync(F,'utf8'); const lines=text.split('\n');
const annexB=lines.findIndex(l=>l.startsWith('# Annex B'));
const norm=lines.slice(0,annexB).join('\n');
const out=[];
const chk=(name,val,want)=>out.push({check:name,value:val,ok:JSON.stringify(val)===JSON.stringify(want),want});

// 1. every §N.M reference resolves to a heading
const heads=new Set([...text.matchAll(/^#{2,4}\s+(A?[\d.]+)\s/gm)].map(m=>m[1]));
const refs=[...norm.matchAll(/§(\d+\.\d+)/g)].map(m=>m[1]);
chk('unresolvable §N.M refs in normative text',[...new Set(refs.filter(r=>!heads.has(r)))],[]);

// 2. no errata citation in normative text
chk('errata citations in normative text',[...new Set([...norm.matchAll(/\b(?:E|EB|EC)-\d+\b/g)].map(m=>m[0]))],[]);

// 3. no precedence language
const prec=[...norm.matchAll(/^.*(?:takes precedence|governs where|Section 0 > |> Annex A >).*$/gm)].map(m=>m[0].slice(0,90));
chk('precedence language in normative text',prec,[]);

// 4. exactly two floor reductions in §0.17
const s017=text.slice(text.indexOf('### 0.17 '),text.indexOf('### 0.18 '));
chk('floor-reduction rows in §0.17',(s017.match(/^\| \*\*/gm)||[]).length,2);

// 5. both PII fences, unrenumbered
chk('CLIENT.2 present',(norm.match(/\*\*CLIENT\.2\*\*/g)||[]).length,1);
chk('ARTIFACT.3 present',(norm.match(/\*\*ARTIFACT\.3 —/g)||[]).length,1);
chk('CLIENT.3 distinct',(norm.match(/\*\*CLIENT\.3\*\*/g)||[]).length,1);
chk('ARTIFACT.5 distinct',(norm.match(/\*\*ARTIFACT\.5 —/g)||[]).length,1);

// 6. single declaration of each security-critical artefact
for (const [n,re] of [['verificationFloor',/^function verificationFloor/gm],['FLOOR_EXEMPT',/^function FLOOR_EXEMPT/gm],
  ['SENSITIVE_DEST',/^function SENSITIVE_DEST/gm],['requiredConfirmationKind',/^function requiredConfirmationKind/gm],
  ['five floor tables',/^\| `EFFECT_FLOOR` \| \| \| `KIND_FLOOR`/gm],['FLOOR_EXEMPT census',/Clause that admits it/gm],
  ['FR table',/^\| \*\*FR-1\*\* \|/gm],['CONTROL_REGISTRY table',/^\| control key \| owner endpoint/gm],
  ['mint-class table',/^\| \*\*M\*\* \| \*server-minted\*/gm],['Phrase',/^interface Phrase/gm],
  ['Narrative',/^interface Narrative \{/gm],['NarrativeTemplate',/^interface NarrativeTemplate/gm],
  ['NARRATIVE_TEMPLATES',/^declare const NARRATIVE_TEMPLATES/gm],['refSet',/^declare function refSet/gm],
  ['MintedIntent',/^type MintedIntent/gm],['DraftClass',/^type DraftClass/gm]])
  chk(`declarations of ${n}`,(norm.match(re)||[]).length,1);

// 7. ReadonlyMap must never be bracket-indexed
chk('MAYA_AI_TOOL_CATALOG_BY_NAME bracket-indexed',(text.match(/MAYA_AI_TOOL_CATALOG_BY_NAME\[/g)||[]).length,0);

// 8. amendments hidden in comments
chk('"amended"/"replaced by" inside a // comment',(norm.match(/\/\/[^\n]*\b(?:amended|is replaced by|VOID)\b/g)||[]).length,0);

// 9. every P-NN cited has a row
const cited=new Set([...norm.matchAll(/\*\*(P-\d\d)\*\*/g)].map(m=>m[1]));
const rows=new Set([...text.matchAll(/^\| \*\*(P-\d\d)\*\*/gm)].map(m=>m[1]));
chk('cited prerequisites with no §A1 row',[...cited].filter(p=>!rows.has(p)).sort(),[]);

// 10. duplicate clause identifiers within one kind body
const ids={};
for (const m of norm.matchAll(/\*\*([A-Z][A-Z_]{2,})\.(\d+)(?:\*\*| —)/g)){const k=`${m[1]}.${m[2]}`;ids[k]=(ids[k]||0)+1;}
chk('clause ids used more than once',Object.entries(ids).filter(([,v])=>v>1).map(([k,v])=>`${k}×${v}`),[]);

// 11. F6a pass 2: a "not restated here" sentence followed by a fenced block or a table within 25 lines
const claims=[];
for (let i=0;i<annexB;i++){
  if (!/not (?:re-)?(?:re)?stated here|not re-declared here/.test(lines[i])) continue;
  // find the end of the citation block (blockquote or paragraph)
  let j=i+1; while (j<annexB && lines[j].trim()!=='' ) j++;
  // the identifiers the sentence says are declared elsewhere
  const sentence=lines.slice(i,j).join(' ');
  const subjects=[...sentence.matchAll(/`([A-Za-z_$][\w$.]*)`/g)].map(m=>m[1])
                 .filter(x=>!/^§/.test(x));
  let restated=null;
  for (let k=j; k<Math.min(j+25,annexB); k++){
    if (/^### /.test(lines[k])) break;
    const isBlock=/^```/.test(lines[k]);
    const isTable=/^\|/.test(lines[k]) && /\|.*\|.*\|/.test(lines[k]) && !/^\| *(?:#|№)/.test(lines[k]);
    if (!isBlock && !isTable) continue;
    // a restatement only counts if the block re-declares one of the sentence's own subjects
    const body=lines.slice(k, Math.min(k+16,annexB)).join('\n');
    const hit=subjects.find(sub => new RegExp(`(?:interface|type|const|function|declare)\\s+${sub.replace(/[.$]/g,'\\$&')}\\b`).test(body)
                                || new RegExp(`^\\| \\\`?${sub.replace(/[.$]/g,'\\$&')}\\\`?\\s*\\|`,'m').test(body));
    if (hit) { restated=`${isBlock?'fenced block':'table'} at ${k+1} re-declares ${hit}`; break; }
  }
  if (restated) claims.push(`line ${i+1} → ${restated}`);
}
chk('"not restated here" followed by a restatement',claims,[]);

let bad=0;
for(const r of out){ if(!r.ok) bad++; console.log(`${r.ok?'PASS':'FAIL'}  ${r.check}: ${JSON.stringify(r.value)}${r.ok?'':`  (want ${JSON.stringify(r.want)})`}`); }
console.log(`\n${out.length-bad}/${out.length} mechanical checks pass`);
