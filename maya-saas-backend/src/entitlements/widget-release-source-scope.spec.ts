import type { Prisma } from '@prisma/client';
import {
  assertPriceGoodsScope,
  readPriceGoodsScope,
} from './widget-release-source-scope';
import {
  NO_PRICE_GOODS_PROFILE,
  NO_HANDOFF_PROFILE,
  PRICE_GOODS_OPERATIONS,
} from './widget-release-profile.contract';
import { RELEASE_STATE, RELEASE_AUTH } from './widget-release.contract';

const db = (row: unknown) => {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    tenantEntitlement: { findUnique: jest.fn().mockResolvedValue(row) },
  };
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    query: tx.$queryRaw,
    read: tx.tenantEntitlement.findUnique,
  };
};
const state = (scope: string, operation = 'grant') => ({
  contract: RELEASE_STATE,
  command: {
    ...(operation === 'grant' ? { certificate: { scope } } : {}),
    authorization: { payload: { profileId: scope, operation } },
  },
});
describe('FIRST-PHONE source deny fence; never a grant of authority', () => {
  it.each(PRICE_GOODS_OPERATIONS)(
    'FP-SOURCE blocks %s even disabled, expired or revoked',
    async (operation) => {
      for (const config of [
        state(NO_PRICE_GOODS_PROFILE),
        state(NO_PRICE_GOODS_PROFILE, 'revoke'),
      ]) {
        const { tx, read, query } = db({
          configJson: config,
          enabled: false,
          expiresAt: new Date(0),
        });
        await expect(
          assertPriceGoodsScope(tx, 'tenant', operation),
        ).rejects.toThrow('widget_release_source_scope');
        expect(query).toHaveBeenCalledTimes(1);
        expect(read).toHaveBeenCalledWith({
          where: {
            tenantId_featureKey: {
              tenantId: 'tenant',
              featureKey: 'widgets.runtime',
            },
          },
        });
      }
    },
  );
  it('FP-LOCK acquires the same tenant release lock before reading the scope', async () => {
    const { tx, read, query } = db(null);
    await assertPriceGoodsScope(tx, 'tenant-exact', PRICE_GOODS_OPERATIONS[0]);
    expect((query.mock.calls as unknown[][])[0][1]).toBe(
      'widget-release:tenant:tenant-exact',
    );
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(
      read.mock.invocationCallOrder[0],
    );
  });
  it('FP-NESTED AE deny read does not acquire a second lock behind an exclusive waiter', async () => {
    const { tx, read, query } = db({
      configJson: state(NO_PRICE_GOODS_PROFILE),
    });
    await expect(
      readPriceGoodsScope(tx, 'tenant', PRICE_GOODS_OPERATIONS[2]),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });
  it.each([
    'catalog.services.list',
    'booking.create_own',
    'appointments.reschedule_own',
    'appointments.cancel_own',
  ])(
    'FP-NONINTERFERENCE does not grant or change %s authority',
    async (operation) => {
      const { tx, read, query } = db({
        configJson: state(NO_PRICE_GOODS_PROFILE),
      });
      await assertPriceGoodsScope(tx, 'tenant', operation);
      expect(query).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    { configJson: null },
    { configJson: state(NO_HANDOFF_PROFILE) },
    { configJson: state('full165.closed-input') },
    {
      configJson: {
        contract: RELEASE_STATE,
        command: {
          authorization: {
            payload: { contract: RELEASE_AUTH, operation: 'revoke' },
          },
        },
      },
    },
  ])(
    'FP-PRESERVE existing broader owner remains responsible for authority (%j)',
    async (row) => {
      const { tx } = db(row);
      await expect(
        assertPriceGoodsScope(tx, 'tenant', PRICE_GOODS_OPERATIONS[0]),
      ).resolves.toBeUndefined();
    },
  );
  it.each([
    { contract: 'forged' },
    state('unknown-profile'),
    { contract: RELEASE_STATE, command: {} },
    {
      contract: RELEASE_STATE,
      command: {
        certificate: { scope: NO_HANDOFF_PROFILE },
        authorization: { payload: { profileId: NO_PRICE_GOODS_PROFILE } },
      },
    },
  ])(
    'FP-CORRUPT unknown/mixed stored scope fails closed (%j)',
    async (configJson) => {
      const { tx } = db({ configJson });
      await expect(
        assertPriceGoodsScope(tx, 'tenant', PRICE_GOODS_OPERATIONS[0]),
      ).rejects.toThrow();
    },
  );
});
