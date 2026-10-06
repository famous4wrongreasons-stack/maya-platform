import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { BusinessStateService } from '../business-state/business-state.service';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import {
  SERVICE_PRICE_TOOL,
  SERVICE_PRICE_CAPABILITY,
} from '../crm/yclients-service-price.contract';
import { CustomersService } from '../customers/customers.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ExpensesService } from '../expenses/expenses.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { C9_CAPABILITIES, c9Capability } from '../orchestration/c9.registry';
import { ActionCapabilityRegistry } from '../action-engine/action-engine.registry';
import { PROFILE_REGISTRY } from '../entitlements/widget-release-profile.registry';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import type { AiToolPrincipal } from './ai-tool.types';
import {
  WIDGET_CAPABILITY_POLICY,
  assertPolicyTotality,
} from '../widgets/authority/capability-policy';
import { AE_WIDGET_COMMIT_ALLOWLIST } from '../widgets/authority/ae-commit-allowlist.runtime';
import { AE_CAPABILITY_GAP_LEDGER } from '../widgets/authority/ae-capability-gap-ledger.runtime';
import { pairingForPropose } from '../widgets/authority/propose-pairing';

const principal: AiToolPrincipal = {
  tenantId: 'tenant-a',
  userId: 'owner-a',
  role: UserRole.TENANT_OWNER,
  surface: 'web',
};
const prepared = {
  service_id: '42',
  price_rubles: 1850.25,
  company_id: '123',
  integration_revision: 'a'.repeat(64),
  current_revision: 'b'.repeat(64),
  current_price_rubles: 1700,
  service_name: 'Стрижка',
  currency: 'RUB',
};

function harness() {
  const crm = {
    prepareServicePriceChange: jest.fn().mockResolvedValue({ ...prepared }),
    applyServicePriceChange: jest.fn(),
  };
  const handler = new AiToolHandlerService(
    crm as unknown as CrmService,
    {} as AppointmentsService,
    {} as LoyaltyService,
    {} as OperationsAnalyticsService,
    {} as ExpensesService,
    {} as PrismaService,
    {} as CustomersService,
    {} as StaffService,
    {} as BusinessStateService,
    {} as AppointmentPeriodReader,
    {} as ClientRecencyFactsService,
  );
  const context = new TenantContextService();
  const entitlements = {
    getEffectiveEntitlements: jest.fn().mockResolvedValue({
      features: {
        'crm.integration': true,
        'ai.owner': true,
        'ai.admin': true,
        'ai.consultant': true,
      },
    }),
    assertFeature: jest.fn().mockResolvedValue(undefined),
  };
  const registry = new AiToolRegistryService();
  const policy = new AiToolPolicyService(
    context,
    entitlements as unknown as EntitlementsService,
    registry,
  );
  return { crm, handler, context, entitlements, registry, policy };
}

