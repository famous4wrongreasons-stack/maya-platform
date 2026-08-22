import type { CommunicationProviderCapabilitiesV1 } from './communication-delivery.contract';
import { CommunicationContractError } from './communication-delivery.errors';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const TEST_CAPABILITIES: readonly CommunicationProviderCapabilitiesV1[] = [
  {
    key: 'communication.test.reconcilable',
    version: 1,
    channel: 'test',
    testOnly: true,
    externalDispatchEnabled: false,
    providerIdempotencySupported: true,
    providerReferenceReturned: true,
    reconciliationSupported: true,
    proofOfNonDeliverySupported: true,
    acceptedIsTerminal: false,
    retry: {
      key: 'communication.test.safe-pre-dispatch',
      version: 1,
      maxExecutionAttempts: 2,
      retryablePreDispatchErrors: new Set(['synthetic_pre_dispatch']),
      backoffMs: [0, MINUTE],
    },
    reconciliation: {
      key: 'communication.test.provider-status',
      version: 1,
      maxInconclusiveAttempts: 2,
    },
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 90 * DAY,
  },
  {
    key: 'communication.test.accepted-terminal',
    version: 1,
    channel: 'test',
    testOnly: true,
    externalDispatchEnabled: false,
    providerIdempotencySupported: true,
    providerReferenceReturned: true,
    reconciliationSupported: false,
    proofOfNonDeliverySupported: false,
    acceptedIsTerminal: true,
    retry: {
      key: 'communication.test.no-retry',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'communication.test.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
    },
    payloadRetentionMs: DAY,
    auditRetentionMs: 30 * DAY,
  },
  {
    key: 'communication.test.opaque-provider',
    version: 1,
    channel: 'test',
    testOnly: true,
    externalDispatchEnabled: false,
    providerIdempotencySupported: false,
    providerReferenceReturned: false,
    reconciliationSupported: false,
    proofOfNonDeliverySupported: false,
    acceptedIsTerminal: false,
    retry: {
      key: 'communication.test.opaque-no-retry',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'communication.test.manual-only',
      version: 1,
      maxInconclusiveAttempts: 1,
    },
    payloadRetentionMs: DAY,
    auditRetentionMs: 30 * DAY,
  },
];

export class CommunicationCapabilityRegistry {
  private readonly definitions = new Map(
    TEST_CAPABILITIES.map((definition) => [definition.key, definition]),
  );

  get(key: string): CommunicationProviderCapabilitiesV1 {
    const definition = this.definitions.get(key);
    if (!definition) {
      throw new CommunicationContractError(
        'CAPABILITY_NOT_REGISTERED',
        `Communication capability is not registered: ${key}`,
      );
    }
    if (!definition.testOnly || definition.externalDispatchEnabled) {
      throw new CommunicationContractError(
        'EXTERNAL_DISPATCH_FORBIDDEN',
        'B3.1 accepts only test-only capabilities with dispatch disabled',
      );
    }
    return definition;
  }

  list(): readonly CommunicationProviderCapabilitiesV1[] {
    return [...this.definitions.values()];
  }
}
