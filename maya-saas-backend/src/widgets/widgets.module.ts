import { Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { assertOwnerClassesResolve } from './authority/contract-bindings';
import { assertLedgersBindAtRegistryLoad } from './authority/ledger-startup.assert';
import { ControlRegistryService } from './control/control-registry.service';
import { INPUT_VALIDATION, SEAL_VERIFIER } from './di-tokens';
import { WidgetEmitterService } from './emission/emitter.service';
import { SealService } from './emission/seal.service';
import { SealVerifierService } from './emission/seal-verifier.service';
import { InputValidationGate } from './input-validation/input-validation.gate';
import { IntentGatewayService } from './intent-gateway.service';
import { WidgetOwnerPortsModule } from './owner-ports/widget-owner-ports.module';
import { LoweringSourceReader } from './stores/lowering-source.read';
import { WidgetStoresService } from './stores/widget-stores.service';
import { WidgetsController } from './widgets.controller';

/**
 * K3 — the widget runtime.
 *
 * It imports PrismaModule and the widget layer's own owner-ports boundary, and nothing else. That is
 * deliberate and worth stating: a gateway that could import a capability module could reach a
 * canonical owner, and section 3 puts the whole of the authority in this component precisely so it
 * is the only thing that may consume an intent token. Every later package adds gates to the
 * pipeline, not paths around it.
 *
 * `WidgetOwnerPortsModule` (D-6) is the one place a non-widget module may ever be imported, so the
 * question "which owners can the widget layer reach?" has one file to answer it. In U0 it is empty:
 * it imports and provides nothing, so no owner is reachable through it.
 */
@Module({
  imports: [PrismaModule, WidgetOwnerPortsModule],
  controllers: [WidgetsController],
  providers: [
    IntentGatewayService,
    WidgetStoresService,
    WidgetEmitterService,
    ControlRegistryService,
    // P-SEAL (IR-SEAL-1), B-22: the seal key is HELD BY THE MINTER's side, never by the gateway. There
    // is no `emission.module.ts` in Wave 1 and `emission/**` outside `seal*.ts` is P-MINT-CORE's, so the
    // two providers stand here and move to the emission module in P-MINT-CORE's merge. B-22 holds
    // either way: the gateway never imports the classes — it will take `SEAL_VERIFIER` as a type-only
    // token — and SEAL-5 pins that no key is reachable from its closure.
    SealService,
    SealVerifierService,
    { provide: SEAL_VERIFIER, useExisting: SealVerifierService },
    // U8a (IR-8a-1): slot 8's built gate, and the one store read its pass performs (D-2). Both are
    // widget-internal — no owner module is imported and no owner is reachable through them — so they
    // are bound here rather than at the D-6 boundary, and k3 check 9's owner enumeration is unchanged.
    LoweringSourceReader,
    { provide: INPUT_VALIDATION, useClass: InputValidationGate },
  ],
  exports: [
    IntentGatewayService,
    WidgetStoresService,
    WidgetEmitterService,
    ControlRegistryService,
    SealService,
    SEAL_VERIFIER,
  ],
})
export class WidgetsModule implements OnModuleInit {
  /**
   * §2.4 EP-REGISTRY-LOAD: every owner class resolves in its space, or the process does not start.
   *
   * A2.4 (P-LEDGER, IR-LED-1) runs first: every `[ABSENT]` §A1 row must be bound to a gap key, or the
   * process does not start either. A ledger fault is then the first thing a failed boot reports, which
   * is what D-4's backstop rests on — the mechanism that says "not built" must exist before anything
   * may say "allowed".
   */
  onModuleInit(): void {
    assertLedgersBindAtRegistryLoad();
    assertOwnerClassesResolve();
  }
}
