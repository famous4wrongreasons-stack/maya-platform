import { BadRequestException } from '@nestjs/common';
import { ClientChannelRuntimeService } from './client-channel-runtime.service';
function fixture() {
  const effects = {
    status: jest.fn(),
    issue: jest.fn(),
    consume: jest.fn(),
    resolve: jest.fn(),
    submitConsent: jest
      .fn<
        Promise<{ accepted: boolean }>,
        [
          string,
          { privacy: boolean; marketing: boolean; idempotencyKey: string },
        ]
      >()
      .mockResolvedValue({ accepted: true }),
  };
  const service = Object.assign(
    Object.create(ClientChannelRuntimeService.prototype) as object,
    effects,
  ) as ClientChannelRuntimeService;
  return { service, ...effects };
}
const grants = { privacyConsent: true, marketingConsent: true };
describe('keyed native consent compatibility ingress', () => {
  it.each([undefined, '', 'short', 'invalid/key'])(
    'fails closed for invalid/missing event identity %s before effects',
    async (key) => {
      const { service, ...effects } = fixture();
      await expect(
        service.submitLegacyNativeConsent('session', grants, key),
      ).rejects.toThrow('consent_transition_identity_required');
      for (const effect of Object.values(effects))
        expect(effect).not.toHaveBeenCalled();
    },
  );
  it('forwards the exact durable event identity without creating a challenge or binding', async () => {
    const { service, submitConsent, issue, consume } = fixture();
    await service.submitLegacyNativeConsent(
      'session',
      grants,
      'explicit-event-G1',
    );
    expect(submitConsent).toHaveBeenCalledWith('session', {
      privacy: true,
      marketing: true,
      idempotencyKey: 'explicit-event-G1',
    });
    expect(issue).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });
  it('preserves G1 / R1 / G2 identities and exact retries through the canonical owner', async () => {
    const { service, submitConsent } = fixture();
    for (const [key, value] of [
      ['explicit-event-G1', true],
      ['explicit-event-R1', false],
      ['explicit-event-G2', true],
    ] as const) {
      for (let retry = 0; retry < 2; retry++)
        await service.submitLegacyNativeConsent(
          'session',
          { privacyConsent: value, marketingConsent: value },
          key,
        );
    }
    expect(
      submitConsent.mock.calls.map(
        (call) => (call[1] as { idempotencyKey: string }).idempotencyKey,
      ),
    ).toEqual([
      'explicit-event-G1',
      'explicit-event-G1',
      'explicit-event-R1',
      'explicit-event-R1',
      'explicit-event-G2',
      'explicit-event-G2',
    ]);
  });
  it.each([
    { ...grants, preferredLocale: 'ru' },
    { ...grants, clientId: 'other' },
    { ...grants, marketingConsent: 'true' },
  ])('rejects broader or non-explicit input', async (value) => {
    const { service, submitConsent } = fixture();
    await expect(
      service.submitLegacyNativeConsent('session', value, 'explicit-event-G1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(submitConsent).not.toHaveBeenCalled();
  });
});
