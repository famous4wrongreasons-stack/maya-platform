import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('legacy installed native consent compatibility boundary', () => {
  it('keeps the old route as a narrow initiator of canonical link and consent', () => {
    const controller = read('customers/customers.controller.ts');
    const runtime = read('crm/client-channel-runtime.service.ts');
    const start = runtime.indexOf('async submitLegacyNativeConsent(');
    const end = runtime.indexOf('\n  async status(', start);
    const method = runtime.slice(start, end);

    expect(controller).toContain(
      'this.clientChannels.submitLegacyNativeConsent(',
    );
    expect(controller).toContain("@Headers('idempotency-key')");
    expect(method).toContain(
      "new BadRequestException('consent_transition_identity_required')",
    );
    expect(method).toContain('return this.submitConsent(channelProof');
    expect(method.indexOf('consent_transition_identity_required')).toBeLessThan(
      method.indexOf('this.submitConsent'),
    );
    expect(method).not.toMatch(
      /this\.(issue|consume|resolve|status)|randomUUID|createHash|Date\.now/,
    );
    expect(method).not.toMatch(
      /customerProfile\.(create|update|upsert|delete)/,
    );
    expect(method).not.toMatch(
      /phone|chat_id|providerSubject|clientId:\s*input/,
    );
  });
});
