import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifiedMint } from './widgets-evidence-lineage.mjs';
const root = { trigger:'T-2b', request_id:'read', widget_id:'root', intent_token_hash:'r', pid:1 };
const child = { trigger:'successor', request_id:'child', widget_id:'child', intent_token_hash:'c', predecessor_widget_id:'root', pid:1 };
const chain = (mutate = ()=>{}) => {
 const rows=[{...root},{...child},{...child,widget_id:'last',intent_token_hash:'l',predecessor_widget_id:'child'}];
 const durable=new Set(['r','c','l']); mutate(rows,durable);
 const map=new Map();for(const r of rows)map.set(r.intent_token_hash,[...(map.get(r.intent_token_hash)??[]),r]);
 return qualifiedMint(rows[2],map,durable);
};
test('accepts a persisted two-hop chain to a production trigger',()=>assert.equal(chain(),true));
for(const [label,change] of [
 ['missing parent',r=>r.splice(0,1)],
 ['foreign process',r=>r[0].pid=2],
 ['non-production root',r=>r[0].trigger='fixture'],
 ['cycle',r=>{r[0].trigger='successor';r[0].predecessor_widget_id='last';}],
 ['duplicate capture',r=>r.push({...r[0]})],
 ['parent not durable',(r,d)=>d.delete('r')],
 ['child not durable',(r,d)=>d.delete('c')],
 ['missing trace',r=>r[0].request_id=null],
 ['missing predecessor',r=>delete r[1].predecessor_widget_id],
 ['self predecessor',r=>r[1].predecessor_widget_id='child'],
 ['root masquerades as successor',r=>r[0].predecessor_widget_id='foreign'],
]) test(`refuses ${label}`,()=>assert.equal(chain(change),false));
