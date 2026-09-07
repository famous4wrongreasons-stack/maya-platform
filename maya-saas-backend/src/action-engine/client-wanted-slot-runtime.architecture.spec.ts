import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const backend = join(__dirname, '..', '..');
const repository = join(backend, '..');
const read = (path: string) => readFileSync(path, 'utf8');
const claude = read(join(repository, 'ai администратор/claude_ai.py'));
const freedSlot = read(join(repository, 'ai администратор/freed_slot.py'));
const bridge = read(
  join(repository, 'ai администратор/legacy_wanted_slot_bridge.py'),
);
const service = read(join(backend, 'src/crm/client-wanted-slot.service.ts'));
const channelRuntime = read(
  join(backend, 'src/crm/client-channel-runtime.service.ts'),
);
const communication = read(
  join(backend, 'src/communication-delivery/communication-delivery.service.ts'),
);

function branch(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Package 5 B9 production identity and delivery ratchet', () => {
  it('forbids hidden Client/referral mutations in both AI branches', () => {
    const wanted = branch(
      claude,
      'elif tool_name == "remember_wanted_slot":',
      'elif tool_name == "check_loyalty_balance":',
    );
    const referral = branch(
      claude,
      'elif tool_name == "get_referral_link":',
      'elif tool_name == "request_client_contact":',
    );
    for (const source of [wanted, referral]) {
      expect(source).not.toMatch(/get_or_create_client|add_slot_interest/);
      expect(source).not.toMatch(/get_or_create_ref_code|build_ref_link/);
    }
    expect(referral).toContain('business_mutations": 0');
    expect(bridge).toContain('current_context()');
    expect(bridge).not.toMatch(/\b(?:database|referral)\./);
  });

  it('removes legacy waitlist/chat delivery from the freed-slot path', () => {
    const canonical = freedSlot.slice(
      freedSlot.indexOf('async def offer_freed_slot('),
    );
    expect(canonical).toContain('async def offer_freed_slot(');
    expect(canonical).toContain('match_available_slot');
    expect(canonical).not.toMatch(
      /get_slot_waitlist|mark_slot_waitlist_notified|send_message|chat_id|find_candidates|log_freed_slot_offer/,
    );
  });

  it('requires exact verified delivery identity and never falls back to SQLite', () => {
    expect(channelRuntime).toContain('resolveVerifiedClientDeliveryEndpoint(');
    const channelResolution = readFileSync(
      join(__dirname, '../crm/client-delivery-endpoint.ts'),
      'utf8',
    );
    expect(channelResolution).toContain('deliveryAddressEncrypted');
    expect(channelResolution).toContain('clientChannelSubjectHash(');
    expect(channelResolution).toContain('!== link.providerSubjectHash');
    expect(channelResolution).toContain(
      'identityRef: link.providerSubjectHash',
    );
    expect(channelResolution).not.toMatch(
      /sqlite|chat_id|get_or_create_client/i,
    );
    expect(service).toContain('recipientIdentityRef: endpoint.identityRef');
    expect(communication).toContain('recipientIdentityRef');
    expect(communication).toContain('durableRecipientRef');
  });

  it('keeps exact time, bounded fan-out and canonical Action ownership', () => {
    expect(service).toContain('CLIENT_WANTED_SLOT_CAPABILITIES.add');
    expect(service).toContain('CLIENT_WANTED_SLOT_CAPABILITIES.match');
    expect(service).toContain('eligible.length >= 3');
    expect(service).toContain('desiredStartAt: command.desiredStartAt');
    expect(service).toContain('expiresAt: command.desiredStartAt');
    expect(service).not.toMatch(/tolerance|phone/i);
  });
});
