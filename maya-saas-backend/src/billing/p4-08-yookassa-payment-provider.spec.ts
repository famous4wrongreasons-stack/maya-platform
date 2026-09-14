import { BadGatewayException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import {
  P408ProviderDefinitiveError,
  P408ProviderDispatchAmbiguousError,
  type P408ProviderPaymentRequest,
} from './p4-08-tenant-billing-executable.service';
import {
  P408ActionProviderReferenceCodec,
  P408YooKassaPaymentProvider,
} from './p4-08-yookassa-payment-provider';
import type { YooKassaClientService } from './yookassa-client.service';

const REQUEST: P408ProviderPaymentRequest = {
  idempotencyKey: 'transport-key-1',
  amountKopecks: 299_000,
  currency: 'RUB',
  paymentMethodId: null,
  metadata: {
    tenant_id: 'tenant-1',
    plan_id: 'plan-1',
    billing_payment_id: 'payment-local-1',
    origin_action_execution_id: 'execution-1',
    purpose: 'initial_checkout',
  },
};

function setup() {
  const yooKassa = {
    isConfigured: jest.fn(() => true),
    createPayment: jest.fn(),
    getPayment: jest.fn(),
  } as unknown as jest.Mocked<YooKassaClientService>;
  const config = {
    get: jest.fn((name: string) => {
      if (name === 'YOOKASSA_RETURN_URL') {
        return 'https://app.example.test/billing-return';
      }
      if (name === 'PUBLIC_APP_URL') return 'https://app.example.test';
      return undefined;
    }),
  } as unknown as ConfigService;
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Tenant One' }),
    },
    subscriptionPlan: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Business' }),
    },
  } as unknown as PrismaService;
  return {
    yooKassa,
    provider: new P408YooKassaPaymentProvider(yooKassa, config, prisma),
  };
}

describe('P408YooKassaPaymentProvider', () => {
  it('dispatches a canonical checkout with the exact transport key', async () => {
    const { provider, yooKassa } = setup();
    yooKassa.createPayment.mockResolvedValue({
      id: 'provider-payment-1',
      status: 'pending',
      paid: false,
      amount: { value: '2990.00', currency: 'RUB' },
      confirmation: {
        type: 'redirect',
        confirmation_url: 'https://yookassa.example.test/p/1',
      },
      metadata: { ...REQUEST.metadata },
    });

    await expect(provider.createPayment(REQUEST)).resolves.toMatchObject({
      id: 'provider-payment-1',
      status: 'pending',
      amountKopecks: 299_000,
      confirmationUrl: 'https://yookassa.example.test/p/1',
      returnUrl: 'https://app.example.test/billing-return',
    });
    expect(yooKassa.createPayment.mock.calls).toContainEqual([
      expect.objectContaining({
        amount: { value: '2990.00', currency: 'RUB' },
        metadata: REQUEST.metadata,
      }),
      REQUEST.idempotencyKey,
    ]);
  });

  it('uses only the exact original request/key for UNKNOWN reconciliation', async () => {
    const { provider, yooKassa } = setup();
    yooKassa.createPayment.mockResolvedValueOnce({
      id: 'provider-payment-1',
      status: 'pending',
      paid: false,
      amount: { value: '2990.00', currency: 'RUB' },
      metadata: { ...REQUEST.metadata },
    });
    await expect(
      provider.reconcileByIdempotencyKey(REQUEST),
    ).resolves.toMatchObject({ outcome: 'FOUND' });
    expect(yooKassa.createPayment.mock.calls).toContainEqual([
      expect.objectContaining({ metadata: REQUEST.metadata }),
      REQUEST.idempotencyKey,
    ]);

    yooKassa.createPayment.mockRejectedValueOnce(new Error('timeout'));
    await expect(provider.reconcileByIdempotencyKey(REQUEST)).resolves.toEqual({
      outcome: 'UNKNOWN',
    });
  });

  it('distinguishes definitive rejection from ambiguous dispatch/read loss', async () => {
    const { provider, yooKassa } = setup();
    yooKassa.createPayment.mockRejectedValueOnce(
      new BadGatewayException({ error: { status: 422 } }),
    );
    await expect(provider.createPayment(REQUEST)).rejects.toBeInstanceOf(
      P408ProviderDefinitiveError,
    );

    yooKassa.createPayment.mockRejectedValueOnce(new Error('connection lost'));
    await expect(provider.createPayment(REQUEST)).rejects.toBeInstanceOf(
      P408ProviderDispatchAmbiguousError,
    );
    yooKassa.getPayment.mockRejectedValueOnce(new Error('read timeout'));
    await expect(
      provider.getPayment('provider-payment-1'),
    ).rejects.toBeInstanceOf(P408ProviderDispatchAmbiguousError);
  });

  it('accepts only approved return origins and protects provider references', () => {
    const { provider } = setup();
    expect(
      provider.checkoutReturnUrl('https://app.example.test/return/path'),
    ).toBe('https://app.example.test/billing-return');
    expect(() =>
      provider.checkoutReturnUrl('https://attacker.example/steal'),
    ).toThrow(P408ProviderDefinitiveError);

    const codec = new P408ActionProviderReferenceCodec(
      'identity-secret-at-least-thirty-two-chars',
      'payload-secret-at-least-thirty-two-chars',
    );
    const raw = 'provider-payment-reference';
    const encrypted = codec.encrypt(raw);
    expect(encrypted).not.toContain(raw);
    expect(codec.decrypt(encrypted)).toBe(raw);
    expect(codec.hash(raw)).toBe(codec.hash(raw));
    expect(codec.hash(raw)).not.toContain(raw);
  });
});
