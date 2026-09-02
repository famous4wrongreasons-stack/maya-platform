import type { ActionExecution } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  P4_08_SHADOW_CAPABILITIES,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import type { ActionEngineRuntimeService } from '../action-engine/action-engine.runtime';
import { TenantBillingCanonicalShadowService } from './tenant-billing-canonical-shadow.service';

describe('TenantBillingCanonicalShadowService', () => {
  it.each([
    [P4_08_SHADOW_CAPABILITIES.checkout, 'initiate_tenant_billing_checkout'],
    [P4_08_SHADOW_CAPABILITIES.recurring, 'charge_tenant_billing_recurring'],
    [P4_08_SHADOW_CAPABILITIES.outcome, 'apply_tenant_billing_payment_outcome'],
    [P4_08_SHADOW_CAPABILITIES.pastDue, 'transition_tenant_billing_past_due'],
  ])(
    'plans %s without a business side effect',
    async (capability, actionClass) => {
      const planShadow = jest.fn().mockResolvedValue({ id: 'execution_1' });
      const service = new TenantBillingCanonicalShadowService({
        planShadow,
      } as unknown as ActionEngineRuntimeService);
      const request = {
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId: 'tenant_1',
        capability,
        source: { type: 'legacy_bridge', occurrenceScope: 'shadow_1' },
        targetRef: 'target_1',
        input: {},
        evidenceRefs: ['server_evidence_1'],
      } satisfies TrustedActionExecutionRequestV1;

      await expect(service.plan(request)).resolves.toEqual({
        actionClass,
        actionExecutionId: 'execution_1',
        shadowDivergences: 0,
        providerPaymentsCreated: 0,
        paymentMutations: 0,
        entitlementMutations: 0,
        providerWrites: 0,
      });
      expect(planShadow).toHaveBeenCalledWith(request);
    },
  );

  it('does not accept an unrelated capability', async () => {
    const service = new TenantBillingCanonicalShadowService({
      planShadow: jest.fn<Promise<ActionExecution>, never[]>(),
    } as unknown as ActionEngineRuntimeService);
    await expect(
      service.plan({ capability: 'billing.direct.write' } as never),
    ).rejects.toThrow('not registered');
  });
});
