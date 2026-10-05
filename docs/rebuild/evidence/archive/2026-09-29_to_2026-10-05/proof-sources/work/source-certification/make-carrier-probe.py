from pathlib import Path
b=Path('.')
s=(b/'test/widgets-live/support/shell-booking-flow.mjs').read_text()
s=s.replace("import { render }", "import assert from 'node:assert/strict';\nimport { resultOf, markupOf } from '../../../../maya-carrier-react/test/.bundle.mjs';\nimport { render }")
s=s.replace('const transport = {', 'const responses = [];\nconst transport = {').replace('const value = projectWidgetIntent(response.body);','responses.push(response.body);\n    const value = projectWidgetIntent(response.body);')
s=s[:s.index('try {\n  const ingested')]+'''try {
  const refs = [];
  const load = (envelope) => {
    const r = runtime.widgets.ingest(envelope);
    assert.notEqual(r.ingested, 'duplicate');
    const result = resultOf(envelope, new Date().toISOString());
    const markup = markupOf({id:r.itemId,result,display:'live',pending:null,sentence:null});
    for (const ref of result.readingOrder) assert(markup.includes(`data-ref="${ref}"`));
    refs.push({kind:envelope.kind,refCount:result.readingOrder.length});
    return r.itemId;
  };
  const activate = async (itemId, ref) => {
    const outcome = await runtime.widgets.activate(itemId,ref);
    assert.equal(outcome.outcome,'dismissed',JSON.stringify(outcome));
    return responses.at(-1);
  };
  const intent = (e,effect) => e.intents.find(i=>i.effect===effect);
  let envelope = input.envelope;
  let itemId = load(envelope);
  if (input.mode === 'journal') {
    const result = await activate(itemId, `intent:${envelope.body.detail_intent}`);
    assert.equal(result.next_envelope.kind,'SCHEDULE');
    assert.equal(result.next_envelope.body.range.from.slice(0,10),'2026-09-24');
    process.stdout.write(JSON.stringify({mode:input.mode,backendDetail:true,fullscreen:runtime.shell.view().fullscreen,refs,counters:runtime.widgets.counters()}));
  } else {
    for (const kind of ['service','staff','slot','commit']) {
      const ref = kind==='commit' ? `intent:${intent(envelope,'COMMIT').intent_ref}`
        : kind==='slot' ? `slot:${envelope.body.groups[0].slots[0].slot_ref}`
        : `option:${envelope.body.options[0].option_id}`;
      const result = await activate(itemId,ref);
      if (kind!=='commit') { envelope=result.next_envelope; }
      else assert.equal(result.owner_decision.state,'SUCCEEDED');
    }
    for (const operation of ['reschedule','cancel']) {
      const response = await post(input.baseUrl,input.accessToken,'/api/ai/tools/appointments.own.list/execute',{surface:'web',arguments:{}});
      assert.equal(response.status,201);
      envelope=response.body.resolution.receipt.envelope;
      itemId=load(envelope);
      const ref = operation==='reschedule' ? `intent:${envelope.body.detail_intent}` : `entry:${envelope.body.entries[0].entry_ref}`;
      const proposal=await activate(itemId,ref);
      assert.equal(proposal.next_envelope.body.confirmation_subject,operation);
      const confirmation=proposal.next_envelope;
      const committed=await activate(itemId,`intent:${intent(confirmation,'COMMIT').intent_ref}`);
      assert.equal(committed.owner_decision.state,'SUCCEEDED');
    }
    process.stdout.write(JSON.stringify({mode:input.mode,createRescheduleCancel:true,refs,counters:runtime.widgets.counters()}));
  }
} finally { runtime.dispose(); }
'''
(b/'test/widgets-live/support/shell-approved-source-probe.mjs').write_text(s)
