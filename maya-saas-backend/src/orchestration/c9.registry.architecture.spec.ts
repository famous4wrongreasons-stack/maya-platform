import {
  C9_CAPABILITIES,
  C9_REGISTRY_HASH,
  c9Available,
  c9Capability,
} from './c9.registry';
import { C9_DOMAINS, C9Principal } from './c9.contract';
import { MAYA_AI_TOOL_CATALOG } from '../ai-tools/ai-tool.catalog';
describe('C9 released registry authority intersection', () => {
  test('exact four domains and all existing catalog mappings are pinned', () => {
    expect(C9_DOMAINS).toHaveLength(4);
    expect(new Set(C9_CAPABILITIES.map((c) => c.capabilityKey)).size).toBe(
      C9_CAPABILITIES.length,
    );
    for (const tool of MAYA_AI_TOOL_CATALOG) {
      const entry = C9_CAPABILITIES.find((c) => c.capabilityKey === tool.name)!;
      expect(entry).toBeDefined();
      expect(entry.mode).toBe(
        tool.riskTier === 'read' ? 'READ' : 'PROPOSE_ONLY',
      );
    }
    expect(C9_REGISTRY_HASH).toMatch(/^[a-f0-9]{64}$/);
  });
  test('BI cannot obtain a write by sharing a tool name; unknown manifest is never substituted', () => {
    expect(() =>
      c9Capability('expenses.create', 'BUSINESS_INTELLIGENCE'),
    ).toThrow();
    expect(() => c9Capability('arbitrary.sql', 'ADMIN')).toThrow();
    expect(() =>
      c9Capability('c9.no_action', 'ADMIN', '0'.repeat(64)),
    ).toThrow();
  });
  test.each([
    'authority',
    'entitlement',
    'policy',
    'provider',
    'budget',
  ] as const)(
    '%s unknown or denied cannot be overridden by remaining ALLOW',
    async (key) => {
      const p = { kind: 'USER' } as C9Principal,
        c = c9Capability('c9.no_action', 'ADMIN');
      for (const denial of [false, null]) {
        const gates = {
          authority: () => Promise.resolve(true),
          entitlement: () => Promise.resolve(true),
          policy: () => Promise.resolve(true),
          provider: () => Promise.resolve(true),
          budget: () => Promise.resolve(true),
        };
        expect(
          await c9Available(c, p, {
            ...gates,
            [key]: () => Promise.resolve(denial),
          }),
        ).toBe(false);
      }
    },
  );
  test('User-only reader does not silently invent userId for Client channel', async () => {
    const allow = () => Promise.resolve(true);
    expect(
      await c9Available(
        c9Capability('analytics.business.profit', 'BUSINESS_INTELLIGENCE'),
        { kind: 'CLIENT_CHANNEL' } as C9Principal,
        {
          authority: allow,
          entitlement: allow,
          policy: allow,
          provider: allow,
          budget: allow,
        },
      ),
    ).toBe(false);
  });
});
