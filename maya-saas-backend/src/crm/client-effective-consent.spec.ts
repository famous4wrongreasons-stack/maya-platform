import { effectiveClientConsent } from './client-effective-consent';
const now = new Date('2026-09-08T12:00:00Z');
const head = {
  id: 'grant',
  decision: 'grant',
  effectiveAt: now,
  invalidation: null,
};
function fixture(rows: unknown[]) {
  return { clientConsentFact: { findMany: jest.fn().mockResolvedValue(rows) } };
}
describe('canonical effective consent after security invalidation', () => {
  it('selects exact tenant/Client/kind current head and never filters away invalidations', async () => {
    const db = fixture([head]);
    expect(
      (
        await effectiveClientConsent(
          db as never,
          'tenant',
          'client',
          'marketing',
          now,
        )
      ).effective,
    ).toBe(true);
    expect(db.clientConsentFact.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant',
        clientId: 'client',
        kind: 'marketing',
        effectiveAt: { lte: now },
      },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: 2,
      include: { invalidation: { select: { id: true } } },
    });
  });
  it('keeps an invalidated head ineffective without resurrecting an older grant', async () => {
    const db = fixture([
      { ...head, invalidation: { id: 'security-fact' } },
      { ...head, id: 'old', effectiveAt: new Date(now.getTime() - 1000) },
    ]);
    expect(
      await effectiveClientConsent(
        db as never,
        'tenant',
        'client',
        'marketing',
        now,
      ),
    ).toMatchObject({
      effective: false,
      effectiveAt: null,
      invalidated: true,
      factId: 'grant',
    });
  });
  it('preserves equal-time grant/revoke conflict policy', async () => {
    const db = fixture([head, { ...head, decision: 'revoke' }]);
    expect(
      (
        await effectiveClientConsent(
          db as never,
          'tenant',
          'client',
          'privacy',
          now,
        )
      ).effective,
    ).toBe(false);
  });
  it('allows an independently verified new head without applying the previous fact invalidation', async () => {
    const db = fixture([
      head,
      {
        ...head,
        id: 'old-invalid',
        effectiveAt: new Date(now.getTime() - 1000),
        invalidation: { id: 'security-fact' },
      },
    ]);
    expect(
      (
        await effectiveClientConsent(
          db as never,
          'tenant',
          'client',
          'privacy',
          now,
        )
      ).effective,
    ).toBe(true);
  });
  it.each(['tenant', 'client'])(
    'rejects absent %s scope without reading facts',
    async (missing) => {
      const db = fixture([head]);
      await expect(
        effectiveClientConsent(
          db as never,
          missing === 'tenant' ? '' : 'tenant',
          missing === 'client' ? '' : 'client',
          'privacy',
          now,
        ),
      ).rejects.toThrow();
      expect(db.clientConsentFact.findMany).not.toHaveBeenCalled();
    },
  );
});
