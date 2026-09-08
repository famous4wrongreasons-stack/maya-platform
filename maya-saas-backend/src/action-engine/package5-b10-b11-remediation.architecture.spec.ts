import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
function pythonFunction(source: string, name: string) {
  const match = source.match(
    new RegExp(
      `(?:^|\\n)(?:async )?def ${name}\\([\\s\\S]*?(?=\\n(?:async )?def |$)`,
    ),
  );
  if (!match) throw new Error(`Missing production function ${name}`);
  return match[0];
}

const forbiddenClientShortcut = /get_or_create_client|phone.*client/i;
const forbiddenScorerOwner =
  /find_candidates|send_message|log_freed_slot_offer|publish_recovery_touchpoint|chat_id/;

function assertSubscriptionInitiator(source: string) {
  if (
    forbiddenClientShortcut.test(source) ||
    /create_subscription|create_payment|set_subscription_payment_id|update_subscription_status/.test(
      source,
    ) ||
    !source.includes('client_commands.channel_proof') ||
    !source.includes('purchase_bridge.initiate_purchase')
  )
    throw new Error('Subscription endpoint bypasses verified Client/P4-05');
}

function assertScorerDisabled(source: string) {
  if (
    forbiddenScorerOwner.test(source) ||
    !source.includes('legacy_wanted_slot_bridge.match_available_slot') ||
    !source.includes('"cycle_scored_outreach": "disabled"')
  )
    throw new Error(
      'Cycle scorer retained delivery or business-fact ownership',
    );
}

describe('Package 5 B10/B11 production bypass protection', () => {
  const webhook = read('ai администратор/webhook_server.py');
  const freedSlot = read('ai администратор/freed_slot.py');
  const transport = read(
    'ai администратор/maya_subscription_purchase_bridge.py',
  );
  const cutover = read(
    'maya-saas-backend/src/customer-subscriptions/customer-subscription-purchase-cutover.service.ts',
  );

  it('retires legacy promo issuance with a mutation-free compatibility outcome', () => {
    const source = pythonFunction(webhook, 'promo_gift_handler');
    expect(source).toContain('status=410');
    expect(source).toContain('"business_mutations": 0');
    expect(source).not.toMatch(
      /get_or_create_client|save_birthday_promo|new_birthday_promo_code|send_message|_send_client_push/,
    );
  });

  it('keeps subscription HTTP as verified initiator of P4-05', () => {
    const source = pythonFunction(webhook, 'sub_create_handler');
    assertSubscriptionInitiator(source);
    expect(transport).toContain(
      'maya.customer-subscription-purchase-cutover-bridge/1',
    );
    expect(transport).not.toMatch(/\b(?:database|subscriptions|yukassa_api)\./);
    expect(cutover).toContain('this.clientChannels.resolve');
    expect(cutover).toContain('P4_05_EXECUTABLE_CAPABILITIES.initiatePurchase');
    expect(cutover).toContain('this.executor.execute(request)');
    expect(cutover).not.toMatch(
      /\.(?:client|customerSubscription)\.(?:create|upsert)\(/,
    );
  });

  it('detects hidden Client or direct legacy subscription mutations', () => {
    const source = pythonFunction(webhook, 'sub_create_handler');
    for (const bypass of [
      'database.get_or_create_client(chat_id)',
      'database.create_subscription(client_id=1)',
      'await yukassa_api.create_payment(amount_rub=100)',
    ])
      expect(() =>
        assertSubscriptionInitiator(`${source}\n    ${bypass}`),
      ).toThrow();
  });

  it('disables cycle-scored outreach while preserving exact B9 delivery', () => {
    const source = pythonFunction(freedSlot, 'offer_freed_slot');
    assertScorerDisabled(source);
    const alerts = readFileSync(
      resolve(
        __dirname,
        '../operational-alerts/canonical-appointment-alerts.service.ts',
      ),
      'utf8',
    );
    const wanted = readFileSync(
      resolve(__dirname, '../crm/client-wanted-slot.service.ts'),
      'utf8',
    );
    expect(alerts).toContain('this.wanted.matchAvailable({');
    expect(alerts).toContain("sourceEventId: 'domain-event:' + event.id");
    for (const guard of [
      "type: 'appointment.removed'",
      "observation: 'after_watch_started'",
      'released.staffId !== staff.id',
      'released.branchId !== staff.branchId',
      'released.startAt.getTime() !== input.availableStartAt.getTime()',
    ])
      expect(wanted).toContain(guard);
    expect(pythonFunction(webhook, '_process_record_delete')).not.toMatch(
      /offer_freed_slot|send_message|refund_for_cancelled_record/,
    );
  });

  it('detects direct Telegram, chat-id, offer and recovery writers in scorer', () => {
    const source = pythonFunction(freedSlot, 'offer_freed_slot');
    for (const bypass of [
      'await app.bot.send_message(chat_id, text)',
      'database.log_freed_slot_offer(client_id=1)',
      'await publish_recovery_touchpoint(phone="x")',
      'candidate = find_candidates(staff_id, slot_dt)',
    ])
      expect(() => assertScorerDisabled(`${source}\n    ${bypass}`)).toThrow();
  });
});
