import type { CommunicationProviderCapabilitiesV1 } from './communication-delivery.contract';
import { CommunicationContractError } from './communication-delivery.errors';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const SHADOW_CAPABILITIES: readonly CommunicationProviderCapabilitiesV1[] = [
  {
    key: 'communication.shadow.inbox',
    version: 1,
    channel: 'inbox',
    testOnly: false,
    externalDispatchEnabled: false,
    providerIdempotencySupported: true,
    providerReferenceReturned: true,
    reconciliationSupported: false,
    proofOfNonDeliverySupported: false,
    acceptedIsTerminal: true,
    retry: {
      key: 'communication.shadow.no-dispatch',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'communication.shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
    },
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 365 * DAY,
  },
  ...['apns', 'telegram', 'smsru', 'smtp'].map(
    (provider): CommunicationProviderCapabilitiesV1 => ({
      key: `communication.shadow.${provider}`,
      version: 1,
      channel:
        provider === 'smsru' ? 'sms' : provider === 'smtp' ? 'email' : provider,
      testOnly: false,
      externalDispatchEnabled: false,
      providerIdempotencySupported: false,
      providerReferenceReturned: false,
      reconciliationSupported: false,
      proofOfNonDeliverySupported: false,
      acceptedIsTerminal: false,
      retry: {
        key: `communication.shadow.${provider}.no-dispatch`,
        version: 1,
        maxExecutionAttempts: 1,
        retryablePreDispatchErrors: new Set(),
        backoffMs: [],
      },
      reconciliation: {
        key: `communication.shadow.${provider}.manual-only`,
        version: 1,
        maxInconclusiveAttempts: 1,
      },
      payloadRetentionMs: 7 * DAY,
      auditRetentionMs: 365 * DAY,
    }),
  ),
];

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

