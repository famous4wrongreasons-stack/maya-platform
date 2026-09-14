import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('B31 approved Option A schema ratchet', () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      'prisma/migrations/20260906120000_b31_immutable_booking_idempotency/migration.sql',
    ),
    'utf8',
  );

  it('has exactly the approved six-column binding and three execution columns', () => {
    const binding = Prisma.dmmf.datamodel.models.find(
      (model) => model.name === 'ActionExecutionIdempotencyBinding',
    )!;
    expect(
      binding.fields
        .filter((field) => field.kind === 'scalar')
        .map((field) => field.name)
        .sort(),
    ).toEqual(
      [
        'tenantId',
        'clientId',
        'idempotencyScope',
        'requestIdempotencyKeyHash',
        'actionExecutionId',
        'createdAt',
      ].sort(),
    );
    expect(sql).toMatch(
      /PRIMARY KEY\s*\("tenantId", "idempotencyScope", "requestIdempotencyKeyHash"\)/,
    );
    const execution = Prisma.dmmf.datamodel.models.find(
      (model) => model.name === 'ActionExecution',
    )!;
    expect(
      execution.fields
        .filter((field) => field.name.startsWith('bookingIntent'))
        .map((field) => field.name)
        .sort(),
    ).toEqual(
      [
        'bookingIntentContract',
        'bookingIntentHash',
        'bookingIntentEncrypted',
      ].sort(),
    );
  });

  it('qualifies execution and Client relations by the same tenant', () => {
    expect(sql).toContain('FOREIGN KEY ("clientId", "tenantId")');
    expect(sql).toContain(
      'REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT',
    );
    expect(sql).toContain('FOREIGN KEY ("actionExecutionId", "tenantId")');
    expect(sql).toContain(
      'REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT',
    );
  });

  it('requires atomic first binding, immutable history and no business backfill', () => {
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(sql).toContain(
      'B31 execution and first binding must commit atomically',
    );
    expect(sql).toContain('B31 accepted binding cannot be rebound');
    expect(sql).toContain(
      'B31 accepted booking intent is immutable; no historical backfill',
    );
    expect(sql).not.toMatch(
      /^\s*(UPDATE|DELETE FROM|INSERT INTO|DROP TABLE|TRUNCATE)\s/im,
    );
  });
});
