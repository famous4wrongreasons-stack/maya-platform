import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-06 activate_gift_certificate Shadow architecture', () => {
  it('stops at planShadow before certificate, bearer, redemption, payment, provider, or message mutation', () => {
    const service = source(
      join(
        SRC_ROOT,
        'gift-certificates',
        'gift-certificate-activation-shadow.service.ts',
      ),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.actionEngine.planShadow({');
    expect(service).toContain('this.yooKassa.getPayment(providerPaymentId)');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toMatch(
      /giftCertificate\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(
      /giftCertificateRedemption\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(/billingPayment\.(?:create|update|upsert)/);
    expect(service).not.toContain('createPayment');
    expect(service).not.toContain('sendMessage');
    expect(registry).toMatch(
      /actionClass: 'activate_gift_certificate',[\s\S]{0,1400}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1400}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1400}executorKey: 'shadow\.none'/,
    );
  });

  it('derives paid evidence and presentation key version server-side without raw bearer/code material', () => {
    const service = source(
      join(
        SRC_ROOT,
        'gift-certificates',
        'gift-certificate-activation-shadow.service.ts',
      ),
    );
    const dto = source(
      join(
        SRC_ROOT,
        'gift-certificates',
        'dto',
        'gift-certificate-activation-shadow.dto.ts',
      ),
    );

    expect(service).toContain(
      "'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION'",
    );
    expect(service).toContain("providerPayment.status === 'pending'");
    expect(service).toContain("providerPayment.status === 'unknown'");
    expect(service).toContain("providerPayment.status !== 'succeeded'");
    expect(service).toContain('rawBearerGenerated: false');
    expect(service).toContain('rawCodePersisted: false');
    expect(service).not.toContain('randomBytes');
    expect(service).not.toContain('codeHash:');
    expect(dto).not.toMatch(/paid|payment_status|nominal|currency|expiry/i);
    expect(dto).not.toMatch(/presentation_key|bearer|code/i);
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
        'maya_gift_certificate_activation_shadow_bridge.py',
      ),
    );
    const module = source(
      join(SRC_ROOT, 'gift-certificates', 'gift-certificates.module.ts'),
    );

    expect(legacyBot).not.toContain(
      'maya_gift_certificate_activation_shadow_bridge',
    );
    expect(legacyPwa).not.toContain(
      'maya_gift_certificate_activation_shadow_bridge',
    );
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yukassa_api\b/m);
    expect(bridge).not.toContain('save_gift_certificate');
    expect(bridge).not.toContain('new_cert_code');
    expect(bridge).not.toContain('create_payment');
    expect(bridge).not.toContain('mark_cert_used');
    expect(bridge).not.toContain('send_message');
    expect(module).toContain('GiftCertificateActivationShadowController');
    expect(module).toContain('GiftCertificateActivationShadowService');
  });
});
