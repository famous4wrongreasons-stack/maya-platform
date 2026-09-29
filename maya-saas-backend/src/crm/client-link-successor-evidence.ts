import { createHash } from 'node:crypto';
import type { ClientReverificationCandidateService } from './client-reverification-candidate.service';
import type { EncryptionService } from '../encryption/encryption.service';

export type SuccessorCandidate = Awaited<
  ReturnType<ClientReverificationCandidateService['resolve']>
>;
export const SUCCESSOR_CHALLENGE_POLICY = Object.freeze({
  version: 2,
  tokenHashVersion: 2,
  ttlSeconds: 600,
  tokenNamespace: 'a18.client-link-challenge.otp.v2',
});
/** Fixed ordering for the digest; JSONB ordering is not an evidence contract. */
export function successorEvidence(
  c: SuccessorCandidate,
  issuedAt: Date,
  encryption: EncryptionService,
) {
  return {
    contract: 'a18.client-link-challenge.issue.v2',
    resolver: 'sb1.canonical-client-sms.v2',
    resolutionEvidenceRef: `client-channel-link:${c.predecessorLinkId}`,
    resolutionEvidenceHash: c.lineageHash,
    issuerAuthorityHash: encryption.opaqueReference(
      'sb1.authenticated-user.v2',
      JSON.stringify([c.tenantId, c.userId]),
    ),
    tenantId: c.tenantId,
    clientId: c.clientId,
    issuedAt: issuedAt.toISOString(),
    policyVersion: 2,
    mayaUserId: c.userId,
    mayaSubjectHash: c.providerSubjectHash,
    verificationChannel: {
      kind: c.verificationChannel.kind,
      crmLinkId: c.verificationChannel.crmLinkId,
      addressHash: c.verificationChannel.addressHash,
    },
    predecessorLinkId: c.predecessorLinkId,
  };
}
export const successorEvidenceHash = (
  e: ReturnType<typeof successorEvidence>,
) => createHash('sha256').update(JSON.stringify(e)).digest('hex');
