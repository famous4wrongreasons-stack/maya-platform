import { BadRequestException } from '@nestjs/common';

import { ClientChannelRuntimeService } from './client-channel-runtime.service';

function fixture(linked = false) {
  const status = jest
    .fn()
    .mockResolvedValueOnce({ linked })
    .mockResolvedValue({ linked: true });
  const issue = jest.fn().mockResolvedValue({ token: 'opaque-token' });
  const consume = jest.fn().mockResolvedValue({ link: { id: 'link-1' } });
  const resolve = jest.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    clientId: 'client-1',
    linkId: 'link-1',
  });
  const submitConsent = jest
    .fn<Promise<{ accepted: boolean }>, [string, Record<string, unknown>]>()
    .mockResolvedValue({ accepted: true });
  const service = Object.assign(
    Object.create(ClientChannelRuntimeService.prototype) as object,
    {
      prisma: {
        $transaction: jest.fn((work: (tx: object) => unknown) => work({})),
      },
      status,
      issue,
      consume,
      resolve,
      submitConsent,
    },
  ) as ClientChannelRuntimeService;
  return { service, status, issue, consume, resolve, submitConsent };
}

describe('legacy native consent compatibility ingress', () => {
  it('creates the verified link before canonical consent for an unlinked session', async () => {
    const { service, issue, consume, submitConsent } = fixture(false);

    await service.submitLegacyNativeConsent('maya-session-proof', {
      privacyConsent: true,
      marketingConsent: false,
    });

    expect(issue).toHaveBeenCalledWith('maya-session-proof');
    expect(consume).toHaveBeenCalledWith('maya-session-proof', 'opaque-token');
    const call = submitConsent.mock.calls[0];
    expect(call[0]).toBe('maya-session-proof');
    expect(call[1].privacy).toBe(true);
    expect(call[1].marketing).toBe(false);
    expect(call[1].idempotencyKey).toMatch(
      /^legacy-native-consent:[0-9a-f]{64}$/,
    );
  });

  it('reuses an active verified link and a stable decision identity', async () => {
    const first = fixture(true);
    const second = fixture(true);
    const input = { privacyConsent: true, marketingConsent: true };

    await first.service.submitLegacyNativeConsent('maya-session-proof', input);
    await second.service.submitLegacyNativeConsent('maya-session-proof', input);

    expect(first.issue).not.toHaveBeenCalled();
    expect(first.consume).not.toHaveBeenCalled();
    expect(first.submitConsent.mock.calls[0][1]).toEqual(
      second.submitConsent.mock.calls[0][1],
    );
  });

  it('accepts a concurrent canonical link winner but no unresolved failure', async () => {
    const winner = fixture(false);
    winner.consume.mockRejectedValue(new Error('unique conflict'));
    await expect(
      winner.service.submitLegacyNativeConsent('maya-session-proof', {
        privacyConsent: true,
        marketingConsent: false,
      }),
    ).resolves.toEqual({ accepted: true });

    const unresolved = fixture(false);
    unresolved.consume.mockRejectedValue(new Error('unique conflict'));
    unresolved.status.mockReset().mockResolvedValue({ linked: false });
    await expect(
      unresolved.service.submitLegacyNativeConsent('maya-session-proof', {
        privacyConsent: true,
        marketingConsent: false,
      }),
    ).rejects.toThrow('unique conflict');
  });

  it('rejects broader legacy profile payloads', async () => {
    const { service, issue, submitConsent } = fixture(false);
    await expect(
      service.submitLegacyNativeConsent('maya-session-proof', {
        privacyConsent: true,
        marketingConsent: false,
        preferredLocale: 'ru',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(issue).not.toHaveBeenCalled();
    expect(submitConsent).not.toHaveBeenCalled();
  });
});
