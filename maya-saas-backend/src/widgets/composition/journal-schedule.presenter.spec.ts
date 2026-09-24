import type { FactUsed } from '../../widget-contract/envelope';
import { presentJournalSchedule } from './journal-schedule.presenter';

const fact: FactUsed = {
  capability: 'operations.journal.read',
  status: 'measured',
  as_of: '2026-09-24T08:00:00.000Z',
  evidence_refs: [`h_${'a'.repeat(64)}`],
  completeness: {
    status: 'COMPLETE',
    requestedScopeHash: 'b'.repeat(64),
    returnedCount: 1,
    totalCount: 1,
    hasMore: false,
    cursorRef: null,
    truncated: false,
    reasonCodes: [],
  },
};

const ownerResult = () => ({
  date: '2026-09-24',
  timezone: 'Europe/Moscow',
  staff: [{ name: 'Анна' }],
  appointments: [
    {
      time: '10:00',
      end_time: '11:00',
      staff_name: 'Анна',
      services: ['Стрижка'],
      status: 'recorded',
      client_name: 'must-not-cross-the-owner-boundary',
      client_phone: '+70000000000',
    },
  ],
});

describe('P-JOURNAL-PROJECTION journal schedule presenter', () => {
  it('copies the authorized owner date, timezone and schedule facts into the certified body without PII', () => {
    const body = presentJournalSchedule(ownerResult(), fact, '2026-09-24');
    expect(body).not.toBeNull();
    if (body === null) throw new Error('expected a schedule body');
    expect(body.timezone).toBe('Europe/Moscow');
    expect(body.range).toEqual({
      from: '2026-09-24T10:00:00',
      to: '2026-09-24T11:00:00',
    });
    expect(body.detail_intent).toBe('i1');
    expect(body.entries[0]?.title.value).toBe('Стрижка');
    expect(body.entries[0]?.title.fact_ref).toBe(0);
    expect(body.entries[0]?.state.value).toBe('BOOKED');
    expect(body.entries[0]?.state.fact_ref).toBe(0);
    expect(JSON.stringify(body)).not.toContain('must-not-cross');
    expect(JSON.stringify(body)).not.toContain('+70000000000');
  });

  it('refuses a result for a different business date instead of reinterpreting it', () => {
    expect(
      presentJournalSchedule(ownerResult(), fact, '2026-09-25'),
    ).toBeNull();
  });

  it('is deterministic over the same authorized result and evidence', () => {
    expect(presentJournalSchedule(ownerResult(), fact, '2026-09-24')).toEqual(
      presentJournalSchedule(ownerResult(), fact, '2026-09-24'),
    );
  });
});
