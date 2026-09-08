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
    expect(method).toContain('await this.issue(channelProof)');
    expect(method).toContain(
      'await this.consume(channelProof, challenge.token)',
    );
    expect(method).toContain('return this.submitConsent(channelProof');
    expect(method).not.toMatch(
      /customerProfile\.(create|update|upsert|delete)/,
    );
    expect(method).not.toMatch(
      /phone|chat_id|providerSubject|clientId:\s*input/,
    );
  });
});
