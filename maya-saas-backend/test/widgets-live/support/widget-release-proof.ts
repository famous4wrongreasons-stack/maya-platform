// Synthetic signing identities only. Never a release certificate for Maya or a real tenant.
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, sign } from 'node:crypto';
import { WIDGET_RELEASE_CLAUSES } from '../../../src/entitlements/widget-release-clauses';
import { WidgetReleasePolicy } from '../../../src/entitlements/widget-release-policy.service';
import {
  canonical,
  RELEASE_AUTH,
  RELEASE_CERT,
  releaseHash,
  type ReleaseAuthorization,
  type ReleaseCertificate,
  type Signed,
} from '../../../src/entitlements/widget-release.contract';
export function releaseProof(databaseUrl: string, operatorId = 'operator') {
  const owner = generateKeyPairSync('ed25519'),
    security = generateKeyPairSync('ed25519');
  const config = new ConfigService({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    WIDGET_RELEASE_ENVIRONMENT: 'synthetic',
    WIDGET_RELEASE_CANDIDATE_SHA: 'a'.repeat(40),
    WIDGET_RELEASE_TRUST_JSON: JSON.stringify({
      owner: {
        principalId: 'synthetic-owner',
        purpose: 'owner',
        publicKey: owner.publicKey.export({ type: 'spki', format: 'pem' }),
      },
      security: {
        principalId: 'synthetic-reviewer',
        purpose: 'security',
        publicKey: security.publicKey.export({ type: 'spki', format: 'pem' }),
      },
    }),
  });
  const policy = new WidgetReleasePolicy(config);
  const signOwner = (
    payload: ReleaseAuthorization,
  ): Signed<ReleaseAuthorization> => ({
    payload,
    keyId: 'owner',
    signature: sign(
      null,
      Buffer.from(canonical(payload)),
      owner.privateKey,
    ).toString('base64url'),
  });
  const signCertificate = (
    payload: ReleaseCertificate,
  ): Signed<ReleaseCertificate> => ({
    payload,
    keyId: 'security',
    signature: sign(
      null,
      Buffer.from(canonical(payload)),
      security.privateKey,
    ).toString('base64url'),
  });
  const command = (
    tenantId: string,
    expectedVersion = 'absent',
    over: Partial<ReleaseAuthorization> = {},
  ) => {
    const now = Date.now(),
      until = new Date(now + 3600000).toISOString();
    const cert = signCertificate({
      contract: RELEASE_CERT,
      environment: 'synthetic',
      scope: 'full165.closed-input',
      candidateSha: 'a'.repeat(40),
      buildDigest: policy.buildDigest(),
      carrierDigest: releaseHash('synthetic carrier'),
      registryDigest: releaseHash('synthetic registry'),
      evidenceDigest: releaseHash('synthetic evidence'),
      integrationDigest: releaseHash('synthetic integration'),
      fbe2eDigest: releaseHash('synthetic fbe2e'),
      revocationProofDigest: releaseHash('synthetic revoke'),
      issuedAt: new Date(now - 1000).toISOString(),
      expiresAt: until,
      matrix: WIDGET_RELEASE_CLAUSES.map((id) => ({
        id,
        state: 'L',
        evidenceDigest: releaseHash('synthetic ' + id),
      })),
    });
    return {
      certificate: cert,
      authorization: signOwner({
        contract: RELEASE_AUTH,
        authorizationId: 'proof-' + Math.random().toString(36).slice(2),
        operation: 'grant',
        tenantId,
        environment: 'synthetic',
        candidateSha: 'a'.repeat(40),
        buildDigest: policy.buildDigest(),
        certificateDigest: releaseHash(cert),
        operatorId,
        approverId: 'synthetic-owner',
        reviewerId: 'synthetic-reviewer',
        rollbackOwnerId: 'synthetic-rollback-owner',
        expectedVersion,
        notBefore: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now + 600000).toISOString(),
        grantExpiresAt: until,
        ...over,
      }),
    };
  };
  return { config, policy, command, signOwner, signCertificate };
}
