// K12 — conversation erasure, and the proof that history was never business state.
//
// The exit is the sharp one: AFTER AN ERASURE REPLAY, EVERY CANONICAL BOOKING / CONSENT / LOYALTY
// READ IS BYTE-IDENTICAL TO BEFORE. That is only achievable if no business object ever pointed at a
// message, a widget or a turn — so the erasure job is not really where this is won. It is won by
// INV-15, and the job is where it is DEMONSTRATED.
//
// Three properties, and each is a different kind of claim:
//
//   1. structural — no business object references a message id or a widget id
//   2. mechanical — erasure touches exactly the two erasable stores and writes a tombstone per row
//   3. replayed   — canonical reads before and after are compared byte for byte
//
// The mirror's dedupe keys are the subtle case. They must SURVIVE erasure — otherwise erasing a
// conversation would let the same reminder be delivered again — while retaining no content. A
// dedupe key is therefore a hash, and the check is that it is one: opaque, fixed width, and
// carrying nothing a person wrote.

import { createHash } from 'node:crypto';

import type { ErasureClass } from '../../widget-contract/lifecycle';

/** §5.5's two erasable stores. The receipt store is not among them — receipts are AUDIT_RETAINED. */
export const TOMBSTONE_STORES = ['timeline', 'intent_audit'] as const;
export type TombstoneStore = (typeof TOMBSTONE_STORES)[number];

export class ErasureRefusal extends Error {}

export interface ErasureRequest {
  readonly tenantId: string;
  readonly erasureRequestRef: string;
  /** Whose conversation. An erasure without a subject is a truncation, not a right. */
  readonly subjectPrincipalProofHash: string;
}

export interface ErasableRow {
  readonly store: TombstoneStore;
  readonly rowKey: string;
  readonly erasureClass: ErasureClass;
  /** JSON Pointers into the row. Never the values — a tombstone that quoted what it erased is not one. */
  readonly fields: readonly string[];
}

export interface Tombstone {
  readonly tenantId: string;
  readonly erasureRequestRef: string;
  readonly store: TombstoneStore;
  readonly rowKey: string;
  readonly fieldsErased: readonly string[];
  readonly erasedAt: string;
}

/**
 * Plan an erasure.
 *
 * `AUDIT_RETAINED` rows are refused rather than skipped. Skipping would let a caller hand in an
 * audit row and receive a success that erased nothing — the shape of a right that appears to work.
 * `CANONICAL_ELSEWHERE` is erased HERE and retained THERE, which is the whole reason the class
 * exists: the widget layer's copy goes, the canonical owner's row stays, and the canonical read is
 * therefore unchanged.
 */
export const planErasure = (
  request: ErasureRequest,
  rows: readonly ErasableRow[],
  now: Date,
): readonly Tombstone[] => {
  if (!request.subjectPrincipalProofHash)
    throw new ErasureRefusal('an erasure request without a subject is refused');

  for (const row of rows) {
    if (row.erasureClass === 'AUDIT_RETAINED')
      throw new ErasureRefusal(
        `${row.store}/${row.rowKey} is AUDIT_RETAINED and survives a conversation erasure`,
      );
    if (!(TOMBSTONE_STORES as readonly string[]).includes(row.store))
      throw new ErasureRefusal(`${row.store} is not an erasable store`);
    if (!row.fields.length)
      throw new ErasureRefusal(
        `${row.store}/${row.rowKey} names no fields: an erasure that erases nothing is not recorded as one`,
      );
  }

  return rows.map((row) =>
    Object.freeze({
      tenantId: request.tenantId,
      erasureRequestRef: request.erasureRequestRef,
      store: row.store,
      rowKey: row.rowKey,
      fieldsErased: [...row.fields],
      erasedAt: now.toISOString(),
    }),
  );
};

// ── INV-15 — conversation history is never business state ────────────────────────────────────────

/**
 * The forbidden pointer names, as they would appear on a BUSINESS object.
 *
 * This is a source-level test rather than a runtime one, because the property is about what the
 * schema permits, not about what a given row holds. A business table with a nullable `widgetId`
 * that happens to be null everywhere is still a table that can reference a widget.
 */
export const HISTORY_POINTER_NAMES = [
  'messageId',
  'message_id',
  'widgetId',
  'widget_id',
  'turnId',
  'turn_id',
  'conversationId',
  'conversation_id',
] as const;

/**
 * Which models in a Prisma schema reference conversation history, excluding the widget layer's own.
 *
 * The widget layer's models are allowed to name these — a `WidgetEmission` is ABOUT a widget. What
 * must be empty is the set of business models that do.
 */
export const businessModelsReferencingHistory = (
  schema: string,
): readonly string[] => {
  const offenders: string[] = [];
  const blocks = schema.split(/\nmodel\s+/).slice(1);
  for (const block of blocks) {
    const name = block.slice(0, block.indexOf(' ')).trim();
    if (name.startsWith('Widget')) continue;
    const end = block.indexOf('\n}');
    const body = end === -1 ? block : block.slice(0, end);
    for (const line of body.split('\n')) {
      const field = line.trim().split(/\s+/)[0];
      if ((HISTORY_POINTER_NAMES as readonly string[]).includes(field))
        offenders.push(`${name}.${field}`);
    }
  }
  return offenders;
};

// ── The mirror's dedupe keys — opaque, and they survive ──────────────────────────────────────────

/** The separator, named once. A hash whose inputs can run together is a hash with collisions. */
const SEP = String.fromCharCode(0);

/**
 * A dedupe key is a hash of the identity of a delivery, never of its text.
 *
 * It must outlive erasure: a key that vanished with the conversation would let an already-delivered
 * reminder be delivered again the moment someone exercised their rights. It must also carry
 * nothing — which is why it is built from the moment, the subject and the window, and why the
 * content is not an input at all rather than being hashed along with everything else.
 */
export const dedupeKey = (args: {
  momentKey: string;
  subjectPrincipalProofHash: string;
  windowStart: string;
}): string =>
  createHash('sha256')
    .update(
      [args.momentKey, args.subjectPrincipalProofHash, args.windowStart].join(
        SEP,
      ),
      'utf8',
    )
    .digest('hex');

/** Opaque means: 64 hex characters and nothing legible. */
export const isOpaqueDedupeKey = (key: string): boolean =>
  /^[0-9a-f]{64}$/.test(key);

// ── The replay proof ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare canonical reads before and after an erasure.
 *
 * Canonicalised the same way K10's digests are — key order is not information, and two reads that
 * differ only in serialisation order are the same read. Anything else is a difference that matters.
 */
const canonical = (v: unknown): string => {
  const walk = (x: unknown): unknown => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(walk);
    const o = x as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((a, k) => {
        a[k] = walk(o[k]);
        return a;
      }, {});
  };
  return JSON.stringify(walk(v));
};

export const canonicalReadDigest = (read: unknown): string =>
  createHash('sha256').update(canonical(read), 'utf8').digest('hex');

export interface ReplayVerdict {
  readonly identical: boolean;
  readonly changed: readonly string[];
}

export const replayIsByteIdentical = (
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): ReplayVerdict => {
  const names = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].sort();
  const changed = names.filter(
    (n) => canonicalReadDigest(before[n]) !== canonicalReadDigest(after[n]),
  );
  return Object.freeze({ identical: changed.length === 0, changed });
};
