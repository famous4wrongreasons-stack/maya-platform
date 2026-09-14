import { BadGatewayException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { YooKassaClientService } from '../billing/yookassa-client.service';
import {
  P406ProviderDefinitiveError,
  P406ProviderDispatchAmbiguousError,
  type P406ProviderCheckoutRequest,
} from './p4-06-gift-certificate-executable.service';
import {
  P406ActionProviderReferenceCodec,
  P406YooKassaCheckoutProvider,
} from './p4-06-yookassa-checkout-provider';

const REQUEST: P406ProviderCheckoutRequest = {
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
        ? 'https://app.example.test/gift-certificate-return'
        : undefined,
    ),
  } as unknown as ConfigService;
  return {
    yooKassa,
    provider: new P406YooKassaCheckoutProvider(yooKassa, config),
  };
}

describe('P406YooKassaCheckoutProvider', () => {
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
      status: 'waiting_for_capture',
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

  it('distinguishes definitive rejection from ambiguous dispatch loss', async () => {
    const { provider, yooKassa } = setup();
    yooKassa.createPayment.mockRejectedValueOnce(
      new BadGatewayException({ error: { status: 422 } }),
    );
    await expect(provider.createPayment(REQUEST)).rejects.toBeInstanceOf(
      P406ProviderDefinitiveError,
    );

    yooKassa.createPayment.mockRejectedValueOnce(new Error('connection lost'));
    await expect(provider.createPayment(REQUEST)).rejects.toBeInstanceOf(
      P406ProviderDispatchAmbiguousError,
    );
  });

  it('encrypts provider references and derives a stable opaque hash', () => {
    const codec = new P406ActionProviderReferenceCodec(
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
