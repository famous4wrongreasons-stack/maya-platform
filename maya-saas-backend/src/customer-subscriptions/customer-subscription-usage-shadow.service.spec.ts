import { createHash } from 'node:crypto';

import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import type { CrmAppointmentDetail } from '../crm/crm-adapter.interface';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CustomerSubscriptionUsageShadowService } from './customer-subscription-usage-shadow.service';
import {
  CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_BRIDGE_CONTRACT,
  CustomerSubscriptionUsageShadowDto,
} from './dto/customer-subscription-usage-shadow.dto';

const TERM_START = new Date('2026-08-01T00:00:00.000Z');
const TERM_END = new Date('2026-08-31T00:00:00.000Z');

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url');
}

const SERVICE_SCOPE_HASH = hash([
  'p4-05.subscription-service-scope.v1',
  'tenant-a',
  'yclients.service.mens-haircut',
]);
const PLAN_SNAPSHOT_HASH = hash([
  'p4-05.legacy-fixed-catalog.v1',
  'tenant-a',
  'haircut.senior',
  'haircut',
  'senior',
  '330000',
  'RUB',
  '2',
  '30',
  SERVICE_SCOPE_HASH,
]);

const validDto = (): CustomerSubscriptionUsageShadowDto => ({
  contract: CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_BRIDGE_CONTRACT,
  initiator: 'daily_scheduler',
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'provider-client-7',
  subscription_id: 'subscription-1',
  visit_record_id: '77',
});

const subscription = (overrides: Record<string, unknown> = {}) => ({
  id: 'subscription-1',
  clientId: 'client-7',
  termIdentityHash: 'term-hash',
  planCode: 'haircut',
  planSnapshotHash: PLAN_SNAPSHOT_HASH,
  serviceScopeHash: SERVICE_SCOPE_HASH,
  priceKopecks: 330_000,
  currency: 'RUB',
  visitsIncluded: 2,
  status: 'active',
  termStartsAt: TERM_START,
  termEndsAt: TERM_END,
  ...overrides,
});

const visit = (
  overrides: Partial<CrmAppointmentDetail> = {},
): CrmAppointmentDetail => ({
  id: 'crm-77',
  client: { id: 'provider-client-7', name: 'Client' },
  provider: { id: 'staff-1', name: 'Staff', title: 'Старший барбер' },
  branch: null,
  service_ids: ['service-10'],
  services: [
    {
      id: 'service-10',
      name: 'Мужская стрижка',
      price: 2000,
      duration_minutes: 60,
      currency: 'RUB',
    },
  ],
  start_at: '2026-08-20T10:00:00.000Z',
  end_at: '2026-08-20T11:00:00.000Z',
  status: 'completed',
  attendance: 'arrived',
  notes: null,
  total_price: 2000,
  currency: 'RUB',
  client_phone: null,
  duration_minutes: 60,
  paid: true,
  can_edit: true,
  ...overrides,
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({
      id: 'usage-shadow-execution-1',
    } as ActionExecution);
  });
  const findLink = jest.fn().mockResolvedValue({
    client: { id: 'client-7', mergedIntoClientId: null },
  });
  const findSubscription = jest.fn().mockResolvedValue(subscription());
  const findUsage = jest.fn().mockResolvedValue(null);
  const aggregateUsage = jest.fn().mockResolvedValue({ _sum: { units: 0 } });
  const checkCrmClientRegistrationGuard = jest
    .fn()
    .mockResolvedValue({ allowed: true, reasonCode: null });
  const getAppointmentDetailForSystem = jest.fn().mockResolvedValue(visit());
  const bridgeSource = {
    assertBridgeSecret: jest.fn(),
    assertBridgeIntegrationBinding: jest.fn().mockReturnValue({
      provider: 'yclients',
      externalCompanyId: 'company-42',
    }),
    resolveTenantByIntegration: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      slug: 'tenant-a',
      resolvedBy: 'integration',
    }),
  };
  const runAsSystemTenant = jest.fn(
    (_tenantId: string, callback: () => unknown) => callback(),
  );
  const service = new CustomerSubscriptionUsageShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: findLink },
      customerSubscription: { findUnique: findSubscription },
      customerSubscriptionUsage: {
        findUnique: findUsage,
        aggregate: aggregateUsage,
      },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
    {
      checkCrmClientRegistrationGuard,
    } as unknown as ClientIdentityService,
    { getAppointmentDetailForSystem } as unknown as CrmService,
  );
  return {
    service,
    planShadow,
    findLink,
    findSubscription,
    findUsage,
    aggregateUsage,
    checkCrmClientRegistrationGuard,
    getAppointmentDetailForSystem,
  };
}

