import { BadRequestException } from '@nestjs/common';

import type { FactUsed } from '../../src/widget-contract/envelope';
import { resolveIntentTemplate } from '../../src/widgets/emission/intent-template.registry';
import { CanonicalReadAdapter } from '../../src/widgets/owner-ports/canonical-read.provider';
import type {
  CanonicalReadPort,
  ProjectionPlan,
} from '../../src/widgets/projection/canonical-read.port';
import { PROJECTOR_REGISTRY } from '../../src/widgets/projection/projector.registry';
import { WidgetProjectorService } from '../../src/widgets/projection/widget-projector.service';

const SCOPE = '1'.repeat(64);
const fact = (
  capability: string,
  status: FactUsed['status'] = 'measured',
): FactUsed => ({
  capability,
  status,
  as_of: '2026-09-23T12:00:00.000Z',
  evidence_refs: [],
  completeness: {
    status: status === 'measured' ? 'PARTIAL' : 'UNAVAILABLE',
    requestedScopeHash: SCOPE,
    returnedCount: status === 'measured' ? 1 : 0,
    totalCount: null,
    hasMore: true,
    cursorRef: null,
    truncated: false,
    reasonCodes: ['NOT_COLLECTED'],
  },
});

const plan = (over: Partial<ProjectionPlan> = {}): ProjectionPlan =>
  ({
    widgetId: '01JPROJECTOR00000000000000',
    widgetKind: 'SERVICE_SELECTOR',
    effect: 'REFINE',
    capabilitySpace: 'C9',
    capabilityKey: 'catalog.services.read',
    targetJson: null,
    runId: null,
    revisionId: null,
    c9Domain: 'ADMIN',
    frozenNounsJson: null,
    requestedScopeHash: SCOPE,
    authority: {
      kind: 'USER',
      tenantId: 'tenant-1',
      userId: 'user-1',
      membershipId: 'membership-1',
      clientId: null,
      channelLinkId: null,
      branchRefs: [],
      staffRef: null,
      proofHash: '2'.repeat(64),
    },
    actor: {
      userId: 'user-1',
      sessionId: 'session-1',
      tenantId: 'tenant-1',
      role: 'TENANT_OWNER',
      email: 'owner@example.invalid',
      branchId: null,
      membershipId: 'membership-1',
      membershipStatus: 'ACTIVE',
    },
    aiToolSurface: 'web',
    answeringChannel: 'pwa',
    resolvedNouns: null,
    closedInputs: null,
    ...over,
  }) as ProjectionPlan;

const READ_MOCKS = new WeakMap<object, jest.Mock>();

const successPort = (value: unknown, capability: string): CanonicalReadPort => {
  const read = jest.fn().mockResolvedValue({
    kind: 'value',
    value,
    fact: fact(capability),
  });
  const port: CanonicalReadPort = { read };
  READ_MOCKS.set(port, read);
  return port;
};

const readMock = (port: CanonicalReadPort): jest.Mock => {
  const read = READ_MOCKS.get(port);
  if (!read) throw new Error('test canonical read mock is not registered');
  return read;
};

