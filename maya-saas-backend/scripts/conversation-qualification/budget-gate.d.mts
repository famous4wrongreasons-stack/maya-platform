export class PilotBudgetGate {
  constructor(options: {
    ledgerPath: string;
    approved?: boolean;
    resume?: boolean;
    transport: typeof fetch;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  });
  requests: number;
  reservedNanoUsd: number;
  dialog(): void;
  turn(): void;
  endTurn(): void;
  fetch: typeof fetch;
  close(): void;
}
