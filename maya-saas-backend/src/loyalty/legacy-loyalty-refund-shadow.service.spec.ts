import { createHash } from 'node:crypto';

import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  LEGACY_LOYALTY_REFUND_SHADOW_BRIDGE_CONTRACT,
  LegacyLoyaltyRefundShadowDto,
} from './dto/legacy-loyalty-refund-shadow.dto';
import { LegacyLoyaltyRefundShadowService } from './legacy-loyalty-refund-shadow.service';

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

const PROVIDER_RECORD_HASH = hash([
  'tenant-a',
  'yclients',
  'provider-record-7',
]);

const validDto = (): LegacyLoyaltyRefundShadowDto => ({
  contract: LEGACY_LOYALTY_REFUND_SHADOW_BRIDGE_CONTRACT,
  provider: 'yclients',
  external_company_id: 'company-42',
  external_client_id: 'external-client-7',
  provider_record_id: 'provider-record-7',
  original_redemption_execution_id: 'redemption-execution-7',
  cancellation_evidence_kind: 'action_execution',
  cancellation_evidence_id: 'cancellation-execution-7',
  legacy_claimed_refund_points: 300,
});

function buildHarness() {
  const planShadow: jest.MockedFunction<
    ActionEngineRuntimeService['planShadow']
  > = jest.fn((request: TrustedActionExecutionRequestV1) => {
    void request;
    return Promise.resolve({ id: 'execution-refund-1' } as ActionExecution);
  });
  const clientFindUnique = jest.fn().mockResolvedValue({
    client: {
      id: 'client-canonical-7',
      userId: 'user-7',
      mergedIntoClientId: null,
    },
  });
  const accountFindUnique = jest.fn().mockResolvedValue({ id: 'account-7' });
  const appointmentFindUnique = jest.fn().mockResolvedValue({
    id: 'appointment-7',
    mayaClientId: 'client-canonical-7',
  });
  const actionExecutionFindFirst = jest.fn(
    (query: { where?: { actionClass?: string } }) => {
      if (query.where?.actionClass === 'redeem_legacy_loyalty') {
        return Promise.resolve({ id: 'redemption-execution-7' });
      }
      if (query.where?.actionClass === 'cancel_appointment') {
        return Promise.resolve({
          safeResultSummaryJson: {
            externalId: 'provider-record-7',
            status: 'canceled',
          },
        });
      }
      return Promise.resolve(null);
    },
  );
  const debitFindMany = jest.fn().mockResolvedValue([
    {
      id: 'debit-row-7',
      accountId: 'account-7',
      delta: -300,
      externalRef: PROVIDER_RECORD_HASH,
    },
  ]);
  const refundFindFirst = jest.fn().mockResolvedValue(null);
  const domainEventFindFirst = jest.fn().mockResolvedValue({
    id: 'removal-event-7',
  });
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
  const service = new LegacyLoyaltyRefundShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    {
      crmClientLink: { findUnique: clientFindUnique },
      loyaltyAccount: { findUnique: accountFindUnique },
      appointment: { findUnique: appointmentFindUnique },
      actionExecution: { findFirst: actionExecutionFindFirst },
      loyaltyTransaction: {
        findMany: debitFindMany,
        findFirst: refundFindFirst,
      },
      domainEvent: { findFirst: domainEventFindFirst },
    } as unknown as PrismaService,
    bridgeSource as unknown as BridgeSourceService,
    { runAsSystemTenant } as unknown as TenantContextService,
  );

  return {
    service,
    planShadow,
    clientFindUnique,
    appointmentFindUnique,
    actionExecutionFindFirst,
    debitFindMany,
    refundFindFirst,
    domainEventFindFirst,
    bridgeSource,
    runAsSystemTenant,
  };
}