describe('U12b [GW G-SYNTH] registered projector rows', () => {
  it.each([
    ['G12-L01', 'SERVICE_SELECTOR', 'catalog.services.read', { services: [] }],
    ['G12-L02', 'STAFF_SELECTOR', 'catalog.staff.read', { staff: [] }],
    [
      'G12-L03',
      'TIME_SLOT_SELECTOR',
      'booking.availability.read',
      { slots: [] },
    ],
    [
      'G12-L05',
      'SCHEDULE',
      'company.business-hours.read',
      { schedule: 'MON-FRI 09:00-20:00' },
    ],
    [
      'G12-L06',
      'STRATEGY_OPTIONS',
      'c9.no_action',
      { run: { state: 'PROPOSED' } },
    ],
  ])(
    '%s projects %s from exactly one canonical source fact',
    async (_id, kind, key, value) => {
      const port = successPort(value, key);
      const projector = new WidgetProjectorService(port);
      const outcome = await projector.compose(
        plan({
          widgetKind: kind,
          capabilityKey: key,
          runId: key === 'c9.no_action' ? 'run-1' : null,
        }),
      );
      expect(outcome.kind).toBe('composer_input');
      expect(readMock(port)).toHaveBeenCalledTimes(1);
      if (outcome.kind === 'composer_input') {
        expect(outcome.source).toBe(value);
        expect(outcome.input.facts).toEqual([fact(key)]);
        expect(outcome.input.facts_origin).toEqual(['synthesised']);
      }
    },
  );

  it('G12-L07 no principal or mismatched authority performs zero owner reads', async () => {
    const port = successPort({ services: [] }, 'catalog.services.read');
    const projector = new WidgetProjectorService(port);
    await expect(projector.compose(plan({ authority: null }))).resolves.toEqual(
      { kind: 'degraded', why: 'no_principal' },
    );
    await expect(
      projector.compose(
        plan({
          actor: { ...plan().actor!, tenantId: 'tenant-2' },
        }),
      ),
    ).resolves.toEqual({ kind: 'degraded', why: 'authority_mismatch' });
    expect(readMock(port)).not.toHaveBeenCalled();
  });

  it('G12-L09 owner denial maps through limitation_codes without leaking its message', async () => {
    const exception = new BadRequestException('private owner detail');
    const port: CanonicalReadPort = {
      read: jest.fn().mockResolvedValue({
        kind: 'owner_exception',
        exception,
        denial_code: 'source_requires_supported_reader',
        fact: fact('catalog.services.read', 'unavailable'),
      }),
    };
    const outcome = await new WidgetProjectorService(port).compose(plan());
    expect(outcome.kind).toBe('composer_input');
    expect(JSON.stringify(outcome)).not.toContain('private owner detail');
    if (outcome.kind === 'composer_input') {
      expect(outcome.input.limitation_codes).toHaveLength(1);
      expect(outcome.input.limitation_codes).toEqual(['PERMISSION']);
      expect(outcome.source).toBeNull();
    }
  });

  it('G12-L13 the owner-composed SCHED.2 row proposes only the A2-blocked COMMIT', () => {
    const projector = new WidgetProjectorService(
      successPort({ services: [] }, 'catalog.services.read'),
    );
    const outcome = projector.composeFromOwnerResponse(
      plan({
        widgetKind: 'SCHEDULE',
        capabilityKey: 'appointments.own.reschedule',
      }),
      {
        value: { confirmation_subject: 'reschedule' },
        fact: fact('appointments.own.reschedule'),
      },
    );
    expect(
      projector.composeFromOwnerResponse(
        plan({
          widgetKind: 'SCHEDULE',
          capabilityKey: 'appointments.own.reschedule',
        }),
        { value: { confirmation_subject: 'reschedule' } },
      ),
    ).toEqual({ kind: 'degraded', why: 'missing_source_field' });
    expect(outcome.kind).toBe('composer_input');
    if (outcome.kind === 'composer_input') {
      expect(outcome.input.intent_proposals).toHaveLength(1);
      expect(outcome.input.facts_origin).toEqual(['copied']);
      expect(
        resolveIntentTemplate({
          proposal: outcome.input.intent_proposals[0],
          widgetKind: 'BOOKING_CONFIRMATION',
          deliveryChannel: 'pwa',
        }),
      ).toEqual({
        kind: 'a2_limitation',
        requestedEffect: 'COMMIT',
        capabilityGapRef: 'MG-P01',
      });
    }
  });

  it('G12-L15 an unregistered subject degrades without a fallback read', async () => {
    const port = successPort({ services: [] }, 'catalog.services.read');
    await expect(
      new WidgetProjectorService(port).compose(
        plan({ capabilityKey: 'catalog.services.near-match' }),
      ),
    ).resolves.toEqual({ kind: 'degraded', why: 'no_registered_row' });
    await expect(
      new WidgetProjectorService(port).compose(
        plan({
          widgetKind: 'STAFF_SELECTOR',
          capabilityKey: 'catalog.services.read',
        }),
      ),
    ).resolves.toEqual({ kind: 'degraded', why: 'no_registered_row' });
    expect(readMock(port)).not.toHaveBeenCalled();
  });

  it('G12-L16 an L2 missing owner field degrades instead of making a partial body', async () => {
    const outcome = await new WidgetProjectorService(
      successPort({}, 'catalog.services.read'),
    ).compose(plan());
    expect(outcome).toEqual({
      kind: 'degraded',
      why: 'missing_source_field',
    });
  });

  it('G12-L17/L18 only the approved journal row binds its typed date scalar', async () => {
    const port = successPort({ services: [] }, 'catalog.services.read');
    const p = plan();
    await new WidgetProjectorService(port).compose(p);
    expect(readMock(port)).toHaveBeenCalledWith({
      plan: p,
      row: PROJECTOR_REGISTRY[0],
      ownerArguments: {},
    });
    expect(
      PROJECTOR_REGISTRY.map((row) => [row.subject_key, row.arguments]),
    ).toEqual([
      ['C9:catalog.services.read', {}],
      ['C9:catalog.staff.read', {}],
      ['C9:booking.availability.read', {}],
      ['C9:company.business-hours.read', {}],
      [
        'C9:operations.journal.read',
        { date: { from: 'retained_local_business_date' } },
      ],
      ['C9:c9.no_action', {}],
      ['C9:appointments.own.reschedule', {}],
    ]);
  });

  it('G12-L19 one composition cannot issue a second read', async () => {
    const port = successPort({ services: [] }, 'catalog.services.read');
    await new WidgetProjectorService(port).compose(plan());
    expect(readMock(port)).toHaveBeenCalledTimes(1);
  });

  it('G12-L20 NAVIGATE remains DEV-1 degraded with zero reads', () => {
    const port = successPort({ services: [] }, 'catalog.services.read');
    const result = new WidgetProjectorService(port).composeNavigate(
      plan({ effect: 'NAVIGATE', targetJson: { class: 'detail' } }),
    );
    expect(result).toEqual({ kind: 'degraded', why: 'navigate_interim' });
    expect(readMock(port)).not.toHaveBeenCalled();
  });
});

