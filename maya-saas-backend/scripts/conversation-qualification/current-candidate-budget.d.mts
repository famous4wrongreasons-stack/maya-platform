export const CANDIDATE_LIMITS: Readonly<{
  model: string;
  dialogs: number;
  turns: number;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  outputPerAttempt: number;
  spendNanoUsd: number;
  durationMs: number;
  timeoutMs: number;
  intervalMs: number;
  requestBytes: number;
  responseBytes: number;
  inputNanoUsdPerToken: number;
  outputNanoUsdPerToken: number;
  pricingStatus: string;
}>;
export const CORE_DIAGNOSTIC_PROFILE: 'core-diagnostic-20261008/1';
export const CORE_DIAGNOSTIC_LIMITS: typeof CANDIDATE_LIMITS &
  Readonly<{ concurrency: 1 }>;
export const CORE_DIAGNOSTIC_LIMITS_SHA256: string;
export type CandidateAdmissionBinding = Readonly<{
  candidateCommit: string;
  manifestSha256: string;
  profile: typeof CORE_DIAGNOSTIC_PROFILE;
  limitsSha256: string;
}>;
type CandidateBudgetOptions = {
  ledgerPath: string;
  manifestSha256: string;
  candidateCommit: string;
  transport: typeof fetch;
} & (
  | {
      mode: 'OFFLINE_SYNTHETIC_ONLY';
      profile?: typeof CORE_DIAGNOSTIC_PROFILE;
      assertAdmission?: never;
      now?: () => number;
      wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
    }
  | {
      mode: 'ADMITTED_MODEL_ONLY';
      profile: typeof CORE_DIAGNOSTIC_PROFILE;
      /** Server-only synchronous permit check. No returned permit or secret. */
      assertAdmission: (binding: CandidateAdmissionBinding) => undefined;
      now?: never;
      wait?: never;
    }
);
export class CandidateBudgetGate {
  constructor(options: CandidateBudgetOptions);
  readonly stats: Readonly<{
    dialogs: number;
    turns: number;
    attempts: number;
    inputTokens: number;
    outputTokens: number;
    reservedNanoUsd: number;
    halted: boolean;
  }>;
  dialog(): void;
  turn(): void;
  endTurn(): void;
  close(): void;
  fetch: typeof fetch;
}
export function candidateReservation(
  url: Parameters<typeof fetch>[0],
  init: RequestInit,
  profile?: typeof CORE_DIAGNOSTIC_PROFILE,
): Readonly<{ bytes: number; input: number; output: number; nanoUsd: number }>;
