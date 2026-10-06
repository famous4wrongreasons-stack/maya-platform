import { Injectable } from '@nestjs/common';
import { actionCapabilityRegistry } from '../authority/contract-bindings';
import { isCataloguePriceConfiguration } from '../pricing/service-price-widget.contract';
import type {
  ActuatingRoutingInput,
  ApprovalRequestOwnerPort,
} from '../routing/effect-router.ports';
import { ApprovalRequestAdapter } from './approval-request.adapter';
import { ServicePriceApprovalAdapter } from './service-price-approval.adapter';

/** Existing B35 stays on its exact owner; only the registered configuration subtype uses the typed AI owner. */
@Injectable()
export class CanonicalApprovalAdapter implements ApprovalRequestOwnerPort {
  constructor(
    private readonly b35: ApprovalRequestAdapter,
    private readonly price: ServicePriceApprovalAdapter,
  ) {}
  request(input: ActuatingRoutingInput) {
    return this.b35.request(input);
  }
  decide(input: ActuatingRoutingInput) {
    const cap = actionCapabilityRegistry.tryGet(
      input.routing.record.capabilityKey ?? '',
    );
    return cap && isCataloguePriceConfiguration(cap)
      ? this.price.decide(input)
      : this.b35.decide(input);
  }
}
