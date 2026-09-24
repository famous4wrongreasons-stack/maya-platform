import { Injectable } from '@nestjs/common';
import { C9Store } from '../../orchestration/c9.store';
import type { C9CancelOwnerPort } from '../routing/effect-router.ports';
import type { RoutingInput } from '../routing/routing-input';
import { sha256Hex } from '../token.util';

@Injectable()
export class C9CancelAdapter implements C9CancelOwnerPort {
  constructor(private readonly store: C9Store) {}
  async cancel(input: RoutingInput): Promise<boolean> {
    const { record } = input;
    if (record.runId === null || record.revisionId === null || record.tenantId !== input.tenantId || record.principalProofHash !== input.principalProofHash)
      return false;
    const key = sha256Hex(`widget-run-cancel\0${input.tenantId}\0${record.runId}\0${record.revisionId}`);
    await this.store.cancel(record.runId, key);
    return true;
  }
}
