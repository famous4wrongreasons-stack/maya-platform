// D-6 module topology as U0 leaves it: the boundary exists, and nothing is wired through it.
//
// "A module that exists is not a gate that is enforced." So this holds the empty state, not just the
// presence: the owner-ports module imports, provides and exports nothing; the widget module imports
// Prisma and that boundary only; and every DI token in `di-tokens.ts` is unbound in the real
// `WidgetsModule`. The unit that binds a token or imports an owner module changes the matching
// assertion in the same commit, with the test that pins what it binds (plan §3.5 item 7).
//
// Class BUILD: metadata and DI resolution. `PrismaService` is replaced by an empty value because only
// resolution is under test and no query runs.

import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';

import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import * as DI_TOKENS from '../di-tokens';
import { IntentGatewayService } from '../intent-gateway.service';
import { WidgetStoresService } from '../stores/widget-stores.service';
import { WidgetsModule } from '../widgets.module';
import { WidgetOwnerPortsModule } from './widget-owner-ports.module';

const meta = (key: string, target: object): unknown =>
  Reflect.getMetadata(key, target);

describe('D-6 — the owner-ports boundary exists and is empty; every widget DI token is unbound', () => {
  it('WidgetOwnerPortsModule imports, provides and exports nothing', () => {
    expect(meta(MODULE_METADATA.IMPORTS, WidgetOwnerPortsModule)).toEqual([]);
    expect(meta(MODULE_METADATA.PROVIDERS, WidgetOwnerPortsModule)).toEqual([]);
    expect(meta(MODULE_METADATA.EXPORTS, WidgetOwnerPortsModule)).toEqual([]);
  });

  it('WidgetsModule imports Prisma and the owner-ports boundary, and no other module', () => {
    expect(meta(MODULE_METADATA.IMPORTS, WidgetsModule)).toEqual([
      PrismaModule,
      WidgetOwnerPortsModule,
    ]);
  });

  it('each token is a string equal to its own name, and none is spelled twice', () => {
    const entries = Object.entries(DI_TOKENS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, token] of entries) expect(token).toBe(name);
    expect(new Set(Object.values(DI_TOKENS)).size).toBe(entries.length);
  });

  it('the real WidgetsModule resolves its providers, and resolves none of the tokens', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WidgetsModule],
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
      for (const token of Object.values(DI_TOKENS))
        expect(() => {
          moduleRef.get<unknown>(token, { strict: false });
        }).toThrow(`Nest could not find ${token} element`);
    } finally {
      await moduleRef.close();
    }
  });
});