describe('LegacyLoyaltyRefundShadowService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MAYA_LEGACY_LOYALTY_REFUND_SHADOW_ENABLED: 'true',
      MAYA_LEGACY_LOYALTY_REFUND_PER_ACTION_CAP_POINTS: '1000',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('converges repeats onto one original-redemption and removal identity', async () => {
    const setup = buildHarness();

    const first = await setup.service.planRefund(validDto());
    const second = await setup.service.planRefund(validDto());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      outcome: 'planned',
      actionExecutionId: 'execution-refund-1',
      shadowDivergences: 0,
      intendedMutation: {
        model: 'LoyaltyTransaction',
        kind: 'refund',
        deltaPoints: 300,
        originalRedemptionActionExecutionId: 'redemption-execution-7',
        atomicBalanceUpdateRequired: true,
      },
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    const [firstRequest] = setup.planShadow.mock.calls[0];
    const [secondRequest] = setup.planShadow.mock.calls[1];
    expect(secondRequest).toEqual(firstRequest);
    expect(firstRequest).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'loyalty.legacy-refund.shadow.v1',
      source: {
        type: 'legacy_bridge',
        sourceRef: 'legacy-loyalty:booking-cancellation-refund',
      },
      targetRef: 'redemption:redemption-execution-7',
      input: {
        canonicalClientId: 'client-canonical-7',
        canonicalAppointmentId: 'appointment-7',
        originalRedemptionActionExecutionId: 'redemption-execution-7',
        originalDebitRowCount: 1,
        originalDebitPoints: 300,
        legacyClaimedRefundPoints: 300,
        intendedDeltaPoints: 300,
        refundDecision: 'refund',
        refundPolicy: 'legacy-cancel-exact-ledger-compensation.v1',
        perActionCapPoints: 1000,
        capDecision: 'within_cap',
        existingRefundDecision: 'none',
        cancellationEvidence: 'proven_removed',
        divergenceCodes: [],
      },
      callerIdempotency: {
        scope: 'p4-03.refund-legacy-loyalty.shadow',
      },
    });
    expect(firstRequest.source.occurrenceScope).toContain(
      firstRequest.callerIdempotency.key,
    );
    expect(setup.runAsSystemTenant).toHaveBeenCalledWith(
      'tenant-a',
      expect.any(Function),
    );
  });

  it('preserves the same redeem evidence and refund identity after restart', async () => {
    const firstProcess = buildHarness();
    const restartedProcess = buildHarness();

    const first = await firstProcess.service.planRefund(validDto());
    const afterRestart = await restartedProcess.service.planRefund(validDto());

    expect(afterRestart).toEqual(first);
    expect(restartedProcess.planShadow.mock.calls[0]?.[0]).toEqual(
      firstProcess.planShadow.mock.calls[0]?.[0],
    );
  });

  it('normalizes cancel execution and removed event into the same action request', async () => {
    const executionEvidence = buildHarness();
    const domainEvidence = buildHarness();
    const eventDto = validDto();
    eventDto.cancellation_evidence_kind = 'domain_event';
    eventDto.cancellation_evidence_id = 'removal-event-7';

    await executionEvidence.service.planRefund(validDto());
    await domainEvidence.service.planRefund(eventDto);

    expect(domainEvidence.planShadow.mock.calls[0]?.[0]).toEqual(
      executionEvidence.planShadow.mock.calls[0]?.[0],
    );
    expect(domainEvidence.domainEventFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'removal-event-7',
        tenantId: 'tenant-a',
        type: 'appointment.removed',
        entityType: 'appointment',
        entityId: 'appointment-7',
        source: 'yclients',
        sourceRef: 'provider-record-7',
      },
      select: { id: true },
    });
  });

  it('fails closed for an unmapped or cross-tenant client', async () => {
    const setup = buildHarness();
    setup.clientFindUnique.mockResolvedValue(null);

    await expect(setup.service.planRefund(validDto())).resolves.toMatchObject({
      outcome: 'identity_unresolved',
      actionExecutionId: null,
      newPathValueMutations: 0,
      newPathProviderWrites: 0,
    });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('requires the provider record to belong to the same canonical client', async () => {
    const setup = buildHarness();
    setup.appointmentFindUnique.mockResolvedValue({
      id: 'appointment-7',
      mayaClientId: 'client-other',
    });

    await expect(setup.service.planRefund(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('requires exact tenant/account/record-bound original debit rows', async () => {
    const setup = buildHarness();
    setup.debitFindMany.mockResolvedValue([
      {
        id: 'debit-row-7',
        accountId: 'account-other',
        delta: -300,
        externalRef: PROVIDER_RECORD_HASH,
      },
    ]);

    await expect(setup.service.planRefund(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('aggregates multiple debit rows under the one original execution', async () => {
    const setup = buildHarness();
    setup.debitFindMany.mockResolvedValue([
      {
        id: 'debit-row-1',
        accountId: 'account-7',
        delta: -100,
        externalRef: PROVIDER_RECORD_HASH,
      },
      {
        id: 'debit-row-2',
        accountId: 'account-7',
        delta: -200,
        externalRef: PROVIDER_RECORD_HASH,
      },
    ]);

    const result = await setup.service.planRefund(validDto());

    expect(result.intendedMutation).toMatchObject({ deltaPoints: 300 });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      originalDebitRowCount: 2,
      originalDebitPoints: 300,
      intendedDeltaPoints: 300,
    });
  });

  it('creates no second refund intent when canonical compensation exists', async () => {
    const setup = buildHarness();
    setup.refundFindFirst.mockResolvedValue({
      id: 'refund-row-7',
      actionExecutionId: 'refund-execution-old',
      delta: 300,
    });

    const result = await setup.service.planRefund(validDto());

    expect(result).toMatchObject({
      outcome: 'planned',
      shadowDivergences: 1,
      intendedMutation: null,
      newPathValueMutations: 0,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      intendedDeltaPoints: 0,
      refundDecision: 'do_not_refund',
      existingRefundDecision: 'already_refunded',
      divergenceCodes: ['canonical_refund_already_exists'],
    });
  });

  it('fails closed when cancellation evidence is absent', async () => {
    const setup = buildHarness();
    setup.actionExecutionFindFirst.mockImplementation(
      (query: { where?: { actionClass?: string } }) =>
        Promise.resolve(
          query.where?.actionClass === 'redeem_legacy_loyalty'
            ? { id: 'redemption-execution-7' }
            : null,
        ),
    );

    await expect(setup.service.planRefund(validDto())).resolves.toMatchObject({
      outcome: 'evidence_unresolved',
      actionExecutionId: null,
    });
    expect(setup.refundFindFirst).not.toHaveBeenCalled();
    expect(setup.planShadow).not.toHaveBeenCalled();
  });

  it('uses server ledger value and cap rather than the legacy claim', async () => {
    const setup = buildHarness();
    const dto = validDto();
    dto.legacy_claimed_refund_points = 250;
    process.env.MAYA_LEGACY_LOYALTY_REFUND_PER_ACTION_CAP_POINTS = '275';

    const result = await setup.service.planRefund(dto);

    expect(result).toMatchObject({
      shadowDivergences: 2,
      intendedMutation: null,
    });
    expect(setup.planShadow.mock.calls[0]?.[0].input).toMatchObject({
      originalDebitPoints: 300,
      legacyClaimedRefundPoints: 250,
      intendedDeltaPoints: 0,
      capDecision: 'exceeds_cap',
      divergenceCodes: [
        'legacy_refund_points_mismatch',
        'per_action_cap_exceeded',
      ],
    });
  });

  it('rejects initiator-supplied authority, amount, and binding fields', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => new BadRequestException(errors),
    });

    for (const forged of [
      { tenantId: 'tenant-b' },
      { canonicalClientId: 'client-forged' },
      { points: 1 },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { cancellationProven: true },
      { approvalBindingHash: 'forged' },
      { executor: 'legacy.direct' },
    ]) {
      await expect(
        pipe.transform(
          { ...validDto(), ...forged },
          { type: 'body', metatype: LegacyLoyaltyRefundShadowDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
