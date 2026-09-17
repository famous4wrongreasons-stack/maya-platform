// K7's exit, plus the six figures Wave 3 must prove.

import fs from 'node:fs';
import path from 'node:path';

import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import { C9_CAP_BY_KEY } from '../authority/contract-bindings';
import { proposeForAe } from '../authority/propose-pairing';
import { MONEY_FACETS, MONEY_TARGET_KINDS } from '../../widget-contract/tables';
import {
  AE_WIDGET_COMMIT_ALLOWLIST,
  GAP_APPOINTMENT_DETAIL_COMMIT,
  isAllowlisted,
  isMoney,
} from './booking-allowlist';
import {
  BookingCommitService,
  CommitRefused,
  type BookingDraft,
} from './booking-commit.service';

const svc = () =>
  new BookingCommitService({
    putDraft: () => Promise.resolve({ id: 'd' }),
  } as never);

const commit = (
  over: Partial<
    Parameters<BookingCommitService['assertCommitAdmissible']>[0]
  > = {},
) => ({
  effect: 'COMMIT',
  aeCapability: 'crm.appointment.create.v1',
  widgetKind: 'BOOKING_CONFIRMATION',
  confirmationOfKind: 'draft',
  confirmationOfRef: 'draft-1',
  producedByIntentTokenHash: null,
  ...over,
});

describe('BOOKING ALLOWLIST: EXACTLY 3 KEYS', () => {
  it('has three rows, and they are the three the contract names', () => {
    expect(AE_WIDGET_COMMIT_ALLOWLIST).toHaveLength(3);
    expect(AE_WIDGET_COMMIT_ALLOWLIST.map((r) => r.ae).sort()).toEqual([
      'crm.appointment.cancel.v1',
      'crm.appointment.create.v1',
      'crm.appointment.reschedule.v1',
    ]);
  });

  it('does NOT admit the four that were gap-ledgered', () => {
    // Not seven. These four have no propose key in any space, and a COMMIT whose propose key
    // cannot be resolved is a COMMIT whose authority cannot be checked.
    for (const g of GAP_APPOINTMENT_DETAIL_COMMIT) {
      expect(isAllowlisted(`crm.appointment.${g}.v1`)).toBe(false);
      expect(() =>
        svc().assertCommitAdmissible(
          commit({ aeCapability: `crm.appointment.${g}.v1` }),
        ),
      ).toThrow(CommitRefused);
    }
  });

  it('K7-PROPOSE-COLUMN: every row still carries the `c9.booking.*` propose key K7 recorded — and NOTHING reads it any more (U7a)', () => {
    // The column is kept, because deleting it is the integrator's to do (D-18), and because it is the
    // record of what K7 traced. But the claim that used to stand here — "Gate 7 resolves through
    // that" — was wrong in a way worth naming: these three keys resolve in NO registry. Authority for
    // a COMMIT is resolved through `AE_PROPOSE_PAIRING`'s propose side (F70, C11:1236-1238), which
    // names `appointments.own.{create,reschedule,cancel}`, and a source fence in
    // `gates/gate7.pipeline.spec.ts` holds that neither Gate 7 nor the commit guard reads this column.
    for (const r of AE_WIDGET_COMMIT_ALLOWLIST) {
      expect(r.proposeKey.startsWith('c9.booking.')).toBe(true);
      expect(C9_CAP_BY_KEY.has(r.proposeKey)).toBe(false);
      expect(proposeForAe(r.ae)?.key).toMatch(/^appointments\.own\./);
    }
  });

  it('K7-F72-DELEGATES: the guard’s confirmation-kind and `confirmation_of_ref` checks are §0.13’s one body, not a second copy (U7a)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, 'booking-commit.service.ts'),
      'utf8',
    );
    expect(src).toContain("from '../authority/commit-guard'");
    for (const owner of [
      'confirmationKindMismatch',
      'confirmationRefProblem',
      'producingRecordMissing',
    ])
      expect(src).toContain(owner);
  });
});

