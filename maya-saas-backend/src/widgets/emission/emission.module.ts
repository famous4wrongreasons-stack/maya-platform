import { Module } from '@nestjs/common';

import { HANDOFF_SIGNER, SEAL_VERIFIER, SUCCESSOR_MINTER } from '../di-tokens';
import { HandoffTargetSigner } from '../routing/handoff-target.signer';
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
    HandoffTargetSigner,
    { provide: HANDOFF_SIGNER, useExisting: HandoffTargetSigner },
  ],
  exports: [
    WidgetEmitterService,
    SealService,
    SEAL_VERIFIER,
    SUCCESSOR_MINTER,
    SuccessorMinterService,
    HANDOFF_SIGNER,
  ],
})
export class WidgetEmissionModule {}
