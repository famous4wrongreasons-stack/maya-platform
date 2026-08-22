export class CommunicationDeliveryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CommunicationDeliveryError';
  }
}

export class CommunicationContractError extends CommunicationDeliveryError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'CommunicationContractError';
  }
}

export class CommunicationConflictError extends CommunicationDeliveryError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'CommunicationConflictError';
  }
}

export class CommunicationClaimError extends CommunicationDeliveryError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'CommunicationClaimError';
  }
}

export class CommunicationLeaseError extends CommunicationDeliveryError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'CommunicationLeaseError';
  }
}
