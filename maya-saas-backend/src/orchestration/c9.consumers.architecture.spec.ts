/**
 * P06 permanent consumer ratchet (mapping §§8, 11, 16).
 * Every consumer reaches the same owner through the same identity contract. Nothing is
 * silently truncated, no contact list can be exported, and there is no second path to an
 * effect that bypasses the source owner.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { C9Agents } from './c9.agents';
import { C9Object, C9_DOMAINS, c9Object } from './c9.contract';

const dir = __dirname;
const production = readdirSync(dir).filter(
  (n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'),
);
const read = (name: string) => readFileSync(join(dir, name), 'utf8');
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const agents = new C9Agents();
const handle = 'h_' + 'a'.repeat(32);

describe('c9 consumers and carried presentation defects', () => {
  test('no C9 answer is silently truncated at a hidden cap', () => {
    for (const name of production) {
      const code = strip(read(name));
      // The carried `.slice(0, 200)` defect (L05) may never reappear anywhere in C9.
      expect({
        name,
        capped: /\.slice\(\s*0\s*,\s*200\s*\)/.test(code),
      }).toEqual({
        name,
        capped: false,
      });
    }
    // Bounded arrays are rejected when oversize, never quietly shortened.
    expect(read('c9.contract.ts')).toContain(
      'return v.map(check); // Never truncate and then claim completeness.',
    );
  });

  test('completeness is declared before any bound is applied', () => {
    const result = agents.answer(
      'BUSINESS_INTELLIGENCE',
      'c9.business_overview',
      {
        contract: 'C9Context@1',
        trusted: {
          principalKind: 'USER',
          scopeHash: 'a'.repeat(64),
          registryHash: 'b'.repeat(64),
          domain: 'BUSINESS_INTELLIGENCE',
          validUntil: '2026-09-14T10:00:00.000Z',
          budgetManifestHash: 'c'.repeat(64),
          policyEvidenceHandles: [],
          sourceAuthority: 'CURRENT_SOURCE_READERS',
        },
        facts: [
          {
            capability: 'c7.measurement.read',
            evidenceHandle: handle,
            asOf: '2026-09-14T10:00:00.000Z',
            completeness: 'COMPLETE',
            qualification: 'VERIFIED',
            rule: { key: 'c7.attended-return', version: 1 },
          },
        ],
        untrusted: { question: 'q', explicitNotes: [], authority: 'NONE' },
        output: { contract: 'AgentResult@1' },
      },
      new Set(['c7.measurement.read']),
      new Set([handle]),
    ).result;
    const completeness = c9Object(result.completeness);
    // Coverage is stated explicitly: a count is never inferred from a capped length.
    for (const key of [
      'status',
      'requestedScopeHash',
      'returnedCount',
      'totalCount',
      'hasMore',
      'cursorRef',
      'truncated',
      'reasonCodes',
    ])
      expect(Object.hasOwn(completeness, key)).toBe(true);
    expect(completeness.truncated).toBe(false);
    expect(completeness.hasMore).toBe(false);
    expect(completeness.totalCount).not.toBeNull();
    // A COMPLETE claim with a missing total or a truncation is denied by the contract.
    expect(read('c9.contract.ts')).toContain("c9Deny('false_completeness')");
    expect(read('c9.contract.ts')).toContain("c9Deny('completeness_count')");
  });

  test('every consumer resolves through one identity contract', () => {
    const authority = read('c9.authority.ts');
    // Native, web, chat, history and voice all arrive as one of exactly two principals.
    expect(authority).toContain("kind: 'CLIENT_CHANNEL'");
    expect(authority).toContain("kind: 'USER'");
    expect(read('c9.contract.ts')).toContain(
      "kind: c9Enum('USER', 'CLIENT_CHANNEL')",
    );
    // The session source allowlist is explicit; an unknown origin is denied.
    for (const source of [
      'membership',
      'auth_session',
      'custom_domain',
      'subdomain',
      'route_slug',
    ])
      expect(authority).toContain(`'${source}'`);
    expect(authority).toContain('this.deny()');
    // A Client without a Maya User is supported only through the verified channel link,
    // and no userId is ever fabricated to satisfy a User-shaped interface.
    expect(authority).toContain('userId: null');
    expect(authority).toContain('channelLinkId: link.linkId');
  });

  test('no C9 surface can export a contact list', () => {
    for (const name of production) {
      const code = strip(read(name));
      expect({
        name,
        contacts: /\b(?:phone|email|contactList|recipients\s*:\s*\[)/i.test(
          code,
        ),
      }).toEqual({ name, contacts: false });
    }
    // Ranking members are dropped at the reader, so they cannot reach a consumer at all.
    expect(read('c9.sources.ts')).toContain('membersIncluded: false');
    // Minimization refuses anything that looks like a contact or a secret.
    expect(read('c9.contract.ts')).toContain("c9Deny('use_secure_surface')");
  });

  test('there is exactly one effect path and it goes through the source owner', () => {
    const execution = strip(read('c9.execution.ts'));
    // Attachment kinds are a closed set, and the EXECUTION rule is the database's to
    // enforce: C9 records a reference, it does not decide that an effect was legitimate.
    expect(execution).toContain(
      "c9Enum('APPROVAL', 'EXECUTION', 'OUTCOME', 'ASSIGNMENT')",
    );
    expect(execution).toContain('c9Insert<C9StepBinding>(tx, ');
    expect(
      readFileSync(
        join(
          dir,
          '../../prisma/migrations/20260913160000_chapter9_orchestration_foundation/migration.sql',
        ),
        'utf8',
      ),
    ).toContain('c9_effect_binding_requires_reviewed_handoff');
    for (const name of production) {
      const code = strip(read(name));
      expect({
        name,
        alternate:
          /\b(?:fetch|axios)\s*\(|\.(?:appointment|client|loyaltyTransaction|expense|actionExecution|communicationDelivery|marketingCampaign)\.(?:create|update|upsert|delete)/.test(
            code,
          ),
      }).toEqual({ name, alternate: false });
    }
  });

  test('every canonical domain answers through the same result contract', () => {
    for (const domain of C9_DOMAINS) {
      const result = agents.answer(
        domain,
        'c9.business_overview',
        {
          contract: 'C9Context@1',
          trusted: {
            principalKind: 'USER',
            scopeHash: 'a'.repeat(64),
            registryHash: 'b'.repeat(64),
            domain,
            validUntil: '2026-09-14T10:00:00.000Z',
            budgetManifestHash: 'c'.repeat(64),
            policyEvidenceHandles: [],
            sourceAuthority: 'CURRENT_SOURCE_READERS',
          },
          facts: [],
          untrusted: { question: 'q', explicitNotes: [], authority: 'NONE' },
          output: { contract: 'AgentResult@1' },
        },
        new Set(),
        new Set(),
      ).result;
      expect(result.contract).toBe('AgentResult@1');
      expect(result.agent_id).toBe(domain);
      // An empty scope is reported as unavailable with a reason, never as an empty success.
      expect((result.completeness as C9Object).status).toBe('UNAVAILABLE');
      expect(result.limitations).toContain('no_permitted_qualified_evidence');
    }
  });
});
