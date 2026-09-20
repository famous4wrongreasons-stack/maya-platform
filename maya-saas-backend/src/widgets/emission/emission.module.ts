import { Module } from '@nestjs/common';

import { SEAL_VERIFIER, SUCCESSOR_MINTER } from '../di-tokens';
import { WidgetEmitterService } from './emitter.service';
import { SealService } from './seal.service';
import { SealVerifierService } from './seal-verifier.service';
import { SuccessorMinterService } from './successor-minter.service';

/** B-22: minting and seal-key custody share one module; the gateway receives only the verifier port. */
@Module({
  providers: [
    WidgetEmitterService,
    SealService,
    SealVerifierService,
    SuccessorMinterService,
    { provide: SEAL_VERIFIER, useExisting: SealVerifierService },
    { provide: SUCCESSOR_MINTER, useExisting: SuccessorMinterService },
  ],
  exports: [
    WidgetEmitterService,
    SealService,
    SEAL_VERIFIER,
    SUCCESSOR_MINTER,
    SuccessorMinterService,
  ],
})
export class WidgetEmissionModule {}
