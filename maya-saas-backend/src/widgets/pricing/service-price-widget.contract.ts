import type { RegisteredActionCapabilityV1 } from '../../action-engine/action-engine.contract';
import { normalizeServicePriceInput } from '../../action-engine/service-price.contract';
import { SERVICE_PRICE_CAPABILITY } from '../../crm/yclients-service-price.contract';

/** V1.4 YC-SP1-WIDGET-1: a financial configuration subtype, never a payment authority. */
export const CATALOGUE_PRICE_CONFIGURATION =
  'catalogue_price_configuration' as const;

const EXACT_RISK_FACETS = Object.freeze([
  'ac2',
  'external',
  'one_target',
  'financial',
  'explicit_actor_approval',
]);

/**
 * Closed admission over the registered semantic contract. A matching key, input label or
 * `financial` facet alone cannot grant the approved exception. Any widened contract returns
 * to the ordinary MONEY veto until independently versioned. The owner still checks the
 * live tenant/OWNER, exact approval hash, source revision and one fixed RUB service at use.
 */
export const isCataloguePriceConfiguration = (
  cap: RegisteredActionCapabilityV1,
): boolean =>
  cap.capability === SERVICE_PRICE_CAPABILITY &&
  cap.capabilityVersion === 1 &&
  cap.actionClass === 'update_crm_service_fixed_price' &&
  cap.targetKind === 'crm_service' &&
  cap.normalizedInputContract === 'maya.crm-service-fixed-price/1' &&
  cap.normalizeInput === normalizeServicePriceInput &&
  cap.identityVersion === 1 &&
  cap.riskProfileVersion === 1 &&
  cap.riskFacets.length === EXACT_RISK_FACETS.length &&
  EXACT_RISK_FACETS.every((facet) => cap.riskFacets.includes(facet)) &&
  cap.allowedSourceTypes.length === 1 &&
  cap.allowedSourceTypes[0] === 'authenticated_request' &&
  cap.policyKey === 'production.crm-service-price.confirmed-request' &&
  cap.policyVersion === 1 &&
  cap.policyDecision === 'ALLOW' &&
  cap.autonomyLevel === 'L2_CONFIRMED_REQUEST' &&
  cap.approvalRequirement === 'NONE' &&
  cap.approvalTtlMs === undefined &&
  cap.transportIdentityVersion === 1 &&
  cap.executorKey === 'crm.service.fixed-price' &&
  cap.executorVersion === 1 &&
  cap.retry.key === 'crm-service-price.no-redispatch' &&
  cap.retry.version === 1 &&
  cap.retry.maxExecutionAttempts === 1 &&
  cap.retry.retryablePreDispatchErrors.size === 0 &&
  cap.retry.backoffMs.length === 0 &&
  cap.reconciliation.key === 'crm-service-price.unattributed-readback-hold' &&
  cap.reconciliation.version === 1 &&
  cap.reconciliation.maxInconclusiveAttempts === 1 &&
  cap.reconciliation.retryAfterProvenNonExecution === false;
