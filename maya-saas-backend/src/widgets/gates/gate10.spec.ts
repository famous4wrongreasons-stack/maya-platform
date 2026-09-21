// U10b — Gate 10's seven-row outcome table. Function-level regression aid; live proof is
// `test/widgets-live/gate10-divergence.live-spec.ts`.

import type { EffectClass } from '../../widget-contract/intent';
import type { GateContext, IntentRecordRow } from '../gate.types';
import { renderUtterance } from '../lowering/lowering';
import type {
  DivergenceAuditInput,
  Gate10Candidate,
} from '../stores/divergence.store';
import { ctx, rec } from './gate-fixtures.spec-helper.spec';
import { gate10, type Gate10Store } from './gate10';

const NOW = new Date('2026-06-01T00:00:00.000Z');

const lowered = (value: string) => {
  const rendered = renderUtterance(value, []);
  if (!rendered.ok) throw new Error(`fixture did not render: ${rendered.rule}`);
  return rendered.utterance;
};

const candidate = (over: Partial<Gate10Candidate> = {}): Gate10Candidate => ({
  intentTokenHash: 'q'.repeat(64),
  effect: 'REFINE',
  priority: 1,
  capabilitySpace: 'C9',
  capabilityKey: 'catalog.services.read',
  handoffSpace: null,
  handoffKey: null,
  targetJson: null,
  issuedAt: new Date('2026-05-01T00:00:00.000Z'),
  erasedAt: null,
  utteranceTemplate: 'show services',
  selectionDomainLabelsJson: null,
  ...over,
});

const tapped = (over: Partial<IntentRecordRow> = {}): IntentRecordRow =>
  rec({
    intentTokenHash: 's'.repeat(64),
    effect: 'REFINE',
    capabilitySpace: 'C9',
    capabilityKey: 'catalog.services.read',
    ...over,
  });

const context = (
  record: IntentRecordRow,
  utterance = 'show services',
): GateContext =>
  ctx(record, {
    now: NOW,
    facts: { lowering: { renderedUtterance: lowered(utterance) } },
  });

const storeWith = (...candidates: Gate10Candidate[]) => {
  const reads: Array<{ record: IntentRecordRow; now: Date }> = [];
  const audits: DivergenceAuditInput[] = [];
  const store: Gate10Store = {
    liveCandidates: (record, now) => {
      reads.push({ record, now });
      return Promise.resolve(candidates);
    },
    recordDivergence: (input) => {
      audits.push(input);
      return Promise.resolve();
    },
  };
  return { store, reads, audits };
};

const answer = (verdict: Awaited<ReturnType<typeof gate10>>) => ({
  outcome: verdict.outcome,
  code: 'code' in verdict ? verdict.code : null,
});

