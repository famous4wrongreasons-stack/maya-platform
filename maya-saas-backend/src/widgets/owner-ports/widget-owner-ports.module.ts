import { Module } from '@nestjs/common';

/**
 * The widget layer's one boundary to non-widget owners (integrator decision D-6).
 *
 * This is the ONLY widget module that may import a non-widget Nest module, and only files under
 * `src/widgets/owner-ports/**` (plus `projection/canonical-read.port.ts`) may import a non-widget
 * service. Gate files and `intent-gateway.service.ts` import port interfaces, the tokens in
 * `../di-tokens.ts` and DI-free owner functions or values, never an owner's service or module.
 *
 * EMPTY by design in U0: it imports nothing and provides nothing, so it adds nothing to the
 * application's DI graph. Each import and each port provider lands with the unit and ruling that
 * needs it (plan §1.3): `AiToolPolicyModule` and `EntitlementsModule` with U6; `CrmModule` with U11b;
 * `AiToolsModule`, `MeasurementModule`, `C8Module` and `C9Module` with U12b/U13b. `ActionEngineModule`
 * is never imported here. An owner module that is merely present is not an enforced gate.
 */
@Module({
  imports: [],
  providers: [],
  exports: [],
})
export class WidgetOwnerPortsModule {}
