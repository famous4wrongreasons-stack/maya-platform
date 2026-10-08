// Finite synthetic preservation fixture. No provider/model call or COMMIT submission.
// The controlled kernel's synthetic success is retained test data, never booking
// acceptance evidence. Consent and loyalty use their existing local owners.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

// Bootstrap first: preserve the existing Nest module import order.
import type {
  FixtureContext,
  GatewayHarness,
} from '../../widgets-live/support/bootstrap';
import {
  closedFixtureComposerInput,
  type Fixtures,
  type TenantFixture,
  type UserFixture,
} from '../../widgets-live/support/fixtures';
import { assertProofDatabase } from '../../widgets-live/support/proof-db-guard';
import { WIDGETS_LIVE_TEST_LITERALS } from '../../widgets-live/support/environment';
import type { AuthenticatedUser } from '../../../src/common/authenticated-user.interface';
import { ActionEngineKernel } from '../../../src/action-engine/action-engine.kernel';
import { ACTION_EXECUTION_REQUEST_CONTRACT } from '../../../src/action-engine/action-engine.contract';
import { TenantAppointmentRepository } from '../../../src/appointments/tenant-appointment.repository';
import { ClientAppointmentReadService } from '../../../src/crm/client-appointment-read.service';
import { ClientLoyaltyReadService } from '../../../src/crm/client-loyalty-read.service';
import { effectiveClientConsents } from '../../../src/crm/client-effective-consent';
import { LoyaltyService } from '../../../src/loyalty/loyalty.service';
import { Package5Wave3CanonicalCutoverService } from '../../../src/package5-wave3/package5-wave3-canonical-cutover.service';
import { TenantContextService } from '../../../src/tenancy/tenant-context.service';
import { TenantResolverService } from '../../../src/tenancy/tenant-resolver.service';
import { BookingConfirmationMinterService } from '../../../src/widgets/emission/booking-confirmation-minter.service';
import { SealService } from '../../../src/widgets/emission/seal.service';
import { mintBookingCreateFactsRef } from '../../../src/widgets/booking/booking-create-facts-ref';
import { WIDGET_ERASURE_CLASS_MAP } from '../../../src/widgets/consent/erasure.job';
import type { FactUsed } from '../../../src/widget-contract/envelope';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../../src/widgets/dto/submit-intent.dto';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const object = (value: unknown): Record<string, unknown> => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
};
const stable = (value: unknown): string => {
  const normalize = (input: unknown): unknown => {
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)]),
      );
    return input;
  };
  return JSON.stringify(normalize(value));
};

export interface PopulatedHistorySnapshot {
  /** Private fixture evidence; do not put business rows or labels in public reports. */
  readonly canonicalRows: string;
  readonly ownerReads: string;
  readonly retainedWidgetFacts: string;
  readonly siblingRows: string;
  /** Legacy narrative nested in an otherwise retained audit JSON column. */
  readonly terminalLegacyContent: readonly unknown[];
  readonly content: Readonly<
    Record<string, readonly Record<string, unknown>[]>
  >;
}

export interface PopulatedHistoryFixture {
  readonly contract: 'maya.history-erasure-populated-fixture/1';
  readonly tenantId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly linkId: string;
  readonly conversationId: string;
  readonly siblingConversationId: string;
  readonly appointmentId: string;
  readonly loyaltyAccountId: string;
  readonly executionIds: readonly string[];
  readonly bookingExecutionId: string;
  readonly approvalExecutionId: string;
  readonly widgetId: string;
  readonly predecessorWidgetId: string;
  readonly siblingWidgetId: string;
  readonly intentTokenHash: string;
  /** Private only, for one exact after-erasure HTTP rejection probe. */
  readonly oldSubmission: Readonly<Record<string, unknown>>;
  /** Unconsumed escape on the confirmation, for an erasure-specific refusal. */
  readonly oldControlSubmission: Readonly<Record<string, unknown>>;
  readonly draftRef: string;
  readonly contentMarker: string;
  readonly before: PopulatedHistorySnapshot;
  readonly qualifications: readonly string[];
}

