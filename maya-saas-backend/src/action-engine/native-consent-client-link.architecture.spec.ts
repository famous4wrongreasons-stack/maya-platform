import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('native consent verified Client link boundary', () => {
  it('links the authenticated Maya channel before canonical Client consent', () => {
    const pwa = read('сайт и приложение/app.html');
    const start = pwa.indexOf('function AMayaConsent()');
    const end = pwa.indexOf('\nwindow.AMayaConsent = AMayaConsent;', start);
    const consent = pwa.slice(start, end);

    expect(consent).toContain("authedFetch('/client-channel/status')");
    expect(consent).toContain("authedFetch('/client-channel/challenges'");
    expect(consent).toContain("authedFetch('/client-channel/consume'");
    expect(consent).toContain("authedFetch('/client-channel/consent'");
    expect(consent).toContain('meMayaConsentTransition(');
    expect(consent).toContain('body: JSON.stringify(command)');
    expect(consent).not.toContain('/customers/me/profile');
    expect(consent).not.toMatch(/clientId|client_id|phone|chat_id/);
  });

  it('retires legacy association authority and requires existing canonical provenance', () => {
    const issuer = read(
      'maya-saas-backend/src/crm/maya-user-client-association-issuer.ts',
    );
    expect(issuer).toContain('Promise.reject(');
    expect(issuer).not.toMatch(/tx\.|channel\.userId|profiles\[/);
    const runtime = read(
      'maya-saas-backend/src/crm/client-channel-runtime.service.ts',
    );
    const resolver = runtime.slice(
      runtime.indexOf('async resolve('),
      runtime.indexOf('  consume('),
    );
    expect(resolver).toContain('lockClientChannelIdentity(');
    expect(resolver).toContain('revokedAt: null');
    expect(resolver).toContain(
      'this.challenges.issue({ resolutionProof: channelProof })',
    );
    expect(resolver).not.toMatch(
      /client\.(find|create)|customerProfile\.|userId|initialMayaChallenges/,
    );
  });
});
