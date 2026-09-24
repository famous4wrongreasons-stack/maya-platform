import { Injectable } from '@nestjs/common';
import { C9Store } from '../../orchestration/c9.store';
import { asWitness, unwrapHandle } from '../noun-resolution/noun-handles';
import type { WitnessPort } from '../noun-resolution/noun-resolution.ports';

@Injectable()
export class WitnessC9RevisionAdapter implements WitnessPort {
  constructor(private readonly store: C9Store) {}

  async currentRevision(
    run: Parameters<WitnessPort['currentRevision']>[0],
    actor: Parameters<WitnessPort['currentRevision']>[1],
  ) {
    if (actor.tenantId === null) return null;
    const snapshot = await this.store.snapshot(unwrapHandle(run));
    const current = snapshot.revisions.at(-1);
    return current === undefined ? null : asWitness(current.id);
  }
}