describe('Gate 10 — deterministic divergence table', () => {
  it('T10-R1 exact subject agreement passes and writes no audit', async () => {
    const record = tapped();
    const fixture = storeWith(candidate());
    expect(answer(await gate10(context(record), fixture.store))).toEqual({
      outcome: 'pass',
      code: null,
    });
    expect(fixture.reads).toEqual([{ record, now: NOW }]);
    expect(fixture.audits).toEqual([]);
  });

  it('T10-R2 null route refuses every literal actuating effect and writes one refusal audit', async () => {
    for (const effect of [
      'CONTROL',
      'DRAFT',
      'REQUEST_APPROVAL',
      'COMMIT',
    ] satisfies EffectClass[]) {
      const record = tapped({
        effect,
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.widget.dismiss',
      });
      const fixture = storeWith();
      expect(
        answer(await gate10(context(record, 'no candidate'), fixture.store)),
      ).toEqual({
        outcome: 'refuse',
        code: 'intent_divergence',
      });
      expect(fixture.audits).toEqual([
        {
          tenantId: record.tenantId,
          widgetId: record.widgetId,
          tappedIntentTokenHash: record.intentTokenHash,
          resolvedIntentTokenHash: null,
          resolvedEffect: null,
          refusalCode: 'intent_divergence',
          observedAt: NOW,
        },
      ]);
    }
  });

  it('T10-R3 null route passes every non-actuating effect and audits NULL', async () => {
    for (const effect of [
      'NONE',
      'NAVIGATE',
      'REFINE',
      'HANDOFF',
    ] satisfies EffectClass[]) {
      const record = tapped({ effect });
      const fixture = storeWith();
      expect(
        answer(await gate10(context(record, 'no candidate'), fixture.store)),
      ).toEqual({
        outcome: 'pass',
        code: null,
      });
      expect(fixture.audits).toHaveLength(1);
      expect(fixture.audits[0]).toMatchObject({
        resolvedIntentTokenHash: null,
        resolvedEffect: null,
        refusalCode: null,
      });
    }
  });

  it('T10-R4 an effect-class divergence refuses even when the subjects share an owner', async () => {
    const record = tapped({ effect: 'REFINE' });
    const fixture = storeWith(
      candidate({
        effect: 'HANDOFF',
        capabilityKey: 'catalog.staff.read',
      }),
    );
    expect(answer(await gate10(context(record), fixture.store))).toEqual({
      outcome: 'refuse',
      code: 'intent_divergence',
    });
    expect(fixture.audits[0]).toMatchObject({
      resolvedIntentTokenHash: 'q'.repeat(64),
      resolvedEffect: 'HANDOFF',
      refusalCode: 'intent_divergence',
    });
  });

  it('T10-R5 a null tapped subject passes and audits NULL', async () => {
    const record = tapped({ capabilitySpace: null, capabilityKey: null });
    const fixture = storeWith(candidate());
    expect(answer(await gate10(context(record), fixture.store))).toEqual({
      outcome: 'pass',
      code: null,
    });
    expect(fixture.audits).toHaveLength(1);
    expect(fixture.audits[0].refusalCode).toBeNull();
  });

  it('T10-R6 different owner endpoints refuse', async () => {
    const record = tapped({
      effect: 'CONTROL',
      capabilitySpace: 'CONTROL',
      capabilityKey: 'control.widget.dismiss',
    });
    const fixture = storeWith(
      candidate({
        effect: 'CONTROL',
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.run.cancel',
      }),
    );
    expect(answer(await gate10(context(record), fixture.store))).toEqual({
      outcome: 'refuse',
      code: 'intent_divergence',
    });
    expect(fixture.audits[0].refusalCode).toBe('intent_divergence');
  });

  it('T10-R6b an undefined owner fails closed', async () => {
    const record = tapped({
      effect: 'REFINE',
      capabilitySpace: 'C9',
      capabilityKey: 'catalog.services.read',
    });
    const fixture = storeWith(
      candidate({
        capabilitySpace: 'TOOL',
        capabilityKey: 'unowned.tool',
      }),
    );
    expect(answer(await gate10(context(record), fixture.store))).toEqual({
      outcome: 'refuse',
      code: 'intent_divergence',
    });
  });

  it('T10-R7 different subjects of the same owner pass and write one AUDIT row', async () => {
    const record = tapped({
      effect: 'CONTROL',
      capabilitySpace: 'CONTROL',
      capabilityKey: 'control.widget.dismiss',
    });
    const fixture = storeWith(
      candidate({
        effect: 'CONTROL',
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.delivery.resolve',
      }),
    );
    expect(answer(await gate10(context(record), fixture.store))).toEqual({
      outcome: 'pass',
      code: null,
    });
    expect(fixture.audits).toHaveLength(1);
    expect(fixture.audits[0]).toMatchObject({
      resolvedEffect: 'CONTROL',
      refusalCode: null,
    });
  });

  it('T10-SHAPE throws when the pipeline failed to supply the record or Gate 9 fact', async () => {
    const fixture = storeWith();
    await expect(
      gate10(ctx(tapped(), { record: null }), fixture.store),
    ).rejects.toThrow('requires the tapped record and Gate 9 lowering');
    await expect(gate10(ctx(tapped()), fixture.store)).rejects.toThrow(
      'requires the tapped record and Gate 9 lowering',
    );
    expect(fixture.reads).toEqual([]);
    expect(fixture.audits).toEqual([]);
  });
});
