import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const source = (...parts: string[]): string =>
  readFileSync(join(ROOT, ...parts), 'utf8');

describe('P4-06 all-3 executable proof contract ratchet', () => {
  const executable = source(
    'src',
    'gift-certificates',
    'p4-06-gift-certificate-executable.service.ts',
  );
  const presentation = source(
    'src',
    'gift-certificates',
    'gift-certificate-claim.contract.ts',
  );
  const schema = source('prisma', 'schema.prisma');
  const registry = source('src', 'action-engine', 'action-engine.registry.ts');

  it('keeps checkout dispatch separate from paid certificate activation', () => {
    expect(executable).toContain('executeCheckout(');
    expect(executable).toContain('executeActivation(');
    expect(executable).toContain('providerState: payment.status');
    expect(executable).toContain('certificateMutations: 0');
    expect(executable).toContain(
      'PENDING checkout cannot activate certificate value',
    );
    expect(executable).toContain(
      'UNKNOWN checkout cannot activate certificate value',
    );
  });

  it('reconciles an ambiguous provider dispatch using the same request identity', () => {
    expect(executable).toContain('reconcileByIdempotencyKey(');
    expect(executable).toContain("outcome: 'STILL_UNKNOWN'");
    expect(executable).toContain('providerRequestIdentityHash');
    expect(executable).not.toContain('randomUUID');
    expect(registry).toContain('reconcile-before-retry');
    expect(registry).toContain('retryAfterProvenNonExecution: true');
  });

  it('creates activation and redemption facts in serializable transactions', () => {
    expect(
      executable.match(/TransactionIsolationLevel\.Serializable/g),
    ).toHaveLength(2);
    expect(executable).toContain('giftCertificate.create');
    expect(executable).toContain('giftCertificateRedemption.create');
    expect(executable).toContain('FOR UPDATE');
    expect(schema).toContain('@@unique([issueExecutionId, tenantId])');
    expect(schema).toContain('@@unique([certificateId, tenantId])');
    expect(schema).toContain('@@unique([actionExecutionId, tenantId])');
  });

  it('makes bearer re-presentation deterministic without durable raw secrets', () => {
    expect(presentation).toContain('giftCertificatePresentation(');
    expect(presentation).toContain('const bearer = `MAYA-GC-${digest}`');
    expect(presentation).toContain('giftCertificateClaimLookup(');
    expect(executable).toContain('delete result.bearer');
    expect(executable).toContain('delete result.presentationKey');
    expect(executable).toContain('presentationKeyVersion');
    expect(schema).toContain('presentationKeyVersion   String?');
  });

  it('keeps redemption full-only and outside loyalty/provider mutation paths', () => {
    expect(executable).toContain('Partial redemption is unsupported');
    expect(executable).toContain(
      'Certificate already has a full redemption winner',
    );
    expect(executable).not.toContain('loyaltyTransaction.create');
    expect(executable).not.toContain('loyaltyAccount.update');
    expect(executable).not.toContain('yooKassa.create');
  });

  it('fails closed on tenant, exact target, actor, and unresolved identity', () => {
    expect(executable).toContain('id_tenantId');
    expect(executable).toContain('unresolvedClientIdentityHold.findFirst');
    expect(executable).toContain('client_identity_unresolved');
    expect(executable).toContain(
      'Redemption target is not exact same-tenant business evidence',
    );
    expect(executable).toContain(
      'Redemption actor authority is not server-derived',
    );
  });
});
