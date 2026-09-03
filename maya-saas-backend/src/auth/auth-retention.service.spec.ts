import { AuthRetentionRepository } from './auth-retention.repository';
import { AuthRetentionService } from './auth-retention.service';

describe('AuthRetentionService canonical initiator', () => {
  it('passes only the operational request to the coordinator facade', async () => {
    const run = jest.fn().mockResolvedValue({ dryRun: true });
    const service = new AuthRetentionService({
      run,
    } as unknown as AuthRetentionRepository);
    await service.run();
    expect(run).toHaveBeenCalledWith({});
    await service.run({ dryRun: false, batchSize: 12 });
    expect(run).toHaveBeenLastCalledWith({ dryRun: false, batchSize: 12 });
  });
});
