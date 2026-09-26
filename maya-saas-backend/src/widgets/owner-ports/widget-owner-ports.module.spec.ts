// D-6 module topology: what the boundary carries, named one binding at a time.
//
// "A module that exists is not a gate that is enforced." So this holds the EXACT state, not just the
// presence: the owner-ports module imports and provides exactly the enumerated owner modules and port
// tokens, the widget module imports Prisma and that boundary only, and every OTHER DI token in
// `di-tokens.ts` is still unbound in the real `WidgetsModule`. The unit that binds a token or imports an
// owner module changes the matching assertion in the same commit, with the test that pins what it binds
// (plan §3.5 item 7). P-PRINCIPAL is the first: `PRINCIPAL_RESOLVER`, through `C9Module` and
// `TenancyModule` (D-1, D-2). U6-L1 is the second: `GATE6_OWNERS`, through `AiToolPolicyModule` (C20's
// `assertCanExecute`, C11:4761-4762) and `EntitlementsModule` ((e)'s `requiredFeatures`, C11:4755).
// `ActionEngineModule` is never imported here: the Action Engine's rows arrive as values (R6-2).
//
// Class BUILD: metadata and DI resolution. `PrismaService` is replaced by an empty value because only
// resolution is under test and no query runs.

import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AiToolPolicyModule } from '../../ai-tools/ai-tool-policy.module';
import { AiToolsModule } from '../../ai-tools/ai-tools.module';
import { EntitlementsModule } from '../../entitlements/entitlements.module';
import { MeasurementModule } from '../../measurement/measurement.module';
import { C9Module } from '../../orchestration/c9.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { TenancyModule } from '../../tenancy/tenancy.module';
import { C8Module } from '../../valuation/c8.module';
import { CrmModule } from '../../crm/crm.module';
import { MarketingModule } from '../../marketing/marketing.module';
import * as DI_TOKENS from '../di-tokens';
import { Gate6OwnersAdapter } from './gate6.owners.provider';
import { CanonicalReadAdapter } from './canonical-read.provider';
import { PrincipalAdapter } from './principal.adapter';
import { TenantScopeAdapter } from './tenant-scope.provider';
import { IntentGatewayService } from '../intent-gateway.service';
import { WidgetStoresService } from '../stores/widget-stores.service';
import { WidgetsController } from '../widgets.controller';
import { WidgetsModule } from '../widgets.module';
import { WidgetEmissionModule } from '../emission/emission.module';
import { WidgetOwnerPortsModule } from './widget-owner-ports.module';
import { BookingCreateNounAdapter } from './noun-booking-create.adapter';
import { BookingCancelNounAdapter } from './noun-booking-cancel.adapter';
import { BookingRescheduleNounAdapter } from './noun-booking-reschedule.adapter';
import { ClientAppointmentReadNounAdapter } from './noun-client-appointment-read.adapter';
import { NounResolutionOwnersProvider } from './noun-resolution.owners.provider';
import { WitnessC9RevisionAdapter } from './witness-c9-revision.adapter';
import { C9CancelAdapter } from './c9-cancel.adapter';
import { ApprovalRequestAdapter } from './approval-request.adapter';
import { CommitBookingAdapter } from './commit-booking.adapter';
import { BookingPreviewAdapter } from './booking-preview.adapter';
import { BookingSelectorAdapter } from './booking-selector.adapter';

const meta = (key: string, target: object): unknown =>
  Reflect.getMetadata(key, target);

/**
 * Configuration the OWNER modules require at construction.
 *
 * `C9Module` reaches `ActionEngineModule`, whose factory refuses to build without an attestation, an
 * identity and a payload-encryption secret — each falling back to `CRM_ENCRYPTION_KEY`. That reach is a
 * consequence of binding `PRINCIPAL_RESOLVER` through the owner's own module (D-6: owners are imported
 * as MODULES), and it is recorded here rather than worked around: the application supplies these from
 * its environment, and an isolated module test has to supply them too. They are test literals; no secret
 * of any deployment is in this file.
 */
const OWNER_MODULE_CONFIG: Readonly<Record<string, string>> = {
  CRM_ENCRYPTION_KEY: 'widget-owner-ports-spec-crm-encryption-key-0123456789',
  MAYA_LOYALTY_REDEMPTION_CODE_PEPPER:
    'widget-owner-ports-spec-redemption-pepper-0123456789',
  JWT_SECRET: 'widget-owner-ports-spec-jwt-secret-0123456789',
};

