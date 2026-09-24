import { Inject, Injectable } from '@nestjs/common';

import type { AiTypedWidgetTriggerPort } from '../../ai-tools/ai-typed-widget-trigger.port';
import { PrismaService } from '../../prisma/prisma.service';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../dto/submit-intent.dto';
import { PRINCIPAL_RESOLVER } from '../di-tokens';
import type { PrincipalResolver, RequestTx } from '../authority/principal-view';
import { IntentGatewayService } from '../intent-gateway.service';
import {
  normaliseUtterance,
  routeUtterance,
  type RoutingCandidate,
} from '../routing/deterministic-router';
import { scoped } from '../stores/tenant-scope';
import { sha256Hex } from '../token.util';

type TypedRoutingCandidate = RoutingCandidate & {
  readonly widgetId: string;
  readonly intentToken: string;
};

/**
 * P-TYPED. A typed sentence is only a carrier for an already-live server-minted intent. It never
 * derives a capability, target or authority from the sentence and it never asks an LLM to do so.
 */
@Injectable()
export class TypedStep0Service implements AiTypedWidgetTriggerPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: IntentGatewayService,
    @Inject(PRINCIPAL_RESOLVER)
    private readonly principals: PrincipalResolver,
  ) {}

  async routeTypedUtterance(
    input: Parameters<AiTypedWidgetTriggerPort['routeTypedUtterance']>[0],
  ) {
    const tenantId = input.actor.tenantId;
    if (tenantId === null || input.surface !== 'web') return null;
    const routed = await this.prisma.$transaction(async (tx) => {
      const principal = await this.principals.resolve(tx);
      if (
        principal === null ||
        principal.authority.tenantId !== tenantId ||
        (principal.authority.userId !== null &&
          principal.authority.userId !== input.actor.userId)
      )
        return null;
      const candidates = await this.typedCandidates(
        tx,
        tenantId,
        principal.proofHash,
        new Date(),
      );
      const matched = routeUtterance(input.utterance, candidates);
      return matched === null ? null : matched;
    });
    if (routed === null) return null;

    const result = await this.gateway.submit({
      intentToken: routed.intentToken,
      tenantId,
      actor: input.actor,
      carrier: 'pwa',
      submission: {
        contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
        widget_id: routed.widgetId,
        intent_token: routed.intentToken,
        inputs: typedInputsForUtterance(
          routed.utteranceTemplate,
          routed.selectionDomainLabelsJson,
          input.utterance,
        ),
        client_nonce: `typed_${input.requestId}`.slice(0, 128),
        profile_id: 'pwa.v1',
      },
    });
    const code = 'code' in result.verdict ? result.verdict.code : null;
    return Object.freeze({
      reply:
        code === null
          ? 'Готово.'
          : 'Не удалось выполнить этот вариант. Откройте карточку и проверьте её состояние.',
      action: Object.freeze({
        status: result.verdict.outcome,
        code,
        stopped_at_gate: result.stoppedAt,
      }),
    });
  }

  private async typedCandidates(
    tx: RequestTx,
    tenantId: string,
    principalProofHash: string,
    now: Date,
  ): Promise<readonly TypedRoutingCandidate[]> {
    const rows = await tx.widgetIntentRecord.findMany({
      where: scoped(tenantId, {
        principalProofHash,
        expiresAt: { gt: now },
        consumedAt: null,
      }),
      orderBy: [{ issuedAt: 'desc' }, { intentTokenHash: 'asc' }],
      select: {
        widgetId: true,
        intentTokenHash: true,
        effect: true,
        priority: true,
        capabilitySpace: true,
        capabilityKey: true,
        issuedAt: true,
        erasedAt: true,
        utteranceTemplate: true,
        selectionDomainLabelsJson: true,
        emission: {
          select: {
            renderReceipts: {
              where: { erasedAt: null },
              orderBy: { degradedAt: 'desc' },
              take: 1,
              select: { emittedEnvelopeJson: true },
            },
          },
        },
      },
    });
    return rows.flatMap((row) => {
      const token = tokenForHash(
        row.emission?.renderReceipts[0]?.emittedEnvelopeJson,
        row.intentTokenHash,
      );
      return token === null
        ? []
        : [Object.freeze({ ...row, intentToken: token })];
    });
  }
}

const tokenForHash = (
  envelope: unknown,
  expectedHash: string,
): string | null => {
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    Array.isArray(envelope)
  )
    return null;
  const intents = (envelope as { intents?: unknown }).intents;
  if (!Array.isArray(intents)) return null;
  for (const intent of intents) {
    if (typeof intent !== 'object' || intent === null || Array.isArray(intent))
      continue;
    const token = (intent as { intent_token?: unknown }).intent_token;
    if (typeof token === 'string' && sha256Hex(token) === expectedHash)
      return token;
  }
  return null;
};

export const typedInputsForUtterance = (
  template: string | null,
  labelsValue: unknown,
  utterance: string,
): Readonly<Record<string, string>> | null => {
  if (template === null || !template.includes('{{selection}}')) return null;
  if (
    typeof labelsValue !== 'object' ||
    labelsValue === null ||
    Array.isArray(labelsValue)
  )
    return null;
  const entries: Array<readonly [string, string]> = [];
  for (const [field, labels] of Object.entries(labelsValue)) {
    if (typeof labels !== 'object' || labels === null || Array.isArray(labels))
      continue;
    for (const [id, label] of Object.entries(labels))
      if (
        typeof label === 'string' &&
        normaliseUtterance(template.split('{{selection}}').join(label)) ===
          normaliseUtterance(utterance)
      )
        entries.push([field, id]);
  }
  return entries.length === 1
    ? Object.freeze({ [entries[0][0]]: entries[0][1] })
    : null;
};