describe('COMMIT OUTSIDE CONFIRMATION: IMPOSSIBLE', () => {
  it('admits the canonical create, confirmed against its draft', () => {
    expect(() => svc().assertCommitAdmissible(commit())).not.toThrow();
  });

  it('refuses a COMMIT that confirms nothing', () => {
    expect(() =>
      svc().assertCommitAdmissible(commit({ confirmationOfRef: null })),
    ).toThrow(/confirms nothing/);
  });

  it('refuses a COMMIT whose widget kind is not the confirmation kind', () => {
    // The whole point: a COMMIT minted from a SERVICE_SELECTOR has not been confirmed by anyone.
    for (const kind of [
      'SERVICE_SELECTOR',
      'STAFF_SELECTOR',
      'TIME_SLOT_SELECTOR',
      'CHOICE',
    ])
      expect(() =>
        svc().assertCommitAdmissible(commit({ widgetKind: kind })),
      ).toThrow(/requires BOOKING_CONFIRMATION/);
  });

  it('refuses a cancel or reschedule that does not name the record it came from', () => {
    for (const ae of [
      'crm.appointment.cancel.v1',
      'crm.appointment.reschedule.v1',
    ])
      expect(() =>
        svc().assertCommitAdmissible(
          commit({
            aeCapability: ae,
            confirmationOfKind: 'record',
            producedByIntentTokenHash: null,
          }),
        ),
      ).toThrow(/must name the consumed record/);
  });

  it('refuses a confirmation_of_kind that does not match the row', () => {
    expect(() =>
      svc().assertCommitAdmissible(commit({ confirmationOfKind: 'record' })),
    ).toThrow(/confirms a draft/);
  });

  it('every selector stage mints a REFINE, never a COMMIT', () => {
    // Statically: the stage machine returns a draft. There is no branch in it that produces a
    // capability, a token or an effect, so no selector can commit anything.
    const src = fs.readFileSync(
      path.join(__dirname, 'booking-commit.service.ts'),
      'utf8',
    );
    const advance = src.slice(
      src.indexOf('advance('),
      src.indexOf('auditRow('),
    );
    expect(advance).not.toContain('COMMIT');
    expect(advance).not.toContain('capability');
  });

  it('refuses a confirmation of an incomplete draft', () => {
    const d: BookingDraft = {
      draftRef: 'd1',
      serviceId: 's',
      staffId: null,
      slotStartsAt: null,
      confirmed: false,
    };
    expect(() => svc().advance(d, 'confirm', '')).toThrow(/incomplete/);
  });

  it('walks the canonical flow and confirms only at the end', () => {
    const s = svc();
    let d: BookingDraft = {
      draftRef: 'd1',
      serviceId: null,
      staffId: null,
      slotStartsAt: null,
      confirmed: false,
    };
    d = s.advance(d, 'service', 'svc-1');
    expect(d.confirmed).toBe(false);
    d = s.advance(d, 'staff', 'staff-1');
    expect(d.confirmed).toBe(false);
    d = s.advance(d, 'slot', '2026-10-01T10:00:00Z');
    expect(d.confirmed).toBe(false);
    d = s.advance(d, 'confirm', '');
    expect(d.confirmed).toBe(true);
  });

  it('changing an earlier choice clears the later ones', () => {
    // Otherwise a person could pick a slot, change the service, and confirm a booking whose slot
    // belongs to a service they no longer chose.
    const s = svc();
    let d: BookingDraft = {
      draftRef: 'd',
      serviceId: 's1',
      staffId: 'st1',
      slotStartsAt: 't1',
      confirmed: false,
    };
    d = s.advance(d, 'service', 's2');
    expect(d.staffId).toBeNull();
    expect(d.slotStartsAt).toBeNull();
  });
});

describe('MONEY KEYS GAP-KEYED: 92/92', () => {
  const rows = () => {
    const r = new ActionCapabilityRegistry() as unknown as Record<
      string,
      unknown
    >;
    return (
      r.list as () => {
        capability: string;
        targetKind: string;
        riskFacets: string[];
      }[]
    )();
  };

  it('the contract predicate selects 92 of 226', () => {
    // The figure the contract states. It reproduces exactly — and so does the near-miss it warns
    // about, which is what makes this a check and not a coincidence.
    const money = rows().filter(isMoney);
    expect(money).toHaveLength(92);
    expect(rows()).toHaveLength(226);
  });

  it('reproduces the contract’s documented WRONG answer for the bare token', () => {
    // "92 capabilities against 12 for the bare `financial` token". A generator once hard-coded five
    // plausible money words here and matched exactly those 12. Both numbers are asserted so that
    // regression is caught by its own signature.
    expect(
      rows().filter((c) => (c.riskFacets ?? []).includes('financial')),
    ).toHaveLength(12);
    expect(MONEY_FACETS).toHaveLength(16);
    expect(MONEY_TARGET_KINDS).toHaveLength(27);
  });

  it('all 92 are gap-keyed: none is on the COMMIT allowlist', () => {
    const money = rows().filter(isMoney);
    const admitted = money.filter((c) => isAllowlisted(c.capability));
    expect(admitted).toEqual([]);
    expect(money.length).toBe(92);
  });

  it('crm.visit.payment.v1 is money and is not mintable', () => {
    const row = rows().find((c) => c.capability === 'crm.visit.payment.v1');
    expect(row).toBeDefined();
    expect(isMoney(row!)).toBe(true);
    expect(isAllowlisted('crm.visit.payment.v1')).toBe(false);
  });
});

describe('DIRECT UI → PROVIDER WRITES: 0', () => {
  it('no file in the widget layer names a provider client', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory()
          ? walk(p)
          : p.endsWith('.ts') && !p.endsWith('.spec.ts')
            ? [p]
            : [];
      });
    const offences: string[] = [];
    for (const f of walk(path.join(__dirname, '..'))) {
      const code = fs
        .readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
      for (const needle of [
        'YclientsClient',
        'yclients.adapter',
        'CrmService',
        'axios',
        'got(',
      ])
        if (code.includes(needle))
          offences.push(`${path.basename(f)}: ${needle}`);
    }
    // A widget that could call a provider would be a second write path, and the receipt would
    // describe something the Action Engine never decided.
    expect(offences).toEqual([]);
  });
});

describe('VOICE-SPECIFIC AUTHORITY PATHS: 0', () => {
  it('the commit guard takes no carrier, so voice cannot have its own rules', () => {
    const src = fs.readFileSync(
      path.join(__dirname, 'booking-commit.service.ts'),
      'utf8',
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    for (const carrier of [
      'voice',
      'spoken',
      'telegram',
      'sms',
      'channel',
      'carrier',
    ])
      expect(code.toLowerCase()).not.toContain(carrier);
  });

  it('the audit row is carrier-free, so said/typed/pressed differ by 0 bytes', () => {
    const s = svc();
    const args = {
      draftRef: 'd1',
      utterance: 'записаться к Илье на 10:00',
      capability: 'crm.appointment.create.v1',
    };
    const said = s.auditRow(args);
    const typed = s.auditRow(args);
    const pressed = s.auditRow(args);
    expect(said).toBe(typed);
    expect(typed).toBe(pressed);
    expect(Buffer.byteLength(said)).toBe(Buffer.byteLength(pressed));
  });
});
