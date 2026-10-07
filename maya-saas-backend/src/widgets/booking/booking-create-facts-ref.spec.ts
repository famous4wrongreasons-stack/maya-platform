import { WidgetStoresService } from '../stores/widget-stores.service';
import {
  bookingCreateFactsHashOf,
  mintBookingCreateFactsRef,
} from './booking-create-facts-ref';

const NOW = new Date('2026-10-07T10:00:00Z');
const HASH = 'a'.repeat(64);

describe('F15 booking create facts reference', () => {
  it('keeps two identical proposals distinct and accepts only this versioned reference', () => {
    const first = mintBookingCreateFactsRef(HASH);
    expect(mintBookingCreateFactsRef(HASH)).not.toBe(first);
    expect(bookingCreateFactsHashOf(first)).toBe(HASH);
    for (const ref of [
      first.replace(':v1:', ':v2:'),
      first + ':suffix',
      first.slice(0, -1),
      '00000000-0000-4000-8000-000000000001',
    ])
      expect(bookingCreateFactsHashOf(ref)).toBeNull();
    expect(() => mintBookingCreateFactsRef(null)).toThrow(
      'BOOKING_FACTS_REQUIRED',
    );
  });

  const fixture = () => {
    const ref = mintBookingCreateFactsRef(HASH);
    const row = {
      tenantId: 't1',
      draftRef: ref,
      principalProofHash: 'p1',
      draftClass: 'task',
      ownerCapabilitySpace: 'C9',
      ownerCapabilityKey: 'c9.booking.propose',
      consumedAt: null as Date | null,
      erasedAt: null as Date | null,
      expiresAt: new Date(NOW.getTime() + 10000),
    };
    const findFirst = jest.fn(
      ({ where }: { where: Record<string, unknown> }) => {
        const matches = Object.entries(where).every(([k, v]) =>
          k === 'expiresAt'
            ? row.expiresAt > (v as { gt: Date }).gt
            : row[k as keyof typeof row] === v,
        );
        return Promise.resolve(matches ? { draftRef: row.draftRef } : null);
      },
    );
    return {
      ref,
      row,
      findFirst,
      store: new WidgetStoresService({ widgetDraft: { findFirst } } as never),
    };
  };

  it('selects only the audit reference, with exact tenant/principal/owner/liveness fences', async () => {
    const h = fixture();
    await expect(
      h.store.readBookingCreateFactsHash('t1', h.ref, 'p1', NOW),
    ).resolves.toBe(HASH);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        draftRef: h.ref,
        principalProofHash: 'p1',
        draftClass: 'task',
        ownerCapabilitySpace: 'C9',
        ownerCapabilityKey: 'c9.booking.propose',
        consumedAt: null,
        erasedAt: null,
        expiresAt: { gt: NOW },
      },
      select: { draftRef: true },
    });
    expect(JSON.stringify(h.findFirst.mock.calls)).not.toMatch(
      /diffJson|bodyJson|textContent|renderProfile/,
    );
  });

  it.each([
    ['foreign tenant', { tenantId: 't2' }],
    ['foreign principal', { principalProofHash: 'p2' }],
    ['wrong owner', { ownerCapabilityKey: 'c9.other' }],
    ['wrong space', { ownerCapabilitySpace: 'AE' }],
    ['wrong class', { draftClass: 'other' }],
    ['expired', { expiresAt: NOW }],
    ['erased', { erasedAt: NOW }],
    ['consumed', { consumedAt: NOW }],
    ['mismatched reference', { draftRef: mintBookingCreateFactsRef(HASH) }],
  ])('refuses %s without returning a witness', async (_label, patch) => {
    const h = fixture();
    Object.assign(h.row, patch);
    await expect(
      h.store.readBookingCreateFactsHash('t1', h.ref, 'p1', NOW),
    ).resolves.toBeNull();
  });

  it('refuses old, missing-principal and unscoped references before reading', async () => {
    const h = fixture();
    await expect(
      h.store.readBookingCreateFactsHash('t1', 'legacy-uuid', 'p1', NOW),
    ).resolves.toBeNull();
    await expect(
      h.store.readBookingCreateFactsHash('t1', h.ref, '', NOW),
    ).resolves.toBeNull();
    await expect(
      h.store.readBookingCreateFactsHash('', h.ref, 'p1', NOW),
    ).rejects.toThrow();
    expect(h.findFirst).not.toHaveBeenCalled();
  });
});
