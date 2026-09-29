import { ConflictException } from '@nestjs/common';
import type { UserTurnAuditPort } from '../owner-ports/user-turn-audit.port';
import {
  lockUserTurn,
  readUserTurnBinding,
  writeUserTurnBinding,
} from '../stores/user-turn-binding';
// ── Gate 9 — lowering: the slot seam ────────────────────────────────────────────────────────────────
//
// GATES-PLAN-V11 U9b. Slot 9 renders only server-resolved canonical labels, then performs the first
// durable write through the gateway's request transaction. Every stale/unrenderable source answers
// DS-03 A (`superseded/handle_stale`) before a turn is written.

import type { GateContext, GateVerdict } from '../gate.types';
import type { RequestTx } from '../authority/principal-view';
import { superseded } from '../gates/verdict';
import {
  isRenderImpossibility,
  LoweringConstructionDefect,
  renderUtterance,
} from './lowering';
import { TimelineStore } from '../stores/timeline.store';

export const lower = async (
  ctx: GateContext,
  tx: RequestTx | null,
  audit?: UserTurnAuditPort,
): Promise<GateVerdict> => {
  const source = ctx.facts.loweringSource;
  if (source === undefined)
    throw new LoweringConstructionDefect('loweringSource');
  const selectedLabels = ctx.facts.selectedLabels;
  if (selectedLabels === undefined)
    throw new LoweringConstructionDefect('selectedLabels');
  if (tx === null) throw new LoweringConstructionDefect('requestTransaction');

  if (source.erasedAt !== null || selectedLabels === null)
    return superseded('handle_stale', 'lowering source unavailable');

  const rendered = renderUtterance(source.utteranceTemplate, selectedLabels);
  if (isRenderImpossibility(rendered))
    return superseded('handle_stale', rendered.rule);

  const correlation = ctx.userTurnCorrelation;
  if (correlation !== undefined && audit === undefined)
    throw new LoweringConstructionDefect('userTurnAudit');
  const turnId =
    correlation === undefined
      ? undefined
      : await lockUserTurn(tx, ctx.tenantId, correlation);
  const binding =
    correlation === undefined
      ? null
      : await readUserTurnBinding(
          tx,
          ctx.tenantId,
          correlation,
          ctx.principalProofHash,
          audit!,
        );
  if (correlation !== undefined) {
    if (audit === undefined)
      throw new LoweringConstructionDefect('userTurnAudit');
    const prior = await TimelineStore.readUserTurn(tx, ctx.tenantId, turnId!);
    // Missing half of an atomic binding is a refusal, never authority to recreate history.
    if (
      (binding === null) !== (prior === null) ||
      (binding !== null &&
        (binding.intentTokenHash !== ctx.intentTokenHash ||
          binding.conversationId !== source.conversationId))
    )
      throw new ConflictException('user_turn_binding_conflict');
  }

  const written = await TimelineStore.lowerToUserTurn(
    {
      ...(turnId === undefined ? {} : { turnId }),
      tenantId: ctx.tenantId,
      intentTokenHash: ctx.intentTokenHash,
      conversationId: source.conversationId,
      principalProofHash: ctx.principalProofHash,
      channel: ctx.carrier,
      renderedUtterance: rendered.utterance,
    },
    tx,
    ctx.now,
  );
  if (written === null)
    return superseded('handle_stale', 'lowering source changed before append');

  if (correlation !== undefined && binding === null) {
    await writeUserTurnBinding(audit!, tx, ctx.tenantId, correlation, {
      contract: 'maya.user-turn-binding/1',
      turnId: written.id,
      conversationId: source.conversationId,
      principalProofHash: ctx.principalProofHash,
      intentTokenHash: ctx.intentTokenHash,
    });
  }

  return {
    outcome: 'pass',
    facts: {
      lowering: { renderedUtterance: rendered.utterance },
      loweredTurn: {
        turnId: written.id,
        conversationId: source.conversationId,
      },
    },
  };
};