export interface PopulatedHistorySetup {
  readonly ctx: FixtureContext;
  readonly gateway: GatewayHarness;
  readonly fixtures: Fixtures;
  /** The canonical proof caller owns the finite entitlement setup. */
  readonly setupEntitlements: (
    fixtures: Fixtures,
    tenant: TenantFixture,
  ) => Promise<void>;
  readonly tenant: TenantFixture;
  readonly user: UserFixture;
  readonly actor: Readonly<AuthenticatedUser>;
  /** Create the verified link before the parent captures its principal hash. */
  readonly client: { readonly clientId: string; readonly linkId: string };
  readonly conversationId: string;
  readonly targetTurnId: string;
  readonly siblingConversationId: string;
  readonly siblingTurnId: string;
}

const scopedOwner = <T>(
  gateway: GatewayHarness,
  actor: Readonly<AuthenticatedUser>,
  work: () => Promise<T>,
): Promise<T> => {
  const context = gateway.moduleRef.get(TenantContextService);
  const resolver = gateway.moduleRef.get(TenantResolverService);
  return context.run(`history-erasure-populated:${randomUUID()}`, () => {
    resolver.bindAuthenticatedUser(actor);
    return work();
  });
};
const fixtureKernel = (ctx: FixtureContext) =>
  new ActionEngineKernel(ctx.prisma, {
    identitySecret: WIDGETS_LIVE_TEST_LITERALS.ACTION_ENGINE_IDENTITY_SECRET,
    payloadEncryptionSecret:
      WIDGETS_LIVE_TEST_LITERALS.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET,
    controlledFixtureMode: true,
  });

