import { Module } from '@nestjs/common';

import { AiToolPolicyModule } from '../../ai-tools/ai-tool-policy.module';
import { AiToolsModule } from '../../ai-tools/ai-tools.module';
import { EntitlementsModule } from '../../entitlements/entitlements.module';
import { MeasurementModule } from '../../measurement/measurement.module';
import { C9Module } from '../../orchestration/c9.module';
import { TenancyModule } from '../../tenancy/tenancy.module';
import { C8Module } from '../../valuation/c8.module';
import { CrmModule } from '../../crm/crm.module';
import { MarketingModule } from '../../marketing/marketing.module';
import {
  APPROVAL_REQUEST_OWNER,
  CANONICAL_READ,
  COMMIT_BOOKING_OWNER,
  DRAFT_OWNER_REGISTRY,
  GATE6_OWNERS,
  PRINCIPAL_RESOLVER,
  TENANT_SCOPE,
  NOUN_RESOLUTION_PORTS,
  C9_CANCEL_OWNER,
} from '../di-tokens';
import { CanonicalReadAdapter } from './canonical-read.provider';
import { Gate6OwnersAdapter } from './gate6.owners.provider';
import { PrincipalAdapter } from './principal.adapter';
import { TenantScopeAdapter } from './tenant-scope.provider';
import { NounResolutionOwnersProvider } from './noun-resolution.owners.provider';
import { WitnessC9RevisionAdapter } from './witness-c9-revision.adapter';
import { BookingCreateNounAdapter } from './noun-booking-create.adapter';
import { BookingCancelNounAdapter } from './noun-booking-cancel.adapter';
import { BookingRescheduleNounAdapter } from './noun-booking-reschedule.adapter';
import { ClientAppointmentReadNounAdapter } from './noun-client-appointment-read.adapter';
import { C9CancelAdapter } from './c9-cancel.adapter';
import { ApprovalRequestAdapter } from './approval-request.adapter';
import { CommitBookingAdapter } from './commit-booking.adapter';
import { DraftOwnerRegistry } from './draft-owner.registry';

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
 * 9 enumeration names them in the same commit. U4 binds `TENANT_SCOPE` through the same
 * `TenancyModule`, which is `@Global()` — the import is documentation rather than resolution, and k3's
 * ports rule is what makes naming it required. U6-L1 binds `GATE6_OWNERS` (R6-2), so
 * `AiToolPolicyModule` (C20's `assertCanExecute`, C11:4761-4762) and `EntitlementsModule` ((e)'s
 * `requiredFeatures`, C11:4755) are imported here and enumerated in k3 check 9 in the same commit;
 * `CrmModule` comes with U11b, `AiToolsModule`, `MeasurementModule` and `C8Module` with U12b/U13b.
 * `ActionEngineModule` is never imported here. An owner module that is merely present is not an
 * enforced gate.
 */
@Module({
  imports: [
    AiToolPolicyModule,
    AiToolsModule,
    MeasurementModule,
    C8Module,
    C9Module,
    CrmModule,
    MarketingModule,
    EntitlementsModule,
    TenancyModule,
  ],
  providers: [
    CanonicalReadAdapter,
    Gate6OwnersAdapter,
    { provide: PRINCIPAL_RESOLVER, useClass: PrincipalAdapter },
    { provide: TENANT_SCOPE, useClass: TenantScopeAdapter },
    { provide: GATE6_OWNERS, useExisting: Gate6OwnersAdapter },
    { provide: CANONICAL_READ, useExisting: CanonicalReadAdapter },
    BookingCreateNounAdapter,
    BookingCancelNounAdapter,
    BookingRescheduleNounAdapter,
    ClientAppointmentReadNounAdapter,
    C9CancelAdapter,
    { provide: C9_CANCEL_OWNER, useExisting: C9CancelAdapter },
    ApprovalRequestAdapter,
    CommitBookingAdapter,
    {
      provide: DRAFT_OWNER_REGISTRY,
      useFactory: () => new DraftOwnerRegistry([]),
    },
    {
      provide: APPROVAL_REQUEST_OWNER,
      useExisting: ApprovalRequestAdapter,
    },
    { provide: COMMIT_BOOKING_OWNER, useExisting: CommitBookingAdapter },
    NounResolutionOwnersProvider,
    WitnessC9RevisionAdapter,
    {
      provide: NOUN_RESOLUTION_PORTS,
      useFactory: (
        nouns: NounResolutionOwnersProvider,
        witness: WitnessC9RevisionAdapter,
      ) => ({ nouns, witness }),
      inject: [NounResolutionOwnersProvider, WitnessC9RevisionAdapter],
    },
  ],
  exports: [
    CANONICAL_READ,
    GATE6_OWNERS,
    PRINCIPAL_RESOLVER,
    TENANT_SCOPE,
    NOUN_RESOLUTION_PORTS,
    C9_CANCEL_OWNER,
    DRAFT_OWNER_REGISTRY,
    APPROVAL_REQUEST_OWNER,
    COMMIT_BOOKING_OWNER,
  ],
})
export class WidgetOwnerPortsModule {}
