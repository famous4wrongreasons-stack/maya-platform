import { Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { assertOwnerClassesResolve } from './authority/contract-bindings';
import { assertLedgersBindAtRegistryLoad } from './authority/ledger-startup.assert';
import { ControlRegistryService } from './control/control-registry.service';
import {
  GATE_8R_OWNERS,
  INPUT_VALIDATION,
  NOUN_RESOLUTION_PORTS,
  SEAL_VERIFIER,
} from './di-tokens';
import { WidgetEmitterService } from './emission/emitter.service';
import { SealService } from './emission/seal.service';
import { SealVerifierService } from './emission/seal-verifier.service';
import { GATE_8R_OWNERS_UNRULED } from './gates/gate-8r.owners';
import { InputValidationGate } from './input-validation/input-validation.gate';
import { IntentGatewayService } from './intent-gateway.service';
import { WidgetOwnerPortsModule } from './owner-ports/widget-owner-ports.module';
import { NOUN_RESOLUTION_PORTS_UNBOUND } from './noun-resolution/noun-resolution.ports';
import { WidgetProjectorService } from './projection/widget-projector.service';
import { assertRoutingResolves } from './routing/deterministic-router';
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
    // U8R (R8R-1): slot 8-R's owner set, as a VALUE. `GATE_8R_OWNERS_UNRULED`'s vocabulary owner is
    // `null` (A1/A2 unruled, PKT:471), so a required readback refuses; the token exists so the day an
    // owner is ruled, the binding changes here and in no gate file.
    { provide: GATE_8R_OWNERS, useValue: GATE_8R_OWNERS_UNRULED },
    // U11a (IR-11a-3): Gate 11's ports, as the FROZEN ALL-NULL record. It is bound here rather than at
    // the D-6 boundary because it reaches no owner, so k3 check 9's owner enumeration does not change;
    // U11b replaces the `useValue` with its adapters and moves the binding to the boundary, with the
    // enumeration in that commit (§2.6 item 7). Row W refuses `superseded/handle_stale` with 0 calls
    // while it stands — an unbound port that REFUSES is the fail-closed half of AMB-01a.
    { provide: NOUN_RESOLUTION_PORTS, useValue: NOUN_RESOLUTION_PORTS_UNBOUND },
    // U12a (IR-12a-1): the projector. It has NO constructor dependency, so it adds no boot blast
    // radius and needs no module import, and it is deliberately NOT exported: nothing outside this
    // module may reference it until Gate 13's edges land (ARCH-12-9 admits `widgets.module.ts` and
    // `gates/gate13.ts`, and only Gate 13 may CALL it). Its registry is empty and every compose
    // answers `degraded` with zero reads, which is DEV-1 — a plan deviation, not a mechanism.
    WidgetProjectorService,
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
    // U10a (IR-U10A-1): §3.12's router and `ownerSet` resolve against the live registries, or the
    // process does not start. A router that cannot answer Gate 10 is a divergence audit that silently
    // has nothing to compare, which is the one failure mode row 10 exists to prevent.
    assertRoutingResolves();
  }
}
