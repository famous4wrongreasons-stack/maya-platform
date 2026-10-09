/** Synthetic in-memory arguments only; no complete(), application, DB or transport. */
import { createHash } from 'node:crypto';
import {
  captureCoreFullOfflineAudit,
  projectCoreFullOfflinePublicCompany,
  sanitizeCoreFullOfflineAuditValue,
} from './core-full-offline-audit';

const scope = {
  tenantId: 'tenant-private',
  userId: 'actor-private',
  privateValues: [
    'tenant-private',
    'actor-private',
    'branch-private',
    'client-private',
    'named-private',
  ],
};
const hash = (value: string) =>
  'sha256:' + createHash('sha256').update(value).digest('hex');
function args(
  decisions: unknown[] = [],
  toolResults: unknown[] = [],
  response: unknown = { reply: 'Уточните период.' },
): unknown[] {
  return [
    {
      tenantId: scope.tenantId,
      userId: scope.userId,
      role: 'tenant_owner',
      email: 'never-read@example.invalid',
    },
    { messages: [{ role: 'user', content: 'DO_NOT_CAPTURE_DTO' }] },
    { privateContext: 'DO_NOT_CAPTURE_BRAIN' },
    false,
    [{ payload: 'DO_NOT_CAPTURE_TOOL_USAGE' }],
    decisions,
    response,
    toolResults,
  ];
}

