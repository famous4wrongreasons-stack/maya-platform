import { Prisma } from '@prisma/client';

import { UserRole } from '../../src/common/domain.enums';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { Fixtures, type WidgetFixture } from './support/fixtures';

describe('I-MIG3 [PG] sealed NAVIGATE source-capability evidence', () => {
  let ctx: FixtureContext;
  let gw: GatewayHarness;
  let fx: Fixtures;

  beforeAll(async () => {
    ctx = await bootFixtureContext();
    gw = await bootGateway();
    fx = new Fixtures(ctx, gw);
  });

  afterEach(async () => fx.teardown());
  afterAll(async () => {
    await gw?.close();
    await ctx?.close();
  });

  const record = async (label: string): Promise<WidgetFixture> => {
    const tenant = await fx.tenant(label);
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    return fx.widget({
      tenant,
      actor,
      kind: 'SCHEDULE',
      body: { schedule: [] },
    });
  };

  const update = (
    row: WidgetFixture,
    data: Record<string, unknown>,
  ): Promise<unknown> =>
    ctx.prisma.widgetIntentRecord.update({
      where: {
        intentTokenHash_tenantId: {
          intentTokenHash: row.intentTokenHash,
          tenantId: row.tenantId,
        },
      },
      data,
    });

  it.each([
    ['detail', { class: 'detail', ref: { route: 'shell.account' } }],
    ['w', { class: 'w', ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }],
  ] as const)('accepts the exact NAVIGATE(%s) pair', async (label, target) => {
    const row = await record(`i-mig3-positive-${label}`);
    await expect(
      update(row, {
        effect: 'NAVIGATE',
        targetJson: target,
        sourceCapabilitySpace: 'C9',
        sourceCapabilityKey: 'staff.schedule.read',
      }),
    ).resolves.toMatchObject({
      sourceCapabilitySpace: 'C9',
      sourceCapabilityKey: 'staff.schedule.read',
    });
  });

  it.each([
    [
      'missing pair',
      {
        effect: 'NAVIGATE',
        targetJson: { class: 'detail', ref: { route: 'shell.account' } },
      },
    ],
    [
      'half pair',
      {
        effect: 'NAVIGATE',
        targetJson: { class: 'detail', ref: { route: 'shell.account' } },
        sourceCapabilitySpace: 'C9',
      },
    ],
    [
      'foreign space',
      {
        effect: 'NAVIGATE',
        targetJson: { class: 'detail', ref: { route: 'shell.account' } },
        sourceCapabilitySpace: 'AE',
        sourceCapabilityKey: 'crm.appointment.create.v1',
      },
    ],
    [
      'non navigate',
      {
        effect: 'REFINE',
        targetJson: Prisma.DbNull,
        sourceCapabilitySpace: 'C9',
        sourceCapabilityKey: 'staff.schedule.read',
      },
    ],
    [
      'other target',
      {
        effect: 'NAVIGATE',
        targetJson: { class: 'i', ref: 'i1' },
        sourceCapabilitySpace: 'C9',
        sourceCapabilityKey: 'staff.schedule.read',
      },
    ],
  ])('refuses %s at the PostgreSQL boundary', async (label, data) => {
    const row = await record(`i-mig3-negative-${label.replaceAll(' ', '-')}`);
    await expect(update(row, data)).rejects.toThrow();
  });
});
