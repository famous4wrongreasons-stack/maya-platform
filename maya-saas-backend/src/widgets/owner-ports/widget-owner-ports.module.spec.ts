// D-6 module topology: what the boundary carries, named one binding at a time.
//
// "A module that exists is not a gate that is enforced." So this holds the EXACT state, not just the
// presence: the owner-ports module imports and provides exactly the enumerated owner modules and port
// tokens, the widget module imports Prisma and that boundary only, and every OTHER DI token in
// `di-tokens.ts` is still unbound in the real `WidgetsModule`. The unit that binds a token or imports an
// owner module changes the matching assertion in the same commit, with the test that pins what it binds
// (plan §3.5 item 7). P-PRINCIPAL is the first: `PRINCIPAL_RESOLVER`, through `C9Module` and
// `TenancyModule` (D-1, D-2).
//
// Class BUILD: metadata and DI resolution. `PrismaService` is replaced by an empty value because only
// resolution is under test and no query runs.

import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { C9Module } from '../../orchestration/c9.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { TenancyModule } from '../../tenancy/tenancy.module';
import * as DI_TOKENS from '../di-tokens';
import { PrincipalAdapter } from './principal.adapter';
import { IntentGatewayService } from '../intent-gateway.service';
import { WidgetStoresService } from '../stores/widget-stores.service';
import { WidgetsController } from '../widgets.controller';
import { WidgetsModule } from '../widgets.module';
import { WidgetOwnerPortsModule } from './widget-owner-ports.module';

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
      C9Module,
      TenancyModule,
    ]);
    expect(meta(MODULE_METADATA.PROVIDERS, WidgetOwnerPortsModule)).toEqual([
      { provide: DI_TOKENS.PRINCIPAL_RESOLVER, useClass: PrincipalAdapter },
    ]);
    expect(meta(MODULE_METADATA.EXPORTS, WidgetOwnerPortsModule)).toEqual([
      DI_TOKENS.PRINCIPAL_RESOLVER,
    ]);
  });

  it('WidgetsModule imports Prisma and the owner-ports boundary, and no other module', () => {
    expect(meta(MODULE_METADATA.IMPORTS, WidgetsModule)).toEqual([
      PrismaModule,
      WidgetOwnerPortsModule,
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
    const BOUND: readonly string[] = [DI_TOKENS.PRINCIPAL_RESOLVER];
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
