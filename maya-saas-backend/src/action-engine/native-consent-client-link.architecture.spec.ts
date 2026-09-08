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
    expect(consent).toContain('idempotencyKey: commandRef.current');
    expect(consent).not.toContain('/customers/me/profile');
    expect(consent).not.toMatch(/clientId|client_id|phone|chat_id/);
  });

  it('permits initial issuance only from dual durable Maya account bindings', () => {
    const issuer = read(
      'maya-saas-backend/src/crm/maya-user-client-association-issuer.ts',
    );
    expect(issuer).toContain("provider !== 'maya_user'");
    expect(issuer).toContain('userId: channel.userId');
    expect(issuer).toContain(
      'OR: [{ userId: channel.userId }, { clientId: client.id }]',
    );
    expect(issuer).toContain('profiles[0].userId !== channel.userId');
    expect(issuer).toContain('profiles[0].clientId !== client.id');
    expect(issuer).not.toMatch(
      /phoneHash|phone:\s|chat_id|clientId:\s*(?:input|body|request)/,
    );
  });
});
