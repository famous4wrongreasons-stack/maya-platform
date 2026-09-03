import { Package5Wave6MaintenanceService } from '../package5-wave6/package5-wave6.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRetentionRepository } from './auth-retention.repository';

describe('Auth retention has no legacy writer or fallback', () => {
  afterEach(() => jest.restoreAllMocks());
  it('defaults all five auth classes to read-only manifests', async () => {
    const shadow = jest
      .spyOn(Package5Wave6MaintenanceService.prototype, 'shadow')
      .mockResolvedValue({} as never);
    const prepare = jest.spyOn(
      Package5Wave6MaintenanceService.prototype,
      'prepare',
    );
    const result = await new AuthRetentionRepository({} as PrismaService).run();
    expect(result.dryRun).toBe(true);
    expect(
      shadow.mock.calls.map(
        ([r]) => (r as { actionClass: string }).actionClass,
      ),
    ).toEqual([
      'purge_auth_sessions',
      'purge_phone_auth_codes',
      'purge_email_auth_codes',
      'purge_auth_flow_states',
      'purge_auth_rate_limit_buckets',
    ]);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('stops on coordinator refusal without a direct-write fallback', async () => {
    jest
      .spyOn(Package5Wave6MaintenanceService.prototype, 'prepare')
      .mockRejectedValue(new Error('policy_denied'));
    const prisma = { authSession: { deleteMany: jest.fn() } };
    await expect(
      new AuthRetentionRepository(prisma as unknown as PrismaService).run({
        dryRun: false,
      }),
    ).rejects.toThrow('policy_denied');
    expect(prisma.authSession.deleteMany).not.toHaveBeenCalled();
  });
  it('rejects injected policy and clock values before any coordinator work', async () => {
    const shadow = jest.spyOn(
      Package5Wave6MaintenanceService.prototype,
      'shadow',
    );
    const repository = new AuthRetentionRepository({} as PrismaService);
    for (const key of ['cutoffs', 'now', 'tenantId', 'policyVersion']) {
      await expect(repository.run({ [key]: 'forged' })).rejects.toThrow(
        'authority_override',
      );
    }
    expect(shadow).not.toHaveBeenCalled();
  });
});
