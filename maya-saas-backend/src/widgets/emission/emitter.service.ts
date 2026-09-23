// P-MINT — the single compose → type → fit → seal → record pipeline.
//
// Effect and target semantics come only from `intent-template.registry.ts`. The request carries a
// WidgetComposerInput and server-resolved principal proof; neither a client nor an LLM can put an
// effect or target on the wire. There is no token-minting overload without both values.

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import type { WidgetComposerInput } from '../../widget-contract/envelope';
import type { AuthorityEnvelope } from '../../widget-contract/envelope-roots';
import type { WidgetKind } from '../../widget-contract/kinds';
import { profileFor } from '../carriers/channel-profile';
import { fit } from '../carriers/fitter';
import { stableActionJson } from '../authority/contract-bindings';
import type { PrincipalView } from '../gate.types';
import { sha256Hex } from '../token.util';
import { assertNoForbiddenKeys } from '../validation/f88-walk';
import { assertComposerInput } from './envelope-validator';
import {
  A2_GAP_REF,
  IntentTemplateRefusal,
  resolveIntentTemplate,
} from './intent-template.registry';
import {
  intentRecordData,
  mintIntentMaterial,
  type MintedIntentMaterial,
} from './record-writer';
import { SealService } from './seal.service';

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
  kind: WidgetKind;
  principalProofHash: string;
  deliveryChannel: string;
  /** Server-composed body. It carries facts and presentation only; never intent effect semantics. */
  body: Record<string, unknown>;
  ttlSeconds: number;
  freshnessClass: 'live' | 'scenario' | 'proactive_once' | 'static';
  /** Server-derived body classification. Client-identifying envelopes never persist slotted copy. */
  piiClass?: AuthorityEnvelope['pii_class'];
  /** The only projector value the minter accepts. */
  composerInput: WidgetComposerInput;
  /** Canonical server-resolved principal. Its proof hash must equal `principalProofHash`. */
  principal: PrincipalView;
}

export interface SealedEmission {
  widgetId: string;
  bodyHash: string;
  envelopeSeal: string;
  issuedAt: Date;
  expiresAt: Date;
  /** Compatibility accessor for existing fixtures: the first minted token, if one exists. */
  intentToken: string | null;
  intentTokenHash: string | null;
  intentTokens: readonly string[];
  intentTokenHashes: readonly string[];
  kind: WidgetKind;
  a2Limited: boolean;
}