describe('P4-05 sync_customer_subscription_usage Shadow service', () => {
  beforeEach(() => {
    process.env.MAYA_CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.MAYA_CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_ENABLED;
  });

  it('plans one exact attended visit with a deterministic one-unit claim', async () => {
    const h = buildHarness();

    const result = await h.service.planUsage(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'usage-shadow-execution-1',
      shadowDivergences: 0,
      intendedUsageClaim: {
        model: 'CustomerSubscriptionUsage',
        canonicalClientId: 'client-7',
        subscriptionId: 'subscription-1',
        providerServiceScopeRef: 'yclients.service.mens-haircut',
        units: 1,
        remainingUnitsBefore: 2,
        remainingUnitsAfter: 1,
        unknownApplicable: false,
        providerWritesRequired: false,
        writesPerformed: false,
      },
      usageClaimsCreatedByNewPath: 0,
      subscriptionEntitlementMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
    });
    expect(h.planShadow).toHaveBeenCalledTimes(1);
    const request = h.planShadow.mock.calls[0]?.[0];
    expect(request?.targetRef).toMatch(/^subscription-usage:/);
    expect(request).toMatchObject({
      capability: 'customer-subscriptions.usage-sync.shadow.v1',
      input: {
        visitAttendance: 'arrived',
        units: 1,
        remainingUnitsBefore: 2,
        remainingUnitsAfter: 1,
      },
    });
  });

  it('converges retry, restart, duplicate initiators, and concurrent calls', async () => {
    const h = buildHarness();
    const first = await h.service.planUsage(validDto());
    const restarted = buildHarness();
    const second = await restarted.service.planUsage({
      ...validDto(),
      initiator: 'startup_reconciliation',
    });
    const [concurrentA, concurrentB] = await Promise.all([
      h.service.planUsage(validDto()),
      h.service.planUsage({
        ...validDto(),
        initiator: 'manual_reconciliation',
      }),
    ]);

    expect([
      first.actionExecutionId,
      second.actionExecutionId,
      concurrentA.actionExecutionId,
      concurrentB.actionExecutionId,
    ]).toEqual(Array(4).fill('usage-shadow-execution-1'));
    const requests = [
      ...h.planShadow.mock.calls,
      ...restarted.planShadow.mock.calls,
    ].map((call) => call[0]);
    expect(new Set(requests.map((request) => request.targetRef)).size).toBe(1);
    expect(
      new Set(requests.map((request) => request.callerIdempotency?.key)).size,
    ).toBe(1);
  });

  it('does not plan an already claimed visit', async () => {
    const h = buildHarness();
    h.findUsage.mockResolvedValue({ id: 'usage-1' });

    await expect(h.service.planUsage(validDto())).resolves.toMatchObject({
      outcome: 'usage_already_claimed',
      usageClaimsCreatedByNewPath: 0,
    });
    expect(h.planShadow).not.toHaveBeenCalled();
  });

  it('rejects wrong service, exhausted allowance, and forged plan snapshot', async () => {
    const wrongService = buildHarness();
    wrongService.getAppointmentDetailForSystem.mockResolvedValue(
      visit({
        services: [
          {
            id: 'service-99',
            name: 'Окрашивание',
            price: 5000,
            duration_minutes: 90,
            currency: 'RUB',
          },
        ],
      }),
    );
    await expect(
      wrongService.service.planUsage(validDto()),
    ).resolves.toMatchObject({ outcome: 'usage_not_eligible' });

    const exhausted = buildHarness();
    exhausted.aggregateUsage.mockResolvedValue({ _sum: { units: 2 } });
    await expect(
      exhausted.service.planUsage(validDto()),
    ).resolves.toMatchObject({ outcome: 'entitlement_exhausted' });

    const forgedPlan = buildHarness();
    forgedPlan.findSubscription.mockResolvedValue(
      subscription({ planSnapshotHash: 'forged' }),
    );
    await expect(
      forgedPlan.service.planUsage(validDto()),
    ).resolves.toMatchObject({ outcome: 'subscription_not_usable' });
  });

  it('rejects inactive, wrong-window, wrong-client, and wrong-provider-card terms', async () => {
    for (const changed of [
      { subscription: { status: 'expired' } },
      { visit: { start_at: '2026-09-20T10:00:00.000Z' } },
      { subscription: { clientId: 'client-other' } },
      { visit: { client: { id: 'provider-client-other', name: 'Client' } } },
    ]) {
      const h = buildHarness();
      if (changed.subscription) {
        h.findSubscription.mockResolvedValue(
          subscription(changed.subscription),
        );
      }
      if (changed.visit) {
        h.getAppointmentDetailForSystem.mockResolvedValue(visit(changed.visit));
      }
      const result = await h.service.planUsage(validDto());
      expect([
        'subscription_not_usable',
        'provider_evidence_unavailable',
      ]).toContain(result.outcome);
      expect(h.planShadow).not.toHaveBeenCalled();
    }
  });

  it('fails closed for unresolved holds and provider read failure or incomplete evidence', async () => {
    const held = buildHarness();
    held.checkCrmClientRegistrationGuard.mockResolvedValue({
      allowed: false,
      reasonCode: CLIENT_IDENTITY_UNRESOLVED,
    });
    await expect(held.service.planUsage(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
    });

    const failedRead = buildHarness();
    failedRead.getAppointmentDetailForSystem.mockRejectedValue(
      new Error('provider unavailable'),
    );
    await expect(
      failedRead.service.planUsage(validDto()),
    ).resolves.toMatchObject({ outcome: 'provider_evidence_unavailable' });

    const missingAttendance = buildHarness();
    missingAttendance.getAppointmentDetailForSystem.mockResolvedValue(
      visit({ attendance: null }),
    );
    await expect(
      missingAttendance.service.planUsage(validDto()),
    ).resolves.toMatchObject({ outcome: 'provider_evidence_unavailable' });
  });

  it('rejects caller-supplied quantity, service, remaining value, and authority', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    for (const field of [
      ['quantity', 2],
      ['service_id', 'forged-service'],
      ['remaining', 999],
      ['approved', true],
      ['entitled', true],
      ['autonomy', 'L5'],
    ] as const) {
      await expect(
        pipe.transform(
          { ...validDto(), [field[0]]: field[1] },
          { type: 'body', metatype: CustomerSubscriptionUsageShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
