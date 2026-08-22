import type { CommunicationReconciliationOutcome } from './communication-delivery.contract';
import { CommunicationContractError } from './communication-delivery.errors';

export type ScriptedDispatchOutcome =
  | {
      kind: 'ACCEPTED' | 'DELIVERED';
      outcomeCode: string;
      providerReference?: string;
    }
  | { kind: 'REJECTED'; outcomeCode: string; errorCode: string }
  | { kind: 'PRE_DISPATCH_FAILURE'; outcomeCode: string; errorCode: string }
  | { kind: 'UNKNOWN'; outcomeCode: string; errorCode: string };

export interface ScriptedReconciliationResult {
  outcome: CommunicationReconciliationOutcome;
  outcomeCode?: string;
  providerReference?: string;
}

/**
 * B3.1 proof adapter. It returns pre-scripted outcomes and has no transport,
 * credential, network client, or production capability registration path.
 */
export class ScriptedCommunicationTestAdapter {
  readonly testOnly = true as const;
  readonly externalDispatchEnabled = false as const;
  readonly externalMessagesSent = 0 as const;

  private dispatchCursor = 0;
  private reconciliationCursor = 0;

  constructor(
    readonly capabilityKey: `communication.test.${string}`,
    private readonly dispatchOutcomes: readonly ScriptedDispatchOutcome[],
    private readonly reconciliationOutcomes: readonly ScriptedReconciliationResult[] = [],
  ) {
    if (!capabilityKey.startsWith('communication.test.')) {
      throw new CommunicationContractError(
        'TEST_ADAPTER_CAPABILITY_REQUIRED',
        'Scripted adapter accepts only communication.test.* capabilities',
      );
    }
  }

  nextDispatch(): ScriptedDispatchOutcome {
    const outcome = this.dispatchOutcomes[this.dispatchCursor];
    if (!outcome) {
      throw new CommunicationContractError(
        'SCRIPTED_DISPATCH_OUTCOME_MISSING',
        'No scripted dispatch outcome remains',
      );
    }
    this.dispatchCursor += 1;
    return outcome;
  }

  nextReconciliation(): ScriptedReconciliationResult {
    const outcome = this.reconciliationOutcomes[this.reconciliationCursor];
    if (!outcome) {
      throw new CommunicationContractError(
        'SCRIPTED_RECONCILIATION_OUTCOME_MISSING',
        'No scripted reconciliation outcome remains',
      );
    }
    this.reconciliationCursor += 1;
    return outcome;
  }
}
