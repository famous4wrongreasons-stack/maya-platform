// K3 — mint → compose → fit → seal, for read-only emission.
//
// Four steps, in that order, and the order carries the security property. The seal is computed LAST
// and over the composed-and-fitted body, so a body altered after sealing no longer matches its own
// seal; and the intent token is minted against the record that already exists, so a token can never
// name a widget that was not emitted.
//
// Wave 2 emits to nobody. That is not a limitation to be apologised for: it is what lets the whole
// path — compose, seal, refuse — be exercised before any user can be harmed by a mistake in it.

import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { sha256Hex } from '../token.util';

/** The five kinds K3 may emit read-only, per the package's own scope. Later kinds arrive with their packages. */
export const K3_EMITTABLE_KINDS = [
  'METRIC',
  'SCHEDULE',
  'SOURCE_STATUS',
  'PROGRESS',
  'LIMITATION',
] as const;
export type K3EmittableKind = (typeof K3_EMITTABLE_KINDS)[number];

export interface MintRequest {
  tenantId: string;
  conversationId: string;
  turnId: string;
  kind: K3EmittableKind;
  principalProofHash: string;
  deliveryChannel: string;
  /** The body a projector produced. K3 does not author bodies; it seals what it is given. */
  body: Record<string, unknown>;
  /** Seconds the envelope stays live. */
  ttlSeconds: number;
  freshnessClass: 'live' | 'scenario' | 'proactive_once' | 'static';
}

export interface SealedEmission {
  widgetId: string;
  bodyHash: string;
  envelopeSeal: string;
  issuedAt: Date;
  expiresAt: Date;
  /** Returned once, to the caller that will deliver it. Only its hash is stored. */
  intentToken: string;
  intentTokenHash: string;
}

@Injectable()
export class WidgetEmitterService {
  constructor(private readonly prisma: PrismaService) {}

