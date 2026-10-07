import type { GoodsReceiptApprovalSnapshot } from '../../ai-tools/ai-approval-widget-trigger.port';
import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import type { ApprovalBody } from '../../widget-contract/kinds';
import type { FactUsed } from '../../widget-contract/envelope';
import type { PrincipalResolver } from '../authority/principal-view';
import type { MintRequest } from '../emission/emitter.service';

const GOODS_RECEIPT_TOOL = 'inventory.goods.receipt.prepare';

/** Pure projection of the canonical approval snapshot; no model or provider calls. */
export function goodsReceiptApprovalMintRequest(
  snapshot: GoodsReceiptApprovalSnapshot,
  principal: NonNullable<Awaited<ReturnType<PrincipalResolver['resolve']>>>,
  turnId: string,
  ttlSeconds: number,
  deliveryChannel = 'pwa',
): MintRequest {
  const fact: FactUsed = {
    capability: GOODS_RECEIPT_TOOL,
    status: 'measured',
    as_of: snapshot.createdAt.toISOString(),
    evidence_refs: [`h_${snapshot.payloadHash}`],
    completeness: {
      status: 'COMPLETE',
      requestedScopeHash: snapshot.payloadHash,
      returnedCount: 1,
      totalCount: 1,
      hasMore: false,
      cursorRef: null,
      truncated: false,
      reasonCodes: [],
    },
  };
  const cell = <T>(value: T, label: string) => ({
    state: 'KNOWN' as const,
    value,
    label,
    reason_code: null,
    fact_ref: 0,
    as_of: fact.as_of,
    evidence_refs: [],
    next_intent_ref: null,
  });
  const body: ApprovalBody = {
    approval_ref: snapshot.id,
    subject: cell(
      String(snapshot.facts.goods_name),
      String(snapshot.facts.goods_name),
    ),
    effect_preview: [
      ['company_id', 'Компания YCLIENTS'],
      ['goods_id', 'Код товара'],
      ['store_name', 'Склад'],
      ['store_id', 'Код склада'],
      ['quantity', 'Количество'],
      ['unit_label', 'Единица'],
      ['unit_id', 'Код единицы'],
      ['unit_cost', 'Закупочная цена за единицу'],
      ['currency', 'Валюта'],
      ['line_total', 'Сумма прихода'],
      ['received_at', 'Дата прихода'],
    ].map(([key, label]) => ({
      label: { phrase_key: `approval.goods_receipt.${key}`, rendered: label },
      value: cell(String(snapshot.facts[key]), String(snapshot.facts[key])),
    })),
    audience_size: null,
    risk_tier: cell('high_write', 'Приход товара в YCLIENTS'),
    reversible: cell(
      false,
      'Приход потребует отдельной операции для исправления',
    ),
    state: cell('PENDING', 'Ожидает вашего подтверждения'),
    requested_by_label: cell('Вы', 'Вы'),
    expires_at: snapshot.expiresAt.toISOString(),
    approve_intent: 'i1',
    reject_intent: 'i2',
    blocked_reason: null,
    detail_intent: 'i3',
  };
  return {
    tenantId: principal.authority.tenantId,
    conversationId: snapshot.origin.conversationId,
    turnId,
    kind: 'APPROVAL',
    principalProofHash: principal.proofHash,
    principal,
    deliveryChannel,
    body: body as unknown as Record<string, unknown>,
    ttlSeconds,
    freshnessClass: 'scenario',
    composerInput: {
      kind_proposal: 'APPROVAL',
      capability: GOODS_RECEIPT_TOOL,
      capability_version: C9_REGISTRY_HASH,
      source: {
        from: 'capability_envelope',
        capability: GOODS_RECEIPT_TOOL,
        capability_version: C9_REGISTRY_HASH,
        fact_index: 0,
      },
      correlation_refs: { turn_id: turnId },
      origin: {
        trigger: 'user_turn',
        emitter: 'capability_read',
        moment_key: null,
        proactive_provenance: null,
      },
      facts: [fact],
      facts_origin: ['copied'],
      slots: {},
      limitation_codes: [],
      intent_proposals: [],
      locale: 'ru-RU',
    },
  };
}
