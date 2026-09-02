import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(SRC_ROOT, '..', '..');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('P4-06 redeem_gift_certificate Shadow architecture', () => {
  it('stops at planShadow before redemption, certificate, loyalty, payment, provider, or message mutation', () => {
    const service = source(
      join(
        SRC_ROOT,
        'gift-certificates',
        'gift-certificate-redemption-shadow.service.ts',
      ),
    );
    const registry = source(
      join(SRC_ROOT, 'action-engine', 'action-engine.registry.ts'),
    );

    expect(service).toContain('this.actionEngine.planShadow({');
    expect(service).not.toContain('executeWithReceipt');
    expect(service).not.toMatch(
      /giftCertificate\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(
      /giftCertificateRedemption\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(
      /loyalty(?:Account|Transaction)\.(?:create|update|upsert|delete)/,
    );
    expect(service).not.toMatch(/billingPayment\.(?:create|update|upsert)/);
    expect(service).not.toContain('createPayment');
    expect(service).not.toContain('sendMessage');
    expect(service).not.toContain('$executeRaw');
    expect(registry).toMatch(
      /actionClass: 'redeem_gift_certificate',[\s\S]{0,1600}policyDecision: ActionPolicyDecision\.SHADOW_ONLY,[\s\S]{0,1600}autonomyLevel: 'L2_5_SHADOW',[\s\S]{0,1600}executorKey: 'shadow\.none'/,
    );
  });

  it('uses one centralized HMAC lookup and retains only derived bindings in ActionExecution', () => {
    const service = source(
      join(
        SRC_ROOT,
        'gift-certificates',
        'gift-certificate-redemption-shadow.service.ts',
      ),
    );
    const claimContract = source(
      join(SRC_ROOT, 'gift-certificates', 'gift-certificate-claim.contract.ts'),
    );
    const canonicalInput = service.slice(
      service.indexOf('const canonicalInput = {'),
      service.indexOf('const execution = await this.actionEngine.planShadow'),
    );
    const lookupContract = claimContract.slice(
      claimContract.indexOf('export function giftCertificateClaimLookup'),
      claimContract.indexOf('export function giftCertificatePresentation('),
    );
    const presentationContract = claimContract.slice(
      claimContract.indexOf('export function giftCertificatePresentation('),
      claimContract.indexOf(
        'export function giftCertificatePresentationConfig(',
      ),
    );

    expect(service).toContain('giftCertificateClaimLookup(');
    expect(service).toContain(
      'input.presentationKeys.has(certificate.presentationKeyVersion)',
    );
    expect(lookupContract.match(/createHmac\(/g)).toHaveLength(1);
    expect(presentationContract.match(/createHmac\(/g)).toHaveLength(2);
    expect(presentationContract).toContain('giftCertificateClaimLookup(');
    expect(claimContract).toContain(
      'GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION',
    );
    expect(canonicalInput).not.toContain('transientBearer');
    expect(canonicalInput).not.toContain('certificate_claim');
    expect(canonicalInput).not.toContain('codeHash');
    expect(canonicalInput).not.toContain('presentationKey:');
    expect(canonicalInput).toContain('claimBindingHash');
    expect(canonicalInput).toContain('rawBearerPersisted: false');
  });

  it('derives exact tenant Client target and actor authority and keeps partial redemption impossible', () => {
    const service = source(
      join(
        SRC_ROOT,
        'gift-certificates',
        'gift-certificate-redemption-shadow.service.ts',
      ),
    );
    const dto = source(
      join(
        SRC_ROOT,
        'gift-certificates',
        'dto',
        'gift-certificate-redemption-shadow.dto.ts',
      ),
    );

    expect(service).toContain('checkCrmClientRegistrationGuard({');
    expect(service).toContain(
      'appointment.mayaClientId !== targetLink.client.id',
    );
    expect(service).toContain("redemptionMode: 'full_only'");
    expect(service).toContain(
      "certificateOwnershipSemantics: 'tenant_transferable_bearer_liability'",
    );
    expect(service).toContain('purchaserIsRedemptionOwner: false');
    expect(service).toContain('recipientSubjectIsClientIdentity: false');
    expect(service).toContain('requesterAuthority');
    expect(service).toContain("providerBoundary: 'LOCAL_ONLY'");
    expect(service).toContain('unknownApplicable: false');
    expect(dto).toContain("@IsIn(['full'])");
    expect(dto).not.toMatch(/partial_amount|nominal|currency|certificate_id/i);
  });

  it('keeps the disposable raw-bearer bridge out of production legacy owners and logs no bearer/body', () => {
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
        'maya_gift_certificate_redemption_shadow_bridge.py',
      ),
    );
    const module = source(
      join(SRC_ROOT, 'gift-certificates', 'gift-certificates.module.ts'),
    );

    expect(legacyBot).not.toContain(
      'maya_gift_certificate_redemption_shadow_bridge',
    );
    expect(legacyPwa).not.toContain(
      'maya_gift_certificate_redemption_shadow_bridge',
    );
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+database\b/m);
    expect(bridge).not.toMatch(/^\s*(?:from|import)\s+yukassa_api\b/m);
    expect(bridge).not.toContain('mark_cert_used');
    expect(bridge).not.toContain('save_gift_certificate');
    expect(bridge).not.toContain('create_payment');
    expect(bridge).not.toContain('send_message');
    expect(bridge).not.toContain('response.text()');
    expect(bridge).not.toMatch(/logger\.[a-z]+\([^\n]*certificate_claim/);
    expect(module).toContain('GiftCertificateRedemptionShadowController');
    expect(module).toContain('GiftCertificateRedemptionShadowService');
  });
});