const PRODUCTION_CAPABILITIES: readonly CommunicationProviderCapabilitiesV1[] =
  [
    {
      key: 'communication.production.web-push.client-single',
      version: 1,
      channel: 'web_push',
      testOnly: false,
      externalDispatchEnabled: true,
      providerIdempotencySupported: false,
      providerReferenceReturned: false,
      reconciliationSupported: false,
      proofOfNonDeliverySupported: false,
      acceptedIsTerminal: true,
      retry: {
        key: 'communication.production.web-push.no-blind-retry',
        version: 1,
        maxExecutionAttempts: 1,
        retryablePreDispatchErrors: new Set(),
        backoffMs: [],
      },
      reconciliation: {
        key: 'communication.production.web-push.manual-only',
        version: 1,
        maxInconclusiveAttempts: 1,
      },
      payloadRetentionMs: 7 * DAY,
      auditRetentionMs: 365 * DAY,
    },
    {
      key: 'communication.production.inbox.new-appointment',
      version: 1,
      channel: 'inbox',
      testOnly: false,
      externalDispatchEnabled: true,
      providerIdempotencySupported: true,
      providerReferenceReturned: true,
      reconciliationSupported: true,
      proofOfNonDeliverySupported: true,
      acceptedIsTerminal: true,
      retry: {
        key: 'communication.production.inbox.no-blind-retry',
        version: 1,
        maxExecutionAttempts: 1,
        retryablePreDispatchErrors: new Set(),
        backoffMs: [],
      },
      reconciliation: {
        key: 'communication.production.inbox.canonical-read',
        version: 1,
        maxInconclusiveAttempts: 2,
      },
      payloadRetentionMs: 7 * DAY,
      auditRetentionMs: 365 * DAY,
    },
    {
      key: 'communication.production.telegram.privacy',
      version: 1,
      channel: 'telegram',
      testOnly: false,
      externalDispatchEnabled: true,
      providerIdempotencySupported: false,
      providerReferenceReturned: true,
      reconciliationSupported: false,
      proofOfNonDeliverySupported: false,
      acceptedIsTerminal: true,
      retry: {
        key: 'communication.production.telegram.no-blind-retry',
        version: 1,
        maxExecutionAttempts: 1,
        retryablePreDispatchErrors: new Set(),
        backoffMs: [],
      },
      reconciliation: {
        key: 'communication.production.telegram.manual-only',
        version: 1,
        maxInconclusiveAttempts: 1,
      },
      payloadRetentionMs: 7 * DAY,
      auditRetentionMs: 365 * DAY,
    },
    {
      key: 'communication.production.inbox.package2-single',
      version: 1,
      channel: 'inbox',
      testOnly: false,
      externalDispatchEnabled: true,
      providerIdempotencySupported: true,
      providerReferenceReturned: true,
      reconciliationSupported: true,
      proofOfNonDeliverySupported: true,
      acceptedIsTerminal: true,
      retry: {
        key: 'communication.production.inbox.package2-no-blind-retry',
        version: 1,
        maxExecutionAttempts: 1,
        retryablePreDispatchErrors: new Set(),
        backoffMs: [],
      },
      reconciliation: {
        key: 'communication.production.inbox.package2-canonical-read',
        version: 1,
        maxInconclusiveAttempts: 2,
      },
      payloadRetentionMs: 7 * DAY,
      auditRetentionMs: 365 * DAY,
    },
    {
      key: 'communication.production.apns.package2-single',
      version: 1,
      channel: 'apns',
      testOnly: false,
      externalDispatchEnabled: true,
      providerIdempotencySupported: false,
      providerReferenceReturned: true,
      reconciliationSupported: false,
      proofOfNonDeliverySupported: false,
      acceptedIsTerminal: true,
      retry: {
        key: 'communication.production.apns.package2-no-blind-retry',
        version: 1,
        maxExecutionAttempts: 1,
        retryablePreDispatchErrors: new Set(),
        backoffMs: [],
      },
      reconciliation: {
        key: 'communication.production.apns.package2-manual-only',
        version: 1,
        maxInconclusiveAttempts: 1,
      },
      payloadRetentionMs: 7 * DAY,
      auditRetentionMs: 365 * DAY,
    },
    {
      key: 'communication.production.telegram.package2-single',
      version: 1,
      channel: 'telegram',
      testOnly: false,
      externalDispatchEnabled: true,
      providerIdempotencySupported: false,
      providerReferenceReturned: true,
      reconciliationSupported: false,
      proofOfNonDeliverySupported: false,
      acceptedIsTerminal: true,
      retry: {
        key: 'communication.production.telegram.package2-no-blind-retry',
        version: 1,
        maxExecutionAttempts: 1,
        retryablePreDispatchErrors: new Set(),
        backoffMs: [],
      },
      reconciliation: {
        key: 'communication.production.telegram.package2-manual-only',
        version: 1,
        maxInconclusiveAttempts: 1,
      },
      payloadRetentionMs: 7 * DAY,
      auditRetentionMs: 365 * DAY,
    },
    {
      key: 'communication.production.inbox.package2-bulk',
      version: 1,
      channel: 'inbox',
      testOnly: false,
      externalDispatchEnabled: true,
      providerIdempotencySupported: true,
      providerReferenceReturned: true,
      reconciliationSupported: true,
      proofOfNonDeliverySupported: true,
      acceptedIsTerminal: true,
      retry: {
        key: 'communication.production.inbox.package2-bulk-no-blind-retry',
        version: 1,
        maxExecutionAttempts: 1,
        retryablePreDispatchErrors: new Set(),
        backoffMs: [],
      },
      reconciliation: {
        key: 'communication.production.inbox.package2-bulk-canonical-read',
        version: 1,
        maxInconclusiveAttempts: 2,
      },
      payloadRetentionMs: 7 * DAY,
      auditRetentionMs: 365 * DAY,
    },
  ];

export class CommunicationCapabilityRegistry {
  private readonly definitions = new Map(
    [
      ...SHADOW_CAPABILITIES,
      ...TEST_CAPABILITIES,
      ...PRODUCTION_CAPABILITIES,
    ].map((definition) => [definition.key, definition]),
  );

  get(key: string): CommunicationProviderCapabilitiesV1 {
    const definition = this.definitions.get(key);
    if (!definition) {
      throw new CommunicationContractError(
        'CAPABILITY_NOT_REGISTERED',
        `Communication capability is not registered: ${key}`,
      );
    }
    return definition;
  }

  list(): readonly CommunicationProviderCapabilitiesV1[] {
    return [...this.definitions.values()];
  }
}