  // ── compose ─────────────────────────────────────────────────────────────────────────────────
  /**
   * Canonical JSON: keys sorted at every depth, no incidental whitespace. Without it the same body
   * hashes two ways depending on key insertion order, and a hash that depends on how an object was
   * built is not a hash of the body — it is a hash of the program that made it.
   */
  private canonical(value: unknown): string {
    const walk = (v: unknown): unknown => {
      if (v === null || typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.map(walk);
      const o = v as Record<string, unknown>;
      return Object.keys(o)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = walk(o[k]);
          return acc;
        }, {});
    };
    return JSON.stringify(walk(value));
  }

  private bodyHash(body: unknown): string {
    return sha256Hex(this.canonical(body));
  }

  // ── fit ─────────────────────────────────────────────────────────────────────────────────────
  /**
   * K3 fits nothing: the channel profiles and the degradation path are K6, and a fitter that
   * guessed here would be a second, quieter implementation of the one K6 owns. What K3 does is
   * record the channel the envelope was composed for, so K6's fitter has something to fit FROM.
   *
   * §4.5.5 requires that every withheld intent name a `reachable_via` present in the emitted
   * envelope, or the fitter throws rather than emitting. Nothing is withheld here because nothing
   * is fitted, and the render receipt that would record it belongs to K6.
   */
  private fit(
    kind: K3EmittableKind,
    deliveryChannel: string,
  ): { tier: null; withheld: [] } {
    void kind;
    void deliveryChannel;
    return { tier: null, withheld: [] };
  }

  // ── seal ────────────────────────────────────────────────────────────────────────────────────
  /**
   * The seal covers the identity of the envelope AND its body. Covering the body is what makes a
   * post-seal edit detectable; covering the identity is what stops a body being moved from one
   * envelope to another.
   */
  private seal(parts: {
    widgetId: string;
    tenantId: string;
    kind: string;
    bodyHash: string;
    issuedAt: Date;
    expiresAt: Date;
  }): string {
    const h = createHash('sha256');
    h.update(
      [
        parts.widgetId,
        parts.tenantId,
        parts.kind,
        parts.bodyHash,
        parts.issuedAt.toISOString(),
        parts.expiresAt.toISOString(),
      ].join('|'),
      'utf8',
    );
    return h.digest('hex');
  }

  // ── mint ────────────────────────────────────────────────────────────────────────────────────
  /**
   * One transaction: the emission row and its intent record are written together or not at all.
   * A token whose record is missing would refuse at Gate 1 anyway — but it would refuse as
   * `EXPIRED`, which would be a lie about why. Writing both together keeps the refusal honest.
   */
  async emit(req: MintRequest, now = new Date()): Promise<SealedEmission> {
    const widgetId = randomUUID();
    const issuedAt = now;
    const expiresAt = new Date(now.getTime() + req.ttlSeconds * 1000);

    const bodyHash = this.bodyHash(req.body);
    this.fit(req.kind, req.deliveryChannel);
    const envelopeSeal = this.seal({
      widgetId,
      tenantId: req.tenantId,
      kind: req.kind,
      bodyHash,
      issuedAt,
      expiresAt,
    });

    // The token is high-entropy and opaque. The client never authors it and cannot derive it: that
    // is the half of BUTTON -> ENDPOINT the wire format does not cover by itself.
    const intentToken = randomBytes(32).toString('base64url');
    const intentTokenHash = sha256Hex(intentToken);

    await this.prisma.$transaction([
      this.prisma.widgetEmission.create({
        data: {
          tenantId: req.tenantId,
          widgetId,
          turnId: req.turnId,
          kind: req.kind,
          bodyVersion: 1,
          envelopeSeal,
          bodyHash,
          lifecycleState: 'MINTED',
          freshnessClass: req.freshnessClass,
          issuedAt,
          expiresAt,
          retentionSec: req.ttlSeconds,
          retentionUntil: expiresAt,
          dedupeKey: `${req.kind}:${req.conversationId}:${bodyHash.slice(0, 16)}`,
          deliveryChannel: req.deliveryChannel,
          deliveryStateJson: { state: 'composed', delivered: false } as never,
          bodyJson: req.body as never,
        },
      }),
      this.prisma.widgetIntentRecord.create({
        data: {
          tenantId: req.tenantId,
          intentTokenHash,
          widgetId,
          principalProofHash: req.principalProofHash,
          widgetKind: req.kind,
          // Read-only emission: the only effect K3 may mint. A DRAFT, REQUEST_APPROVAL or COMMIT
          // token does not exist in wave 2, and that is guaranteed by absence here rather than by
          // a check somewhere downstream.
          effect: 'NONE',
          priority: 0,
          verificationFloor: 'ANONYMOUS',
          requestedScopeHash: sha256Hex(`${req.kind}|read-only`),
          bodyHash,
          selectionDomain: 'none',
          issuedAt,
          expiresAt,
          singleUse: false,
        },
      }),
    ]);

    return {
      widgetId,
      bodyHash,
      envelopeSeal,
      issuedAt,
      expiresAt,
      intentToken,
      intentTokenHash,
    };
  }

  /**
   * Re-derive a stored envelope's seal and compare. This is the check that makes the seal worth
   * computing: without it a seal is a column, not a fence.
   */
  async verifySeal(tenantId: string, widgetId: string): Promise<boolean> {
    const row = await this.prisma.widgetEmission.findFirst({
      where: { tenantId, widgetId },
      select: {
        widgetId: true,
        tenantId: true,
        kind: true,
        bodyHash: true,
        issuedAt: true,
        expiresAt: true,
        envelopeSeal: true,
        bodyJson: true,
      },
    });
    if (!row) return false;
    // Both halves are checked: the body still hashes to bodyHash, and the seal still covers it.
    const bodyStillMatches =
      row.bodyJson === null || this.bodyHash(row.bodyJson) === row.bodyHash;
    const sealStillMatches =
      this.seal({
        widgetId: row.widgetId,
        tenantId: row.tenantId,
        kind: row.kind,
        bodyHash: row.bodyHash,
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
      }) === row.envelopeSeal;
    return bodyStillMatches && sealStillMatches;
  }
}
