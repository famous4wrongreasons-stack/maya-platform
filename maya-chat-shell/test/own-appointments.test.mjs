import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOwnAppointments } from '../src/shell/own-appointments.ts';
import { createTransport } from '../src/net/client.ts';
import { projectOwnAppointments, ownMutationConfirmed } from '../src/net/personal.ts';
const ok = value => ({ ok: true, value });
const row = { id: 'appointment-1', start: '2099-10-22T10:00:00Z', end: '2099-10-22T11:00:00Z', updatedAt: '2026-10-22T10:00:00Z', status: 'confirmed', staffId: 'staff', staffName: 'Мастер', serviceIds: ['service'], serviceNames: ['Стрижка'], branchId: 'branch', timezone: 'Europe/Moscow' };
const raw = r => ({ id: r.id, start_at: r.start, end_at: r.end, updated_at: r.updatedAt, status: r.status, staff_external_id: r.staffId, service_ids: r.serviceIds, services: [{name:'Стрижка'}], branch_id:r.branchId, branch:{timezone:r.timezone}, staff:{name:'Мастер'}, client_phone:'MUST_NOT_LEAVE_NET', client_id:'PRIVATE' });
const flush = async () => { for(let i=0;i<16;i++) await Promise.resolve(); };
function setup() {
  let rows = [structuredClone(row)], signedIn = true, outcome = null;
  const writes = [], listeners = new Set();
  const transport = {
    ownAppointments: async () => ok(rows),
    ownCancel: async (id,key) => { writes.push(['cancel',id,key]); if(outcome) return outcome; rows = rows.map(r=>r.id===id?{...r,status:'canceled'}:r); return ok(true); },
    ownReschedule: async (id,start,key) => { writes.push(['move',id,start,key]); if(outcome) return outcome; rows = rows.map(r=>r.id===id?{...r,start}:r); return ok(true); },
    personalSlots: async () => ok([{start:'2099-10-23T10:00:00Z',staffId:'staff',branchId:'branch'},{start:'2099-10-23T11:00:00Z',staffId:'foreign',branchId:'branch'}]),
  };
  const port=createOwnAppointments({transport,session:{view:()=>({signedIn}),subscribe:l=>{listeners.add(l);return()=>listeners.delete(l);}},newId:()=> '10000000-0000-4000-8000-000000000001',newAbort:()=>new AbortController()});
  return {port,transport,writes,rows:r=>{rows=r;},outcome:x=>{outcome=x;},signOut:()=>{signedIn=false;for(const l of listeners)l({signedIn});}};
}
test('own cancel needs explicit selected confirmation and double tap dispatches once', async()=>{
  const h=setup();h.port.open();await flush();
  h.port.cancel('foreign');await h.port.confirmCancel();assert.equal(h.writes.length,0);
  h.port.cancel(row.id);assert.equal(h.writes.length,0);
  await Promise.all([h.port.confirmCancel(),h.port.confirmCancel()]);
  assert.equal(h.writes.length,1);assert.equal(h.port.view().rows[0].status,'canceled');assert.match(h.port.view().notice,/отменена/);h.port.dispose();
});
test('move uses only an offered same-branch/staff slot, preserves record id and requires confirmation',async()=>{
  const h=setup();h.port.open();await flush();h.port.move(row.id);h.port.date('2099-10-23');await h.port.slots();
  assert.equal(h.port.view().slots.length,1);h.port.choose(8);assert.equal(h.port.view().phase,'reschedule');
  h.port.choose(0);assert.equal(h.writes.length,0);await Promise.all([h.port.confirmMove(),h.port.confirmMove()]);
  assert.deepEqual(h.writes[0].slice(0,3),['move',row.id,'2099-10-23T10:00:00Z']);assert.equal(h.writes.length,1);assert.equal(h.port.view().rows[0].id,row.id);h.port.dispose();
});
test('stale target is reviewed again before any write; sign-out removes the personal view',async()=>{
  const h=setup();h.port.open();await flush();h.port.cancel(row.id);h.rows([{...row,updatedAt:'2026-10-23T00:00:00Z'}]);await h.port.confirmCancel();assert.equal(h.writes.length,0);assert.match(h.port.view().notice,/изменилась/);
  h.signOut();assert.equal(h.port.view().open,false);h.port.dispose();
});
test('lost response is not retried by refresh/reopen and cannot show success from an unrelated row',async()=>{
  const h=setup();h.outcome({ok:false,failure:{reason:'unknown'}});h.port.open();await flush();h.port.cancel(row.id);await h.port.confirmCancel();
  assert.equal(h.writes.length,1);assert.deepEqual(h.port.view().blocked,[row.id]);await h.port.refresh();h.port.close();h.port.open();await flush();h.port.cancel(row.id);await h.port.confirmCancel();
  assert.equal(h.writes.length,1);assert.deepEqual(h.port.view().blocked,[row.id]);h.rows([{...row,id:'unrelated',status:'canceled'},row]);await h.port.refresh();assert.deepEqual(h.port.view().blocked,[row.id]);
  h.rows([{...row,status:'canceled'}]);await h.port.refresh();assert.deepEqual(h.port.view().blocked,[]);h.port.dispose();
});
test('own projection drops identity/contact/provider payload; mutation confirmation is exact',()=>{
  const projected=projectOwnAppointments([raw(row)]);assert(projected);assert(!JSON.stringify(projected).includes('PRIVATE'));assert(!JSON.stringify(projected).includes('MUST_NOT'));
  assert.equal(ownMutationConfirmed({ok:true,appointment:raw({...row,status:'canceled'})},row.id,null),true);
  assert.equal(ownMutationConfirmed({ok:true,appointment:raw({...row,id:'foreign',status:'canceled'})},row.id,null),false);
  assert.equal(ownMutationConfirmed({ok:true,appointment:raw(row)},row.id,'2099-10-23T00:00:00Z'),false);
});
test('wire uses only fixed personal routes, explicit context and stable idempotency; unknown 503 is not success',async()=>{
  const original=globalThis.fetch,calls=[];
  const auth={authorize:async()=>({kind:'bearer',bearer:'synthetic-test',serial:1}),reauthorize:async()=>({kind:'signed_out',reason:'session_revoked'}),refused(){}};
  try {
    globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({error:{code:'crm_outcome_unknown'}}),{status:503});};
    const transport=createTransport(auth);const result=await transport.ownCancel(row.id,'10000000-0000-4000-8000-000000000001',new AbortController().signal);
    assert.equal(result.ok,false);assert.equal(result.failure.reason,'unknown');assert.equal(calls.length,1);
    assert.match(calls[0].url,/\/personal-client\/appointments\/cancel$/);assert.deepEqual(JSON.parse(calls[0].init.body),{appointmentId:row.id});
    assert.equal(calls[0].init.headers['X-Maya-Authority-Context'],'personal_client');assert.equal(calls[0].init.headers['Idempotency-Key'],'10000000-0000-4000-8000-000000000001');
  } finally {globalThis.fetch=original;}
});
