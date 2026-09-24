import { Injectable } from '@nestjs/common';
import { stableActionJson } from '../../action-engine/action-engine.identity';
import { SealService } from '../emission/seal.service';
import type { HandoffSignerPort } from './effect-router.ports';

const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class HandoffTargetSigner implements HandoffSignerPort {
  constructor(private readonly seals: SealService) {}
  sign(input: Parameters<HandoffSignerPort['sign']>[0]) {
    if (
      !record(input.target) ||
      input.target.class !== 's' ||
      !record(input.target.ref) ||
      typeof input.target.ref.route !== 'string'
    )
      return null;
    const routeKey = input.target.ref.route;
    const opaqueHandle = this.seals.signHandoff(
      stableActionJson([
        routeKey,
        input.intentTokenHash,
        input.principalProofHash,
      ]),
    );
    return Object.freeze({
      route_key: routeKey,
      opaque_handle: opaqueHandle,
    });
  }
}
