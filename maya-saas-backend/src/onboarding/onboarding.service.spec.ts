import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import type { CanonicalTrialOnboardingService } from './canonical-trial-onboarding.service';
import { OnboardingService } from './onboarding.service';

const dto = {
  name: 'Synthetic',
  slug: 'synthetic',
  ownerEmail: 'owner@example.invalid',
  trialActivationToken: 't'.repeat(43),
};
describe('Onboarding canonical TrialActivation initiator', () => {
  function fixture(enabled = true) {
    const activate = jest.fn().mockResolvedValue({
      tenantId: 'tenant',
      ownerUserId: 'reserved-owner',
      activationId: 'activation',
    });
    const ownerSession = jest.fn().mockResolvedValue({
      user: { id: 'reserved-owner' },
      tenant: { id: 'tenant' },
    });
    const rate = { assertPreflight: jest.fn().mockResolvedValue(undefined) };
    const service = new OnboardingService(
      new ConfigService({
        NODE_ENV: 'production',
        SELF_SERVE_TRIAL_SIGNUP: String(enabled),
      }),
      rate as unknown as AuthRateLimitService,
      { activate, ownerSession } as unknown as CanonicalTrialOnboardingService,
    );
    return { service, activate, ownerSession, rate };
  }
  it('uses the exact canonical activation outcome to issue the owner session', async () => {
    const f = fixture();
    const result = await f.service.createTrialSignup(dto);
    expect(f.activate).toHaveBeenCalledWith(dto);
    expect(f.ownerSession).toHaveBeenCalledWith('tenant', 'reserved-owner', {});
    expect(result.trial_activation.activation_id).toBe('activation');
  });
  it('preserves self-serve release policy', async () => {
    const f = fixture(false);
    await expect(f.service.createTrialSignup(dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(f.activate).not.toHaveBeenCalled();
  });
  it('propagates a post-activation session failure without tenant compensation', async () => {
    const f = fixture();
    f.ownerSession.mockRejectedValue(new Error('Session unavailable'));
    await expect(f.service.createTrialSignup(dto)).rejects.toThrow(
      'Session unavailable',
    );
    expect(f.activate).toHaveBeenCalledTimes(1);
  });
});
