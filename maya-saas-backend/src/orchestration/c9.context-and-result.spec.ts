import { c9AgentResult, c9Hash, c9SafeText } from './c9.contract';
describe('AgentResult@1 bounded trustworthy output', () => {
  const h = 'h_' + 'a'.repeat(32),
    evidence = new Set([h]),
    caps = new Set(['valuations.read']);
  const full = {
    contract: 'AgentResult@1',
    agent_id: 'BUSINESS_INTELLIGENCE',
    intent: 'c9.bi',
    findings: [
      { statement: 'Доступен подтверждённый результат', evidence_refs: [h] },
    ],
    facts_used: [
      {
        capability: 'valuations.read',
        status: 'measured',
        as_of: '2026-09-13T10:00:00.000Z',
        evidence_refs: [h],
        completeness: {
          status: 'COMPLETE',
          requestedScopeHash: c9Hash('scope/1', []),
          returnedCount: 1,
          totalCount: 1,
          hasMore: false,
          cursorRef: null,
          truncated: false,
          reasonCodes: [],
        },
      },
    ],
    confidence: 'high',
    limitations: [],
    proposed_action_intents: [],
    completeness: {
      status: 'COMPLETE',
      requestedScopeHash: c9Hash('scope/1', []),
      returnedCount: 1,
      totalCount: 1,
      hasMore: false,
      cursorRef: null,
      truncated: false,
      reasonCodes: [],
    },
    evidence_refs: [h],
  };
  test('qualified bounded result is accepted', () =>
    expect(c9AgentResult(full, evidence, caps)).toEqual(full));
  test('unknown top level or hidden chain of thought is rejected', () =>
    expect(() =>
      c9AgentResult({ ...full, chain_of_thought: 'private' }, evidence, caps),
    ).toThrow('unknown_field'));
  test('unqualified evidence cannot become a finding', () =>
    expect(() => c9AgentResult(full, new Set(), caps)).toThrow(
      'unqualified_result_evidence',
    ));
  test('oversize evidence/arrays are rejected, never silently sliced', () => {
    expect(() =>
      c9AgentResult(
        { ...full, evidence_refs: Array(101).fill(h) },
        evidence,
        caps,
      ),
    ).toThrow('array_bounds');
    expect(() =>
      c9AgentResult(
        { ...full, findings: Array(21).fill(full.findings[0]) },
        evidence,
        caps,
      ),
    ).toThrow();
  });
  test('partial source may not claim high confidence or complete population', () => {
    expect(() =>
      c9AgentResult(
        { ...full, completeness: { ...full.completeness, hasMore: true } },
        evidence,
        caps,
      ),
    ).toThrow('false_completeness');
    expect(() =>
      c9AgentResult(
        { ...full, completeness: { ...full.completeness, status: 'PARTIAL' } },
        evidence,
        caps,
      ),
    ).toThrow('missingness_required');
    expect(
      c9AgentResult(
        {
          ...full,
          confidence: 'low',
          limitations: ['Часть данных недоступна'],
          completeness: {
            ...full.completeness,
            status: 'PARTIAL',
            totalCount: null,
          },
        },
        evidence,
        caps,
      ).confidence,
    ).toBe('low');
  });
  test.each([
    'phone +79991112233',
    'mail test@example.org',
    'api_key=secret-value',
    'Bearer test',
    '-----BEGIN PRIVATE KEY-----',
  ])('sensitive text never reaches public rationale: %s', (text) =>
    expect(() => c9SafeText(text)).toThrow('secure_surface'),
  );
  test('BI action intent is rejected even when capability exists elsewhere', () => {
    const action = {
      capability: 'expenses.create',
      argumentHandles: [],
      risk: 'high_write',
      approval: 'actor',
      reversibility: 'SOURCE_DEFINED',
      rationale: 'Внести расход',
      audience_size: null,
    };
    expect(() =>
      c9AgentResult(
        { ...full, proposed_action_intents: [action] },
        evidence,
        new Set([...caps, 'expenses.create']),
      ),
    ).toThrow('bi_read_only');
  });
});
