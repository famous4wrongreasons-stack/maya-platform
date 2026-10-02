import {
  envelopeBodyHash,
  envelopeBodyHashTerms,
} from '../../src/widgets/emission/envelope.factory';
import { stableActionJson } from '../../src/action-engine/action-engine.identity';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import {
  firstOption,
  firstSlot,
  object,
  observe,
  startBooking,
  submit,
} from './support/release-booking-flow';

const cases = [
  ['UTC', '2028-02-28T23:59:59Z', '2028-02-29', false],
  ['UTC', '2028-02-29T12:00:00Z', '2028-03-01', false],
  ['Europe/Moscow', '2027-10-01T21:30:00Z', '2027-10-03', true],
  ['America/Los_Angeles', '2027-01-01T02:00:00Z', '2027-01-01', true],
  ['Pacific/Kiritimati', '2027-12-31T12:00:00Z', '2028-01-02', true],
  ['Asia/Kathmandu', '2027-01-31T20:00:00Z', '2027-02-02', true],
  ['America/New_York', '2027-03-14T04:30:00Z', '2027-03-14', true],
  ['America/New_York', '2027-11-07T04:30:00Z', '2027-11-08', true],
] as const;

async function carrier(
  envelope: Record<string, unknown>,
  now: string,
  formatted: unknown,
) {
  expect(envelopeBodyHash(envelope as never)).toBe(
    object(envelope.integrity).body_hash,
  );
  const child = spawn(
    process.execPath,
    [path.resolve('test/widgets-live/support/calendar-carrier-proof.mjs')],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let err = '',
    out = '';
  child.stderr.on('data', (v: Buffer) => {
    err += v.toString();
  });
  child.stdout.on('data', (v: Buffer) => {
    out += v.toString();
  });
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(err)),
    );
  });
  child.stdin.end(
    JSON.stringify({
      envelope,
      now,
      formatted,
      canonical: stableActionJson(envelopeBodyHashTerms(envelope)),
    }),
  );
  await done;
  expect(JSON.parse(out)).toMatchObject({ carrier: 'PASS', formatted });
}

describe('L5/L24 local calendar through availability → envelope → carrier → confirmation [HTTP] [PostgreSQL]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterEach(async () => {
    jest.useRealTimers();
    await fx.teardown();
    http.recorder.clear();
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
  });
  it.each(cases)(
    'L5-PIPELINE %s at %s → %s (branch=%s)',
    async (timezone, now, expectedDate, useBranch) => {
      jest.useFakeTimers({
        doNotFake: [
          'nextTick',
          'queueMicrotask',
          'performance',
          'hrtime',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'setImmediate',
          'clearImmediate',
        ],
      });
      jest.setSystemTime(new Date(now));
      const s = await startBooking(fx, http);
      await db.prisma.tenant.update({
        where: { id: s.tenant.id },
        data: { defaultTimezone: useBranch ? 'UTC' : timezone },
      });
      if (useBranch) {
        const branch = await db.prisma.branch.create({
          data: { tenantId: s.tenant.id, name: 'Calendar proof', timezone },
        });
        await db.prisma.internalProvider.update({
          where: { id: s.source.staffId },
          data: { branchId: branch.id },
        });
      }
      await observe(http, s.token, s.envelope);
      const staff = object(
        (
          await submit(
            http,
            s.token,
            s.envelope,
            'REFINE',
            firstOption(s.envelope),
          )
        ).next_envelope,
      );
      await observe(http, s.token, staff);
      const slot = object(
        (await submit(http, s.token, staff, 'REFINE', firstOption(staff)))
          .next_envelope,
      );
      expect(slot.kind).toBe('TIME_SLOT_SELECTOR');
      expect(object(slot.body)).toMatchObject({
        timezone,
        more_intent: null,
        widen_window_intent: null,
      });
      const selected = firstSlot(slot);
      const start = object(selected.start);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(String(start.value)));
      expect(parts).toBe(expectedDate);
      expect(String(start.formatted)).toContain(timezone);
      await carrier(slot, new Date(now).toISOString(), start.formatted);
      const confirmation = object(
        (await submit(http, s.token, slot, 'DRAFT', selected.slot_ref))
          .next_envelope,
      );
      expect(confirmation.kind).toBe('BOOKING_CONFIRMATION');
      const when = object(object(confirmation.body).when);
      expect(when.value).toBe(start.value);
      expect(when.formatted).toBe(start.formatted);
      await carrier(confirmation, new Date(now).toISOString(), when.formatted);
      expect(
        await db.prisma.appointment.count({ where: { tenantId: s.tenant.id } }),
      ).toBe(0);
      expect(
        await db.prisma.actionExecution.count({
          where: { tenantId: s.tenant.id },
        }),
      ).toBe(0);
    },
  );
});
