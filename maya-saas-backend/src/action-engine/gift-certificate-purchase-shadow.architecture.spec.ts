import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-06 initiate_gift_certificate_purchase Shadow architecture', () => {
  it('stops at planShadow before provider, payment, certificate, redemption, or message mutation', () => {
    const service = source(
      join(
        SRC_ROOT,
        'gift-certificates',
        'gift-certificate-purchase-shadow.service.ts',
      ),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.actionEngine.planShadow(request)');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toMatch(
      /giftCertificate\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(
      /giftCertificateRedemption\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(/billingPayment\.(?:create|update|upsert)/);
    expect(service).not.toContain('yukassa_api');
    expect(service).not.toContain('createPayment');
    expect(service).not.toContain('sendMessage');
    expect(registry).toMatch(
      /actionClass: 'initiate_gift_certificate_purchase',[\s\S]{0,1200}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1200}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1200}executorKey: 'shadow\.none'/,
    );
  });

  it('keeps checkout PENDING known and activation, bearer, and UNKNOWN absent', () => {
    const contract = source(
      join(
        SRC_ROOT,
        'action-engine',
        'gift-certificate-purchase-shadow.contract.ts',
      ),
    );

    expect(contract).toContain("expectedProviderState: 'PENDING'");
    expect(contract).toContain('unknownApplicable: false');
    expect(contract).toContain('createsCertificate: false');
    expect(contract).toContain('issuesBearer: false');
    expect(contract).not.toContain("actionClass: 'activate_gift_certificate'");
    expect(contract).not.toContain('codeHash');
  });

  it('keeps the disposable bridge out of production legacy owners', () => {
    const legacyBot = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'bot.py'),
    );
    const legacyPwa = source(
      join(REPOSITORY_ROOT, 'ai администратор', 'webhook_server.py'),
    );
    const bridge = source(
      join(
        REPOSITORY_ROOT,
        'ai администратор',
        'maya_gift_certificate_purchase_shadow_bridge.py',
      ),
    );
    const appModule = source(join(SRC_ROOT, 'app.module.ts'));

    expect(legacyBot).not.toContain(
      'maya_gift_certificate_purchase_shadow_bridge',
    );
    expect(legacyPwa).not.toContain(
      'maya_gift_certificate_purchase_shadow_bridge',
    );
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yukassa_api\b/m);
    expect(bridge).not.toContain('save_gift_certificate');
    expect(bridge).not.toContain('new_cert_code');
    expect(bridge).not.toContain('create_payment');
    expect(bridge).not.toContain('send_message');
    expect(appModule).toContain('GiftCertificatesModule');
  });
});
