export class ActionEngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ActionEngineError';
  }
}

export class ActionContractError extends ActionEngineError {
  constructor(message: string) {
    super('ACTION_CONTRACT_INVALID', message);
    this.name = 'ActionContractError';
  }
}

export class ActionConflictError extends ActionEngineError {
  constructor(message: string) {
    super('ACTION_IDEMPOTENCY_CONFLICT', message);
    this.name = 'ActionConflictError';
  }
}

export class ActionClaimError extends ActionEngineError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'ActionClaimError';
  }
}

export class ActionLeaseError extends ActionEngineError {
  constructor(message: string) {
    super('ACTION_LEASE_INVALID', message);
    this.name = 'ActionLeaseError';
  }
}