describe('full offline actual completion audit capture', () => {
  it('preserves explicitly selected public branding address without changing generic address privacy', () => {
    const company = {
      name: 'Салон MAYA',
      address: 'Москва, улица Примерная, 12',
      businessHours: 'Ежедневно 10:00–20:00',
    };
    const original = JSON.stringify(company);
    expect(
      projectCoreFullOfflinePublicCompany(company, scope.privateValues),
    ).toEqual(company);
    expect(
      sanitizeCoreFullOfflineAuditValue(
        { company, customer: { address: company.address } },
        scope.privateValues,
      ),
    ).toMatchObject({
      company: { address: '[private omitted]' },
      customer: { address: '[private omitted]' },
    });
    expect(
      projectCoreFullOfflinePublicCompany(
        { ...company, address: 'branch-private' },
        scope.privateValues,
      ).address,
    ).toBe('[private omitted]');
    expect(JSON.stringify(company)).toBe(original);
    let getterCalls = 0;
    for (const invalid of [
      { ...company, phone: '+79991234567' },
      { ...company, address: { privateAddress: 'unknown' } },
      {
        ...company,
        get address() {
          getterCalls++;
          return 'unknown';
        },
      },
    ])
      expect(() =>
        projectCoreFullOfflinePublicCompany(invalid, scope.privateValues),
      ).toThrow('core_full_offline_public_company_shape_refused');
    expect(getterCalls).toBe(0);
  });
  it('copies final mutated plans and actual READ facts without grading or using other complete arguments', () => {
    const plan = {
      version: 'maya-ci/1',
      dialogue_act: 'request',
      tasks: [
        {
          id: 'task_1',
          intent: 'booking.find_availability',
          entities: {
            employee: 'Артём',
            services: ['Мужская стрижка'],
            date_or_period: '2026-10-10',
            time: '17:00',
          },
          requires_clarification: true,
          permission: { status: 'allowed' },
        },
      ],
      context: {
        carried_slots: ['employee'],
        replaced_slots: ['time'],
        unresolved_references: [],
      },
    };
    plan.tasks[0].requires_clarification = false;
    const result = {
      staff: [{ id: '71', name: 'Артём' }],
      services: [{ id: '81', title: 'Мужская стрижка' }],
      amount: 12000,
      currency: 'RUB',
      period: { from: '2026-10-01', to: '2026-10-10' },
      configured: true,
    };
    const input = args(
      [{ semanticPlan: plan, reply: 'DO_NOT_CAPTURE_RAW_MODEL_REPLY' }],
      [{ name: 'finance.summary', result }],
    );
    const before = JSON.stringify(input);
    const captured = captureCoreFullOfflineAudit(input, scope);
    expect(captured.actor).toEqual({
      role: 'tenant_owner',
      sameTenant: true,
      sameActor: true,
    });
    expect(captured.semanticPlans).toMatchObject([
      {
        tasks: [
          {
            requires_clarification: false,
            entities: {
              employee: 'Артём',
              services: ['Мужская стрижка'],
              time: '17:00',
              date_or_period: '2026-10-10',
            },
          },
        ],
      },
    ]);
    expect(captured.toolResults).toEqual([
      {
        name: 'finance.summary',
        result: {
          ...result,
          staff: [{ id: hash('71'), name: 'Артём' }],
          services: [{ id: hash('81'), title: 'Мужская стрижка' }],
        },
      },
    ]);
    expect(captured.completeness).toEqual({
      status: 'complete',
      reasons: [],
      decisionsSeen: 1,
      semanticPlansCaptured: 1,
      toolResultsSeen: 1,
      toolResultsCaptured: 1,
    });
    expect(JSON.stringify(input)).toBe(before);
    plan.tasks[0].entities.time = '18:00';
    result.amount = 999;
    expect(JSON.stringify(captured)).toContain('17:00');
    expect(JSON.stringify(captured)).not.toContain('DO_NOT_CAPTURE');
    expect(JSON.stringify(captured)).not.toContain('never-read');
  });

  it('retains actual deterministic response facts and treats empty decisions/default results as complete observation', () => {
    const input = args([], [], {
      reply: 'Доступных окон нет.',
      occupancy: {
        recommendation: {
          outcome: 'no_current_opportunity',
          noSideEffects: true,
        },
      },
    });
    input.pop(); // The actual complete() default is an empty toolResults array.
    const result = captureCoreFullOfflineAudit(input, scope);
    expect(result.semanticPlans).toEqual([]);
    expect(result.toolResults).toEqual([]);
    expect(result.response).toEqual(input[6]);
    expect(result.completeness.status).toBe('complete');
  });

  it('omits known private strings first and hashes unknown structured references consistently', () => {
    const opaque = '01234567-89ab-4cde-8f01-23456789abcd';
    const result = sanitizeCoreFullOfflineAuditValue(
      {
        branch_id: 'branch-private',
        description: `named-private ${opaque} one@example.invalid +7 (999) 123-45-67`,
        selected: { id: opaque },
        sourceRef: opaque,
        token: 'SYNTHETIC_OPAQUE_HANDLE',
        nested: [{ tenantId: 'tenant-private', source_id: 71 }],
        email: 'synthetic@example.invalid',
        password: 'SYNTHETIC_PASSWORD',
      },
      scope.privateValues,
    );
    expect(result).toMatchObject({
      branch_id: '[private omitted]',
      selected: { id: hash(opaque) },
      sourceRef: hash(opaque),
      token: hash('SYNTHETIC_OPAQUE_HANDLE'),
      nested: [{ tenantId: '[private omitted]', source_id: hash('71') }],
      email: '[private omitted]',
      password: '[private omitted]',
    });
    expect(result).toMatchObject({
      description: `[private omitted] ${hash(opaque)} [private omitted] [private omitted]`,
    });
    const serialized = JSON.stringify(result);
    for (const value of [
      ...scope.privateValues,
      opaque,
      'example.invalid',
      '123-45-67',
      'SYNTHETIC_PASSWORD',
    ])
      expect(serialized).not.toContain(value);
    expect(serialized).toContain(hash(opaque));
  });

  it('keeps public catalog labels while omitting private client identity and preserving actual client read aggregates', () => {
    const result = captureCoreFullOfflineAudit(
      args(
        [],
        [
          {
            name: 'catalog.staff.read',
            result: { staff: [{ id: '71', name: 'Елена' }] },
          },
          {
            name: 'clients.find_summary',
            result: {
              client: {
                id: 'client-private',
                name: 'Имя клиента',
                phone: '+79991234567',
              },
              found: true,
              visits_count: 4,
              revenue: 8000,
              currency: 'RUB',
              service: { name: 'Мужская стрижка' },
            },
          },
        ],
      ),
      scope,
    );
    expect(result.toolResults[0].result).toMatchObject({
      staff: [{ name: 'Елена' }],
    });
    expect(result.toolResults[1].result).toMatchObject({
      client: {
        id: '[private omitted]',
        name: '[private omitted]',
        phone: '[private omitted]',
      },
      found: true,
      visits_count: 4,
      revenue: 8000,
      currency: 'RUB',
      service: { name: 'Мужская стрижка' },
    });
    expect(result.completeness.status).toBe('complete');
  });

  it('observes foreign actor/tenant without granting or guessing identity from malformed input', () => {
    const input = args();
    input[0] = {
      role: 'administrator',
      tenantId: 'other-tenant',
      userId: 'other-actor',
    };
    expect(captureCoreFullOfflineAudit(input, scope).actor).toEqual({
      role: 'administrator',
      sameTenant: false,
      sameActor: false,
    });
    input[0] = {
      role: 'invented_role',
      tenantId: scope.tenantId,
      userId: scope.userId,
    };
    const malformed = captureCoreFullOfflineAudit(input, scope);
    expect(malformed.actor).toEqual({
      role: null,
      sameTenant: null,
      sameActor: null,
    });
    expect(malformed.completeness.reasons).toContain('actor_shape');
  });

  it('never invokes getters/toJSON/proxy traps and marks missing observations as incomplete', () => {
    let calls = 0;
    const accessor = {
      get amount() {
        calls++;
        return 2000;
      },
    };
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          calls++;
          throw Error('must_not_read');
        },
      },
    );
    const input = args(
      [
        {
          get semanticPlan() {
            calls++;
            return {};
          },
        },
      ],
      [
        {
          name: 'finance.summary',
          result: {
            accessor,
            proxy,
            toJSON() {
              calls++;
              return 'unsafe';
            },
          },
        },
      ],
    );
    const captured = captureCoreFullOfflineAudit(input, scope);
    expect(calls).toBe(0);
    expect(captured.completeness.status).toBe('incomplete');
    expect(captured.completeness.reasons).toEqual(
      expect.arrayContaining(['accessor_omitted', 'unsupported_value']),
    );
    const invalidPrivate = ['value'];
    Object.defineProperty(invalidPrivate, '0', {
      get() {
        calls++;
        return 'unsafe';
      },
    });
    expect(() =>
      captureCoreFullOfflineAudit(input, {
        ...scope,
        privateValues: invalidPrivate,
      }),
    ).toThrow('core_full_offline_audit_scope_refused');
    expect(calls).toBe(0);
  });

  it('bounds cycles, oversized rows/strings and unsupported facts without silently claiming complete capture', () => {
    const cyclic: { again?: unknown } = {};
    cyclic.again = cyclic;
    const captured = captureCoreFullOfflineAudit(
      args(
        [],
        [
          {
            name: 'finance.summary',
            result: {
              cyclic,
              rows: Array.from({ length: 513 }, (_, index) => index),
              long: 'a'.repeat(16385),
              amount: Infinity,
            },
          },
        ],
      ),
      scope,
    );
    expect(captured.completeness.status).toBe('incomplete');
    expect(captured.completeness.reasons).toEqual(
      expect.arrayContaining([
        'bounded_capture',
        'cycle_omitted',
        'unsupported_value',
      ]),
    );
    expect(JSON.stringify(captured).length).toBeLessThan(10000);
    expect(captureCoreFullOfflineAudit([], scope).completeness.status).toBe(
      'incomplete',
    );
  });

  it('returns deterministic detached JSON, preserves native dates and treats conflicting redacted keys as incomplete', () => {
    const source = {
      at: new Date('2026-10-10T14:00:00.000Z'),
      'branch-private': 1,
      'client-private': 2,
    };
    const input = args([], [{ name: 'finance.summary', result: source }]);
    const one = captureCoreFullOfflineAudit(input, scope),
      two = captureCoreFullOfflineAudit(input, scope);
    expect(one).toEqual(two);
    expect(one.toolResults[0].result).toMatchObject({
      at: '2026-10-10T14:00:00.000Z',
    });
    expect(one.completeness.reasons).toContain('key_collision');
    expect(source.at).toBeInstanceOf(Date);
  });
});
