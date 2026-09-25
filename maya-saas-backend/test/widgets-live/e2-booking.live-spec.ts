// Wave 6 / E2 — the six booking edges on the real widget gateway, real
// PostgreSQL stores, real canonical appointment owners and the isolated
// internal-calendar provider.  Fixture writes establish source facts only;
// every create/reschedule/cancel effect below enters through the production
// WidgetEmitter → 13 gates → Gate 14 → Action Engine path.

import { randomUUID } from 'node:crypto';

import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { C9_REGISTRY_HASH } from '../../src/orchestration/c9.registry';
import type {
  FactUsed,
  WidgetComposerInput,
} from '../../src/widget-contract/envelope';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import { SealService } from '../../src/widgets/emission/seal.service';
import type { PrincipalView } from '../../src/widgets/gate.types';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { Fixtures, type TenantFixture } from './support/fixtures';

type Envelope = Readonly<Record<string, unknown>>;
type Intent = Readonly<Record<string, unknown>>;

const scopeHash = (label: string): string =>
  Buffer.from(label.repeat(16), 'utf8')
    .toString('hex')
    .slice(0, 64)
    .padEnd(64, '0');

const fact = (capability: string, label: string): FactUsed => ({
  capability,
  status: 'measured',
  as_of: new Date().toISOString(),
  evidence_refs: [`proof:${label}`],
  completeness: {
    status: 'COMPLETE',
    requestedScopeHash: scopeHash(label),
    returnedCount: 1,
    totalCount: 1,
    hasMore: false,
    cursorRef: null,
    truncated: false,
    reasonCodes: [],
  },
});

const input = (args: {
  kind: 'SERVICE_SELECTOR' | 'SCHEDULE';
  sourceCapability: 'catalog.services.read' | 'operations.journal.read';
  template: string;
  subject: string;
  handles: Readonly<Record<string, string>>;
  label: string;
}): WidgetComposerInput => ({
  kind_proposal: args.kind,
  capability: args.sourceCapability,
  capability_version: C9_REGISTRY_HASH,
  source: {
    from: 'capability_envelope',
    capability: args.sourceCapability,
    capability_version: C9_REGISTRY_HASH,
    fact_index: 0,
  },
  correlation_refs: { turn_id: randomUUID() },
  origin: {
    trigger: 'system_reply',
    emitter: 'capability_read',
    moment_key: null,
    proactive_provenance: null,
  },
  facts: [fact(args.sourceCapability, args.label)],
  facts_origin: ['copied'],
  slots: {},
  limitation_codes: [],
  intent_proposals: [
    {
      intent_template_key: args.template,
      capability: { space: 'C9', key: args.subject },
      argument_handles: args.handles,
      role: 'primary',
    },
    {
      intent_template_key: 'control.dismiss@1',
      capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
      role: 'escape',
    },
  ],
  locale: 'en',
});

const intent = (envelope: Envelope, effect: string): Intent => {
  const intents = envelope.intents;
  if (!Array.isArray(intents)) throw new Error('E2 envelope has no intents');
  const found = intents.find(
    (candidate): candidate is Intent =>
      typeof candidate === 'object' &&
      candidate !== null &&
      !Array.isArray(candidate) &&
      (candidate as Record<string, unknown>).effect === effect,
  );
  if (!found) throw new Error(`E2 envelope has no ${effect} intent`);
  return found;
};

const tokenOf = (value: Intent): string => {
  if (typeof value.intent_token !== 'string' || value.intent_token.length === 0)
    throw new Error('E2 intent has no token');
  return value.intent_token;
};

const widgetIdOf = (value: Envelope): string => {
  if (typeof value.widget_id !== 'string' || value.widget_id.length === 0)
    throw new Error('E2 envelope has no widget id');
  return value.widget_id;
};