describe('U12b [GW] canonical read adapter', () => {
  it('G12-L18-PORT calls only the closed tool set without an idempotency key', async () => {
    const execute = jest.fn().mockResolvedValue({
      status: 'completed',
      result: { services: [] },
    });
    const runtime = { execute };
    const store = { snapshot: jest.fn() };
    const adapter = new CanonicalReadAdapter(runtime as never, store as never);
    const row = PROJECTOR_REGISTRY[0];
    const result = await adapter.read({
      plan: plan(),
      row,
      ownerArguments: {},
    });
    expect(result).toMatchObject({
      kind: 'value',
      value: { services: [] },
    });
    expect(execute).toHaveBeenCalledWith(
      plan().actor,
      'catalog.services.read',
      { arguments: {}, surface: 'web' },
      { suppressWidgetTrigger: true },
    );
    const executeCalls = execute.mock
      .calls as unknown as readonly (readonly unknown[])[];
    expect(executeCalls[0]?.[2]).not.toHaveProperty('idempotencyKey');
    const planted = {
      ...PROJECTOR_REGISTRY[0],
      subject_key: 'C9:not.registered' as const,
    };
    await expect(
      adapter.read({ plan: plan(), row: planted, ownerArguments: {} }),
    ).resolves.toMatchObject({ kind: 'owner_exception' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('G12-L09-PORT maps a canonical owner exception and rethrows an infrastructure fault', async () => {
    const runtime = { execute: jest.fn() };
    const adapter = new CanonicalReadAdapter(runtime as never, {} as never);
    runtime.execute.mockRejectedValueOnce(
      new BadRequestException('c9_permission'),
    );
    await expect(
      adapter.read({
        plan: plan(),
        row: PROJECTOR_REGISTRY[0],
        ownerArguments: {},
      }),
    ).resolves.toMatchObject({
      kind: 'owner_exception',
      denial_code: 'permission',
    });
    runtime.execute.mockRejectedValueOnce(new Error('transport fault'));
    await expect(
      adapter.read({
        plan: plan(),
        row: PROJECTOR_REGISTRY[0],
        ownerArguments: {},
      }),
    ).rejects.toThrow('transport fault');
  });
});
