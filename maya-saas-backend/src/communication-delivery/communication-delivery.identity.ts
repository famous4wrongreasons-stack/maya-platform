import { ActionIdentityService } from '../action-engine';

export class CommunicationDeliveryIdentity {
  private readonly identity: ActionIdentityService;

  constructor(identitySecret: string, payloadEncryptionSecret: string) {
    this.identity = new ActionIdentityService(
      identitySecret,
      payloadEncryptionSecret,
    );
  }

  hashOpaqueRef(
    tenantId: string,
    recipientKind: string,
    value: string,
  ): string {
    return this.identity.hmac('maya.communication-recipient-ref/1', {
      tenantId,
      recipientKind,
      value,
    });
  }

  campaignIdentity(input: {
    tenantId: string;
    actionIdentityFingerprint: string;
    callerKey: string;
    scope: string;
    channel: string;
    contentIdentityHash: string;
  }): string {
    return this.identity.hmac('maya.communication-campaign/1', input);
  }

  deliveryIdentity(input: {
    identityVersion: number;
    tenantId: string;
    actionIdentityFingerprint: string;
    campaignIdempotencyKey: string;
    recipientKind: string;
    recipientRefHash: string;
    channel: string;
    contentIdentityHash: string;
  }): string {
    return this.identity.hmac('maya.logical-communication-delivery/1', input);
  }

  providerRequestIdentity(input: {
    tenantId: string;
    deliveryIdentity: string;
    capabilityKey: string;
    capabilityVersion: number;
  }): string {
    return this.identity.hmac('maya.communication-provider-request/1', input);
  }

  leaseTokenHash(input: {
    tenantId: string;
    recipientId: string;
    leaseToken: string;
  }): string {
    return this.identity.hmac('maya.communication-lease/1', input);
  }

  safeHash(namespace: string, value: unknown): string {
    return this.identity.hmac(namespace, value);
  }

  encryptProviderReference(value: string): string {
    return this.identity.encryptNormalizedPayload(value);
  }
}