@Injectable()
export class WidgetEmitterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seals: SealService,
  ) {}

  /**
   * The canonical P-MINT entry. `composerInput` is the only projector value read; `principal` is the
   * one server-resolved authority view. The rest of `request` is transport/store context already
   * owned by the emission service, and contains no effect or target member.
   */
  async emit(request: MintRequest, now = new Date()): Promise<SealedEmission> {
    const input = request.composerInput;
    const principal = request.principal;
    if (
      principal.authority.tenantId !== request.tenantId ||
      principal.proofHash !== request.principalProofHash
    )
      throw new IntentTemplateRefusal('principal_mismatch');
    assertComposerInput(input);
    if (input.kind_proposal !== request.kind)
      throw new IntentTemplateRefusal('request_kind_mismatch');

    const resolved = input.intent_proposals.map((proposal) => ({
      proposal,
      resolved: resolveIntentTemplate({
        proposal,
        widgetKind: input.kind_proposal,
        deliveryChannel: request.deliveryChannel,
      }),
    }));

    const a2Limited = resolved.some(
      (entry) => entry.resolved.kind === 'a2_limitation',
    );
    const kind: WidgetKind = a2Limited ? 'LIMITATION' : input.kind_proposal;
    const body = a2Limited
      ? {
          limitation_codes: [
            ...new Set([...input.limitation_codes, A2_GAP_REF]),
          ],
          capability_gap_ref: A2_GAP_REF,
        }
      : request.body;
    const issuedAt = now;
    const expiresAt = new Date(now.getTime() + request.ttlSeconds * 1000);
    const widgetId = randomUUID();
    const bodyHash = sha256Hex(stableActionJson(body));

    const materials: MintedIntentMaterial[] = a2Limited
      ? []
      : resolved.map((entry, index) => {
          if (entry.resolved.kind !== 'intent')
            throw new IntentTemplateRefusal('mixed_a2_resolution');
          return mintIntentMaterial({
            input,
            proposal: entry.proposal,
            resolved: entry.resolved,
            intentIndex: index,
            issuedAt,
            envelopeExpiresAt: expiresAt,
            slotless: request.piiClass === 'client_identified',
          });
        });

    const tokened = materials.filter(
      (m): m is MintedIntentMaterial & { token: string; tokenHash: string } =>
        m.token !== null && m.tokenHash !== null,
    );
    const fitting = fit({
      carrier: request.deliveryChannel,
      intents: tokened.map((m) => ({
        token: m.token,
        label: m.intent.label,
        role: m.intent.role,
        isEscape: m.intent.role === 'escape',
      })),
      bodyText: stableActionJson(body),
      reachableVia:
        tokened.find((m) => m.intent.role === 'escape')?.token ?? 'shell.root',
    });
    const emittedTokens = new Set(fitting.emitted.map((i) => i.token));
    const emittedIntents = materials.filter(
      (m) => m.token === null || emittedTokens.has(m.token),
    );
    const envelopeForSeal = {
      contract: 'maya.widget.envelope/1',
      widget_id: widgetId,
      tenant_id: request.tenantId,
      kind,
      body,
      intents: emittedIntents.map((m) => m.intent),
      limitations: a2Limited
        ? [{ reason_code: A2_GAP_REF, capability_gap_ref: A2_GAP_REF }]
        : [],
    };
    assertNoForbiddenKeys('WidgetEnvelope', envelopeForSeal, [
      { at: 'intents', shape: 'WidgetIntent' },
      { at: 'enabled', shape: 'Cell' },
    ]);
    if (Buffer.byteLength(stableActionJson(envelopeForSeal), 'utf8') > 32_768)
      throw new IntentTemplateRefusal('envelope_oversize');

    const profile = profileFor(request.deliveryChannel);
    if (!profile) throw new IntentTemplateRefusal('carrier_unknown');
    const envelopeSeal = this.seals.seal({
      bodyHash,
      widgetId,
      tenantId: request.tenantId,
      principalProofHash: principal.proofHash,
      issuedAt,
      expiresAt,
      profileId: profile.profileId,
    });

    const emittedTokened = emittedIntents.filter(
      (
        material,
      ): material is MintedIntentMaterial & {
        token: string;
        tokenHash: string;
      } => material.token !== null && material.tokenHash !== null,
    );
    const recordWrites = emittedTokened.map((material) =>
      this.prisma.widgetIntentRecord.create({
        data: intentRecordData({
          material,
          input,
          tenantId: request.tenantId,
          widgetId,
          principalProofHash: principal.proofHash,
          bodyHash,
          body,
          issuedAt,
        }) as never,
      }),
    );
    await this.prisma.$transaction([
      this.prisma.widgetEmission.create({
        data: {
          tenantId: request.tenantId,
          widgetId,
          turnId: request.turnId,
          kind,
          bodyVersion: 1,
          envelopeSeal,
          bodyHash,
          lifecycleState: 'MINTED',
          freshnessClass: request.freshnessClass,
          issuedAt,
          expiresAt,
          retentionSec: request.ttlSeconds,
          retentionUntil: expiresAt,
          dedupeKey: `${kind}:${request.conversationId}:${bodyHash.slice(0, 16)}`,
          deliveryChannel: request.deliveryChannel,
          deliveryStateJson: { state: 'composed', delivered: false } as never,
          bodyJson: body as never,
        },
      }),
      ...recordWrites,
      this.prisma.widgetRenderReceipt.create({
        data: {
          tenantId: request.tenantId,
          widgetId,
          profileId: profile.profileId,
          profileVersion: 1,
          renderTier: fitting.tier,
          intentsMinted: materials.length,
          intentsEmitted: emittedIntents.length,
          intentsWithheldJson: fitting.intentsWithheld as never,
          bodyReductionsJson: fitting.bodyReductions as never,
          textEquivalentIsCanonical: fitting.textEquivalentIsCanonical,
          degradedAt: issuedAt,
          deliveryChannel: request.deliveryChannel,
          composedEnvelopeJson: envelopeForSeal as never,
          emittedEnvelopeJson: envelopeForSeal as never,
        },
      }),
    ]);

    return Object.freeze({
      widgetId,
      bodyHash,
      envelopeSeal,
      issuedAt,
      expiresAt,
      intentToken: emittedTokened[0]?.token ?? null,
      intentTokenHash: emittedTokened[0]?.tokenHash ?? null,
      intentTokens: Object.freeze(emittedTokened.map((m) => m.token)),
      intentTokenHashes: Object.freeze(emittedTokened.map((m) => m.tokenHash)),
      kind,
      a2Limited,
    });
  }

  async verifySeal(tenantId: string, widgetId: string): Promise<boolean> {
    const row = await this.prisma.widgetEmission.findFirst({
      where: { tenantId, widgetId },
      select: {
        widgetId: true,
        tenantId: true,
        bodyHash: true,
        issuedAt: true,
        expiresAt: true,
        envelopeSeal: true,
        bodyJson: true,
        deliveryChannel: true,
      },
    });
    if (!row) return false;
    const receipt = await this.prisma.widgetRenderReceipt.findFirst({
      where: { tenantId, widgetId, deliveryChannel: row.deliveryChannel },
      select: { profileId: true },
    });
    if (!receipt) return false;
    const record = await this.prisma.widgetIntentRecord.findFirst({
      where: { tenantId, widgetId },
      select: { principalProofHash: true },
    });
    if (!record) return false;
    const bodyStillMatches =
      row.bodyJson === null ||
      sha256Hex(stableActionJson(row.bodyJson)) === row.bodyHash;
    const expected = this.seals.seal({
      bodyHash: row.bodyHash,
      widgetId: row.widgetId,
      tenantId: row.tenantId,
      principalProofHash: record.principalProofHash,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      profileId: receipt.profileId,
    });
    return bodyStillMatches && expected === row.envelopeSeal;
  }
}
