// One ephemeral test signer. No reviewer, production key, real identity or transport.
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { assertProofDatabase } from './proof-db-guard';
import { WIDGET_RELEASE_CLAUSES } from '../../../src/entitlements/widget-release-clauses';
import { WidgetReleasePolicy } from '../../../src/entitlements/widget-release-policy.service';
import {
  canonical,
  releaseHash,
  type Signed,
} from '../../../src/entitlements/widget-release.contract';
import {
  SINGLE_OPERATOR,
  SINGLE_OPERATOR_RELEASE_AUTH,
  type SingleOperatorReleaseAuthorization,
} from '../../../src/entitlements/widget-release-production.contract';
import {
  NO_HANDOFF_PROFILE,
  PROFILE_CERT,
  PROFILE_DIGEST,
  PROFILE_REGISTRY_DIGEST,
  type ProfileCertificate,
} from '../../../src/entitlements/widget-release-profile.contract';

export function singleOperatorProof(
  databaseUrl: string,
  tenant: string,
  operator = 'operator',
) {
  assertProofDatabase({ ...process.env, DATABASE_URL: databaseUrl });
  const owner = generateKeyPairSync('ed25519');
  const config = new ConfigService({
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
    WIDGET_RELEASE_ENVIRONMENT: 'production',
    WIDGET_RELEASE_CANDIDATE_SHA: 'a'.repeat(40),
    WIDGET_RELEASE_TRUST_JSON: '{}',
    WIDGET_RELEASE_PRODUCTION_TENANTS_JSON: JSON.stringify([tenant]),
    WIDGET_RELEASE_PRODUCTION_TRUST_JSON: JSON.stringify({
      owner: {
        principalId: operator,
        purpose: 'owner',
        publicKey: owner.publicKey.export({ type: 'spki', format: 'pem' }),
      },
    }),
  });
  const policy = new WidgetReleasePolicy(config);
  const signOwner = (
    payload: SingleOperatorReleaseAuthorization,
  ): Signed<SingleOperatorReleaseAuthorization> => ({
    payload,
    keyId: 'owner',
    signature: sign(
      null,
      Buffer.from(canonical(payload)),
      owner.privateKey,
    ).toString('base64url'),
  });
  const command = (expectedVersion = 'absent', tenantId = tenant) => {
    const now = Date.now(),
      expiresAt = new Date(now + 600000).toISOString();
    const matrix: ProfileCertificate['matrix'] = WIDGET_RELEASE_CLAUSES.map(
      (id) =>
        id === 'G6-6' || id === 'G13-R8'
          ? {
              id,
              state: 'STOP',
              evidenceDigest: releaseHash('synthetic ' + id),
            }
          : { id, state: 'L', evidenceDigest: releaseHash('synthetic ' + id) },
    );
    const certificate: ProfileCertificate = {
      contract: PROFILE_CERT,
      environment: 'production',
      scope: NO_HANDOFF_PROFILE,
      certification: 'CERTIFIED_FOR_PROFILE',
      candidateSha: 'a'.repeat(40),
      buildDigest: policy.buildDigest(),
      profileDigest: PROFILE_DIGEST,
      registryDigest: PROFILE_REGISTRY_DIGEST,
      carrierDigest: releaseHash('synthetic carrier'),
      evidenceDigest: releaseHash('synthetic evidence'),
      integrationDigest: releaseHash('synthetic integration'),
      fbe2eDigest: releaseHash('synthetic fbe2e'),
      revocationProofDigest: releaseHash('synthetic revocation'),
      isolationProofDigest: releaseHash('synthetic isolation'),
      dependencyProofDigest: releaseHash('synthetic dependency'),
      matrix,
      globalAuditDigest: releaseHash(matrix),
      issuedAt: new Date(now - 1000).toISOString(),
      expiresAt,
    };
    return {
      certificate,
      authorization: signOwner({
        contract: SINGLE_OPERATOR_RELEASE_AUTH,
        governance: SINGLE_OPERATOR,
        independentHumanReview: false,
        reviewerId: null,
        authorizationId: randomUUID(),
        releaseId: 'synthetic-release',
        operation: 'grant',
        tenantId,
        environment: 'production',
        candidateSha: certificate.candidateSha,
        buildDigest: certificate.buildDigest,
        certificateDigest: releaseHash(certificate),
        evidenceDigest: certificate.evidenceDigest,
        profileId: NO_HANDOFF_PROFILE,
        profileDigest: PROFILE_DIGEST,
        approverId: operator,
        operatorId: operator,
        rollbackOwnerId: operator,
        expectedVersion,
        notBefore: certificate.issuedAt,
        expiresAt,
        grantExpiresAt: expiresAt,
      }),
    };
  };
  return { config, policy, command, signOwner };
}
