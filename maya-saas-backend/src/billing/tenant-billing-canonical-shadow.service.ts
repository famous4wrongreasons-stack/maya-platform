import { Injectable } from '@nestjs/common';

import {
  P4_08_SHADOW_CAPABILITIES,
  type P408ActionClass,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { ActionEngineRuntimeService } from '../action-engine/action-engine.runtime';

export interface TenantBillingShadowResult {
  actionClass: P408ActionClass;
  actionExecutionId: string;
  shadowDivergences: 0;
  providerPaymentsCreated: 0;
  paymentMutations: 0;
  entitlementMutations: 0;
  providerWrites: 0;
}

const ACTION_BY_CAPABILITY = new Map<string, P408ActionClass>([
  [P4_08_SHADOW_CAPABILITIES.checkout, 'initiate_tenant_billing_checkout'],
  [P4_08_SHADOW_CAPABILITIES.recurring, 'charge_tenant_billing_recurring'],
  [P4_08_SHADOW_CAPABILITIES.outcome, 'apply_tenant_billing_payment_outcome'],
  [P4_08_SHADOW_CAPABILITIES.pastDue, 'transition_tenant_billing_past_due'],
]);

/**
 * Non-executable P4-08 surface. Callers must build the request from
 * authenticated tenant context plus server catalog/provider reads. The
 * capability registry rejects caller-selected monetary, policy, state and cap
 * fields before the policy-denied ActionExecution is persisted.
 */
@Injectable()
export class TenantBillingCanonicalShadowService {
  constructor(private readonly actionEngine: ActionEngineRuntimeService) {}

  async plan(
    request: TrustedActionExecutionRequestV1,
  ): Promise<TenantBillingShadowResult> {
    const actionClass = ACTION_BY_CAPABILITY.get(request.capability);
    if (!actionClass) {
      throw new Error('P4-08 Shadow capability is not registered');
    }
    const execution = await this.actionEngine.planShadow(request);
    return {
      actionClass,
      actionExecutionId: execution.id,
      shadowDivergences: 0,
      providerPaymentsCreated: 0,
      paymentMutations: 0,
      entitlementMutations: 0,
      providerWrites: 0,
    };
  }
}