describe('catalog.service.price.update chat boundary', () => {
  const registry = new AiToolRegistryService();

  it('pins exactly one local C9/AE candidate without adding a released carrier successor', () => {
    const candidates = C9_CAPABILITIES.filter(
      (row) => row.capabilityKey === SERVICE_PRICE_TOOL,
    );
    expect(candidates).toEqual([
      {
        capabilityKey: SERVICE_PRICE_TOOL,
        contractVersion: 1,
        domains: ['ADMIN'],
        mode: 'PROPOSE_ONLY',
        toolOrInterface: SERVICE_PRICE_TOOL,
        ownerKey: `existing.ai-tool:${SERVICE_PRICE_TOOL}`,
        inputContract: `${SERVICE_PRICE_TOOL}:input/1`,
        outputContract: `${SERVICE_PRICE_TOOL}:output/1`,
        principalKinds: ['USER'],
        scopeResolver: 'current_source_scope',
        featureRefs: ['crm.integration'],
        providerAvailabilityResolver: 'current_source_readiness',
        sourcePolicyResolver: 'current_source_policy',
        approvalAdapter: 'exact_source_confirmation',
        idempotencyAdapter: 'existing_source_receipt',
        resourceClass: 'SOURCE_HANDOFF',
        timeoutMs: 15_000,
        maxInputBytes: 16384,
        maxOutputBytes: 32768,
        evidencePolicy: 'qualified_current_reference',
        taskBundleRef: 'c9.skills/1',
      },
    ]);
    const actions = new ActionCapabilityRegistry()
      .list()
      .filter((row) => row.capability === SERVICE_PRICE_CAPABILITY);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      capability: SERVICE_PRICE_CAPABILITY,
      capabilityVersion: 1,
      actionClass: 'update_crm_service_fixed_price',
      targetKind: 'crm_service',
      allowedSourceTypes: ['authenticated_request'],
      riskFacets: [
        'ac2',
        'external',
        'one_target',
        'financial',
        'explicit_actor_approval',
      ],
      policyKey: 'production.crm-service-price.confirmed-request',
      autonomyLevel: 'L2_CONFIRMED_REQUEST',
      approvalRequirement: 'NONE',
      retry: {
        maxExecutionAttempts: 1,
        retryablePreDispatchErrors: new Set(),
        backoffMs: [],
      },
      reconciliation: { retryAfterProvenNonExecution: false },
    });
    expect(PROFILE_REGISTRY.successorCapabilities).not.toContain(
      SERVICE_PRICE_TOOL,
    );
  });

  it('admits only the owner-approved v1.4 typed price confirmation pair', () => {
    expect(() => assertPolicyTotality()).not.toThrow();
    expect(WIDGET_CAPABILITY_POLICY[`C9:${SERVICE_PRICE_TOOL}`]).toMatchObject({
      min_verification: 'SESSION_VERIFIED',
      consent_class: 'none',
    });
    expect(pairingForPropose(SERVICE_PRICE_TOOL)).toEqual({
      propose: { space: 'C9', key: SERVICE_PRICE_TOOL },
      ae: { space: 'AE', key: SERVICE_PRICE_CAPABILITY },
    });
    expect(AE_WIDGET_COMMIT_ALLOWLIST[SERVICE_PRICE_CAPABILITY]).toMatchObject({
      family: 'catalogue_price_configuration',
      confirmation_kind: 'APPROVAL',
      min_verification: 'SESSION_VERIFIED',
      requires_ae_approval: false,
    });
    expect(AE_CAPABILITY_GAP_LEDGER[SERVICE_PRICE_CAPABILITY]).toBeUndefined();
  });

  it('exposes only exact service and requested price, with actor approval and no retry', () => {
    const definition = registry.get(SERVICE_PRICE_TOOL);
    expect(definition).toMatchObject({
      allowedRoles: [UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER],
      requiredFeatures: ['crm.integration'],
      riskTier: 'high_write',
      approvalPolicy: 'actor',
      idempotency: 'required',
      retryPolicy: 'none',
      fallbackPolicy: 'fail_closed',
      inputSchema: {
        additionalProperties: false,
        required: ['service_id', 'price_rubles'],
      },
    });
    expect(Object.keys(definition.inputSchema.properties as object)).toEqual([
      'service_id',
      'price_rubles',
    ]);
    expect(c9Capability(SERVICE_PRICE_TOOL, 'ADMIN')).toMatchObject({
      mode: 'PROPOSE_ONLY',
      approvalAdapter: 'exact_source_confirmation',
    });
    expect(() => c9Capability(SERVICE_PRICE_TOOL, 'OCCUPANCY')).toThrow();
  });

  it.each([0, 0.01, 1850.25, 1_000_000_000])(
    'preserves the exact requested RUB price %s',
    (price) => {
      expect(
        registry.validateArguments(SERVICE_PRICE_TOOL, {
          service_id: '42',
          price_rubles: price,
        }),
      ).toEqual({ service_id: '42', price_rubles: price });
    },
  );

  it.each([-1, 0.001, 10.123, NaN, Infinity, 1_000_000_000.01, '1850', null])(
    'refuses invalid or coerced price %s',
    (price) => {
      expect(() =>
        registry.validateArguments(SERVICE_PRICE_TOOL, {
          service_id: '42',
          price_rubles: price,
        }),
      ).toThrow(BadRequestException);
    },
  );

  it.each([
    'tenant_id',
    'branch_id',
    'user_id',
    'patch',
    'price_min',
    'price_max',
    'percent',
  ])('refuses model authority or arbitrary field %s', (field) => {
    expect(() =>
      registry.validateArguments(SERVICE_PRICE_TOOL, {
        service_id: '42',
        price_rubles: 1850.25,
        [field]: 'untrusted',
      }),
    ).toThrow(BadRequestException);
  });

  it.each(['0', '042', 'foo', '1/2', '1?company=2', '1234567890123456', 42])(
    'refuses invalid provider service identity %s',
    (id) => {
      expect(() =>
        registry.validateArguments(SERVICE_PRICE_TOOL, {
          service_id: id,
          price_rubles: 1850.25,
        }),
      ).toThrow(BadRequestException);
    },
  );

  it('replays complete bounded preparation without changing its signed content', () => {
    expect(registry.validateArguments(SERVICE_PRICE_TOOL, prepared)).toEqual(
      prepared,
    );
    const spaced = { ...prepared, service_name: ' Стрижка ' };
    expect(registry.validateArguments(SERVICE_PRICE_TOOL, spaced)).toEqual(
      spaced,
    );
    for (const override of [
      { company_id: 'external' },
      { integration_revision: 'a' },
      { current_revision: 'B'.repeat(64) },
      { service_name: 'a'.repeat(241) },
      { currency: 'USD' },
      { current_price_rubles: 10.123 },
    ]) {
      expect(() =>
        registry.validateArguments(SERVICE_PRICE_TOOL, {
          ...prepared,
          ...override,
        }),
      ).toThrow(BadRequestException);
    }
    expect(() =>
      registry.validateArguments(SERVICE_PRICE_TOOL, {
        service_id: '42',
        price_rubles: 1850.25,
        currency: 'RUB',
      }),
    ).toThrow(BadRequestException);
  });

  it('prepares through the trusted owner and discards every caller-supplied server field', async () => {
    const { handler, crm } = harness();
    const forged = {
      ...prepared,
      company_id: '999',
      current_price_rubles: 1,
      current_revision: 'c'.repeat(64),
      service_name: 'Подмена',
    };
    const result = await handler.normalizeArguments(
      SERVICE_PRICE_TOOL,
      principal,
      forged,
    );
    expect(crm.prepareServicePriceChange).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      {
        service_id: '42',
        price_rubles: 1850.25,
      },
    );
    expect(result).toEqual(prepared);
    expect(crm.applyServicePriceChange).not.toHaveBeenCalled();
  });

  it('shows authoritative current → exact requested price and approval; no second source read', async () => {
    const { handler, crm } = harness();
    const args = await handler.normalizeArguments(
      SERVICE_PRICE_TOOL,
      principal,
      {
        service_id: '42',
        price_rubles: 1850.25,
      },
    );
    const preview = registry.buildApprovalPreview(SERVICE_PRICE_TOOL, args);
    expect(preview.summary).toBe(
      'Изменить цену услуги «Стрижка» в YCLIENTS: 1 700 ₽ → 1 850,25 ₽ (RUB). Требуется ваше подтверждение.',
    );
    expect(
      await handler.enrichApprovalPreview(
        SERVICE_PRICE_TOOL,
        principal,
        args,
        preview.payload,
      ),
    ).toEqual(preview.payload);
    expect(preview.payload).toMatchObject({
      source: 'YCLIENTS',
      service: 'Стрижка',
      service_id: '42',
      current_price_rubles: 1700,
      proposed_price_rubles: 1850.25,
      currency: 'RUB',
    });
    expect(crm.prepareServicePriceChange).toHaveBeenCalledTimes(1);
    expect(crm.applyServicePriceChange).not.toHaveBeenCalled();
    expect(() =>
      registry.buildApprovalPreview(SERVICE_PRICE_TOOL, {
        service_id: '42',
        price_rubles: 1850.25,
      }),
    ).toThrow(BadRequestException);
  });

  it('re-prepares a changed-price follow-up instead of copying old metadata or applying it', async () => {
    const { handler, crm } = harness();
    crm.prepareServicePriceChange.mockResolvedValueOnce({
      ...prepared,
      price_rubles: 1900,
    });
    const result = await handler.normalizeArguments(
      SERVICE_PRICE_TOOL,
      principal,
      {
        ...prepared,
        price_rubles: 1900,
      },
    );
    expect(crm.prepareServicePriceChange).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      {
        service_id: '42',
        price_rubles: 1900,
      },
    );
    expect(
      registry.buildApprovalPreview(SERVICE_PRICE_TOOL, result).summary,
    ).toContain('1 700 ₽ → 1 900 ₽');
    expect(crm.applyServicePriceChange).not.toHaveBeenCalled();
  });

  it.each([
    { state: 'SUCCEEDED', confirmed: true, actionExecutionId: 'action-a' },
    { state: 'UNKNOWN', confirmed: false, actionExecutionId: 'action-a' },
  ])(
    'returns only the canonical owner outcome unchanged: $state',
    async (outcome) => {
      const { handler, crm } = harness();
      crm.applyServicePriceChange.mockResolvedValueOnce(outcome);
      expect(
        await handler.execute(
          SERVICE_PRICE_TOOL,
          principal,
          prepared,
          'approved-key',
        ),
      ).toBe(outcome);
      expect(crm.applyServicePriceChange).toHaveBeenCalledWith(
        'tenant-a',
        'owner-a',
        prepared,
        'approved-key',
      );
      expect(crm.prepareServicePriceChange).not.toHaveBeenCalled();
    },
  );

  it.each([
    UserRole.CLIENT,
    UserRole.CUSTOMER,
    UserRole.TENANT_ADMIN,
    UserRole.ADMINISTRATOR,
    UserRole.STAFF,
    UserRole.MANAGER,
    UserRole.ACCOUNTANT,
  ])('denies non-owner %s before provider preparation', async (role) => {
    const { policy, context, crm } = harness();
    await expect(
      context.runAsSystemTenant('tenant-a', () =>
        policy.assertCanExecute(
          { ...principal, role },
          registry.get(SERVICE_PRICE_TOOL),
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(crm.prepareServicePriceChange).not.toHaveBeenCalled();
  });

  it('enforces tenant context, CRM entitlement and the requesting actor', async () => {
    const { policy, context, entitlements } = harness();
    const definition = registry.get(SERVICE_PRICE_TOOL);
    await context.runAsSystemTenant('tenant-a', () =>
      policy.assertCanExecute(principal, definition),
    );
    expect(entitlements.assertFeature).toHaveBeenCalledWith(
      'tenant-a',
      'crm.integration',
    );
    await expect(
      context.runAsSystemTenant('tenant-b', () =>
        policy.assertCanExecute(principal, definition),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(policy.canDecide(definition, 'owner-a', principal)).toBe(true);
    expect(
      policy.canDecide(definition, 'owner-a', {
        ...principal,
        userId: 'owner-b',
      }),
    ).toBe(false);
    entitlements.assertFeature.mockRejectedValueOnce(
      new ForbiddenException('crm unavailable'),
    );
    await expect(
      context.runAsSystemTenant('tenant-a', () =>
        policy.assertCanExecute(principal, definition),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
