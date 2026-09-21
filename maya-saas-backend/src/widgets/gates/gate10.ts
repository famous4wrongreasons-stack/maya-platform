// U10b — Gate 10 in full: deterministic route comparison and durable audit.

import type { EffectClass } from '../../widget-contract/intent';
import type { GateContext, GateVerdict, IntentRecordRow } from '../gate.types';
import type {
  DivergenceAuditInput,
  Gate10Candidate,
} from '../stores/divergence.store';
import { routeUtterance } from '../routing/deterministic-router';
import { sameOwner } from '../routing/owner-set';
import { subjectOf } from './subject';
import { pass, refuse } from './verdict';

const ACTUATING_WITH_NULL_ROUTE: ReadonlySet<string> = new Set([
  'CONTROL',
  'DRAFT',
  'REQUEST_APPROVAL',
  'COMMIT',
]);

export interface Gate10Store {
  liveCandidates(
    record: IntentRecordRow,
    now: Date,
  ): Promise<readonly Gate10Candidate[]>;
  recordDivergence(input: DivergenceAuditInput): Promise<void>;
}

const effectOf = (candidate: Gate10Candidate | null): EffectClass | null =>
  candidate === null ? null : (candidate.effect as EffectClass);

export const gate10 = async (
  ctx: GateContext,
  store: Gate10Store,
): Promise<GateVerdict> => {
  const record = ctx.record;
  const lowering = ctx.facts.lowering;
  if (record === null || lowering === undefined)
    throw new Error(
      'invariant: Gate 10 requires the tapped record and Gate 9 lowering',
    );

  const candidates = await store.liveCandidates(record, ctx.now);
  const matched = routeUtterance(lowering.renderedUtterance, candidates);
  const tappedSubject = subjectOf(record);
  const resolvedSubject = matched === null ? null : subjectOf(matched);

  const agrees =
    tappedSubject !== null &&
    resolvedSubject !== null &&
    tappedSubject.space === resolvedSubject.space &&
    tappedSubject.key === resolvedSubject.key;
  if (agrees) return pass;

  let refuses = false;
  if (matched === null) refuses = ACTUATING_WITH_NULL_ROUTE.has(record.effect);
  else if (matched.effect !== record.effect) refuses = true;
  else if (tappedSubject !== null && !sameOwner(tappedSubject, resolvedSubject))
    refuses = true;

  await store.recordDivergence({
    tenantId: record.tenantId,
    widgetId: record.widgetId,
    tappedIntentTokenHash: record.intentTokenHash,
    resolvedIntentTokenHash: matched?.intentTokenHash ?? null,
    resolvedEffect: effectOf(matched),
    refusalCode: refuses ? 'intent_divergence' : null,
    observedAt: ctx.now,
  });

  return refuses
    ? refuse(
        'intent_divergence',
        'deterministic route diverged from the tapped intent',
      )
    : pass;
};