describe('E2 — BOOK-1…BOOK-6 and live Gate 14 booking COMMIT [GW, PostgreSQL]', () => {
  let db: FixtureContext;
  let gw: GatewayHarness;
  let fx: Fixtures;
  let seals: SealService;

  beforeAll(async () => {
    db = await bootFixtureContext();
    gw = await bootGateway();
    fx = new Fixtures(db, gw);
    seals = gw.moduleRef.get(SealService);
  });

  afterEach(async () => {
    await fx.teardown();
    gw.recorder.clear();
  });

  afterAll(async () => {
    await gw?.close();
    await db?.close();
  });

  const submit = async (
    actor: Awaited<ReturnType<Fixtures['actor']>>,
    envelope: Envelope,
    selected: Intent,
    label: string,
  ) =>
    (await gw.intent(
      actor,
      {
        contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
        widget_id: widgetIdOf(envelope),
        intent_token: tokenOf(selected),
        inputs: null,
        client_nonce: `e2-${label}-${randomUUID().slice(0, 8)}`,
        profile_id: 'pwa.default',
      },
      `E2:${label}`,
    )) as unknown as Record<string, unknown>;

  const emit = async (args: {
    tenant: TenantFixture;
    principal: PrincipalView;
    kind: 'SERVICE_SELECTOR' | 'SCHEDULE';
    sourceCapability: 'catalog.services.read' | 'operations.journal.read';
    template: string;
    subject: string;
    handles: Readonly<Record<string, string>>;
    label: string;
  }): Promise<Envelope> => {
    const conversationId = randomUUID();
    const turn = await gw.stores.appendTurn({
      tenantId: args.tenant.id,
      conversationId,
      turnIndex: 0,
      role: 'assistant',
      principalProofHash: args.principal.proofHash,
      channel: 'pwa',
    });
    const minted = await gw.emitter.emit({
      tenantId: args.tenant.id,
      conversationId,
      turnId: turn.id,
      kind: args.kind,
      principalProofHash: args.principal.proofHash,
      deliveryChannel: 'pwa',
      body: { e2: args.label },
      ttlSeconds: 600,
      freshnessClass: 'live',
      composerInput: input(args),
      principal: args.principal,
    });
    return minted.envelope;
  };

  it('BOOK-1…BOOK-6: create, reschedule and cancel each propose then COMMIT through Gate 14', async () => {
    const tenant = await fx.tenant('E2 booking', CalendarSource.INTERNAL);
    const user = await fx.user(tenant, UserRole.CLIENT);
    await db.prisma.user.update({
      where: { id: user.id },
      data: {
        encryptedName: db.encryption.encrypt('E2 Client'),
        phone: `+7999${String(Date.now()).slice(-7)}`,
      },
    });
    const client = await fx.client(tenant, user);
    await fx.grantFeature(tenant, 'widgets.runtime');
    await fx.grantFeature(tenant, 'ai.consultant');
    await fx.grantFeature(tenant, 'booking.customer_app');
    await fx.grantFeature(tenant, 'crm.integration');

    const service = await db.prisma.internalService.create({
      data: {
        tenantId: tenant.id,
        name: 'E2 Service',
        price: 1500,
        durationMinutes: 30,
      },
    });
    const provider = await db.prisma.internalProvider.create({
      data: {
        tenantId: tenant.id,
        displayName: 'E2 Provider',
        active: true,
        slotIntervalMinutes: 30,
      },
    });
    await db.prisma.internalProviderService.create({
      data: {
        tenantId: tenant.id,
        providerId: provider.id,
        serviceId: service.id,
      },
    });
    await db.prisma.internalAvailabilityRule.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        tenantId: tenant.id,
        providerId: provider.id,
        weekday,
        startMinute: 0,
        endMinute: 1440,
      })),
    });

    const actor = await fx.actor(tenant, user);
    const principal = await fx.principalView(actor);

    const day = (offset: number): string => {
      const value = new Date(Date.now() + offset * 86_400_000);
      return value.toISOString().slice(0, 10);
    };
    const createDay = day(14);
    const rescheduleDay = day(16);
    const createHandles = seals.mintNounHandles([
      {
        tenantId: tenant.id,
        noun: 'service',
        ownerKind: 'internal_service',
        ownerRef: service.id,
      },
      {
        tenantId: tenant.id,
        noun: 'staff',
        ownerKind: 'internal_provider',
        ownerRef: provider.id,
      },
      {
        tenantId: tenant.id,
        noun: 'slot',
        ownerKind: 'availability_slot',
        ownerRef: createDay,
      },
    ]);

    // BOOK-1: a server-minted DRAFT reaches the canonical read-only booking owner.
    const createSource = await emit({
      tenant,
      principal,
      kind: 'SERVICE_SELECTOR',
      sourceCapability: 'catalog.services.read',
      template: 'draft.booking.create@1',
      subject: 'appointments.own.create',
      handles: createHandles,
      label: 'BOOK-1',
    });
    const book1 = await submit(
      actor,
      createSource,
      intent(createSource, 'DRAFT'),
      'BOOK-1',
    );
    if (book1.outcome !== 'terminate')
      throw new Error(`BOOK-1 refused: ${JSON.stringify(book1)}`);
    expect(book1).toMatchObject({
      outcome: 'terminate',
      receipt_outcome: 'ACCEPTED',
    });
    const createConfirmation = book1.next_envelope as Envelope;
    expect(createConfirmation).toMatchObject({ kind: 'BOOKING_CONFIRMATION' });

    // BOOK-2: the linked COMMIT reaches Gate 14 and the existing Action Engine owner.
    const book2 = await submit(
      actor,
      createConfirmation,
      intent(createConfirmation, 'COMMIT'),
      'BOOK-2',
    );
    if (book2.receipt_outcome !== 'ACCEPTED')
      throw new Error(`BOOK-2 refused: ${JSON.stringify(book2)}`);
    expect(book2).toMatchObject({
      outcome: 'terminate',
      receipt_outcome: 'ACCEPTED',
    });
    expect(book2.owner_decision).toMatchObject({ state: 'SUCCEEDED' });
    const appointment = await db.prisma.appointment.findFirstOrThrow({
      where: { tenantId: tenant.id, mayaClientId: client.clientId },
    });
    expect(appointment.status).toBe('confirmed');
    const rescheduleHandles = seals.mintNounHandles([
      {
        tenantId: tenant.id,
        noun: 'appointment',
        ownerKind: 'appointment',
        ownerRef: appointment.id,
      },
      {
        tenantId: tenant.id,
        noun: 'service',
        ownerKind: 'internal_service',
        ownerRef: service.id,
      },
      {
        tenantId: tenant.id,
        noun: 'staff',
        ownerKind: 'internal_provider',
        ownerRef: provider.id,
      },
      {
        tenantId: tenant.id,
        noun: 'slot',
        ownerKind: 'availability_slot',
        ownerRef: rescheduleDay,
      },
    ]);

    // BOOK-3 / BOOK-4: REFINE proposes a linked record confirmation, then Gate 14 reschedules it.
    const rescheduleSource = await emit({
      tenant,
      principal,
      kind: 'SCHEDULE',
      sourceCapability: 'operations.journal.read',
      template: 'refine.booking.reschedule@1',
      subject: 'appointments.own.reschedule',
      handles: rescheduleHandles,
      label: 'BOOK-3',
    });
    const book3 = await submit(
      actor,
      rescheduleSource,
      intent(rescheduleSource, 'REFINE'),
      'BOOK-3',
    );
    expect(book3).toMatchObject({
      outcome: 'terminate',
      receipt_outcome: 'ACCEPTED',
    });
    const rescheduleConfirmation = book3.next_envelope as Envelope;
    const book4 = await submit(
      actor,
      rescheduleConfirmation,
      intent(rescheduleConfirmation, 'COMMIT'),
      'BOOK-4',
    );
    expect(book4).toMatchObject({
      outcome: 'terminate',
      receipt_outcome: 'ACCEPTED',
    });
    expect(book4.owner_decision).toMatchObject({ state: 'SUCCEEDED' });
    const moved = await db.prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(moved.startAt.getTime()).not.toBe(appointment.startAt.getTime());

    const cancelHandles = seals.mintNounHandles([
      {
        tenantId: tenant.id,
        noun: 'appointment',
        ownerKind: 'appointment',
        ownerRef: appointment.id,
      },
    ]);

    // BOOK-5 / BOOK-6: cancellation is separately proposed and separately committed.
    const cancelSource = await emit({
      tenant,
      principal,
      kind: 'SCHEDULE',
      sourceCapability: 'operations.journal.read',
      template: 'refine.booking.cancel@1',
      subject: 'appointments.own.cancel',
      handles: cancelHandles,
      label: 'BOOK-5',
    });
    const book5 = await submit(
      actor,
      cancelSource,
      intent(cancelSource, 'REFINE'),
      'BOOK-5',
    );
    expect(book5).toMatchObject({
      outcome: 'terminate',
      receipt_outcome: 'ACCEPTED',
    });
    const cancelConfirmation = book5.next_envelope as Envelope;
    const book6 = await submit(
      actor,
      cancelConfirmation,
      intent(cancelConfirmation, 'COMMIT'),
      'BOOK-6',
    );
    expect(book6).toMatchObject({
      outcome: 'terminate',
      receipt_outcome: 'ACCEPTED',
    });
    expect(book6.owner_decision).toMatchObject({ state: 'SUCCEEDED' });
    await expect(
      db.prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
      }),
    ).resolves.toMatchObject({ status: 'canceled' });

    const executions = await db.prisma.actionExecution.findMany({
      where: {
        tenantId: tenant.id,
        capability: {
          in: [
            'crm.appointment.create.v1',
            'crm.appointment.reschedule.v1',
            'crm.appointment.cancel.v1',
          ],
        },
      },
      select: { capability: true, state: true },
    });
    expect(executions).toEqual(
      expect.arrayContaining([
        { capability: 'crm.appointment.create.v1', state: 'SUCCEEDED' },
        { capability: 'crm.appointment.reschedule.v1', state: 'SUCCEEDED' },
        { capability: 'crm.appointment.cancel.v1', state: 'SUCCEEDED' },
      ]),
    );
    expect(executions).toHaveLength(3);
  }, 120_000);
});
