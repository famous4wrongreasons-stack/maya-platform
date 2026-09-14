/**
 * P03 permanent policy and source ratchet (mapping §10).
 * Confirmed configuration belongs to A22 and to nobody else: a conversation produces a
 * typed draft and a material diff, never a write. A reference is not access, a URL is not
 * monitoring, credentials never enter this payload, and a report preference cannot
 * duplicate or re-route an already-admitted report run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  C9_POLICY_NAMESPACE,
  C9_REPORT_TYPES,
  C9_TENANT_CONTEXT_CONTRACT,
  C9_VERTICALS,
  c9EffectiveLimits,
  c9PolicyDraft,
  c9SafeUrl,
  c9TenantContext,
} from './c9.policy';
import { C9Object, C9_ROUTES } from './c9.contract';
import { c9DefaultBudget } from './c9.budget';
import {
  TENANT_CONFIGURATION_NAMESPACES,
  governedConfigurationContent,
} from '../package5-wave1/governed-settings.contract';

const migration = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260913160000_chapter9_orchestration_foundation/migration.sql',
  ),
  'utf8',
);
const service = readFileSync(join(__dirname, 'c9.policy.service.ts'), 'utf8');
const policy = readFileSync(join(__dirname, 'c9.policy.ts'), 'utf8');

const content = (overrides: C9Object = {}): C9Object => ({
  contract: C9_TENANT_CONTEXT_CONTRACT,
  profile: {
    vertical: 'barbershop',
    staffing: 'solo',
    branchRefs: [],
    timezoneSourceRef: 'tenant:timezone',
    serviceCatalogSourceRef: 'tenant:catalog',
  },
  strategyConstraints: {
    discounts: 'forbidden',
    allowedObjectiveKeys: ['c9.business_overview'],
    valuationPolicyRef: null,
    businessRuleRefs: [],
  },
  sourceReferences: [],
  reportPreferences: [],
  resourceLimits: null,
  exposurePolicyRefs: { marketingPolicyRef: null, offerPolicyRefs: [] },
  ...overrides,
});

describe('c9 tenant policy and sources', () => {
  test('the namespace is the one already admitted by the database', () => {
    expect(C9_POLICY_NAMESPACE).toBe('c9_orchestration');
    expect(TENANT_CONFIGURATION_NAMESPACES).toContain('c9_orchestration');
    expect(migration).toContain("'c9_orchestration'");
    // The existing A22 allowlist was extended as a strict superset, not replaced.
    for (const existing of [
      'business_rules',
      'client_capabilities',
      'staff_ai_provider',
      'c8_valuation',
    ]) {
      expect(migration).toContain(`'${existing}'`);
      expect(TENANT_CONFIGURATION_NAMESPACES).toContain(existing);
    }
    expect(migration).toContain('"contractVersion"=1 AND "revision">0');
  });

  test('the existing A22 owner validates this payload, so chat cannot bypass it', () => {
    expect(
      governedConfigurationContent('c9_orchestration', content()),
    ).toMatchObject({ contract: C9_TENANT_CONTEXT_CONTRACT });
    expect(() =>
      governedConfigurationContent('c9_orchestration', {
        ...content(),
        somethingElse: true,
      }),
    ).toThrow('c9_unknown_field');
    // The intake service reads and drafts; it writes nothing anywhere.
    expect(service).not.toMatch(
      /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
    );
    expect(service).toContain('tenant_business_configuration');
  });

  test('all four verticals and the report types are supported exactly', () => {
    for (const vertical of ['barbershop', 'beauty', 'dental', 'auto_service'])
      expect(C9_VERTICALS).toContain(vertical);
    expect([...C9_REPORT_TYPES]).toEqual([
      'daily_report',
      'morning_owner',
      'morning_staff',
    ]);
    for (const vertical of C9_VERTICALS)
      expect(
        c9TenantContext(
          content({
            profile: {
              vertical,
              staffing: 'team',
              branchRefs: [],
              timezoneSourceRef: 'tenant:timezone',
              serviceCatalogSourceRef: 'tenant:catalog',
            },
          }),
        ),
      ).toBeTruthy();
    expect(() =>
      c9TenantContext(
        content({
          profile: {
            vertical: 'restaurant',
            staffing: 'team',
            branchRefs: [],
            timezoneSourceRef: 'tz',
            serviceCatalogSourceRef: 'cat',
          },
        }),
      ),
    ).toThrow('c9_enum');
  });

  test('a solo profile is never asked for branches it does not have', () => {
    expect(() =>
      c9TenantContext(
        content({
          profile: {
            vertical: 'barbershop',
            staffing: 'solo',
            branchRefs: ['a', 'b'],
            timezoneSourceRef: 'tz',
            serviceCatalogSourceRef: 'cat',
          },
        }),
      ),
    ).toThrow('c9_solo_profile_branches');
  });

  test('a URL is a reference, never access, and never carries a credential', () => {
    expect(c9SafeUrl('https://example.test/price-list')).toBe(
      'https://example.test/price-list',
    );
    for (const unsafe of [
      'https://user:pass@example.test/',
      'https://example.test/?access_token=abc',
      'https://example.test/?q=sk-live-1',
      'https://example.test/#token=abc',
    ])
      expect(() => c9SafeUrl(unsafe)).toThrow('c9_use_secure_surface');
    expect(() => c9SafeUrl('ftp://example.test/x')).toThrow(
      'c9_source_url_scheme',
    );
    // Recording a URL grants no connector; that requires an existing integration ref.
    expect(() =>
      c9TenantContext(
        content({
          sourceReferences: [
            {
              key: 'price-list',
              kind: 'existing_connector_ref',
              url: 'https://example.test/x',
              connectorRef: null,
              purpose: 'business_context',
            },
          ],
        }),
      ),
    ).toThrow('c9_connector_reference_required');
    expect(() =>
      c9TenantContext(
        content({
          sourceReferences: [
            {
              key: 'price-list',
              kind: 'reference_only',
              url: null,
              connectorRef: 'integration-1',
              purpose: 'business_context',
            },
          ],
        }),
      ),
    ).toThrow('c9_reference_is_not_access');
    // Qualification is derived live; there is no writable "verified" flag to set.
    expect(policy).not.toMatch(/verified\s*:\s*c9Boolean/);
  });

  test('a report preference cannot duplicate or re-route an admitted report', () => {
    const preference = {
      reportType: 'daily_report',
      enabled: true,
      localHour: 9,
      timezoneSourceRef: 'tenant:timezone',
      scope: 'existing_eligible_owner',
    };
    expect(
      c9TenantContext(content({ reportPreferences: [preference] })),
    ).toBeTruthy();
    expect(() =>
      c9TenantContext(
        content({ reportPreferences: [preference, { ...preference }] }),
      ),
    ).toThrow('c9_duplicate_report_preference');
    expect(() =>
      c9TenantContext(
        content({ reportPreferences: [{ ...preference, localHour: 24 }] }),
      ),
    ).toThrow('c9_integer');
    // No recipient, device, channel or schedule is expressible here at all.
    for (const forbidden of [
      'recipients',
      'deviceRefs',
      'channelOrder',
      'cron',
      'sql',
    ])
      expect(policy).not.toContain(`${forbidden}:`);
  });

  test('an owner may only set an objective the released router knows', () => {
    expect(
      c9TenantContext(
        content({
          strategyConstraints: {
            discounts: 'existing_owner_only',
            allowedObjectiveKeys: Object.keys(C9_ROUTES).slice(0, 3),
            valuationPolicyRef: null,
            businessRuleRefs: [],
          },
        }),
      ),
    ).toBeTruthy();
    expect(() =>
      c9TenantContext(
        content({
          strategyConstraints: {
            discounts: 'forbidden',
            allowedObjectiveKeys: ['c9.invented_objective'],
            valuationPolicyRef: null,
            businessRuleRefs: [],
          },
        }),
      ),
    ).toThrow('c9_unregistered_objective');
    // Discounts are an explicit owner choice; there is no permissive third value.
    expect(() =>
      c9TenantContext(
        content({
          strategyConstraints: {
            discounts: 'any',
            allowedObjectiveKeys: [],
            valuationPolicyRef: null,
            businessRuleRefs: [],
          },
        }),
      ),
    ).toThrow('c9_enum');
  });

  test('a tenant ceiling can tighten a released bound and never raise it', () => {
    const released = c9DefaultBudget();
    const tighter = c9EffectiveLimits(released, {
      domainsMax: 1,
      toolCallsPerDomainMax: 2,
      toolCallsMax: 3,
      modelCallsMax: 1,
      inputTokensMax: 1000,
      outputTokensMax: 500,
      reasoningMsMax: 30000,
      aiCost: null,
    });
    expect(tighter).toMatchObject({
      domainsMax: 1,
      toolCallsPerDomainMax: 2,
      toolCallsMax: 3,
      modelCallsMax: 1,
      inputTokensMax: 1000,
      outputTokensMax: 500,
      reasoningMsMax: 30000,
    });
    // Asking for more than the release allows is refused by the typed bound itself.
    expect(() =>
      c9EffectiveLimits(released, {
        domainsMax: 3,
        toolCallsPerDomainMax: 6,
        toolCallsMax: 12,
        modelCallsMax: 12,
        inputTokensMax: 96000,
        outputTokensMax: 48000,
        reasoningMsMax: 120000,
        aiCost: null,
      }),
    ).toThrow('c9_integer');
    // With no released allowance a tenant cannot fund paid work by naming a price.
    expect(
      c9EffectiveLimits(released, {
        domainsMax: 2,
        toolCallsPerDomainMax: 6,
        toolCallsMax: 12,
        modelCallsMax: 12,
        inputTokensMax: 96000,
        outputTokensMax: 48000,
        reasoningMsMax: 120000,
        aiCost: {
          currency: 'RUB',
          capMicros: '9999999',
          priceManifestRef: 'a'.repeat(64),
        },
      }).aiCost,
    ).toBeNull();
    expect(c9EffectiveLimits(released, null)).toEqual(released);
  });

  test('a draft names what changes and what is not supported, and writes nothing', () => {
    const base = content();
    const draft = c9PolicyDraft(
      { revision: 3, id: 'revision-3', content: base },
      {
        reportPreferences: [
          {
            reportType: 'morning_owner',
            enabled: true,
            localHour: 8,
            timezoneSourceRef: 'tenant:timezone',
            scope: 'existing_eligible_owner',
          },
        ],
        sendSmsAtNine: true,
        customSql: 'SELECT 1',
      },
    );
    expect(draft.namespace).toBe('c9_orchestration');
    expect(draft.expectedRevision).toBe(3);
    expect(draft.previousRevisionId).toBe('revision-3');
    expect(draft.changed).toEqual(['reportPreferences']);
    // Unsupported requests are named back, never silently dropped or coerced.
    expect(draft.unsupported).toEqual(['customSql', 'sendSmsAtNine']);
    expect(draft.content.contract).toBe(C9_TENANT_CONTEXT_CONTRACT);
    // An identical proposal is not a change, so nothing is offered for confirmation.
    expect(
      c9PolicyDraft({ revision: 3, id: 'revision-3', content: base }, {})
        .changed,
    ).toEqual([]);
  });

  test('a stale predecessor cannot be confirmed as if it were current', () => {
    const base = content();
    const first = c9PolicyDraft(
      { revision: 1, id: 'revision-1', content: base },
      {},
    );
    const second = c9PolicyDraft(
      { revision: 2, id: 'revision-2', content: base },
      {},
    );
    // The draft carries the exact predecessor, so A22 rejects a confirmation built on an
    // older revision instead of silently applying it.
    expect(first.expectedRevision).not.toBe(second.expectedRevision);
    expect(first.previousRevisionId).not.toBe(second.previousRevisionId);
    expect(service).toContain('confirmed.previousRevisionId');
    expect(service).toContain('confirmed.revision');
  });

  test('only an owner is shown owner configuration, resolved live', () => {
    expect(service).toContain("c9Deny('policy_owner_required')");
    expect(service).toContain("['tenant_owner', 'business_owner']");
    expect(service).toContain("status='active' FOR SHARE");
    expect(service).toContain('this.authority.current(tx, channelProof)');
  });
});
