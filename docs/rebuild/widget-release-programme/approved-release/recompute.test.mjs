import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {promote,batteries} from './recompute.mjs';
const read=f=>JSON.parse(fs.readFileSync(new URL(f,import.meta.url)));
function fixture(){
 const audit=read('../final-evidence/current-audit.json'),uMap=read('./u-proofs.json');
 const lines=[];
 for(const [id,clause]of [['AR-G6-REVOCATION','G6-13'],['AR-FR6D-NONMONEY','G7-FR6d']])
   for(const [entry,pid]of [['HTTP',1],['BIN',2]])lines.push({test_id:id,entry,pid,claim:'L',clauses:[clause],stopped_at_gate:'13',gates_run:14,record_hash:entry,trigger_trace_id:entry,labels:['[E-MINT]']});
 lines.push({test_id:'D8-U',entry:'HTTP',claim:'U',record_hash:null,labels:['[U-proof]'],clauses:['G8-3','G8-4','G8-5t','G8-DENY']});
 const reports=Object.fromEntries(batteries.map(b=>[b,{mutants:[{id:'synthetic-validator-only',battery:'gate'+b+'.json',status:'build-killed'}]}]));
 return{audit,lines,uMap,reports};
}
test('approved overlay keeps every clause and does not convert HANDOFF STOP or 9.6 into acceptance',()=>{
 const f=fixture(),a=promote(f.audit,f.lines,f.uMap,f.reports),clauses=a.gates.flatMap(g=>Object.entries(g.clauses));
 assert.equal(clauses.length,165);assert.equal(clauses.filter(([,c])=>c.state==='false').length,10);
 for(const id of ['G6-6','G13-R8'])assert.equal(clauses.find(([k])=>k===id)[1].current_classification,'ACCEPTED_STOP');
 assert.equal(clauses.find(([k])=>k==='9.6')[1].current_classification,'INTEGRATION_OWNED');
});
for(const [name,mutate]of [
 ['missing independent binary',f=>{f.lines=f.lines.filter(l=>l.entry!=='BIN');}],
 ['same process pretending to be binary',f=>{f.lines.forEach(l=>l.pid=1);}],
 ['duplicate mint pair',f=>f.lines.push({...f.lines[0]})],
 ['missing settled U decision',f=>{f.uMap.proofs=f.uMap.proofs.filter(p=>p.clause!=='G8-3');}],
 ['turning a U ledger into live evidence',f=>{f.lines.find(l=>l.test_id==='D8-U').claim='L';}]
])test('refuses '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>promote(f.audit,f.lines,f.uMap,f.reports));});