describe('D-6 — the owner-ports boundary carries exactly what is bound; every other widget DI token is unbound', () => {
  const restore = new Map<string, string | undefined>();
  beforeAll(() => {
    for (const [key, value] of Object.entries(OWNER_MODULE_CONFIG)) {
      restore.set(key, process.env[key]);
      process.env[key] = value;
    }
  });
  afterAll(() => {
    for (const [key, value] of restore)
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });

  it('WidgetOwnerPortsModule imports and provides exactly what is bound today, and no more', () => {
    expect(meta(MODULE_METADATA.IMPORTS, WidgetOwnerPortsModule)).toEqual([
      AiToolPolicyModule,
      AiToolsModule,
      MeasurementModule,
      C8Module,
      C9Module,
      CrmModule,
      MarketingModule,
      EntitlementsModule,
      TenancyModule,
    ]);
    expect(meta(MODULE_METADATA.PROVIDERS, WidgetOwnerPortsModule)).toEqual([
      CanonicalReadAdapter,
      Gate6OwnersAdapter,
      { provide: DI_TOKENS.PRINCIPAL_RESOLVER, useClass: PrincipalAdapter },
      { provide: DI_TOKENS.TENANT_SCOPE, useClass: TenantScopeAdapter },
      { provide: DI_TOKENS.GATE6_OWNERS, useExisting: Gate6OwnersAdapter },
      {
        provide: DI_TOKENS.CANONICAL_READ,
        useExisting: CanonicalReadAdapter,
      },
      BookingCreateNounAdapter,
      BookingCancelNounAdapter,
      BookingRescheduleNounAdapter,
      ClientAppointmentReadNounAdapter,
      C9CancelAdapter,
      { provide: DI_TOKENS.C9_CANCEL_OWNER, useExisting: C9CancelAdapter },
      ApprovalRequestAdapter,
      CommitBookingAdapter,
      BookingPreviewAdapter,
      BookingSelectorAdapter,
      expect.objectContaining({ provide: DI_TOKENS.DRAFT_OWNER_REGISTRY }),
      {
        provide: DI_TOKENS.BOOKING_PROPOSE_OWNER,
        useExisting: BookingPreviewAdapter,
      },
      {
        provide: DI_TOKENS.BOOKING_SELECTOR_OWNER,
        useExisting: BookingSelectorAdapter,
      },
      {
        provide: DI_TOKENS.APPROVAL_REQUEST_OWNER,
        useExisting: ApprovalRequestAdapter,
      },
      {
        provide: DI_TOKENS.COMMIT_BOOKING_OWNER,
        useExisting: CommitBookingAdapter,
      },
      NounResolutionOwnersProvider,
      WitnessC9RevisionAdapter,
      expect.objectContaining({ provide: DI_TOKENS.NOUN_RESOLUTION_PORTS }),
    ]);
    expect(meta(MODULE_METADATA.EXPORTS, WidgetOwnerPortsModule)).toEqual([
      DI_TOKENS.CANONICAL_READ,
      DI_TOKENS.GATE6_OWNERS,
      DI_TOKENS.PRINCIPAL_RESOLVER,
      DI_TOKENS.TENANT_SCOPE,
      DI_TOKENS.NOUN_RESOLUTION_PORTS,
      DI_TOKENS.C9_CANCEL_OWNER,
      DI_TOKENS.DRAFT_OWNER_REGISTRY,
      DI_TOKENS.APPROVAL_REQUEST_OWNER,
      DI_TOKENS.COMMIT_BOOKING_OWNER,
      DI_TOKENS.BOOKING_PROPOSE_OWNER,
      DI_TOKENS.BOOKING_SELECTOR_OWNER,
    ]);
  });

  it('WidgetsModule imports Prisma, the owner-ports boundary and the internal emission module only', () => {
    expect(meta(MODULE_METADATA.IMPORTS, WidgetsModule)).toEqual([
      PrismaModule,
      WidgetOwnerPortsModule,
      WidgetEmissionModule,
    ]);
  });

  // The boundary serves no route. A `controllers` member here passed every other fence (U0 S4 review,
  // mutant R4b); k3 checks 7 and 9 refuse it too.
  it('WidgetOwnerPortsModule registers no controller, and WidgetsModule registers WidgetsController only', () => {
    expect(
      meta(MODULE_METADATA.CONTROLLERS, WidgetOwnerPortsModule) ?? [],
    ).toEqual([]);
    expect(meta(MODULE_METADATA.CONTROLLERS, WidgetsModule)).toEqual([
      WidgetsController,
    ]);
  });

  it('each token is a string equal to its own name, and none is spelled twice', () => {
    const entries = Object.entries(DI_TOKENS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, token] of entries) expect(token).toBe(name);
    expect(new Set(Object.values(DI_TOKENS)).size).toBe(entries.length);
  });

  it('the real WidgetsModule resolves its providers and the bound port, and resolves no other token', async () => {
    // Every token bound so far. A token leaves this list only by being bound, in the commit that binds
    // it: that is what keeps "unbound" from drifting into "nobody checked".
    const BOUND: readonly string[] = [
      DI_TOKENS.CANONICAL_READ,
      DI_TOKENS.GATE6_OWNERS,
      DI_TOKENS.PRINCIPAL_RESOLVER,
      DI_TOKENS.TENANT_SCOPE,
      // P-SEAL binds this one in `widgets.module.ts`, not at the boundary (B-22): the seal key is the
      // minter's, and it moves to the emission module in P-MINT-CORE's merge.
      DI_TOKENS.SEAL_VERIFIER,
      // P-MINT-CORE binds the widget-store-only successor beside the seal holder. It reaches no
      // canonical owner and is deliberately outside the owner-ports boundary.
      DI_TOKENS.SUCCESSOR_MINTER,
      DI_TOKENS.HANDOFF_SIGNER,
      // U8a (IR-8a-1) binds slot 8's gate in `widgets.module.ts` too, and for the same kind of
      // reason: `InputValidationGate` is widget-internal and reaches no owner, so the D-6 boundary
      // has nothing to say about it and k3 check 9's owner enumeration is unchanged.
      DI_TOKENS.INPUT_VALIDATION,
      // U8b binds both widget-internal registries as frozen empty maps. A source not explicitly
      // registered therefore refuses; neither token reaches a canonical owner in this programme.
      DI_TOKENS.INPUT_BOUNDS_REGISTRY,
      DI_TOKENS.INPUT_NORMALIZER_REGISTRY,
      // U8R (R8R-1) binds slot 8-R's owner set in `widgets.module.ts` as a VALUE. It reaches no owner
      // either — the production vocabulary owner is `null` (A1/A2 unruled, PKT:471).
      DI_TOKENS.GATE_8R_OWNERS,
      // U11a (IR-11a-3) binds Gate 11's ports in `widgets.module.ts` as the FROZEN ALL-NULL record.
      // It reaches no owner either; U11b moves the binding to the boundary with its adapters, and the
      // k3 check 9 enumeration lands in that commit (§2.6 item 7).
      DI_TOKENS.NOUN_RESOLUTION_PORTS,
      // U10b binds Gate 10's candidate/audit seam to the widget-internal stores facade. The gateway
      // sees this narrow port instead of importing the full facade and its unrelated sub-stores.
      DI_TOKENS.GATE10_STORE,
      DI_TOKENS.C9_CANCEL_OWNER,
      DI_TOKENS.DRAFT_OWNER_REGISTRY,
      DI_TOKENS.APPROVAL_REQUEST_OWNER,
      DI_TOKENS.COMMIT_BOOKING_OWNER,
      DI_TOKENS.BOOKING_PROPOSE_OWNER,
      DI_TOKENS.BOOKING_SELECTOR_OWNER,
      DI_TOKENS.BOOKING_CONFIRMATION_MINTER,
      DI_TOKENS.NAVIGATE_WIDGET_MINTER,
    ];
    const moduleRef = await Test.createTestingModule({
      // The owner modules the boundary now imports resolve configuration the way the application does:
      // `ConfigModule` is global in `AppModule`, and an isolated test module has to say so itself.
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        WidgetsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    try {
      // Control: resolution itself works, so a throw below means "unbound", not "broken module".
      expect(moduleRef.get(WidgetStoresService)).toBeInstanceOf(
        WidgetStoresService,
      );
      expect(moduleRef.get(IntentGatewayService)).toBeInstanceOf(
        IntentGatewayService,
      );
      expect(
        moduleRef.get<unknown>(DI_TOKENS.PRINCIPAL_RESOLVER, { strict: false }),
      ).toBeInstanceOf(PrincipalAdapter);
      expect(
        moduleRef.get<unknown>(DI_TOKENS.TENANT_SCOPE, { strict: false }),
      ).toBeInstanceOf(TenantScopeAdapter);
      expect(
        moduleRef.get<unknown>(DI_TOKENS.GATE6_OWNERS, { strict: false }),
      ).toBeInstanceOf(Gate6OwnersAdapter);
      expect(
        moduleRef.get<unknown>(DI_TOKENS.CANONICAL_READ, { strict: false }),
      ).toBeInstanceOf(CanonicalReadAdapter);
      for (const token of Object.values(DI_TOKENS).filter(
        (t) => !BOUND.includes(t),
      ))
        expect(() => {
          moduleRef.get<unknown>(token, { strict: false });
        }).toThrow(`Nest could not find ${token} element`);
    } finally {
      await moduleRef.close();
    }
  });
});
