import { createHash } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { WIDGET_RELEASE_CLAUSES } from './widget-release-clauses';

export const RELEASE_FEATURE = 'widgets.runtime';
export const RELEASE_AUTH = 'maya.widget-release-authorization/1';
export const RELEASE_CERT = 'maya.widget-release-certificate/1';
export const RELEASE_STATE = 'maya.widget-release-state/1';
export const RELEASE_AUDIT = 'widget.release';
export const MAX_RELEASE_MS = 24 * 60 * 60 * 1000;
export type ReleaseEnvironment = 'synthetic' | 'staging';
export interface Signed<T> {
  payload: T;
  keyId: string;
  signature: string;
}
export interface ReleaseAuthorization {
  contract: typeof RELEASE_AUTH;
  authorizationId: string;
  operation: 'grant' | 'revoke';
  tenantId: string;
  environment: ReleaseEnvironment;
  candidateSha: string;
  buildDigest: string;
  certificateDigest: string;
  operatorId: string;
  approverId: string;
  reviewerId: string;
  rollbackOwnerId: string;
  expectedVersion: string;
  notBefore: string;
  expiresAt: string;
  grantExpiresAt: string | null;
}
export interface ReleaseClause {
  id: string;
  state: 'L' | 'L-T' | 'U';
  evidenceDigest: string;
  u?: {
    decisionDigest: string;
    absence: string;
    refusal: string;
    mechanism: string;
  };
}
export interface ReleaseCertificate {
  contract: typeof RELEASE_CERT;
  environment: ReleaseEnvironment;
  scope: 'full165.closed-input';
  candidateSha: string;
  buildDigest: string;
  carrierDigest: string;
  registryDigest: string;
  evidenceDigest: string;
  integrationDigest: string;
  fbe2eDigest: string;
  revocationProofDigest: string;
  issuedAt: string;
  expiresAt: string;
  matrix: ReleaseClause[];
}
export interface ReleaseCommand {
  authorization: Signed<ReleaseAuthorization>;
  certificate?: Signed<ReleaseCertificate>;
}
export interface ReleaseReceipt {
  contract: 'maya.widget-release-receipt/1';
  authorizationId: string;
  operation: 'grant' | 'revoke';
  tenantId: string;
  candidateSha: string;
  certificateDigest: string;
  actorId: string;
  approverId: string;
  reviewerId: string;
  rollbackOwnerId: string;
  previousVersion: string;
  version: string;
  appliedAt: string;
  expiresAt: string | null;
  auditId: string;
}
export function releaseDeny(reason: string): never {
  throw new ForbiddenException(`widget_release_${reason}`);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return releaseDeny('shape');
  return value as Record<string, unknown>;
}
export function exact(value: unknown, keys: string[]) {
  const v = object(value);
  if (Object.keys(v).sort().join('|') !== [...keys].sort().join('|'))
    releaseDeny('shape');
  return v;
}
export function identifier(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(v))
    releaseDeny('identifier');
}
export function digest(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) releaseDeny('digest');
}
export function instant(v: unknown): number {
  if (
    typeof v !== 'string' ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    return releaseDeny('time');
  return Date.parse(v);
}
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const v = object(value);
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
      .join(',') +
    '}'
  );
}
export const releaseHash = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export function authorization(value: unknown): ReleaseAuthorization {
  const v = exact(value, [
    'contract',
    'authorizationId',
    'operation',
    'tenantId',
    'environment',
    'candidateSha',
    'buildDigest',
    'certificateDigest',
    'operatorId',
    'approverId',
    'reviewerId',
    'rollbackOwnerId',
    'expectedVersion',
    'notBefore',
    'expiresAt',
    'grantExpiresAt',
  ]);
  if (
    v.contract !== RELEASE_AUTH ||
    !['grant', 'revoke'].includes(String(v.operation)) ||
    !['synthetic', 'staging'].includes(String(v.environment))
  )
    releaseDeny('authorization');
  for (const k of [
    'authorizationId',
    'tenantId',
    'operatorId',
    'approverId',
    'reviewerId',
    'rollbackOwnerId',
  ])
    identifier(v[k]);
  if (
    typeof v.candidateSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(v.candidateSha)
  )
    releaseDeny('candidate');
  digest(v.buildDigest);
  digest(v.certificateDigest);
  if (v.expectedVersion !== 'absent') digest(v.expectedVersion);
  if (
    instant(v.expiresAt) <= instant(v.notBefore) ||
    instant(v.expiresAt) - instant(v.notBefore) > MAX_RELEASE_MS
  )
    releaseDeny('authorization_window');
  if (v.operation === 'grant') instant(v.grantExpiresAt);
  else if (v.grantExpiresAt !== null) releaseDeny('revoke_expiry');
  if (v.reviewerId === v.approverId || v.reviewerId === v.operatorId)
    releaseDeny('independent_reviewer');
  return v as unknown as ReleaseAuthorization;
}
export function certificate(value: unknown): ReleaseCertificate {
  const v = exact(value, [
    'contract',
    'environment',
    'scope',
    'candidateSha',
    'buildDigest',
    'carrierDigest',
    'registryDigest',
    'evidenceDigest',
    'integrationDigest',
    'fbe2eDigest',
    'revocationProofDigest',
    'issuedAt',
    'expiresAt',
    'matrix',
  ]);
  if (
    v.contract !== RELEASE_CERT ||
    v.scope !== 'full165.closed-input' ||
    !['synthetic', 'staging'].includes(String(v.environment))
  )
    releaseDeny('certificate');
  if (
    typeof v.candidateSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(v.candidateSha)
  )
    releaseDeny('candidate');
  for (const k of [
    'buildDigest',
    'carrierDigest',
    'registryDigest',
    'evidenceDigest',
    'integrationDigest',
    'fbe2eDigest',
    'revocationProofDigest',
  ])
    digest(v[k]);
  if (
    instant(v.expiresAt) <= instant(v.issuedAt) ||
    instant(v.expiresAt) - instant(v.issuedAt) > MAX_RELEASE_MS
  )
    releaseDeny('certificate_window');
  if (
    !Array.isArray(v.matrix) ||
    v.matrix.length !== WIDGET_RELEASE_CLAUSES.length
  )
    releaseDeny('threshold');
  const rows = v.matrix as unknown[];
  if (
    rows
      .map((x) => object(x).id)
      .sort()
      .join('|') !== [...WIDGET_RELEASE_CLAUSES].sort().join('|')
  )
    releaseDeny('threshold');
  for (const row of rows) {
    const r = object(row);
    exact(
      r,
      r.state === 'U'
        ? ['id', 'state', 'evidenceDigest', 'u']
        : ['id', 'state', 'evidenceDigest'],
    );
    if (!['L', 'L-T', 'U'].includes(String(r.state))) releaseDeny('threshold');
    digest(r.evidenceDigest);
    if (r.state === 'U')
      for (const d of Object.values(
        exact(r.u, ['decisionDigest', 'absence', 'refusal', 'mechanism']),
      ))
        digest(d);
  }
  return v as unknown as ReleaseCertificate;
}
