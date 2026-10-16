import {
  envelopeBodyHash,
  envelopeBodyHashTerms,
} from '../../src/widgets/emission/envelope.factory';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import * as calendarBinding from '../../src/ai-tools/booking-catalog-binding';
import { AiToolHandlerService } from '../../src/ai-tools/ai-tool-handler.service';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import { UserRole } from '../../src/common/domain.enums';
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
  firstSlot,
  object,
  startBooking,
  submit,
} from './support/release-booking-flow';

const cases = [
  ['UTC', '2028-02-28T23:59:59Z', '2028-02-29', false],
  ['UTC', '2028-02-29T12:00:00Z', '2028-03-01', false],
  ['Europe/Moscow', '2027-10-01T21:30:00Z', '2027-10-03', true],
  ['Europe/Moscow', '2027-10-01T21:30:00Z', '2027-10-03', false],
  ['America/Los_Angeles', '2027-01-01T02:00:00Z', '2027-01-01', true],
  ['America/Los_Angeles', '2027-01-01T02:00:00Z', '2027-01-01', false],
  ['Pacific/Kiritimati', '2027-12-31T12:00:00Z', '2028-01-02', true],
  ['Asia/Kathmandu', '2027-01-31T20:00:00Z', '2027-02-02', true],
  ['America/New_York', '2027-03-14T04:30:00Z', '2027-03-14', true],
  ['America/New_York', '2027-11-07T04:30:00Z', '2027-11-08', true],
  ['America/New_York', '2027-11-07T04:30:00Z', '2027-11-08', false],
  ['Europe/Berlin', '2027-10-30T22:30:00Z', '2027-11-01', true],
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

describe('L5/L24 semantic tomorrow → availability → envelope → carrier → confirmation [HTTP] [PostgreSQL] [scripted model]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fx.teardown();
    http.recorder.clear();
  });
  afterAll(async () => {
    await http?.close();
    await db?.close();
  });
  it.each(cases)(
    'L5-CHAT-TOMORROW %s at %s → %s (branch=%s)',
    async (timezone, now, expectedDate, useBranch) => {
      // Override only the calendar's existing `now` parameter. Auth, retention,
      // C9 admission and PostgreSQL keep their real clock; the actual date
      // implementation below remains under test (including every mutation).
      const realDate = calendarBinding.bookingPreferenceDate;
      const clock = jest
        .spyOn(calendarBinding, 'bookingPreferenceDate')
        .mockImplementation((value, zone) =>
          realDate(value, zone, new Date(now)),
        );
      const s = await startBooking(fx, http);
      await db.prisma.tenant.update({
        where: { id: s.tenant.id },
        data: { defaultTimezone: useBranch ? 'UTC' : timezone },
      });
      let branchId: string | undefined;
      if (useBranch) {
        const branch = await db.prisma.branch.create({
          data: { tenantId: s.tenant.id, name: 'Calendar proof', timezone },
        });
        branchId = branch.id;
        await db.prisma.internalProvider.update({
          where: { id: s.source.staffId },
          data: { branchId: branch.id },
        });
      }
      await db.prisma.internalService.update({
        where: { id: s.source.serviceId },
        data: { name: 'стрижка' },
      });
      await db.prisma.internalProvider.update({
        where: { id: s.source.staffId },
        data: { displayName: 'Стас' },
      });
      jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
        throw new Error('External model/provider calls forbidden');
      });
      const decisions = jest
        .spyOn(http.app.get(AiCoreModelService), 'decide')
        .mockImplementation((input) => {
          const prompt =
            input.messages.filter((m) => m.role === 'user').at(-1)?.content ??
            '';
          const employee = prompt.match(
            /\[name removed\]@[a-f0-9]{32}_\d+/,
          )?.[0];
          expect(employee).toBeDefined();
          const semanticPlan =
            new ConversationIntelligenceService().validatePlan(
              {
                dialogue_act: 'request',
                tasks: [
                  {
                    intent: 'booking.find_availability',
                    entities: {
                      employee,
                      services: ['стрижка'],
                      date_or_period: 'tomorrow',
                      ...(useBranch ? { branch: 'Calendar proof' } : {}),
                    },
                    confidence: 0.99,
                  },
                ],
              },
              input.principalRole ?? UserRole.CLIENT,
              input.tools.map((t) => t.name),
              input.conversationPlan,
            );
          return Promise.resolve({
            reply: '',
            semanticPlan,
            toolCall: { name: 'booking.availability.read', arguments: {} },
            provider: 'openai',
            model: 'SCRIPTED_CALENDAR_BOUNDARY_ONLY',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          });
        });
      const reads = jest.spyOn(http.app.get(AiToolHandlerService), 'execute');
      const trace = randomUUID();
      // Neither the HTTP request nor scripted semantics supplies the expected date.
      // The current chat owner must resolve tomorrow through the canonical timezone.
      const response = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${s.token}`)
        .send({
          surface: 'web',
          requestId: trace,
          messages: [
            { role: 'user', content: 'Есть время к Стасу завтра на стрижку?' },
          ],
        });
      expect(response.status).toBe(201);
      const body = object(response.body);
      expect({
        reply: body.reply,
        hasResolution: Boolean(body.resolution),
      }).toMatchObject({ hasResolution: true });
      const slot = object(object(object(body.resolution).receipt).envelope);
      expect(decisions).toHaveBeenCalledTimes(1);
      expect(clock).toHaveBeenCalledWith('tomorrow', timezone);
      const calls = reads.mock.calls.filter(
        (c) => c[0] === 'booking.availability.read',
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][2]).toMatchObject({
        date: `${expectedDate}T00:00:00.000Z`,
        staff_id: s.source.staffId,
        service_ids: [s.source.serviceId],
        ...(branchId ? { branch_id: branchId } : {}),
      });
      expect(object(slot.provenance).source_capability).toBe(
        'booking.availability.read',
      );
      expect(
        http
          .mintProvenance()
          .some(
            (mint) =>
              mint.widget_id === slot.widget_id &&
              mint.trigger === 'T-2a' &&
              mint.request_id === trace,
          ),
      ).toBe(true);
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
      await carrier(slot, new Date().toISOString(), start.formatted);
      const confirmation = object(
        (await submit(http, s.token, slot, 'DRAFT', selected.slot_ref))
          .next_envelope,
      );
      expect(confirmation.kind).toBe('BOOKING_CONFIRMATION');
      const when = object(object(confirmation.body).when);
      expect(when.value).toBe(start.value);
      expect(when.formatted).toBe(start.formatted);
      await carrier(confirmation, new Date().toISOString(), when.formatted);
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