/** Setup runs only on the owned fresh proof DB, before the separate binary boots. */
export async function populateHistoryErasureFixture(
  input: PopulatedHistorySetup,
): Promise<PopulatedHistoryFixture> {
  assertProofDatabase();
  const { ctx, gateway, fixtures, tenant, user, actor, client } = input;
  assert.equal(actor.tenantId, tenant.id);
  assert.equal(actor.userId, user.id);
  const principal = await fixtures.principalView(actor);
  const parent = await ctx.prisma.widgetTimelineTurn.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      id: input.targetTurnId,
      conversationId: input.conversationId,
      erasedAt: null,
    },
  });
  assert.equal(
    parent.principalProofHash,
    principal.proofHash,
    'Create Client binding before capturing the parent principal',
  );
  const link = await ctx.prisma.clientChannelLink.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      id: client.linkId,
      clientId: client.clientId,
      revokedAt: null,
    },
  });
  assert.equal(link.verificationVersion, 1);
  assert.equal(
    (await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } }))
      .calendarSource,
    'internal',
  );
  await input.setupEntitlements(fixtures, tenant);
  const now = new Date();
  const contentMarker = `Синтетическая сохранённая запись ${randomUUID().slice(0, 8)}`;

  // Canonical appointment repository, no calendar/provider dispatch. This is
  // explicitly seeded history, not an accepted user booking from the browser.
  const appointments = new TenantAppointmentRepository(
    ctx.prisma,
    ctx.tenantContext,
  );
  const appointment = await ctx.tenantContext.runAsSystemTenant(tenant.id, () =>
    appointments.createForClient({
      clientId: user.id,
      branchId: null,
      crmExternalId: null,
      crmProvider: null,
      source: 'history-erasure-synthetic',
      staffId: null,
      staffExternalId: 'synthetic-erasure-staff',
      serviceIds: ['synthetic-erasure-service'],
      startAt: now,
      endAt: new Date(now.getTime() + 3600000),
      blockedStartAt: now,
      blockedEndAt: new Date(now.getTime() + 3600000),
      status: 'confirmed',
      notes: null,
      totalPriceKopecks: 150000,
      currency: 'RUB',
    }),
  );
  // Repository's legacy create API has no Maya Client argument. This exact
  // fixture association is qualified; it is not an identity inference.
  await ctx.prisma.appointment.update({
    where: { id: appointment.id, tenantId: tenant.id },
    data: { mayaClientId: client.clientId },
  });

  const consent = gateway.moduleRef.get(Package5Wave3CanonicalCutoverService);
  await scopedOwner(gateway, actor, async () => {
    for (const kind of ['privacy', 'marketing'] as const)
      await consent.recordClientConsent(
        tenant.id,
        user.id,
        client.clientId,
        kind,
        kind === 'privacy',
        now,
        `history-erasure:${randomUUID()}:${kind}`,
      );
  });
  const facts = await ctx.prisma.clientConsentFact.findMany({
    where: { tenantId: tenant.id, clientId: client.clientId },
    orderBy: { id: 'asc' },
  });
  assert.equal(facts.length, 2);
  assert.ok(facts.every((fact) => fact.actionExecutionId !== null));

  // Establish an empty synthetic account, then use the actual local adjustment
  // owner/AE for its populated balance, encrypted reason and transaction.
  const loyaltyAccount = await ctx.prisma.loyaltyAccount.create({
    data: {
      tenantId: tenant.id,
      clientId: client.clientId,
      userId: user.id,
      source: 'internal',
      balance: 0,
    },
  });
  await scopedOwner(gateway, actor, () =>
    gateway.moduleRef.get(LoyaltyService).adjustInternalBalance({
      tenantId: tenant.id,
      targetUserId: user.id,
      actorUserId: user.id,
      sourceRef: 'http.admin-loyalty.adjust',
      dto: {
        delta: 25,
        reason: 'Synthetic erasure preservation adjustment',
        idempotencyKey: randomUUID(),
      },
    }),
  );
  const ledger = await ctx.prisma.loyaltyTransaction.findMany({
    where: { tenantId: tenant.id, accountId: loyaltyAccount.id },
  });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].balanceAfter, 25);
  assert.ok(ledger[0].actionExecutionId);

  // Existing controlled fixture ingress/kernel produces durable approval,
  // attempts, evidence and receipt. No production executor is called here.
  const kernel = fixtureKernel(ctx);
  const booking = await kernel.createExecutionForControlledFixture({
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: tenant.id,
    capability: 'crm.appointment.create.v1',
    source: {
      type: 'authenticated_request',
      actorUserId: user.id,
      occurrenceScope: `synthetic-erasure:${randomUUID()}`,
      sourceRef: 'history-erasure-synthetic-fixture',
    },
    targetRef: appointment.id,
    input: {
      clientId: client.clientId,
      clientName: 'Synthetic fixture',
      staffId: 'synthetic-erasure-staff',
      serviceIds: ['synthetic-erasure-service'],
      start: now.toISOString(),
    },
    evidenceRefs: [`synthetic-appointment:${appointment.id}`],
  });
  const approval = await kernel.createExecutionForControlledFixture({
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: tenant.id,
    capability: 'kernel.test.approval',
    source: {
      type: 'synthetic_shadow',
      actorUserId: user.id,
      occurrenceScope: `synthetic-erasure:${randomUUID()}`,
      sourceRef: 'history-erasure-synthetic-approval',
    },
    targetRef: appointment.id,
    input: { valueRef: appointment.id },
    evidenceRefs: [`synthetic-appointment:${appointment.id}`],
  });
  await kernel.decideApproval({
    tenantId: tenant.id,
    executionId: approval.id,
    approverUserId: user.id,
    decision: 'APPROVED',
  });
  for (const execution of [booking, approval]) {
    const claim = await kernel.claimExecution({
      tenantId: tenant.id,
      executionId: execution.id,
      workerId: 'history-erasure-synthetic-fixture',
    });
    await kernel.finalizeSuccess({
      tenantId: tenant.id,
      executionId: execution.id,
      attemptId: claim.attempt.id,
      leaseToken: claim.leaseToken,
      outcomeCode: 'SYNTHETIC_FIXTURE_RETAINED',
      safeResult: { synthetic: true, appointmentId: appointment.id },
    });
  }

  const emitMetric = async (
    conversationId: string,
    userTurnId: string,
    label: string,
  ) => {
    const userTurn = await ctx.prisma.widgetTimelineTurn.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        conversationId,
        id: userTurnId,
        principalProofHash: principal.proofHash,
        erasedAt: null,
      },
    });
    const turn = await gateway.stores.appendTurn(
      {
        tenantId: tenant.id,
        conversationId,
        turnIndex: userTurn.turnIndex + 1,
        role: 'assistant',
        principalProofHash: principal.proofHash,
        channel: 'pwa',
        textContent: label,
        spokenTranscript: label,
      },
      now,
    );
    return gateway.emitter.emit(
      {
        tenantId: tenant.id,
        conversationId,
        turnId: turn.id,
        principalProofHash: principal.proofHash,
        kind: 'METRIC',
        deliveryChannel: 'pwa',
        body: { value: 1, label },
        ttlSeconds: 600,
        freshnessClass: 'live',
        principal,
        composerInput: closedFixtureComposerInput({
          kind: 'METRIC',
          turnId: turn.id,
          executionId: booking.id,
        }),
      },
      now,
    );
  };
  const predecessor = await emitMetric(
    input.conversationId,
    input.targetTurnId,
    contentMarker,
  );
  const sibling = await emitMetric(
    input.siblingConversationId,
    input.siblingTurnId,
    'Синтетическая карточка другого разговора',
  );
  const fact: FactUsed = {
    capability: 'appointments.own.create',
    status: 'measured',
    as_of: now.toISOString(),
    evidence_refs: [`synthetic-appointment:${appointment.id}`],
    completeness: {
      status: 'COMPLETE',
      requestedScopeHash: hash(appointment.id),
      returnedCount: 1,
      totalCount: 1,
      hasMore: false,
      cursorRef: null,
      truncated: false,
      reasonCodes: [],
    },
  };
  const draftRef = mintBookingCreateFactsRef(hash(stable(fact)));
  await gateway.stores.putDraft(
    {
      tenantId: tenant.id,
      draftRef,
      draftClass: 'task',
      ownerCapabilitySpace: 'AE',
      ownerCapabilityKey: 'appointments.own.create',
      principalProofHash: principal.proofHash,
      diff: null,
      ttlSeconds: 600,
    },
    now,
  );
  const handles = gateway.moduleRef.get(SealService).mintNounHandles([
    {
      tenantId: tenant.id,
      noun: 'service',
      ownerKind: 'catalog_service',
      ownerRef: 'synthetic-erasure-service',
    },
    {
      tenantId: tenant.id,
      noun: 'staff',
      ownerKind: 'catalog_staff',
      ownerRef: 'synthetic-erasure-staff',
    },
    {
      tenantId: tenant.id,
      noun: 'slot',
      ownerKind: 'booking_availability',
      ownerRef: 'synthetic-erasure-slot',
    },
  ]);
  const confirmation = await gateway.moduleRef
    .get(BookingConfirmationMinterService)
    .mint({
      tenantId: tenant.id,
      predecessorWidgetId: predecessor.widgetId,
      principal,
      deliveryChannel: 'pwa',
      now,
      preview: {
        subject: 'create',
        sourceCapabilityKey: 'appointments.own.create',
        frozenArgumentHandles: handles,
        draftRef,
        appointmentRef: null,
        producingIntentTokenHash: null,
        when: now.toISOString(),
        whenPrevious: null,
        serviceLabel: contentMarker,
        staffLabel: 'Синтетический мастер',
        durationMinutes: 60,
        priceKopecks: 150000,
        currency: 'RUB',
        fact,
      },
    });
  assert.equal(typeof confirmation.widget_id, 'string');
  const widgetId = String(confirmation.widget_id);
  assert.ok(Array.isArray(confirmation.intents));
  const commit = confirmation.intents
    .map(object)
    .find((intent) => intent.effect === 'COMMIT');
  assert.ok(commit);
  assert.ok(typeof commit.intent_token === 'string');
  const control = confirmation.intents
    .map(object)
    .find((intent) => intent.effect === 'CONTROL');
  assert.ok(control && typeof control.intent_token === 'string');
  const controlRecord = await ctx.prisma.widgetIntentRecord.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      widgetId,
      intentTokenHash: hash(control.intent_token),
      effect: 'CONTROL',
      consumedAt: null,
      emission: { is: { supersededByWidgetId: null } },
    },
  });
  assert.ok(controlRecord.expiresAt > now);
  assert.equal(await gateway.emitter.verifySeal(tenant.id, widgetId), true);
  const intentTokenHash = hash(commit.intent_token);
  const record = await ctx.prisma.widgetIntentRecord.findFirstOrThrow({
    where: { tenantId: tenant.id, widgetId, intentTokenHash, effect: 'COMMIT' },
  });
  await gateway.stores.recordSubmission(
    {
      tenantId: tenant.id,
      widgetId,
      intentTokenHash,
      clientNonce: randomUUID(),
      profileId: 'pwa.default',
      inputsClosed: {},
      readbackAffirmation: 'synthetic historical affirmation',
      spokenTranscript: contentMarker,
    },
    now,
  );
  // Consumes this fixture's already-finished action; never send this token to AE.
  assert.equal(record.singleUse, true);
  const consumed = await gateway.stores.claimIntentRecord({
    tenantId: tenant.id,
    intentTokenHash,
    singleUse: record.singleUse,
    now,
  });
  assert.equal(consumed, true);
  await gateway.stores.writeReceipt(
    {
      tenantId: tenant.id,
      widgetId,
      intentTokenHash,
      outcome: 'ACCEPTED',
      answeringChannel: 'pwa',
      actionReceiptRef: booking.id,
    },
    now,
  );

  // Historical C/X compatibility fixture only. These columns have no current
  // content writer (receipt echo is deliberately always null); no A/seal,
  // authority, effect, handle or confirmation linkage is altered.
  await ctx.prisma.widgetIntentRecord.update({
    where: { id: record.id },
    data: {
      renderedUtterance: contentMarker,
      selectedLabels: [contentMarker],
      selectionDomainLabelsJson: { synthetic: contentMarker },
      spokenTranscript: contentMarker,
    },
  });
  await ctx.prisma.widgetIntentSubmissionAudit.updateMany({
    where: { tenantId: tenant.id, intentTokenHash },
    data: {
      inputsFreeTextJson: { note: contentMarker },
      inputsPiiJson: { synthetic: 'not-a-real-person' },
    },
  });
  await ctx.prisma.widgetIntentReceipt.updateMany({
    where: { tenantId: tenant.id, intentTokenHash },
    data: { utteranceEcho: contentMarker },
  });
  await ctx.prisma.widgetDraft.updateMany({
    where: { tenantId: tenant.id, draftRef },
    data: { diffJson: { syntheticHistoricalCopy: contentMarker } },
  });
  const terminal = await ctx.prisma.widgetEmission.findFirstOrThrow({
    where: { tenantId: tenant.id, widgetId },
    select: { terminalLinesJson: true },
  });
  assert.ok(Array.isArray(terminal.terminalLinesJson));
  assert.equal(terminal.terminalLinesJson.length, 1);
  const retainedLine = object(terminal.terminalLinesJson[0]);
  assert.equal(retainedLine.outcome, 'CONFIRMED');
  assert.equal(retainedLine.action_receipt_ref, booking.id);
  // Reproduce the historical mixed A/C shape while preserving the exact owner
  // outcome/ref. Current writers intentionally cannot add this narrative.
  await ctx.prisma.widgetEmission.updateMany({
    where: { tenantId: tenant.id, widgetId },
    data: {
      terminalLinesJson: [
        {
          outcome: 'CONFIRMED',
          action_receipt_ref: booking.id,
          text: contentMarker,
          legacy_copy: { transcript: contentMarker },
        },
      ],
    },
  });
  // Unrelated legacy C fixture: not a booking receipt or delivery claim. Exact
  // siblingRows equality must preserve it when the target conversation erases.
  await ctx.prisma.widgetEmission.updateMany({
    where: { tenantId: tenant.id, widgetId: sibling.widgetId },
    data: {
      terminalLinesJson: [
        {
          outcome: 'DELIVERED_ONLY',
          action_receipt_ref: null,
          text: 'Synthetic sibling content remains after other conversation erasure',
        },
      ],
    },
  });
  const executions = await ctx.prisma.actionExecution.findMany({
    where: { tenantId: tenant.id },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  const base: Omit<PopulatedHistoryFixture, 'before'> = {
    contract: 'maya.history-erasure-populated-fixture/1',
    tenantId: tenant.id,
    userId: user.id,
    clientId: client.clientId,
    linkId: client.linkId,
    conversationId: input.conversationId,
    siblingConversationId: input.siblingConversationId,
    appointmentId: appointment.id,
    loyaltyAccountId: loyaltyAccount.id,
    executionIds: executions.map((row) => row.id),
    bookingExecutionId: booking.id,
    approvalExecutionId: approval.id,
    widgetId,
    predecessorWidgetId: predecessor.widgetId,
    siblingWidgetId: sibling.widgetId,
    intentTokenHash,
    draftRef,
    contentMarker,
    oldSubmission: {
      contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
      widget_id: widgetId,
      intent_token: commit.intent_token,
      inputs: null,
      client_nonce: randomUUID(),
      profile_id: 'pwa.default',
    },
    oldControlSubmission: {
      contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
      widget_id: widgetId,
      intent_token: control.intent_token,
      inputs: null,
      client_nonce: randomUUID(),
      profile_id: 'pwa.default',
    },
    qualifications: [
      'synthetic fixture, not real booking/model/provider acceptance',
      'booking receipt and approval use existing controlled fixture kernel; no COMMIT dispatch',
      'consent register/export owner is unregistered; consent facts/effective read/AE receipts only',
      'AE approval fields preserved; AiApprovalRequest and payment owners are outside this fixture',
      'legacy repair covers historical valid outcome/ref shape with extra C fields; malformed A values are not qualified',
      'legacy C/X copies are explicitly seeded without modifying A/seal/authority',
      'appointment Client association is explicit fixture linkage; legacy repository lacks this argument',
    ],
  };
  const before = await readPopulatedHistorySnapshot(ctx, gateway, actor, base);
  assert.ok(before.ownerReads.includes('25'));
  assert.ok(
    before.content.WidgetEmission.some((row) =>
      stable(row.bodyJson).includes(contentMarker),
    ),
  );
  assert.ok(
    before.content.WidgetRenderReceipt.some(
      (row) => row.emittedEnvelopeJson !== null,
    ),
  );
  assert.ok(stable(before.terminalLegacyContent).includes(contentMarker));
  return { ...base, before };
}

/** Actual owner reads plus complete retained-row comparison, reusable after restart. */
export async function readPopulatedHistorySnapshot(
  ctx: FixtureContext,
  gateway: GatewayHarness,
  actor: Readonly<AuthenticatedUser>,
  fixture: Omit<PopulatedHistoryFixture, 'before'>,
): Promise<PopulatedHistorySnapshot> {
  assertProofDatabase();
  const tenantId = fixture.tenantId;
  assert.equal(actor.tenantId, tenantId);
  assert.equal(actor.userId, fixture.userId);
  const kernel = gateway.moduleRef.get(ActionEngineKernel);
  const ownerReads = await scopedOwner(gateway, actor, async () => ({
    appointments: await gateway.moduleRef
      .get(ClientAppointmentReadService)
      .forAccount(tenantId, fixture.userId),
    loyalty: await gateway.moduleRef
      .get(ClientLoyaltyReadService)
      .forAccount(tenantId, fixture.userId, true, 20),
    consent: await effectiveClientConsents(
      ctx.prisma,
      tenantId,
      fixture.clientId,
    ),
    executions: await Promise.all(
      fixture.executionIds.map((id) => kernel.getAudit(tenantId, id)),
    ),
    receipts: await Promise.all(
      fixture.executionIds.map((id) => kernel.getExecutionResult(tenantId, id)),
    ),
  }));
  const canonicalRows = await Promise.all([
    ctx.prisma.client.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
    ctx.prisma.appointment.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
    ctx.prisma.clientConsentFact.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
    ctx.prisma.customerProfile.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
    ctx.prisma.clientChannelLink.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
    ctx.prisma.loyaltyAccount.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
    ctx.prisma.loyaltyTransaction.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
    ctx.prisma.actionExecution.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
    ctx.prisma.actionAttempt.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
    ctx.prisma.actionTargetMutation.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    }),
  ]);
  const rowsFor = async (conversationId: string) => {
    const turns = await ctx.prisma.widgetTimelineTurn.findMany({
      where: { tenantId, conversationId },
      orderBy: { id: 'asc' },
    });
    const emissions = await ctx.prisma.widgetEmission.findMany({
      where: { tenantId, turnId: { in: turns.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    });
    const widgetIds = emissions.map((row) => row.widgetId);
    const records = await ctx.prisma.widgetIntentRecord.findMany({
      where: { tenantId, widgetId: { in: widgetIds } },
      orderBy: { id: 'asc' },
    });
    const scope = {
      tenantId,
      intentTokenHash: { in: records.map((row) => row.intentTokenHash) },
    };
    const drafts = records
      .filter(
        (row) =>
          row.confirmationOfKind === 'draft' && row.confirmationOfRef !== null,
      )
      .map((row) => row.confirmationOfRef!);
    return {
      WidgetTimelineTurn: turns,
      WidgetEmission: emissions,
      WidgetIntentRecord: records,
      WidgetIntentSubmissionAudit:
        await ctx.prisma.widgetIntentSubmissionAudit.findMany({
          where: scope,
          orderBy: { id: 'asc' },
        }),
      WidgetIntentReceipt: await ctx.prisma.widgetIntentReceipt.findMany({
        where: scope,
        orderBy: { id: 'asc' },
      }),
      WidgetRenderReceipt: await ctx.prisma.widgetRenderReceipt.findMany({
        where: { tenantId, widgetId: { in: widgetIds } },
        orderBy: { id: 'asc' },
      }),
      WidgetDraft: await ctx.prisma.widgetDraft.findMany({
        where: { tenantId, draftRef: { in: drafts } },
        orderBy: { id: 'asc' },
      }),
    };
  };
  const target = await rowsFor(fixture.conversationId);
  const terminalLegacyContent: unknown[] = [];
  const terminalAudit = (widgetId: string, value: unknown): unknown => {
    if (value === null) return null;
    assert.ok(Array.isArray(value));
    return value.map((line) => {
      const fields = object(line);
      const extra = Object.fromEntries(
        Object.entries(fields).filter(
          ([key]) => key !== 'outcome' && key !== 'action_receipt_ref',
        ),
      );
      if (Object.keys(extra).length)
        terminalLegacyContent.push({ widgetId, fields: extra });
      return {
        outcome: fields.outcome,
        action_receipt_ref: fields.action_receipt_ref,
      };
    });
  };
  const retained: Record<string, unknown> = {},
    content: Record<string, Record<string, unknown>[]> = {};
  for (const [model, rows] of Object.entries(target)) {
    const fields = Object.keys(
      WIDGET_ERASURE_CLASS_MAP[model as keyof typeof WIDGET_ERASURE_CLASS_MAP],
    );
    retained[model] = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row)
          .filter(([key]) => key !== 'erasedAt' && !fields.includes(key))
          .map(([key, value]) => [
            key,
            key === 'terminalLinesJson'
              ? terminalAudit(String(object(row).widgetId), value)
              : value,
          ]),
      ),
    );
    content[model] = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(
          ([key]) => key === 'erasedAt' || fields.includes(key),
        ),
      ),
    );
  }
  return {
    canonicalRows: stable(canonicalRows),
    ownerReads: stable(ownerReads),
    retainedWidgetFacts: stable(retained),
    siblingRows: stable(await rowsFor(fixture.siblingConversationId)),
    terminalLegacyContent,
    content,
  };
}

