import { Module } from '@nestjs/common';

import { C9Module } from '../../orchestration/c9.module';
import { TenancyModule } from '../../tenancy/tenancy.module';
import { PRINCIPAL_RESOLVER } from '../di-tokens';
import { PrincipalAdapter } from './principal.adapter';

/**
 * The widget layer's one boundary to non-widget owners (integrator decision D-6).
 *
 * This is the ONLY widget module that may import a non-widget Nest module, and only files under
 * `src/widgets/owner-ports/**` (plus `projection/canonical-read.port.ts`) may import a non-widget
 * service. Gate files and `intent-gateway.service.ts` import port interfaces, the tokens in
 * `../di-tokens.ts` and DI-free owner functions or values, never an owner's service or module.
 *
 * Each import and each port provider lands with the unit and ruling that needs it (plan §1.3). It is no
 * longer empty: P-PRINCIPAL binds `PRINCIPAL_RESOLVER`, which is K1's resolution (C11:2536-2539) plus
 * B-02's in-transaction role read, so `C9Module` and `TenancyModule` are imported here and the k3 check
 * 9 enumeration names them in the same commit. `AiToolPolicyModule` and `EntitlementsModule` come with
 * U6; `CrmModule` with U11b; `AiToolsModule`, `MeasurementModule` and `C8Module` with U12b/U13b.
 * `ActionEngineModule` is never imported here. An owner module that is merely present is not an
 * enforced gate.
 */
@Module({
  imports: [C9Module, TenancyModule],
  providers: [{ provide: PRINCIPAL_RESOLVER, useClass: PrincipalAdapter }],
  exports: [PRINCIPAL_RESOLVER],
})
export class WidgetOwnerPortsModule {}
