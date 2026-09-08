import { createHash } from 'node:crypto';
import { ActionPolicyDecision } from '@prisma/client';
import type { RegisteredActionCapabilityV1 } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';
import {
  exactPreferenceKeys,
  preferenceObject,
} from './client-preferences.contract';

export const CONSENT_SECURITY_ACTION = 'invalidate_client_consent_authority';
export const CONSENT_SECURITY_CAPABILITY =
  'package5.a18.consent-security-invalidation.execute.v1';
export const CONSENT_SECURITY_CONTRACT =
  'maya.a18.consent-security-invalidation/1';
export const CONSENT_SECURITY_REASON = 'UNPROVEN_CLIENT_PROVENANCE';
export const CONSENT_SECURITY_INCIDENT = 'native-consent-compat-e9d3d3a2';
export const CONSENT_SECURITY_APPROVAL =
  'owner-approval:fdecfbb4:consent-security-invalidation-v1';
export const CONSENT_SECURITY_TARGET =
  '2f5ead7db7dc3844f52a3294f1f80e4432321eb4ca548b391b9f24bfd9f5e0cd';

export function consentSecurityHash(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, canonical(val)]),
      );
    return v;
  }
  return createHash('sha256')
    .update(`${CONSENT_SECURITY_CONTRACT}\n${JSON.stringify(canonical(value))}`)
    .digest('hex');
}
export function securityId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,180}$/.test(value))
    throw new ActionContractError('Exact security identity required');
  return value;
}
export function securityHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new ActionContractError('Security evidence digest required');
  return value;
}
function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new ActionContractError('Canonical UTC instant required');
  return value;
}
export interface ConsentSecurityCommand {
  incidentId: string;
  tenantId: string;
  clientId: string;
  linkId: string;
  factIds: string[];
}
export function normalizeSecurityCommand(
  value: unknown,
): ConsentSecurityCommand {
  const v = preferenceObject(value);
  exactPreferenceKeys(v, [
    'incidentId',
    'tenantId',
    'clientId',
    'linkId',
    'factIds',
  ]);
  if (
    !Array.isArray(v.factIds) ||
    v.factIds.length !== 2 ||
    new Set(v.factIds).size !== 2
  )
    throw new ActionContractError(
      'Exactly two distinct consent facts required',
    );
  return {
    incidentId: securityId(v.incidentId),
    tenantId: securityId(v.tenantId),
    clientId: securityId(v.clientId),
    linkId: securityId(v.linkId),
    factIds: v.factIds.map(securityId).sort(),
  };
}
export interface SecurityAuthorityEvidence {
  contract: 'maya.a18.security-actor/1';
  policyVersion: 1;
  userId: string;
  role: 'platform_owner';
  scope: 'platform';
  sessionIdentityHash: string;
  verifiedAt: string;
  approvalRef: string;
  approvalMaterialHash: string;
}
export function normalizeSecurityAuthority(
  value: unknown,
): SecurityAuthorityEvidence {
  const a = preferenceObject(value);
  exactPreferenceKeys(a, [
    'contract',
    'policyVersion',
    'userId',
    'role',
    'scope',
    'sessionIdentityHash',
    'verifiedAt',
    'approvalRef',
    'approvalMaterialHash',
  ]);
  if (
    a.contract !== 'maya.a18.security-actor/1' ||
    a.policyVersion !== 1 ||
    a.role !== 'platform_owner' ||
    a.scope !== 'platform' ||
    a.approvalRef !== CONSENT_SECURITY_APPROVAL
  )
    throw new ActionContractError('Canonical security actor evidence required');
  return {
    contract: a.contract,
    policyVersion: 1,
    userId: securityId(a.userId),
    role: a.role,
    scope: a.scope,
    sessionIdentityHash: securityHash(a.sessionIdentityHash),
    verifiedAt: instant(a.verifiedAt),
    approvalRef: a.approvalRef,
    approvalMaterialHash: securityHash(a.approvalMaterialHash),
  };
}
export interface SecurityManifest {
  contract: typeof CONSENT_SECURITY_CONTRACT;
  command: ConsentSecurityCommand;
  reasonCode: typeof CONSENT_SECURITY_REASON;
  policyVersion: 1;
  authority: SecurityAuthorityEvidence;
  link: {
    id: string;
    provider: 'maya_user' | 'telegram';
    providerSubjectHash: string;
    verificationEvidenceHash: string;
    challengeId: string;
    issuanceEvidenceHash: string;
    expectedRevokedAt: null;
  };
  facts: Array<{
    id: string;
    kind: 'privacy' | 'marketing';
    actionExecutionId: string;
    normalizedInputHash: string;
  }>;
  heads: Array<{ kind: 'privacy' | 'marketing'; factId: string }>;
  profiles: Array<{
    id: string;
    privacyConsentAt: string | null;
    marketingConsentAt: string | null;
  }>;
}
export function normalizeSecurityManifest(value: unknown): SecurityManifest {
  const v = preferenceObject(value);
  exactPreferenceKeys(v, [
    'contract',
    'command',
    'reasonCode',
    'policyVersion',
    'authority',
    'link',
    'facts',
    'heads',
    'profiles',
  ]);
  if (
    v.contract !== CONSENT_SECURITY_CONTRACT ||
    v.reasonCode !== CONSENT_SECURITY_REASON ||
    v.policyVersion !== 1
  )
    throw new ActionContractError('Security manifest version required');
  const command = normalizeSecurityCommand(v.command);
  const l = preferenceObject(v.link);
  exactPreferenceKeys(l, [
    'id',
    'provider',
    'providerSubjectHash',
    'verificationEvidenceHash',
    'challengeId',
    'issuanceEvidenceHash',
    'expectedRevokedAt',
  ]);
  if (
    !['maya_user', 'telegram'].includes(String(l.provider)) ||
    l.expectedRevokedAt !== null ||
    l.id !== command.linkId
  )
    throw new ActionContractError('Exact active security target required');
  if (
    !Array.isArray(v.facts) ||
    v.facts.length !== 2 ||
    !Array.isArray(v.heads) ||
    v.heads.length !== 2 ||
    !Array.isArray(v.profiles) ||
    v.profiles.length > 1
  )
    throw new ActionContractError('Bounded exact security manifest required');
  const facts = v.facts
    .map((value) => {
      const f = preferenceObject(value);
      exactPreferenceKeys(f, [
        'id',
        'kind',
        'actionExecutionId',
        'normalizedInputHash',
      ]);
      if (!['privacy', 'marketing'].includes(String(f.kind)))
        throw new ActionContractError('Consent kind required');
      return {
        id: securityId(f.id),
        kind: f.kind as 'privacy' | 'marketing',
        actionExecutionId: securityId(f.actionExecutionId),
        normalizedInputHash: securityHash(f.normalizedInputHash),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (
    facts.map((f) => f.id).join(',') !== command.factIds.join(',') ||
    new Set(facts.map((f) => f.kind)).size !== 2
  )
    throw new ActionContractError('Exact privacy and marketing facts required');
  const heads = v.heads
    .map((value) => {
      const h = preferenceObject(value);
      exactPreferenceKeys(h, ['kind', 'factId']);
      if (!facts.some((f) => f.kind === h.kind && f.id === h.factId))
        throw new ActionContractError(
          'Exact affected current consent head required',
        );
      return {
        kind: h.kind as 'privacy' | 'marketing',
        factId: securityId(h.factId),
      };
    })
    .sort((a, b) => (a.kind < b.kind ? -1 : 1));
  if (new Set(heads.map((h) => h.kind)).size !== 2)
    throw new ActionContractError('Distinct consent heads required');
  const profiles = v.profiles.map((value) => {
    const p = preferenceObject(value);
    exactPreferenceKeys(p, ['id', 'privacyConsentAt', 'marketingConsentAt']);
    return {
      id: securityId(p.id),
      privacyConsentAt:
        p.privacyConsentAt === null ? null : instant(p.privacyConsentAt),
      marketingConsentAt:
        p.marketingConsentAt === null ? null : instant(p.marketingConsentAt),
    };
  });
  return {
    contract: CONSENT_SECURITY_CONTRACT,
    command,
    reasonCode: CONSENT_SECURITY_REASON,
    policyVersion: 1,
    authority: normalizeSecurityAuthority(v.authority),
    link: {
      id: command.linkId,
      provider: l.provider as 'maya_user' | 'telegram',
      providerSubjectHash: securityHash(l.providerSubjectHash),
      verificationEvidenceHash: securityHash(l.verificationEvidenceHash),
      challengeId: securityId(l.challengeId),
      issuanceEvidenceHash: securityHash(l.issuanceEvidenceHash),
      expectedRevokedAt: null,
    },
    facts,
    heads,
    profiles,
  };
}
export function normalizeConsentSecurityInput(value: unknown) {
  const v = preferenceObject(value);
  exactPreferenceKeys(v, [
    'operation',
    'targetKind',
    'targetRef',
    'requestMaterialHash',
    'evidenceSetHash',
    'manifest',
  ]);
  const manifest = normalizeSecurityManifest(v.manifest);
  if (
    v.operation !== CONSENT_SECURITY_ACTION ||
    v.targetKind !== 'client_consent_security' ||
    v.targetRef !== manifest.command.clientId ||
    v.requestMaterialHash !== consentSecurityHash(manifest.command) ||
    v.evidenceSetHash !== consentSecurityHash(manifest)
  )
    throw new ActionContractError('Immutable consent security input mismatch');
  return {
    operation: CONSENT_SECURITY_ACTION,
    targetKind: 'client_consent_security',
    targetRef: manifest.command.clientId,
    requestMaterialHash: securityHash(v.requestMaterialHash),
    evidenceSetHash: securityHash(v.evidenceSetHash),
    manifest,
  };
}
export function consentSecurityCapability(): RegisteredActionCapabilityV1 {
  return {
    capability: CONSENT_SECURITY_CAPABILITY,
    capabilityVersion: 1,
    actionClass: CONSENT_SECURITY_ACTION,
    normalizedInputContract: CONSENT_SECURITY_CONTRACT,
    targetKind: 'client_consent_security',
    allowedSourceTypes: ['legacy_bridge'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['a18', 'ac1', 'security_invalidation', 'local_atomic'],
    policyKey: 'chapter6.package5.a18.consent-security-invalidation',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_CANONICAL',
    approvalRequirement: 'NONE',
    retry: {
      key: 'package5.wave3.local-transaction',
      version: 1,
      maxExecutionAttempts: 3,
      retryablePreDispatchErrors: new Set(['local_serialization']),
      backoffMs: [0, 25, 100],
    },
    reconciliation: {
      key: 'package5.wave3.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'package5.a18.consent-security-invalidation.local',
    executorVersion: 1,
    // Existing A18 durations; incident FK/retention guards preserve the pinned evidence.
    payloadRetentionMs: 30 * 86400000,
    auditRetentionMs: 7 * 365 * 86400000,
    normalizeInput: normalizeConsentSecurityInput,
  };
}