export function assertPopulatedHistoryErased(
  fixture: PopulatedHistoryFixture,
  after: PopulatedHistorySnapshot,
): void {
  assert.equal(
    after.canonicalRows,
    fixture.before.canonicalRows,
    'Canonical facts changed during history erasure',
  );
  assert.equal(
    after.ownerReads,
    fixture.before.ownerReads,
    'Canonical owner read changed during history erasure',
  );
  assert.equal(
    after.retainedWidgetFacts,
    fixture.before.retainedWidgetFacts,
    'Audit-retained widget facts changed',
  );
  assert.equal(
    after.siblingRows,
    fixture.before.siblingRows,
    'Other conversation changed',
  );
  assert.ok(
    fixture.before.terminalLegacyContent.length > 0,
    'Legacy terminal narrative was not exercised',
  );
  assert.deepEqual(
    after.terminalLegacyContent,
    [],
    'Legacy terminal narrative or extra fields remain',
  );
  for (const [model, rows] of Object.entries(after.content)) {
    assert.ok(rows.length > 0, `Populated ${model} was not exercised`);
    assert.equal(
      rows.length,
      fixture.before.content[model].length,
      `${model} audit rows were removed`,
    );
    for (const row of rows) {
      assert.ok(
        row.erasedAt instanceof Date,
        `${model} missing erasure marker`,
      );
      for (const [field, value] of Object.entries(row)) {
        if (field === 'erasedAt') continue;
        if (field === 'selectedLabels') assert.deepEqual(value, []);
        else
          assert.equal(value, null, `${model}.${field} retained C/X content`);
      }
    }
  }
}
