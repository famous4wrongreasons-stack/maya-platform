/**
 * P04 permanent strategy ratchet (mapping §§8, 16).
 * With C8 disabled 0/8 the domains still work honestly: an absent probability stays absent,
 * options exist only because a capability resolved, the allowance of three is a ceiling and
 * not a quota, and a value or a rank is never treated as consent to contact anyone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { C9Agents } from './c9.agents';
import { C9Strategy, C9Feasible } from './c9.strategy';
import { C9Object, c9Object } from './c9.contract';

const strategy = new C9Strategy();
const agents = new C9Agents();
const hash = 'a'.repeat(64);
const handle = 'h_' + 'b'.repeat(32);
const agentsSource = readFileSync(join(__dirname, 'c9.agents.ts'), 'utf8');
const strategySource = readFileSync(join(__dirname, 'c9.strategy.ts'), 'utf8');

const base = {
  objectiveKey: 'c9.client_return',
  safeDescription: 'Вернуть клиентов, которые давно не приходили',
  budgetManifestHash: hash,
  validUntil: '2026-09-15T10:00:00.000Z',
};
const option = (over: Partial<C9Feasible> = {}): C9Feasible => ({
  optionKey: 'opt-a',
  title: 'Предложить запись',
  domain: 'CLIENT_LIFECYCLE',
  capability: 'clients.dormant.list',
  intentContract: 'clients.dormant.list:input/1',
  intent: null,
  ...over,
});
const context = (facts: C9Object[], domain: string): C9Object => ({
  contract: 'C9Context@1',
  trusted: {
    principalKind: 'USER',
    scopeHash: hash,
    registryHash: 'c'.repeat(64),
    domain,
    validUntil: base.validUntil,
    budgetManifestHash: hash,
    policyEvidenceHandles: [],
    sourceAuthority: 'CURRENT_SOURCE_READERS',
  },
  facts,
  untrusted: { question: 'q', explicitNotes: [], authority: 'NONE' },
  output: { contract: 'AgentResult@1' },
});

describe('c9 limited data and strategy', () => {
  test('a disabled C8 target yields an unavailable answer, never a number', () => {
    const result = agents.answer(
      'CLIENT_LIFECYCLE',
      'c9.client_return',
      context(
        [
          {
            capability: 'c8.result.read',
            evidenceHandle: handle,
            asOf: '2026-09-14T10:00:00.000Z',
            available: false,
            completeness: 'UNAVAILABLE',
            qualification: 'UNQUALIFIED',
            numericPrediction: null,
            activation: 'DISABLED',
            reasons: [
              'qualified_model_and_approved_activation_evidence_required',
            ],
            rule: { key: 'c8.attended-return', version: 1 },
          },
        ],
        'CLIENT_LIFECYCLE',
      ),
      new Set(['c8.result.read']),
      new Set([handle]),
    ).result;
    expect(result.completeness).toMatchObject({ status: 'UNAVAILABLE' });
    expect(result.confidence).toBe('low');
    expect(result.findings).toEqual([]);
    expect(result.limitations).toContain(
      'qualified_model_and_approved_activation_evidence_required',
    );
    // Nothing numeric is carried forward in place of the missing prediction.
    expect(JSON.stringify(result)).not.toMatch(/"numericPrediction":(?!null)/);
  });

  test('a model can never replace a prediction the source withheld', () => {
    // The agent derives every fact status from the projection's own verdict.
    expect(agentsSource).toContain('function factStatus');
    expect(agentsSource).toContain(
      'Every projected fact carries its own source verdict; C9 never upgrades one.',
    );
    // No arithmetic and no generated value anywhere in the agent or the strategy builder.
    for (const source of [agentsSource, strategySource]) {
      const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      expect(code).not.toMatch(/Math\.(?:round|random|pow|exp|log)/);
      expect(code).not.toMatch(/\bpredict|\bforecast|\bprobabilit/i);
    }
  });

  test('options exist only where a capability actually resolved', () => {
    // An unregistered capability for this domain is omitted, not proposed.
    expect(
      strategy.feasible([
        option(),
        option({ optionKey: 'opt-b', capability: 'expenses.create' }),
      ]),
    ).toHaveLength(1);
    // A capability belonging to another domain is likewise omitted.
    expect(
      strategy.feasible([option({ optionKey: 'opt-c', domain: 'OCCUPANCY' })]),
    ).toEqual([]);
  });

  test('three is a ceiling, not a quota, and padding is impossible', () => {
    const single = strategy.propose({ ...base, options: [option()] });
    const alternatives = single.alternatives as C9Object[];
    // One feasible option plus the honest do-nothing option. No filler.
    expect(alternatives).toHaveLength(2);
    expect(alternatives.map((a) => a.key)).toEqual(['opt-a', 'c9.no_action']);
    expect(alternatives.filter((a) => a.recommended)).toHaveLength(1);
    const many = strategy.propose({
      ...base,
      options: [
        option(),
        option({ optionKey: 'opt-b' }),
        option({ optionKey: 'opt-c' }),
        option({ optionKey: 'opt-d' }),
      ],
    });
    expect((many.alternatives as C9Object[]).length).toBeLessThanOrEqual(3);
    expect(() => strategy.feasible([option(), option()])).toThrow(
      'c9_duplicate_option',
    );
  });

  test('doing nothing is always representable and creates no effect', () => {
    const proposal = strategy.propose({ ...base, options: [] });
    const alternatives = proposal.alternatives as C9Object[];
    expect(alternatives).toHaveLength(1);
    expect(alternatives[0]).toMatchObject({
      key: 'c9.no_action',
      kind: 'NO_ACTION',
      recommended: true,
    });
    const step = proposal.steps.find((s) => s.optionKey === 'c9.no_action')!;
    expect(step.kind).toBe('NO_ACTION');
    expect(step.capability).toBe('c9.no_action');
    expect(step.intent).toBeNull();
    expect(c9Object(step.budgetSlice).exposure).toMatchObject({
      maxActions: 0,
      maxRecipients: 0,
      maxMessages: 0,
    });
  });

  test('an unbounded paid component makes an option ineligible', () => {
    const unbounded = option({
      optionKey: 'opt-msg',
      capability: 'b35.preview',
      intentContract: 'b35.preview:input/1',
      exposure: {
        maxActions: 1,
        maxRecipients: 50,
        maxMessages: 50,
        providerCost: null,
        verifiedZeroCost: null,
        offerRef: null,
        maxDiscountMinorUnits: null,
        maxDiscountBps: null,
      },
    });
    expect(strategy.feasible([unbounded])).toEqual([]);
    // With a verified zero-cost proof the same shape is admissible again.
    expect(
      strategy.feasible([
        {
          ...unbounded,
          exposure: {
            ...(unbounded.exposure as C9Object),
            verifiedZeroCost: 'release:zero-charge-evidence',
          },
        },
      ]),
    ).toHaveLength(1);
  });

  test('a proposal carries unknowns instead of smoothing them away', () => {
    const proposal = strategy.propose({
      ...base,
      options: [option()],
      unknowns: ['no_qualified_value', 'no_recent_visit'],
    });
    for (const alternative of proposal.alternatives as C9Object[]) {
      expect(alternative.unknowns).toEqual([
        'no_qualified_value',
        'no_recent_visit',
      ]);
      expect(c9Object(alternative.costSummary).unavailableReasons).toEqual([
        'no_qualified_value',
        'no_recent_visit',
      ]);
      // A benefit is a reference to a qualified fact, never generated prose or a number.
      expect(c9Object(alternative.knownBenefit).proposalText).toBe('');
    }
  });

  test('a target is owner policy; C9 proposes no measured outcome', () => {
    const proposal = strategy.propose({ ...base, options: [option()] });
    expect(c9Object(proposal.objective).successCriteria).toEqual([]);
    expect(strategySource).toContain(
      'A target is owner policy. C7 owns the measured outcome; C9 proposes neither.',
    );
  });

  test('a discount is never proposed by default and exposure starts at zero', () => {
    const proposal = strategy.propose({ ...base, options: [option()] });
    const constraints = c9Object(proposal.constraints);
    expect(c9Object(constraints.oneOff).discounts).toBe('forbidden');
    expect(constraints.exposure).toMatchObject({
      maxActions: 0,
      maxRecipients: 0,
      maxMessages: 0,
      offerRef: null,
      maxDiscountMinorUnits: null,
      maxDiscountBps: null,
    });
  });

  test('a rank or a value is not consent and carries no contact permission', () => {
    // The C8 projection strips members and states both boundaries explicitly.
    const readers = readFileSync(join(__dirname, 'c9.sources.ts'), 'utf8');
    expect(readers).toContain('membersIncluded: false');
    expect(readers).toContain('contactPermission: false');
    expect(readers).toContain('actionAuthority: false');
    expect(readers).toContain(
      'Population coverage is retained even when the invocation does not request individual members.',
    );
  });
});
