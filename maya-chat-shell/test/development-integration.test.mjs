import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectWidgetIntent } from '../src/net/project.ts';
import { createLiveSubmission } from '../src/shell/intents.ts';

const body = (owner_decision, accepted = true) => ({
  contract: 'maya.widget.intent/1', outcome: 'terminate',
  code: accepted ? null : 'effect_not_admissible',
  next_envelope: null, resolved_widget: null,
  receipt_outcome: accepted ? 'ACCEPTED' : 'REFUSED', owner_decision,
});
const price = { decision: 'approve', status: 'completed', state: 'SUCCEEDED', outcome: {
  verified: true, source: 'yclients', currency: 'RUB', service_id: '42',
  price_rubles: 1900, action_execution_id: 'price-ae',
} };

test('pricing and schedule projections retain their own terminal facts', async () => {
  const pricing = projectWidgetIntent(body(price));
  assert.equal(pricing.schedule_outcome, undefined);
  assert.deepEqual(pricing.owner_decision.outcome, price.outcome);
  const schedule = projectWidgetIntent(body({ domain: 'staff_schedule', state: 'FAILED' }, false));
  assert.equal(schedule.schedule_outcome, 'FAILED');
  assert.equal(schedule.owner_decision.outcome, null);
  for (const decision of [{ ...price, state: 'FAILED' }, { domain: 'other', state: 'FAILED' }, null]) {
    assert.equal(projectWidgetIntent(body(decision, false)).schedule_outcome, undefined);
  }
});

test('schedule failure permits one receipt read, without admitting pricing refusal or losing pricing success evidence', async () => {
  let reads = 0;
  const reply = { value: projectWidgetIntent(body(price)) };
  const port = createLiveSubmission({
    widgetIntent: async () => ({ ok: true, value: reply.value }),
    resolveWidgets: async () => { reads++; return { ok: false, failure: { reason: 'no_connection' } }; },
  });
  const submit = () => port.submit({ widget_id: 'same-widget' }, new AbortController().signal);
  assert.deepEqual(await submit(), { status: 'accepted', ownerDecision: reply.value.owner_decision });
  assert.equal(reads, 1);
  reply.value = projectWidgetIntent(body({ ...price, state: 'FAILED' }, false));
  assert.deepEqual(await submit(), { status: 'forbidden' });
  assert.equal(reads, 1);
  reply.value = projectWidgetIntent(body({ domain: 'staff_schedule', state: 'FAILED' }, false));
  assert.deepEqual(await submit(), { status: 'forbidden' });
  assert.equal(reads, 2);
});
