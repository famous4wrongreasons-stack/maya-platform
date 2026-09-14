import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CONSENT_SECURITY_APPROVAL,
  CONSENT_SECURITY_INCIDENT,
  CONSENT_SECURITY_TARGET,
  consentSecurityHash,
  type SecurityManifest,
} from '../action-engine/consent-security-invalidation.contract';

const RECEIPTS = [
  '8987b79ea5544cac0610cb5e68f28c887602bf363a407b6a3680dbcadc4d3db6',
  '3dbc11747b322094cd02e8c76157c6093811c16a0406331d18bc282137d40af1',
].sort();
// Exactly the existing read-only audit's versioned array encoding, not a
// generic raw-request fingerprint. These hashes select evidence, not an actor.
const auditFingerprint = (parts: string[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex');

@Injectable()
export class ConsentSecurityApprovalService {
  verify(manifest: SecurityManifest) {
    const c = manifest.command,
      l = manifest.link;
    const target = auditFingerprint([
      c.tenantId,
      c.clientId,
      l.id,
      l.challengeId,
      l.issuanceEvidenceHash,
      l.verificationEvidenceHash,
    ]);
    const receipts = manifest.facts
      .map((f) =>
        auditFingerprint([
          c.tenantId,
          c.clientId,
          f.id,
          f.actionExecutionId,
          f.normalizedInputHash,
        ]),
      )
      .sort();
    if (
      c.incidentId !== CONSENT_SECURITY_INCIDENT ||
      target !== CONSENT_SECURITY_TARGET ||
      receipts.join(',') !== RECEIPTS.join(',')
    )
      throw new ForbiddenException(
        'consent_security_scope_reconciliation_required',
      );
    return consentSecurityHash({
      approvalRef: CONSENT_SECURITY_APPROVAL,
      incidentId: c.incidentId,
      target,
      receipts,
    });
  }
}
