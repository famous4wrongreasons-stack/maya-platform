import { ConfigService } from '@nestjs/config';

import { P410YooKassaCredentialVerifier } from './p4-10-yookassa-credential-verifier';

describe('P410YooKassaCredentialVerifier', () => {
  afterEach(() => jest.restoreAllMocks());

  function verifier() {
    return new P410YooKassaCredentialVerifier(
      new ConfigService({
        YOOKASSA_API_BASE_URL: 'https://provider.invalid/v3/',
        YOOKASSA_REQUEST_TIMEOUT_MS: '5000',
      }),
    );
  }

  it.each([
    [200, true, 'ACCEPTED', null],
    [401, false, 'REJECTED', 'commerce_credentials_rejected'],
    [403, false, 'REJECTED', 'commerce_credentials_rejected'],
    [503, false, 'UNAVAILABLE', 'commerce_provider_error'],
  ] as const)(
    'maps read-only HTTP %s to %s',
    async (status, ok, outcome, errorCode) => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        status,
        ok,
      } as Response);
      const result = await verifier().verify('shop-id', 'secret-key');
      expect(result).toMatchObject({ outcome, errorCode, providerWrites: 0 });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://provider.invalid/v3/payments?limit=1',
        expect.objectContaining({ method: 'GET' }),
      );
    },
  );

  it('treats transport loss as an unavailable read, never as payment UNKNOWN', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
    await expect(verifier().verify('shop-id', 'secret-key')).resolves.toEqual({
      outcome: 'UNAVAILABLE',
      errorCode: 'commerce_provider_unavailable',
      httpStatus: null,
      providerWrites: 0,
    });
  });
});
