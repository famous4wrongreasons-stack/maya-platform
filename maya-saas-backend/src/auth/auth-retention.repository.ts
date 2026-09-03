import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Wave6Class } from '../package5-wave6/package5-wave6.policy';
import { Package5Wave6MaintenanceService } from '../package5-wave6/package5-wave6.service';

const AUTH_CLASSES: Wave6Class[] = [
  'purge_auth_sessions',
  'purge_phone_auth_codes',
  'purge_email_auth_codes',
  'purge_auth_flow_states',
  'purge_auth_rate_limit_buckets',
];
export type AuthRetentionOptions = { batchSize?: number; dryRun?: boolean };

/** CLI initiator only. The AC6 coordinator owns selection, time and deletion. */
@Injectable()
export class AuthRetentionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async run(options: AuthRetentionOptions = {}) {
    if (
      Object.keys(options).some(
        (key) => !['batchSize', 'dryRun'].includes(key),
      ) ||
      (options.dryRun !== undefined && typeof options.dryRun !== 'boolean')
    ) {
      throw new Error('maintenance_initiator_authority_override_forbidden');
    }
    const coordinator = new Package5Wave6MaintenanceService(this.prisma);
    const dryRun = options.dryRun !== false;
    const runs = [];
    for (const actionClass of AUTH_CLASSES) {
      const request = { actionClass, batchSize: options.batchSize };
      if (dryRun) runs.push(await coordinator.shadow(request));
      else {
        const runId = await coordinator.prepare(request);
        runs.push(await coordinator.execute(runId));
      }
    }
    return { policyVersion: 1, dryRun, runs };
  }
}
