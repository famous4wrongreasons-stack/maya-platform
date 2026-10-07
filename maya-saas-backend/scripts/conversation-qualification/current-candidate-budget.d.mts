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
export class CandidateBudgetGate {
  constructor(options: {
    ledgerPath: string;
    manifestSha256: string;
    candidateCommit: string;
    mode: 'OFFLINE_SYNTHETIC_ONLY';
    transport: typeof fetch;
    now?: () => number;
    wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  });
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
): Readonly<{ bytes: number; input: number; output: number; nanoUsd: number }>;
