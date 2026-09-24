import type { PrismaService } from '../../prisma/prisma.service';
import type { OperationalAlertWidgetTriggerPort } from '../../operational-alerts/operational-alert-widget-trigger.port';
import type { WidgetEmitterService } from '../emission/emitter.service';
import type { Gate6Owners } from '../owner-ports/gate6.owners.provider';
import type { WidgetStoresService } from '../stores/widget-stores.service';
import {
  assertShiftScheduleBody,
  MomentTriggerService,
} from './moment.trigger';

const PROOF = 'a'.repeat(64);
const principal = {
  authority: {
    kind: 'USER',
    tenantId: 'tenant-a',
    userId: 'user-a',
    membershipId: 'member-a',
    clientId: null,
    channelLinkId: null,
    branchRefs: [],
    staffRef: 'staff-a',
    proofHash: PROOF,
  },
  role: 'master',
  presentationMode: 'staff',
  verificationLevel: 'SESSION_VERIFIED',
  proofHash: PROOF,
} as const;

const input: Parameters<
  OperationalAlertWidgetTriggerPort['afterShiftAdmitted']
>[0] = {
  tenantId: 'tenant-a',
  runId: 'run-a',
  occurrenceRef: 'occurrence-a',
  occurredAt: '2026-09-24T08:00:00.000Z',
  admittedAt: '2026-09-24T08:00:01.000Z',
  expiresAt: '2026-09-24T09:00:00.000Z',
  recipient: {
    userId: 'user-a',
    role: 'master',
    title: 'Скоро начало смены',
    bodyText: 'Ваша смена начинается в 12:00.',
  },
  source: {
    localDate: '2026-09-24',
    timezone: 'Europe/Moscow',
    scheduledStartAt: '2026-09-24T09:00:00.000Z',
    scheduleEvidenceHash: 'b'.repeat(64),
  },
};

describe('P-MT3 MomentTriggerService', () => {
  const harness = (
    options: {
      entitled?: boolean;
      resolved?: typeof principal | null;
      previous?: { widgetId: string } | null;
      turnProof?: string;
    } = {},
  ) => {
    const emit = jest.fn().mockResolvedValue({ widgetId: 'widget-a' });
    const ensureAssistantTurn = jest.fn().mockResolvedValue({
      id: 'turn-a',
      principalProofHash: options.turnProof ?? PROOF,
    });
    const upsert = jest.fn();
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) =>
          callback({}),
        ),
      widgetEmission: {
        findFirst: jest.fn().mockResolvedValue(options.previous ?? null),
      },
      widgetSuppressedEmission: { upsert },
    } as unknown as PrismaService;
    const service = new MomentTriggerService(
      prisma,
      { emit } as unknown as WidgetEmitterService,
      { ensureAssistantTurn } as unknown as WidgetStoresService,
      {
        grantsRequiredFeatures: jest
          .fn()
          .mockResolvedValue(options.entitled ?? true),
      } as unknown as Gate6Owners,
      {
        resolve: jest
          .fn()
          .mockResolvedValue(
            options.resolved === undefined ? principal : options.resolved,
          ),
      },
    );
    return { service, emit, ensureAssistantTurn, upsert };
  };

  it('MT3-1 emits one strict web-push SCHEDULE from canonical typed facts', async () => {
    const h = harness();
    await h.service.afterShiftAdmitted(
      input,
      new Date('2026-09-24T08:01:00.000Z'),
    );
    expect(h.emit).toHaveBeenCalledTimes(1);
    type EmitRequest = Parameters<WidgetEmitterService['emit']>[0];
    const calls = h.emit.mock.calls as unknown as Array<[EmitRequest]>;
    const request = calls[0]?.[0];
    if (request === undefined) throw new Error('expected one emission');
    expect(request.tenantId).toBe('tenant-a');
    expect(request.kind).toBe('SCHEDULE');
    expect(request.deliveryChannel).toBe('web-push');
    expect(request.freshnessClass).toBe('proactive_once');
    expect(request.piiClass).toBe('none');
    expect(request.composerInput.origin.trigger).toBe('proactive');
    expect(request.composerInput.origin.moment_key).toBe('shift_reminder');
    expect(request.composerInput.intent_proposals).toEqual([
      {
        intent_template_key: 'navigate.schedule@1',
        role: 'primary',
      },
      {
        intent_template_key: 'control.dismiss@1',
        capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
        role: 'escape',
      },
    ]);
    expect(() => assertShiftScheduleBody(request.body)).not.toThrow();
  });

  it('MT3-2 writes nothing for a tenant without widgets.runtime', async () => {
    const h = harness({ entitled: false });
    await expect(
      h.service.afterShiftAdmitted(input, new Date('2026-09-24T08:01:00.000Z')),
    ).resolves.toBeNull();
    expect(h.ensureAssistantTurn).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
  });

  it.each([
    ['missing principal', null],
    [
      'foreign principal',
      {
        ...principal,
        authority: { ...principal.authority, userId: 'user-b' },
      },
    ],
    [
      'foreign tenant principal',
      {
        ...principal,
        authority: { ...principal.authority, tenantId: 'tenant-b' },
      },
    ],
  ])('%s cannot acquire the canonical moment', async (_label, resolved) => {
    const h = harness({ resolved: resolved as typeof principal | null });
    await expect(
      h.service.afterShiftAdmitted(input, new Date('2026-09-24T08:01:00.000Z')),
    ).resolves.toBeNull();
    expect(h.emit).not.toHaveBeenCalled();
  });

  it('refuses an expired artefact and a stale retained turn without emission', async () => {
    const expired = harness();
    await expect(
      expired.service.afterShiftAdmitted(
        input,
        new Date('2026-09-24T09:00:00.000Z'),
      ),
    ).resolves.toBeNull();
    expect(expired.emit).not.toHaveBeenCalled();

    const stale = harness({ turnProof: 'c'.repeat(64) });
    await expect(
      stale.service.afterShiftAdmitted(
        input,
        new Date('2026-09-24T08:01:00.000Z'),
      ),
    ).resolves.toBeNull();
    expect(stale.emit).not.toHaveBeenCalled();
  });

  it('replay returns the already emitted widget without a second mint', async () => {
    const h = harness({ previous: { widgetId: 'widget-prior' } });
    await expect(
      h.service.afterShiftAdmitted(input, new Date('2026-09-24T08:01:00.000Z')),
    ).resolves.toEqual({ widgetId: 'widget-prior' });
    expect(h.ensureAssistantTurn).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
  });

  it('rejects a final body with any hidden projector payload', () => {
    expect(() =>
      assertShiftScheduleBody({
        range: {},
        timezone: 'Europe/Moscow',
        lanes: [{}],
        buckets: [{}],
        entries: [{}],
        gaps: [],
        detail_intent: 'i1',
        llm_fact: 'forbidden',
      }),
    ).toThrow(/final body schema violation/);
  });
});
