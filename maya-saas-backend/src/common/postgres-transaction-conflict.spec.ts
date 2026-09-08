import { isPostgresSerializationConflict } from './postgres-transaction-conflict';

describe('PostgreSQL transaction abort evidence', () => {
  it.each([
    { code: 'P2034' },
    { cause: { originalCode: '40001', kind: 'TransactionWriteConflict' } },
    { meta: { driverAdapterError: { cause: { originalCode: '40P01' } } } },
  ])('recognizes explicit aborted transactions: %j', (error) => {
    expect(isPostgresSerializationConflict(error)).toBe(true);
  });

  it.each([
    null,
    { code: 'P2002' },
    { code: 'ECONNRESET' },
    { code: 'ETIMEDOUT' },
    { message: 'TransactionWriteConflict' },
    { cause: { originalCode: '08006' } },
  ])(
    'never treats ambiguous outcome as a transaction-abort proof: %j',
    (error) => {
      expect(isPostgresSerializationConflict(error)).toBe(false);
    },
  );

  it('bounds recursive driver metadata', () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(isPostgresSerializationConflict(error)).toBe(false);
  });
});
