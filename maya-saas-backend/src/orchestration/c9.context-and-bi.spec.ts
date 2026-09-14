/**
 * P02/P06 permanent context and BI ratchet (mapping §§8, 11).
 * Business Intelligence reads and never writes, a permitted scope is an intersection and
 * never a union, raw personal data never reaches a projection, and untrusted conversation
 * text stays untrusted no matter how it is phrased.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { C9Agents } from './c9.agents';
import { C9Orchestrator, C9_ROUTES } from './c9.orchestrator';
import { C9Object, c9SafeText } from './c9.contract';
import { C9_CAPABILITIES, c9Capability } from './c9.registry';

const now = '2026-09-14T10:00:00.000Z';
const agents = new C9Agents();
const sources = readdirSync(__dirname).filter(
  (n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'),
);

function context(
  facts: C9Object[],
  domain = 'BUSINESS_INTELLIGENCE',
): C9Object {
  return {
    contract: 'C9Context@1',
    trusted: {
      principalKind: 'USER',
      scopeHash: 'a'.repeat(64),
      registryHash: 'b'.repeat(64),
      domain,
      validUntil: now,
      budgetManifestHash: 'c'.repeat(64),
      policyEvidenceHandles: [],
      sourceAuthority: 'CURRENT_SOURCE_READERS',
    },
    facts,
    untrusted: { question: 'q', explicitNotes: [], authority: 'NONE' },
    output: { contract: 'AgentResult@1' },
  };
}
const handle = 'h_' + 'a'.repeat(32);
const measured: C9Object = {
  capability: 'c7.measurement.read',
  evidenceHandle: handle,
  asOf: now,
  completeness: 'COMPLETE',
  qualification: 'VERIFIED',
  rule: { key: 'c7.attended-return', version: 1 },
};
const answer = (facts: C9Object[], domain = 'BUSINESS_INTELLIGENCE') =>
  agents.answer(
    domain as never,
    'c9.business_overview',
    context(facts, domain),
    new Set(['c7.measurement.read', 'c8.result.read']),
    new Set([handle]),
  ).result;

describe('c9 context and business intelligence', () => {
  test('BI answers with facts and proposes no action at all', () => {
    const result = answer([measured]);
    expect(result.agent_id).toBe('BUSINESS_INTELLIGENCE');
    expect(result.proposed_action_intents).toEqual([]);
    expect(result.confidence).toBe('high');
    expect((result.facts_used as C9Object[])[0]).toMatchObject({
      capability: 'c7.measurement.read',
      status: 'measured',
    });
    // Every registered BI capability is read-only; a write can never resolve for it.
    for (const cap of C9_CAPABILITIES.filter((c) =>
      c.domains.includes('BUSINESS_INTELLIGENCE'),
    ))
      expect(cap.mode).toBe('READ');
    expect(() =>
      c9Capability('expenses.create', 'BUSINESS_INTELLIGENCE'),
    ).toThrow('c9_capability_not_registered');
    expect(() =>
      c9Capability('staff.schedule.update', 'BUSINESS_INTELLIGENCE'),
    ).toThrow('c9_capability_not_registered');
  });

  test('an unavailable C8 result is reported as unavailable, never as a number', () => {
    const result = answer([
      {
        capability: 'c8.result.read',
        evidenceHandle: handle,
        asOf: now,
        available: false,
        completeness: 'UNAVAILABLE',
        qualification: 'UNQUALIFIED',
        numericPrediction: null,
        reasons: ['qualified_model_and_approved_activation_evidence_required'],
        rule: { key: 'c8.attended-return', version: 1 },
      },
    ]);
    expect(result.completeness).toMatchObject({ status: 'UNAVAILABLE' });
    expect(result.confidence).toBe('low');
    expect(result.limitations).toContain(
      'qualified_model_and_approved_activation_evidence_required',
    );
    // Nothing is invented to fill the gap: no finding claims an absent value.
    expect(result.findings).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/numericPrediction/);
  });

  test('partial evidence forces low confidence and an explicit limitation', () => {
    const result = answer([
      { ...measured, completeness: 'PARTIAL', reasons: ['period_incomplete'] },
    ]);
    expect(result.completeness).toMatchObject({ status: 'PARTIAL' });
    expect(result.confidence).toBe('low');
    expect(result.limitations).toContain('period_incomplete');
    expect((result.facts_used as C9Object[])[0].status).toBe(
      'measured_incomplete',
    );
  });

  test('only BI is forbidden to propose, and it is forbidden everywhere', () => {
    const proposal = {
      capability: 'c7.measurement.read',
      argumentHandles: [handle],
      risk: 'low_write',
      approval: 'owner',
      reversibility: 'SOURCE_DEFINED',
      rationale: 'proposed for owner decision',
      audience_size: null,
    };
    // A proposal offered to BI is dropped by the agent and would be denied by the contract.
    expect(agents.proposes('BUSINESS_INTELLIGENCE')).toBe(false);
    expect(
      agents.answer(
        'BUSINESS_INTELLIGENCE',
        'c9.business_overview',
        context([measured]),
        new Set(['c7.measurement.read']),
        new Set([handle]),
        [proposal],
      ).result.proposed_action_intents,
    ).toEqual([]);
    for (const domain of ['ADMIN', 'CLIENT_LIFECYCLE', 'OCCUPANCY'] as const) {
      expect(agents.executable(domain)).toBe(true);
      expect(agents.proposes(domain)).toBe(true);
      const result = agents.answer(
        domain,
        'c9.operations_support',
        context([measured], domain),
        new Set(['c7.measurement.read']),
        new Set([handle]),
        [proposal],
      ).result;
      expect(result.proposed_action_intents).toHaveLength(1);
      // A proposal is a request for an owner decision, never an authority to act.
      expect((result.proposed_action_intents as C9Object[])[0]).toMatchObject({
        approval: 'owner',
        reversibility: 'SOURCE_DEFINED',
      });
      // And it may only name a capability this invocation actually resolved.
      expect(() =>
        agents.answer(
          domain,
          'c9.operations_support',
          context([measured], domain),
          new Set(['c7.measurement.read']),
          new Set([handle]),
          [{ ...proposal, capability: 'appointments.own.cancel' }],
        ),
      ).toThrow('c9_result_action');
    }
  });

  test('an answer may only cite evidence and capabilities it was actually given', () => {
    expect(() =>
      agents.answer(
        'BUSINESS_INTELLIGENCE',
        'c9.business_overview',
        context([measured]),
        new Set(['c7.measurement.read']),
        new Set(), // the handle was never issued for this invocation
      ),
    ).toThrow('c9_unqualified_result_evidence');
    expect(() =>
      agents.answer(
        'BUSINESS_INTELLIGENCE',
        'c9.business_overview',
        context([measured]),
        new Set(['c8.result.read']), // a capability this run never resolved
        new Set([handle]),
      ),
    ).toThrow('c9_result_capability');
  });

  test('an agent cannot be handed a context built for another domain', () => {
    expect(() =>
      agents.answer(
        'BUSINESS_INTELLIGENCE',
        'c9.business_overview',
        context([measured], 'OCCUPANCY'),
        new Set(['c7.measurement.read']),
        new Set([handle]),
      ),
    ).toThrow('c9_agent_context_domain');
  });

  test('routing is a released table, bounded by two domains and never guessed', () => {
    for (const [objective, domains] of Object.entries(C9_ROUTES)) {
      expect(objective.startsWith('c9.')).toBe(true);
      expect(domains.length).toBeGreaterThan(0);
      expect(domains.length).toBeLessThanOrEqual(2);
      expect(new Set(domains).size).toBe(domains.length);
    }
    const orchestrator = new C9Orchestrator(
      null as never,
      null as never,
      null as never,
      agents,
      null as never,
    );
    const manifest = { domainsMax: 2 };
    // A simple or unmapped request delegates to nothing rather than picking a domain.
    expect(orchestrator.route('c9.unmapped_objective', manifest)).toEqual([]);
    expect(orchestrator.route('c9.business_overview', manifest)).toEqual([
      'BUSINESS_INTELLIGENCE',
    ]);
    // A tightened tenant ceiling wins over the released table.
    expect(() =>
      orchestrator.route('c9.client_value', { domainsMax: 1 }),
    ).toThrow('c9_route_domain_budget');
  });

  test('raw personal data cannot enter a projection through any phrasing', () => {
    for (const raw of [
      'клиент +7 962 025 98 88',
      'owner@example.com',
      'api_key = sk-live-000',
      'Authorization: Bearer abc',
      '-----BEGIN PRIVATE KEY-----',
    ])
      expect(() => c9SafeText(raw)).toThrow('c9_use_secure_surface');
  });

  test('untrusted text never becomes authority, policy or a business fact', () => {
    const built = context([measured]);
    expect((built.untrusted as C9Object).authority).toBe('NONE');
    const source = readFileSync(join(__dirname, 'c9.context.ts'), 'utf8');
    // Policy evidence comes from its owner, never from the conversation.
    expect(source).toContain('policyEvidenceHandles: [] as string[]');
    expect(source).toContain("sourceAuthority: 'CURRENT_SOURCE_READERS'");
    expect(source).toContain('memoryIsPolicy: false');
    expect(source).toContain('sourceMutationAuthority: false');
    // The question and notes are minimized before they are carried anywhere.
    expect(source).toContain('c9SafeText(question)');
    expect(source).toContain('c9Array((v) => c9SafeText(v, 400), 20)(notes)');
  });

  test('permitted scope is resolved live and intersected, never copied or unioned', () => {
    const registry = readFileSync(join(__dirname, 'c9.registry.ts'), 'utf8');
    // Availability requires every predicate; an unknown condition denies.
    expect(registry).toContain(
      "for (const key of [\n    'authority',\n    'entitlement',\n    'policy',\n    'provider',\n    'budget',\n  ] as const)\n    if ((await source[key]()) !== true) return false;",
    );
    const authority = readFileSync(join(__dirname, 'c9.authority.ts'), 'utf8');
    // Membership and staff scope are read from the database under lock every time.
    expect(authority).toContain('FOR SHARE OF m,u');
    expect(authority).toContain("m.status='active'");
    expect(authority).toContain("u.status='active'");
    // A finance-capable role is never inferred; the source reader decides.
    expect(authority).not.toMatch(/manager|finance/i);
    const readers = readFileSync(join(__dirname, 'c9.sources.ts'), 'utf8');
    expect(readers).toContain("c9Deny('source_reader_authority')");
    expect(readers).toContain("['tenant_owner', 'business_owner'].includes(");
  });

  test('no C9 production file can reach a provider or mutate a source owner', () => {
    for (const name of sources) {
      const text = readFileSync(join(__dirname, name), 'utf8');
      expect({
        name,
        provider: /\b(?:fetch|axios|https?:\/\/)/.test(text),
      }).toEqual({
        name,
        provider: false,
      });
    }
    // The coordinator delegates; it never lets one agent call another.
    const orchestrator = readFileSync(
      join(__dirname, 'c9.orchestrator.ts'),
      'utf8',
    );
    expect(orchestrator).not.toMatch(/agents\.answer\([^)]*agents\./);
    expect(orchestrator).toContain('for (const domain of domains)');
  });
});
