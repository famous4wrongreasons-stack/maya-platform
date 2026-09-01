import { BadGatewayException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { YooKassaClientService } from '../billing/yookassa-client.service';
import {
  P405ProviderDefinitiveError,
  P405ProviderDispatchAmbiguousError,
  type P405ProviderCheckoutRequest,
} from './p4-05-customer-subscription-executable.service';
import {
  P405ActionProviderReferenceCodec,
  P405YooKassaCheckoutProvider,
} from './p4-05-yookassa-checkout-provider';

const REQUEST: P405ProviderCheckoutRequest = {
  idempotencyKey: 'transport-key-1',
  amountKopecks: 12_345,
  currency: 'RUB',
  metadata: {
    tenant_id: 'tenant-1',
    checkout_execution_id: 'execution-1',
  },
};

function setup() {
  const yooKassa = {
    isConfigured: jest.fn(() => true),
    createPayment: jest.fn(),
    getPayment: jest.fn(),
  } as unknown as jest.Mocked<YooKassaClientService>;
  const config = {
    get: jest.fn((name: string) =>
      name === 'YOOKASSA_RETURN_URL'
        ? 'https://app.example.test/subscription-return'
        : undefined,
    ),
  } as unknown as ConfigService;
  return {
    yooKassa,
    provider: new P405YooKassaCheckoutProvider(yooKassa, config),
  };
}

describe('P405YooKassaCheckoutProvider', () => {
  it('maps a known pending checkout and returns its presentation URL', async () => {
    const { provider, yooKassa } = setup();
    yooKassa.createPayment.mockResolvedValue({
      id: 'payment-1',
      status: 'waiting_for_capture',
      paid: false,
      amount: { value: '123.45', currency: 'RUB' },
      confirmation: {
        type: 'redirect',
        confirmation_url: 'https://yookassa.example.test/checkout/payment-1',
      },
      metadata: { ...REQUEST.metadata },
    });

    await expect(provider.createPayment(REQUEST)).resolves.toMatchObject({
      id: 'payment-1',
      status: 'pending',
      amountKopecks: 12_345,
      currency: 'RUB',
      confirmationUrl: 'https://yookassa.example.test/checkout/payment-1',
    });
    expect(yooKassa.createPayment.mock.calls).toContainEqual([
      expect.objectContaining({
        amount: { value: '123.45', currency: 'RUB' },
        capture: true,
        metadata: REQUEST.metadata,
      }),
      REQUEST.idempotencyKey,
    ]);
  });

  it('reconciles only with the original key and byte-equivalent request', async () => {
    const { provider, yooKassa } = setup();
    yooKassa.createPayment.mockResolvedValue({
      id: 'payment-1',
      status: 'pending',
      paid: false,
      amount: { value: '123.45', currency: 'RUB' },
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

  it('distinguishes definitive provider rejection from ambiguous dispatch loss', async () => {
    const { provider, yooKassa } = setup();
    yooKassa.createPayment.mockRejectedValueOnce(
      new BadGatewayException({ error: { status: 422 } }),
    );
    await expect(provider.createPayment(REQUEST)).rejects.toBeInstanceOf(
      P405ProviderDefinitiveError,
    );

    yooKassa.createPayment.mockRejectedValueOnce(new Error('connection lost'));
    await expect(provider.createPayment(REQUEST)).rejects.toBeInstanceOf(
      P405ProviderDispatchAmbiguousError,
    );
  });

  it('encrypts provider references and derives a stable opaque lookup hash', () => {
    const codec = new P405ActionProviderReferenceCodec(
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
