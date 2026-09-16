// K8 — the client-facing widgets, and the presentation fence.
//
// The mapping puts it sharply: "the five PII fences fire HERE or nowhere". K4 built them; K8 is
// where a real client presentation meets them, and a fence that passed in a unit test but is never
// called on the path that matters protects nobody.
//
// Two rules do most of the work:
//   - a client-presented envelope never carries `pii_ceiling: 'client_identified'` for a segment
//   - `CLIENT_LIST` is refused outright under `presentation_mode: 'client'`
//
// The second is worth stating plainly: a client must never be shown a list of other clients. It is
// not a permission that happens to be absent — the kind is refused for that presentation mode.

import {
  clientPreviewFence,
  llmBoundaryFence,
  artifactPiiFence,
  spokenReadbackFence,
  secureSurfaceFence,
  type FenceVerdict,
} from '../authority/pii-fences';

export type PresentationMode = 'client' | 'staff' | 'owner' | 'system';

/** The kinds K8 may emit to a client. Read and refine only: none of them commits anything. */
export const CLIENT_KINDS = [
  'CHOICE',
  'METRIC',
  'LIMITATION',
  'SOURCE_STATUS',
  'FORM',
] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Refused outright under a client presentation, whatever the principal holds. */
export const KINDS_REFUSED_TO_CLIENTS = ['CLIENT_LIST'] as const;

export interface PresentationRequest {
  readonly mode: PresentationMode;
  readonly kind: string;
  readonly body: unknown;
  readonly deliveryChannel: string;
  readonly spokenText: string;
  readonly artifact?: { contains_pii?: boolean | null } | null;
  /** What the LIVE principal holds, resolved server-side. Never what the envelope claims. */
  readonly principalCapabilities: readonly string[];
  /** What this envelope would need. */
  readonly requiredCapabilities: readonly string[];
  /** `client_identified` may not appear on a segment shown to a client. */
  readonly piiCeiling: 'none' | 'aggregate' | 'client_identified';
}

export interface PresentationVerdict {
  readonly admitted: boolean;
  readonly refusals: readonly string[];
  /** All five, always evaluated — so "5/5 fired" is a fact about the run, not about the code. */
  readonly fences: readonly FenceVerdict[];
}

/**
 * Evaluate a presentation.
 *
 * Every fence runs on every request, even after one has already refused. That costs a little and
 * buys something worth more: the verdict says which fences fired, so "the five fired independently"
 * is observable per request rather than inferred from five separate unit tests.
 */
export const evaluatePresentation = (
  req: PresentationRequest,
): PresentationVerdict => {
  const isClient = req.mode === 'client';

  const fences: FenceVerdict[] = [
    clientPreviewFence(req.body, isClient),
    llmBoundaryFence(req.body),
    artifactPiiFence(req.artifact ?? {}),
    spokenReadbackFence(req.spokenText, req.deliveryChannel),
    secureSurfaceFence({
      secureSurfaceOnly: false,
      deliveryChannel: req.deliveryChannel,
    }),
  ];

  const refusals: string[] = [];

  // The kind fence, which is not a PII fence and is checked separately because it is categorical.
  if (
    isClient &&
    (KINDS_REFUSED_TO_CLIENTS as readonly string[]).includes(req.kind)
  )
    refusals.push(`${req.kind} is refused under presentation_mode 'client'`);

  if (isClient && req.piiCeiling === 'client_identified')
    refusals.push(
      "a client presentation may not carry pii_ceiling 'client_identified'",
    );

  // No envelope carries a capability the live principal does not hold. Checked against the live
  // principal, not against what the envelope was minted with — a downgrade between mint and
  // presentation must take the capability with it.
  const held = new Set(req.principalCapabilities);
  const missing = req.requiredCapabilities.filter((c) => !held.has(c));
  if (missing.length)
    refusals.push(`principal does not hold: ${missing.join(', ')}`);

  for (const f of fences) if (!f.allowed) refusals.push(`${f.fence}: ${f.why}`);

  return { admitted: refusals.length === 0, refusals, fences };
};
