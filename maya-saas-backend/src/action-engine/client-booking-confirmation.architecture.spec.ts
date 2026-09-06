import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bookingConfirmationKey,
  BOOKING_CONFIRMATION_NAMESPACE,
} from '../crm/client-booking-confirmation.service';

describe('B33 durable source receipt architecture', () => {
  const backend = resolve(__dirname, '../..');
  const schema = readFileSync(resolve(backend, 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(
      backend,
      'prisma/migrations/20260906180000_b33_client_booking_confirmation/migration.sql',
    ),
    'utf8',
  );
  it('has exactly approved eight scalar fields and no identity generator', () => {
    const body = schema
      .split('model ClientBookingConfirmation {')[1]
      .split('\n}')[0];
    const fields = [
      ...body.matchAll(/^\s+(\w+)\s+(String|Json|DateTime)\b/gm),
    ].map((m) => m[1]);
    expect(fields).toEqual([
      'id',
      'tenantId',
      'clientId',
      'clientChannelLinkId',
      'actionNamespace',
      'confirmationEvidenceJson',
      'confirmationEvidenceHash',
      'acceptedAt',
    ]);
    expect(body).not.toContain('@default(uuid())');
    expect(migration).toContain('BEFORE INSERT OR UPDATE OR DELETE');
    expect(migration).toContain('FOR SHARE OF l, c');
    expect(migration).not.toMatch(/INSERT INTO|UPDATE "ActionExecution"/);
  });
  it('derives a stable namespaced key independent of model output', () => {
    const receipt = {
      id: '12345678-1234-4123-8123-123456789abc',
      tenantId: 'tenant',
      clientId: 'client',
      actionNamespace: BOOKING_CONFIRMATION_NAMESPACE,
    };
    const key = bookingConfirmationKey(receipt);
    expect(key).toMatch(/^chat-confirmation:v1:[a-f0-9]{64}$/);
    expect(
      bookingConfirmationKey({
        ...receipt,
        ...{ staffId: 'changed', start: 'changed' },
      }),
    ).toBe(key);
    expect(bookingConfirmationKey({ ...receipt, clientId: 'other' })).not.toBe(
      key,
    );
    expect(
      bookingConfirmationKey({
        ...receipt,
        id: '12345678-1234-4123-8123-123456789abd',
      }),
    ).not.toBe(key);
  });
});
