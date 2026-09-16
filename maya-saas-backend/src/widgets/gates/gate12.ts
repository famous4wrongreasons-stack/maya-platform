// ── Gate 12 — the data fence ─────────────────────────────────────────────────────────────────────
//
// LEGACY. Moved here unchanged from the former `gate-logic.ts`. The Gate 12 specification records
// that the carrier-ceiling rule below has no contract source, and that slot 12 calls `gate12(ctx)`
// with no subject, so on the live path this function only passes. Its deletion from this file
// belongs to the Gate 12 unit.
//
// All five PII fences, on the path. They were correct and called from nowhere; this is the call.
// Each fires independently — a submission that trips any one of them is refused, and the K4 suite
// already proves that removing any one leaves the other four firing.

import type { GateContext, GateVerdict } from '../gate.types';
import {
  PII_FENCES,
  clientPreviewFence,
  llmBoundaryFence,
  artifactPiiFence,
  spokenReadbackFence,
  secureSurfaceFence,
} from '../authority/pii-fences';
import { pass, refuse } from './verdict';

export interface DataFenceSubject {
  /** The principal the data belongs to, as a proof hash. */
  readonly subjectPrincipalProofHash: string | null;
  readonly subjectTenantId: string | null;
  readonly piiClass: 'none' | 'business_aggregate' | 'client_identified';
  readonly carrier: string;
}

/** The highest PII class each carrier may carry. An artefact above its ceiling is refused. */
export const CARRIER_PII_CEILING: Readonly<
  Record<string, DataFenceSubject['piiClass']>
> = Object.freeze({
  pwa: 'client_identified',
  native: 'client_identified',
  'telegram-bot': 'business_aggregate',
  'web-push': 'none',
  sms: 'none',
  email: 'business_aggregate',
  'realtime-voice': 'business_aggregate',
});

const PII_RANK: Readonly<Record<string, number>> = Object.freeze({
  none: 0,
  business_aggregate: 1,
  client_identified: 2,
});

export const gate12 = (
  ctx: GateContext,
  subject?: DataFenceSubject,
): GateVerdict => {
  if (!subject) return pass; // this submission carries no subject data
  const r = ctx.record;
  if (!r) return refuse('use_secure_surface', 'no record');

  // CROSS-TENANT: refused before anything else, because a tenant mismatch is not a presentation
  // question and must never reach a fence that could be reasoned around.
  if (
    subject.subjectTenantId !== null &&
    subject.subjectTenantId !== ctx.tenantId
  )
    return refuse('use_secure_surface', 'cross-tenant personal data');

  // CROSS-PRINCIPAL identified PII: the data belongs to someone who is not the caller.
  if (
    subject.piiClass === 'client_identified' &&
    subject.subjectPrincipalProofHash !== null &&
    subject.subjectPrincipalProofHash !== ctx.principalProofHash
  )
    return refuse(
      'use_secure_surface',
      'identified personal data of another principal',
    );

  // ABOVE THE CARRIER CEILING: a carrier that cannot hold this class does not get it.
  const ceiling = CARRIER_PII_CEILING[subject.carrier] ?? 'none';
  if (PII_RANK[subject.piiClass] > PII_RANK[ceiling])
    return refuse(
      'use_secure_surface',
      `${subject.piiClass} above the ${subject.carrier} ceiling`,
    );

  return pass;
};

/** The five fences, named, so the count is the contract's and not a subset of it. */
export const DATA_FENCES = PII_FENCES;
export const FENCE_FUNCTIONS = [
  clientPreviewFence,
  llmBoundaryFence,
  artifactPiiFence,
  spokenReadbackFence,
  secureSurfaceFence,
];
