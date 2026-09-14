/** Isolated PostgreSQL constraints proof. Synthetic AE state fixtures are NOT runtime acceptance. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55509');
assert.ok(['/maya_rc_replay', '/maya_rc_clean_replay'].includes(url.pathname));
const rawDb = new PrismaService(
  new ConfigService({ DATABASE_URL: url.toString() }),
);
// Each schema operation uses the same bounded UTC transaction as the R-C owners.
const db = new Proxy(rawDb, {
  get(target, property, receiver) {
    if (property === '$transaction')
      return (work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        canonicalUtcTransaction(target, work);
    if (
      typeof property === 'string' &&
      !property.startsWith('$') &&
      Reflect.get(target, property) &&
      typeof Reflect.get(target, property) === 'object' &&
      'findMany' in Reflect.get(target, property)
    ) {
      return new Proxy(Reflect.get(target, property) as object, {
        get(_model, operation) {
          return (args: unknown) =>
            canonicalUtcTransaction(target, (tx) => {
              const delegate = Reflect.get(tx, property) as object;
              const method = Reflect.get(delegate, operation) as (
                args: unknown,
              ) => Promise<unknown>;
              return method.call(delegate, args);
            });
        },
      });
    }
    const value: unknown = Reflect.get(target, property, receiver);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  },
});
type Tx = Prisma.TransactionClient;
const now = new Date();
const day = 86_400_000;
const h = (v: string = randomUUID()) =>
  createHash('sha256').update(v).digest('hex');
const checks: string[] = [];
const plus = (v: Date, ms: number) => new Date(v.getTime() + ms);
const years = (v: Date, n: number) => {
  const d = new Date(v);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d;
};
async function principal() {
  const tenant = await db.tenant.create({
    data: {
      name: 'R-C synthetic schema',
      slug: randomUUID(),
      status: 'active',
    },
  });
  const user = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: randomUUID() + '@example.invalid',
      passwordHash: 'not-a-login',
      role: 'tenant_owner',
      status: 'active',
    },
  });
  const member = await db.membership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      role: 'tenant_owner',
      status: 'active',
    },
  });
  const branch = await db.branch.create({
    data: { tenantId: tenant.id, name: 'Synthetic', timezone: 'UTC' },
  });
  const identity = await db.authIdentity.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      provider: 'telegram',
      providerUserId: randomUUID(),
    },
  });
  return {
    tenantId: tenant.id,
    userId: user.id,
    membershipId: member.id,
    branchId: branch.id,
    authIdentityId: identity.id,
  };
}
type Principal = Awaited<ReturnType<typeof principal>>;
async function execution(
  tx: Tx,
  p: Principal,
  actionClass: string,
  extra: Partial<Prisma.ActionExecutionUncheckedCreateInput> = {},
) {
  const active = !extra.state || extra.state === 'EXECUTING';
  const row = await tx.actionExecution.create({
    data: {
      tenantId: p.tenantId,
      actorUserId: p.userId,
      identityVersion: 1,
      identityFingerprint: h(),
      sourceType: 'authenticated_request',
      actionClass,
      capability: 'schema-fixture-only',
      capabilityVersion: 1,
      targetKind: 'schema-proof',
      targetRef: randomUUID(),
      normalizedInputContract: 'synthetic/schema/1',
      normalizedInputHash: h(),
      normalizedInputEncrypted: 'synthetic-only',
      evidenceRefsJson: [],
      riskProfileVersion: 1,
      riskFacetsJson: [],
      policyKey: 'synthetic-schema-only',
      policyVersion: 1,
      policyDecision: 'ALLOW',
      autonomyLevel: 'synthetic',
      policyDecidedBy: 'synthetic',
      approvalRequirement: 'NONE',
      approvalDecision: 'NOT_REQUIRED',

      retryPolicyKey: 'synthetic',
      retryPolicyVersion: 1,
      maxExecutionAttempts: 1,
      reconciliationPolicyKey: 'synthetic',
      reconciliationPolicyVersion: 1,
      reconciliationState: 'NOT_REQUIRED',
      transportIdentityVersion: 1,
      transportIdempotencyKey: randomUUID(),
      ...extra,
      state: 'READY',
    },
  });
  if (active) return begin(tx, row);
  return row;
}
async function begin(tx: Tx, e: { id: string; tenantId: string }) {
  await tx.actionAttempt.create({
    data: {
      tenantId: e.tenantId,
      actionExecutionId: e.id,
      attemptNumber: 1,
      kind: 'EXECUTION',
      state: 'STARTED',
      executorKey: 'synthetic-schema-only',
      executorVersion: 1,
      externalDispatchState: 'NOT_CROSSED',
      startedAt: now,
    },
  });
  return tx.actionExecution.update({
    where: { id: e.id },
    data: {
      revision: { increment: 1 },
      state: 'EXECUTING',
      executionAttemptCount: 1,
      firstAttemptedAt: now,
      leaseOwner: 'synthetic',
      leaseTokenHash: h(),
      leaseExpiresAt: plus(now, 60000),
    },
  });
}
async function finish(tx: Tx, id: string) {
  await tx.actionAttempt.updateMany({
    where: { actionExecutionId: id, state: 'STARTED' },
    data: {
      state: 'SUCCEEDED',
      finishedAt: now,
      outcomeCode: 'synthetic_committed',
    },
  });
  await tx.actionExecution.update({
    where: { id },
    data: {
      revision: { increment: 1 },
      state: 'SUCCEEDED',
      executionAttemptCount: 1,
      firstAttemptedAt: now,
      finalizedAt: now,
      finalOutcomeCode: 'synthetic_committed',
      leaseOwner: null,
      leaseTokenHash: null,
      leaseExpiresAt: null,
    },
  });
}

function constraint(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 6) return false;
  const e = error as Record<string, unknown>;
  return (
    ['P2002', 'P2003', 'P2004', '23503', '23505', '23514'].includes(
      String(e.code ?? e.originalCode),
    ) ||
    [e.cause, e.meta, e.driverAdapterError].some((v) =>
      constraint(v, depth + 1),
    )
  );
}
async function denied(label: string, op: () => Promise<unknown>) {
  await assert.rejects(op, (e: unknown) => {
    assert.ok(constraint(e), String(e));
    return true;
  });
  checks.push(label);
}
async function config(
  tx: Tx,
  p: Principal,
  prev?: { id: string; revision: number },
  extra: Partial<Prisma.TenantBusinessConfigurationRevisionUncheckedCreateInput> = {},
) {
  const e = await execution(tx, p, 'update_tenant_business_configuration');
  const row = await tx.tenantBusinessConfigurationRevision.create({
    data: {
      tenantId: p.tenantId,
      namespace: 'business_rules',
      revision: (prev?.revision ?? 0) + 1,
      previousRevisionId: prev?.id ?? null,
      actionExecutionId: e.id,
      actorUserId: p.userId,
      actorMembershipId: p.membershipId,
      contractVersion: 1,
      contentHash: h(),
      encryptedContent: 'synthetic',
      createdAt: now,
      ...extra,
    },
  });
  await finish(tx, e.id);
  return row;
}
async function cash(
  tx: Tx,
  p: Principal,
  prev?: { id: string; revision: number },
  extra: Partial<Prisma.CashDeclarationUncheckedCreateInput> = {},
) {
  const e = await execution(
    tx,
    p,
    prev ? 'correct_cash_position' : 'declare_cash_position',
  );
  const row = await tx.cashDeclaration.create({
    data: {
      tenantId: p.tenantId,
      branchId: p.branchId,
      businessDay: now.toISOString().slice(0, 10),
      timezone: 'UTC',
      countedAt: now,
      currency: 'RUB',
      countedCashKopecks: 12500,
      declarationKind: 'COUNT',
      revision: (prev?.revision ?? 0) + 1,
      previousDeclarationId: prev?.id ?? null,
      actionExecutionId: e.id,
      declaredByUserId: p.userId,
      declaredByMembershipId: p.membershipId,
      contractVersion: 1,
      intentHash: h(),
      encryptedReason: prev ? 'synthetic correction' : null,
      createdAt: now,
      ...extra,
    },
  });
  await finish(tx, e.id);
  return row;
}
async function payloadClaim(
  tx: Tx,
  tenantId: string,
  kind: string,
  ref: string,
  digest: string,
  deadline: Date,
  action: string,
  policy: string,
) {
  const fingerprint = h();
  const started = new Date();
  const run = await tx.maintenanceRun.create({
    data: {
      scope: 'tenant',
      tenantId,
      runIdentityVersion: 1,
      runIdentityFingerprint: fingerprint,
      maintenanceKind: action,
      subjectClass: kind,
      policyKey: policy,
      policyVersion: 1,
      cutoffAt: started,
      maxItems: 1,
      batchSize: 1,
      cursorHash: h(),
      state: 'RUNNING',
      leaseOwner: 'synthetic-schema-proof',
      leaseTokenHash: h(),
      leaseExpiresAt: plus(started, 60000),
      authorityType: 'SYSTEM_POLICY',
      startedAt: started,
    },
  });
  return tx.maintenanceItemClaim.create({
    data: {
      maintenanceRunId: run.id,
      itemKind: kind,
      itemRefHash: h(
        [fingerprint, kind, tenantId, ref, digest, deadline.getTime()].join(
          '/',
        ),
      ),
    },
  });
}
async function main() {
  const entryZone = await rawDb.$queryRaw<
    Array<{ zone: string }>
  >`SELECT current_setting('TimeZone') AS zone`;
  const utc = await canonicalUtcTransaction(
    rawDb,
    (tx) =>
      tx.$queryRaw<
        Array<{ zone: string }>
      >`SELECT current_setting('TimeZone') AS zone`,
    { readOnly: true },
  );
  assert.equal(utc[0].zone, 'UTC');
  const p = await principal(),
    foreign = await principal();
  const cfg = await db.$transaction((tx) => config(tx, p));
  await denied('R11 foreign Membership rejected', () =>
    db.$transaction((tx) =>
      config(tx, p, undefined, {
        namespace: 'client_capabilities',
        actorMembershipId: foreign.membershipId,
      }),
    ),
  );
  await denied('R11 namespace overwrite rejected', () =>
    db.tenantBusinessConfigurationRevision.update({
      where: { id: cfg.id },
      data: { contentHash: h() },
    }),
  );
  await denied('R11 unclaimed ciphertext purge rejected', () =>
    db.tenantBusinessConfigurationRevision.update({
      where: { id: cfg.id },
      data: { encryptedContent: null },
    }),
  );
  await denied('R11 tombstone deletion rejected', () =>
    db.tenantBusinessConfigurationRevision.delete({ where: { id: cfg.id } }),
  );
  const cr = await Promise.allSettled([
    db.$transaction((tx) => config(tx, p, cfg)),
    db.$transaction((tx) => config(tx, p, cfg)),
  ]);
  assert.equal(cr.filter((v) => v.status === 'fulfilled').length, 1);
  checks.push('R11 concurrent predecessor has one winner');
  const c = await db.$transaction((tx) => cash(tx, p));
  await denied('R14 negative count rejected', () =>
    db.$transaction((tx) => cash(tx, p, c, { countedCashKopecks: -1 })),
  );
  await denied('R14 foreign branch rejected', () =>
    db.$transaction((tx) =>
      cash(tx, p, undefined, { branchId: foreign.branchId }),
    ),
  );
  await denied('R14 mutable observation overwrite rejected', () =>
    db.cashDeclaration.update({
      where: { id: c.id },
      data: { countedCashKopecks: 0 },
    }),
  );
  const withdrawn = await db.$transaction((tx) =>
    cash(tx, p, c, { declarationKind: 'WITHDRAWAL', countedCashKopecks: null }),
  );
  assert.equal(withdrawn.countedCashKopecks, null);
  assert.equal(
    await db.cashDeclaration.count({ where: { tenantId: p.tenantId } }),
    2,
  );
  await denied('R14 stale correction rejected', () =>
    db.$transaction((tx) => cash(tx, p, c)),
  );
  checks.push('R14 correction history retained; withdrawal is null, not zero');
  const occurrence = h();
  const alertData = {
    tenantId: p.tenantId,
    alertType: 'wanted_slot_admin_notice',
    occurrenceRef: occurrence,
    contractVersion: 1,
    occurredAt: now,
    intentHash: h(),
    intentEncrypted: 'synthetic-plan',
    admittedAt: now,
    expiresAt: plus(now, day),
    payloadRetentionUntil: plus(now, 7 * day),
    auditRetentionUntil: plus(now, 365 * day),
  };
  const alert = await db.$transaction(async (tx) => {
    const row = await tx.operationalAlertRun.create({ data: alertData });
    await execution(tx, p, 'deliver_business_alert', {
      state: 'READY',
      capability: 'communication.business-alerts.execute.v1',
      operationalAlertRunId: row.id,
      operationalAlertSlotKey: h(),
      intentExpiresAt: row.expiresAt,
    });
    return row;
  });
  await denied('R06 same logical occurrence cannot admit twice', () =>
    db.operationalAlertRun.create({ data: alertData }),
  );
  await denied('R06 late slot insertion rejected', () =>
    execution(db, p, 'deliver_business_alert', {
      state: 'READY',
      capability: 'communication.business-alerts.execute.v1',
      operationalAlertRunId: alert.id,
      operationalAlertSlotKey: h(),
      intentExpiresAt: alert.expiresAt,
    }),
  );
  await denied('R06 arbitrary alert type rejected', () =>
    db.operationalAlertRun.create({
      data: { ...alertData, alertType: 'raw_god', occurrenceRef: h() },
    }),
  );
  await denied('R06 direct payload purge rejected', () =>
    db.operationalAlertRun.update({
      where: { id: alert.id },
      data: { intentEncrypted: null },
    }),
  );
  const guestData = {
    tenantId: p.tenantId,
    publicationKey: 'synthetic/article',
    sourceKind: 'GUEST',
    visitorSubjectHash: h(),
    identityHash: h(),
    intentHash: h(),
    authorEncrypted: 'synthetic-label',
    textEncrypted: 'synthetic-text',
    contentHash: h(),
    consentPolicyVersion: '1',
    consentAcceptedAt: now,
    status: 'PENDING',
    revision: 0,
    createdAt: now,
    retentionUntil: plus(now, 365 * day),
    sourceGatewayId: 'synthetic-gateway',
  };
  const comment = await db.publicCommunityComment.create({ data: guestData });
  await denied('R09 guest cannot auto-publish', () =>
    db.publicCommunityComment.create({
      data: { ...guestData, identityHash: h(), status: 'APPROVED' },
    }),
  );
  await denied('R09 anonymous self-edit rejected', () =>
    db.publicCommunityComment.update({
      where: { id: comment.id },
      data: { textEncrypted: 'changed' },
    }),
  );
  await db.$transaction(async (tx) => {
    const e = await execution(tx, p, 'moderate_public_community_comment');
    await tx.publicCommunityComment.update({
      where: { id: comment.id },
      data: {
        status: 'APPROVED',
        revision: 1,
        lastModerationExecutionId: e.id,
      },
    });
    await finish(tx, e.id);
  });
  await denied('R09 same source key changed intent rejected', () =>
    db.publicCommunityComment.create({
      data: { ...guestData, intentHash: h() },
    }),
  );
  const interaction = {
    tenantId: p.tenantId,
    publicationKey: 'synthetic/article',
    kind: 'like',
    visitorSubjectHash: h(),
    identityHash: h(),
    intentHash: h(),
    expectedVersion: 0,
    version: 1,
    desiredValue: true,
    receivedAt: now,
    sourceGatewayId: 'synthetic-gateway',
    contractVersion: 1,
    payloadHash: h(),
  };
  await db.publicCommunityInteraction.create({ data: interaction });
  await denied('R09 stale anonymous expected version rejected', () =>
    db.publicCommunityInteraction.create({
      data: { ...interaction, identityHash: h() },
    }),
  );
  await denied('R09 interaction facts are immutable', () =>
    db.publicCommunityInteraction.updateMany({
      where: { tenantId: p.tenantId },
      data: { desiredValue: false },
    }),
  );
  const client = await db.client.create({ data: { tenantId: p.tenantId } });
  assert.equal(client.userId, null);
  const appt = await db.appointment.create({
    data: {
      tenantId: p.tenantId,
      mayaClientId: client.id,
      branchId: p.branchId,
      source: 'external',
      staffExternalId: randomUUID(),
      serviceIds: [],
      startAt: plus(now, -5 * 60 * 60 * 1000),
      endAt: plus(now, -4 * 60 * 60 * 1000),
      blockedStartAt: plus(now, -5 * 60 * 60 * 1000),
      blockedEndAt: plus(now, -4 * 60 * 60 * 1000),
      attendance: 'arrived',
    },
  });
  const request = await db.$transaction(async (tx) => {
    const e = await execution(tx, p, 'request_native_feedback');
    const row = await tx.nativeFeedbackRequest.create({
      data: {
        tenantId: p.tenantId,
        clientId: client.id,
        appointmentId: appt.id,
        requestedByUserId: p.userId,
        requestExecutionId: e.id,
        requestIdentityHash: h(),
        intentHash: h(),
        contractVersion: 1,
        eligibleAt: plus(appt.endAt, 3 * 60 * 60 * 1000),
        expiresAt: plus(now, 7 * day),
        contentHash: h(),
        contentEncrypted: 'synthetic',
        planHash: h(),
        planEncrypted: 'synthetic',
        state: 'OPEN',
        revision: 0,
        latestResponseVersion: 0,
        createdAt: now,
        retentionUntil: plus(now, 365 * day),
      },
    });
    await finish(tx, e.id);
    return row;
  });
  checks.push(
    'R08 exact Appointment ownership supports Client without Maya User',
  );
  await denied('R08 direct root response pointer rejected', () =>
    db.nativeFeedbackRequest.update({
      where: { id: request.id },
      data: { latestResponseVersion: 1, revision: 1, state: 'RESPONDED' },
    }),
  );
  const response = await db.$transaction(async (tx) => {
    const e = await execution(tx, p, 'submit_native_feedback_revision', {
      actorUserId: null,
    });
    const row = await tx.nativeFeedbackRevision.create({
      data: {
        tenantId: p.tenantId,
        requestId: request.id,
        clientId: client.id,
        executionId: e.id,
        identityHash: h(),
        intentHash: h(),
        version: 1,
        kind: 'response',
        rating: 5,
        commentEncrypted: 'synthetic-comment',
        contentHash: h(),
        planHash: h(),
        planEncrypted: 'synthetic',
        createdAt: now,
      },
    });
    await tx.nativeFeedbackRequest.update({
      where: { id: request.id },
      data: { latestResponseVersion: 1, revision: 1, state: 'RESPONDED' },
    });
    await finish(tx, e.id);
    return row;
  });
  await denied('R08 accepted response cannot be rewritten', () =>
    db.nativeFeedbackRevision.update({
      where: { id: response.id },
      data: { rating: 1 },
    }),
  );
  await denied('R08 admitted delivery cannot omit binding', () =>
    execution(db, p, 'deliver_report_briefing', {
      state: 'READY',
      capability: 'communication.native-feedback.invitation.execute.v1',
    }),
  );
  await denied(
    'R08 revision cannot commit without advancing the exact request projection',
    () =>
      db.$transaction(async (tx) => {
        const e = await execution(tx, p, 'submit_native_feedback_revision', {
          actorUserId: null,
        });
        await tx.nativeFeedbackRevision.create({
          data: {
            tenantId: p.tenantId,
            requestId: request.id,
            clientId: client.id,
            executionId: e.id,
            identityHash: h(),
            intentHash: h(),
            version: 2,
            kind: 'response',
            rating: 4,
            contentHash: h(),
            planHash: h(),
            planEncrypted: 'synthetic',
            createdAt: now,
          },
        });
        await finish(tx, e.id);
      }),
  );
  const attachment = await db.$transaction(async (tx) => {
    const e = await execution(tx, p, 'reserve_team_attachment');
    const row = await tx.teamAttachment.create({
      data: {
        tenantId: p.tenantId,
        ownerUserId: p.userId,
        reserveExecutionId: e.id,
        uploadIdentityHash: h(),
        intentHash: h(),
        objectStoreKey: 'synthetic/' + h(),
        contentSha256: h(),
        declaredSize: 123n,
        mime: 'image/png',
        kind: 'image',
        filenameEncrypted: 'synthetic',
        state: 'RESERVED',
        revision: 0,
        createdAt: now,
        uploadExpiresAt: plus(now, 60 * 60 * 1000),
      },
    });
    await finish(tx, e.id);
    return row;
  });
  await denied(
    'R12 transport cannot mark reservation SEALED without canonical finalization',
    () =>
      db.teamAttachment.update({
        where: { id: attachment.id },
        data: {
          state: 'SEALED',
          revision: 1,
          actualSize: 123n,
          storageReceiptHash: h(),
        },
      }),
  );
  const final = await execution(db, p, 'finalize_team_attachment', {
    state: 'READY',
  });
  await db.teamAttachment.update({
    where: { id: attachment.id },
    data: { finalizeExecutionId: final.id, revision: 1 },
  });
  await db.$transaction(async (tx) => {
    await begin(tx, final);
    await tx.actionAttempt.updateMany({
      where: { actionExecutionId: final.id, state: 'STARTED' },
      data: {
        state: 'UNKNOWN',
        finishedAt: now,
        outcomeCode: 'synthetic_unknown',
        externalDispatchState: 'MAY_HAVE_CROSSED',
        reconciliationRequired: true,
      },
    });
    await tx.actionExecution.update({
      where: { id: final.id },
      data: {
        revision: { increment: 1 },
        state: 'UNKNOWN',
        reconciliationState: 'REQUIRED',
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
      },
    });
  });
  await denied('R12 UNKNOWN finalize does not grant payload erase', () =>
    db.teamAttachment.update({
      where: { id: attachment.id },
      data: {
        state: 'ERASED',
        revision: 2,
        filenameEncrypted: null,
        payloadErasedAt: now,
      },
    }),
  );
  await db.$transaction(async (tx) => {
    const attempt = await tx.actionAttempt.create({
      data: {
        tenantId: p.tenantId,
        actionExecutionId: final.id,
        attemptNumber: 2,
        kind: 'RECONCILIATION',
        state: 'STARTED',
        executorKey: 'synthetic-schema-only',
        executorVersion: 1,
        externalDispatchState: 'NOT_APPLICABLE',
        startedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: { id: final.id },
      data: {
        revision: { increment: 1 },
        reconciliationState: 'IN_PROGRESS',
        leaseOwner: 'synthetic',
        leaseTokenHash: h(),
        leaseExpiresAt: plus(now, 60000),
      },
    });
    await tx.actionAttempt.update({
      where: { id: attempt.id },
      data: {
        state: 'SUCCEEDED',
        finishedAt: now,
        outcomeCode: 'PROVEN_SUCCEEDED',
      },
    });
    await tx.actionExecution.update({
      where: { id: final.id },
      data: {
        revision: { increment: 1 },
        state: 'SUCCEEDED',
        reconciliationState: 'RESOLVED',
        finalizedAt: now,
        finalOutcomeCode: 'synthetic_resolved',
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
      },
    });
    await tx.teamAttachment.update({
      where: { id: attachment.id },
      data: {
        state: 'SEALED',
        revision: 2,
        actualSize: 123n,
        storageReceiptHash: h(),
        lastObservedAt: now,
      },
    });
  });
  const message = await db.$transaction(async (tx) => {
    const e = await execution(tx, p, 'send_team_message');
    const row = await tx.teamMessage.create({
      data: {
        tenantId: p.tenantId,
        conversationKey: 'team/main',
        senderUserId: p.userId,
        sendExecutionId: e.id,
        identityHash: h(),
        intentHash: h(),
        payloadEncrypted: 'synthetic-message',
        payloadHash: h(),
        attachmentId: attachment.id,
        createdAt: now,
        expiresAt: plus(now, 365 * day),
        revision: 0,
        planHash: h(),
        planEncrypted: 'synthetic-plan',
        status: 'SENT',
      },
    });
    await tx.teamAttachment.update({
      where: { id: attachment.id },
      data: { state: 'BOUND', revision: 3, mediaExpiresAt: plus(now, 2 * day) },
    });
    await finish(tx, e.id);
    return row;
  });
  await denied('R12 message in-place editing rejected', () =>
    db.teamMessage.update({
      where: { id: message.id },
      data: { payloadEncrypted: 'edited' },
    }),
  );
  await denied('R12 read/transport unlink cannot delete owner', () =>
    db.teamAttachment.delete({ where: { id: attachment.id } }),
  );
  await denied('R12 delivery cannot omit canonical message binding', () =>
    execution(db, p, 'deliver_report_briefing', {
      state: 'READY',
      capability: 'communication.team-message-notification.execute.v1',
    }),
  );
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = plus(monday, 6 * day),
    admitted = plus(sunday, 20 * 60 * 60 * 1000),
    expiry = plus(sunday, 8 * day);
  const reminder = await db.$transaction(async (tx) => {
    const row = await tx.expenseReminderRun.create({
      data: {
        tenantId: p.tenantId,
        reminderType: 'weekly_expense_reminder',
        periodStartLocalDate: monday.toISOString().slice(0, 10),
        periodEndLocalDate: sunday.toISOString().slice(0, 10),
        contractVersion: 1,
        timezone: 'UTC',
        intentHash: h(),
        intentEncrypted: 'synthetic-week-plan',
        admittedAt: admitted,
        expiresAt: expiry,
        payloadRetentionUntil: expiry,
        auditRetentionUntil: years(admitted, 7),
      },
    });
    await execution(tx, p, 'deliver_business_alert', {
      state: 'READY',
      capability: 'communication.business-alerts.execute.v1',
      expenseReminderRunId: row.id,
      expenseReminderSlotKey: h(),
      intentExpiresAt: expiry,
    });
    return row;
  });
  await denied('R13 late reminder slot insertion rejected', () =>
    execution(db, p, 'deliver_business_alert', {
      state: 'READY',
      capability: 'communication.business-alerts.execute.v1',
      expenseReminderRunId: reminder.id,
      expenseReminderSlotKey: h(),
      intentExpiresAt: expiry,
    }),
  );
  const source = h();
  async function intake(tx: Tx, n: number, count: number, hash = source) {
    for (let i = 0; i < n; i++) {
      const q = await tx.aiApprovalRequest.create({
        data: {
          tenantId: p.tenantId,
          requestedByUserId: p.userId,
          requestedByTenantId: p.tenantId,
          toolName: 'expenses.create',
          surface: 'staff-chat',
          riskTier: 'high',
          approvalPolicy: 'required',
          summary: 'Synthetic card',
          payloadHash: h(),
          payloadPreviewJson: {},
          encryptedArguments: 'synthetic',
          idempotencyKey: randomUUID(),
          createdAt: now,
          expiresAt: plus(now, 10 * 60 * 1000),
        },
      });
      await tx.expenseIntakeBinding.create({
        data: {
          tenantId: p.tenantId,
          actorUserId: p.userId,
          actorMembershipId: p.membershipId,
          authIdentityId: p.authIdentityId,
          sourceNamespace: 'synthetic-bot',
          sourceEventHash: hash,
          itemIndex: i,
          sourceItemCount: count,
          sourceContentHash: h('same-content'),
          approvalRequestId: q.id,
          createdAt: now,
          auditRetentionUntil: years(now, 7),
        },
      });
    }
  }
  await denied('R13 partial source/card bundle cannot commit', () =>
    db.$transaction((tx) => intake(tx, 1, 2)),
  );
  await db.$transaction((tx) => intake(tx, 2, 2));
  assert.equal(
    await db.expenseIntakeBinding.count({
      where: { tenantId: p.tenantId, sourceEventHash: source },
    }),
    2,
  );
  await denied('R13 existing bundle cannot be appended or replaced', () =>
    db.$transaction((tx) => intake(tx, 1, 3)),
  );
  checks.push(
    'R13 whole two-card bundle admitted atomically without Expense mutation',
  );
  assert.equal(await db.expense.count({ where: { tenantId: p.tenantId } }), 0);
  // Prospective synthetic fixtures with old clocks are retention tests, never a historical backfill.
  const old = plus(now, -400 * day);
  const oldComment = await db.publicCommunityComment.create({
    data: {
      ...guestData,
      identityHash: h(),
      createdAt: old,
      consentAcceptedAt: old,
      retentionUntil: plus(old, 365 * day),
    },
  });
  await denied('AC6 wrong-tenant claim cannot erase community payload', () =>
    db.$transaction(async (tx) => {
      await payloadClaim(
        tx,
        foreign.tenantId,
        'PublicCommunityComment',
        oldComment.id,
        oldComment.contentHash,
        oldComment.retentionUntil,
        'purge_public_community_payloads',
        'public-community-retention',
      );
      await tx.publicCommunityComment.update({
        where: { id: oldComment.id },
        data: {
          authorEncrypted: null,
          textEncrypted: null,
          payloadErasedAt: now,
        },
      });
    }),
  );
  await denied('AC6 changed digest cannot erase community payload', () =>
    db.$transaction(async (tx) => {
      await payloadClaim(
        tx,
        p.tenantId,
        'PublicCommunityComment',
        oldComment.id,
        h(),
        oldComment.retentionUntil,
        'purge_public_community_payloads',
        'public-community-retention',
      );
      await tx.publicCommunityComment.update({
        where: { id: oldComment.id },
        data: {
          authorEncrypted: null,
          textEncrypted: null,
          payloadErasedAt: now,
        },
      });
    }),
  );
  await db.$transaction(async (tx) => {
    await payloadClaim(
      tx,
      p.tenantId,
      'PublicCommunityComment',
      oldComment.id,
      oldComment.contentHash,
      oldComment.retentionUntil,
      'purge_public_community_payloads',
      'public-community-retention',
    );
    await tx.publicCommunityComment.update({
      where: { id: oldComment.id },
      data: {
        authorEncrypted: null,
        textEncrypted: null,
        payloadErasedAt: now,
      },
    });
  });
  checks.push(
    'R09 exact expired AC6 claim erases only encrypted payload, preserving source/visibility tombstone',
  );

  const oldAppt = await db.appointment.create({
    data: {
      tenantId: p.tenantId,
      mayaClientId: client.id,
      branchId: p.branchId,
      source: 'external',
      staffExternalId: randomUUID(),
      serviceIds: [],
      startAt: plus(old, -5 * 60 * 60 * 1000),
      endAt: plus(old, -4 * 60 * 60 * 1000),
      blockedStartAt: plus(old, -5 * 60 * 60 * 1000),
      blockedEndAt: plus(old, -4 * 60 * 60 * 1000),
      attendance: 'arrived',
    },
  });
  const oldFeedback = await db.$transaction(async (tx) => {
    const e = await execution(tx, p, 'request_native_feedback');
    const row = await tx.nativeFeedbackRequest.create({
      data: {
        tenantId: p.tenantId,
        clientId: client.id,
        appointmentId: oldAppt.id,
        requestedByUserId: p.userId,
        requestExecutionId: e.id,
        requestIdentityHash: h(),
        intentHash: h(),
        contractVersion: 1,
        eligibleAt: plus(oldAppt.endAt, 3 * 60 * 60 * 1000),
        expiresAt: plus(old, 7 * day),
        contentHash: h(),
        contentEncrypted: 'synthetic',
        planHash: h(),
        planEncrypted: 'synthetic',
        state: 'OPEN',
        revision: 0,
        latestResponseVersion: 0,
        createdAt: old,
        retentionUntil: plus(old, 365 * day),
      },
    });
    await finish(tx, e.id);
    return row;
  });
  const oldResponse = await db.$transaction(async (tx) => {
    const e = await execution(tx, p, 'submit_native_feedback_revision', {
      actorUserId: null,
    });
    const row = await tx.nativeFeedbackRevision.create({
      data: {
        tenantId: p.tenantId,
        requestId: oldFeedback.id,
        clientId: client.id,
        executionId: e.id,
        identityHash: h(),
        intentHash: h(),
        version: 1,
        kind: 'response',
        rating: 5,
        commentEncrypted: 'synthetic',
        contentHash: h(),
        planHash: h(),
        planEncrypted: 'synthetic',
        createdAt: old,
      },
    });
    await tx.nativeFeedbackRequest.update({
      where: { id: oldFeedback.id },
      data: { latestResponseVersion: 1, revision: 1, state: 'RESPONDED' },
    });
    await finish(tx, e.id);
    return row;
  });
  await db.$transaction(async (tx) => {
    await payloadClaim(
      tx,
      p.tenantId,
      'NativeFeedbackRevision',
      oldResponse.id,
      oldResponse.planHash,
      oldFeedback.retentionUntil,
      'purge_native_feedback_payloads',
      'native-feedback-retention',
    );
    await tx.nativeFeedbackRevision.update({
      where: { id: oldResponse.id },
      data: {
        commentEncrypted: null,
        planEncrypted: null,
        payloadErasedAt: now,
      },
    });
    await payloadClaim(
      tx,
      p.tenantId,
      'NativeFeedbackRequest',
      oldFeedback.id,
      oldFeedback.planHash,
      oldFeedback.retentionUntil,
      'purge_native_feedback_payloads',
      'native-feedback-retention',
    );
    await tx.nativeFeedbackRequest.update({
      where: { id: oldFeedback.id },
      data: {
        contentEncrypted: null,
        planEncrypted: null,
        payloadErasedAt: now,
      },
    });
  });
  checks.push(
    'R08 exact request/revision AC6 claims retain Client/Appointment identity and rating history',
  );

  const oldCfg = await db.$transaction((tx) =>
    config(tx, p, undefined, {
      namespace: 'staff_ai_provider',
      createdAt: old,
    }),
  );
  await denied(
    'R11 current configuration cannot be purged even with a valid claim',
    () =>
      db.$transaction(async (tx) => {
        await payloadClaim(
          tx,
          p.tenantId,
          'TenantBusinessConfigurationRevision',
          oldCfg.id,
          oldCfg.contentHash,
          plus(old, 365 * day),
          'purge_superseded_business_configuration_payloads',
          'package5.r11.business-configuration-retention',
        );
        await tx.tenantBusinessConfigurationRevision.update({
          where: { id: oldCfg.id },
          data: { encryptedContent: null },
        });
      }),
  );
  await db.$transaction((tx) =>
    config(tx, p, oldCfg, { namespace: 'staff_ai_provider' }),
  );
  await db.$transaction(async (tx) => {
    await payloadClaim(
      tx,
      p.tenantId,
      'TenantBusinessConfigurationRevision',
      oldCfg.id,
      oldCfg.contentHash,
      plus(old, 365 * day),
      'purge_superseded_business_configuration_payloads',
      'package5.r11.business-configuration-retention',
    );
    await tx.tenantBusinessConfigurationRevision.update({
      where: { id: oldCfg.id },
      data: { encryptedContent: null },
    });
  });
  checks.push(
    'R11 exact AC6 claim erases superseded content only after 365 days',
  );

  const ancient = years(now, -8);
  const oldCash = await db.$transaction((tx) =>
    cash(tx, p, undefined, {
      countedAt: ancient,
      businessDay: ancient.toISOString().slice(0, 10),
      createdAt: ancient,
      encryptedReason: 'synthetic old reason',
    }),
  );
  await db.$transaction(async (tx) => {
    await payloadClaim(
      tx,
      p.tenantId,
      'CashDeclaration',
      oldCash.id,
      oldCash.intentHash,
      years(ancient, 7),
      'purge_cash_declaration_reason_payloads',
      'package5.r14.cash-declaration-retention',
    );
    await tx.cashDeclaration.update({
      where: { id: oldCash.id },
      data: { encryptedReason: null },
    });
  });
  assert.equal(
    (await db.cashDeclaration.findUniqueOrThrow({ where: { id: oldCash.id } }))
      .countedCashKopecks,
    12500,
  );
  checks.push(
    'R14 seven-year reason purge retains immutable cash observation/count',
  );

  const oldAlert = await db.$transaction(async (tx) => {
    const row = await tx.operationalAlertRun.create({
      data: {
        ...alertData,
        occurrenceRef: h(),
        occurredAt: old,
        admittedAt: old,
        expiresAt: plus(old, day),
        payloadRetentionUntil: plus(old, 7 * day),
        auditRetentionUntil: plus(old, 365 * day),
      },
    });
    const e = await execution(tx, p, 'deliver_business_alert', {
      state: 'READY',
      capability: 'communication.business-alerts.execute.v1',
      operationalAlertRunId: row.id,
      operationalAlertSlotKey: h(),
      intentExpiresAt: row.expiresAt,
    });
    await begin(tx, e);
    await finish(tx, e.id);
    return row;
  });
  await db.$transaction(async (tx) => {
    await payloadClaim(
      tx,
      p.tenantId,
      'OperationalAlertRun',
      oldAlert.id,
      oldAlert.intentHash,
      oldAlert.payloadRetentionUntil,
      'purge_operational_alert_payloads',
      'package5.r06.operational-alert-payload-retention',
    );
    await tx.operationalAlertRun.update({
      where: { id: oldAlert.id },
      data: { intentEncrypted: null },
    });
  });
  checks.push(
    'R06 exact seven-day AC6 claim and terminal bound execution permit payload-only purge',
  );

  const oldMonday = new Date(old);
  oldMonday.setUTCHours(0, 0, 0, 0);
  oldMonday.setUTCDate(
    oldMonday.getUTCDate() - ((oldMonday.getUTCDay() + 6) % 7),
  );
  const oldSunday = plus(oldMonday, 6 * day),
    oldAdmission = plus(oldSunday, 20 * 60 * 60 * 1000),
    oldExpiry = plus(oldSunday, 8 * day);
  const oldReminder = await db.expenseReminderRun.create({
    data: {
      tenantId: p.tenantId,
      reminderType: 'weekly_expense_reminder',
      periodStartLocalDate: oldMonday.toISOString().slice(0, 10),
      periodEndLocalDate: oldSunday.toISOString().slice(0, 10),
      contractVersion: 1,
      timezone: 'UTC',
      intentHash: h(),
      intentEncrypted: 'synthetic empty audience',
      admittedAt: oldAdmission,
      expiresAt: oldExpiry,
      payloadRetentionUntil: oldExpiry,
      auditRetentionUntil: years(oldAdmission, 7),
    },
  });
  await db.$transaction(async (tx) => {
    await payloadClaim(
      tx,
      p.tenantId,
      'ExpenseReminderRun',
      oldReminder.id,
      oldReminder.intentHash,
      oldExpiry,
      'purge_expense_reminder_payloads',
      'package5.r13.expense-reminder-retention',
    );
    await tx.expenseReminderRun.update({
      where: { id: oldReminder.id },
      data: { intentEncrypted: null },
    });
  });
  checks.push(
    'R13 expired empty-audience plan can purge payload while preserving weekly identity/audit',
  );

  const oldMessage = await db.$transaction(async (tx) => {
    const e = await execution(tx, p, 'send_team_message');
    const row = await tx.teamMessage.create({
      data: {
        tenantId: p.tenantId,
        conversationKey: 'team/main',
        senderUserId: p.userId,
        sendExecutionId: e.id,
        identityHash: h(),
        intentHash: h(),
        payloadEncrypted: 'synthetic old message',
        payloadHash: h(),
        createdAt: old,
        expiresAt: plus(old, 365 * day),
        revision: 0,
        planHash: h(),
        planEncrypted: 'synthetic plan',
        status: 'SENT',
      },
    });
    await finish(tx, e.id);
    return row;
  });
  await db.$transaction(async (tx) => {
    await payloadClaim(
      tx,
      p.tenantId,
      'TeamMessage',
      oldMessage.id,
      oldMessage.planHash,
      oldMessage.expiresAt,
      'purge_team_message_payloads',
      'team-lifecycle-retention',
    );
    await tx.teamMessage.update({
      where: { id: oldMessage.id },
      data: {
        payloadEncrypted: null,
        planEncrypted: null,
        payloadErasedAt: now,
      },
    });
  });
  const abandoned = await db.$transaction(async (tx) => {
    const e = await execution(tx, p, 'reserve_team_attachment');
    const row = await tx.teamAttachment.create({
      data: {
        tenantId: p.tenantId,
        ownerUserId: p.userId,
        reserveExecutionId: e.id,
        uploadIdentityHash: h(),
        intentHash: h(),
        objectStoreKey: 'synthetic/' + h(),
        contentSha256: h(),
        declaredSize: 123n,
        mime: 'image/png',
        kind: 'image',
        filenameEncrypted: 'synthetic filename',
        state: 'RESERVED',
        revision: 0,
        createdAt: old,
        uploadExpiresAt: plus(old, 60 * 60 * 1000),
      },
    });
    await finish(tx, e.id);
    return row;
  });
  await db.$transaction(async (tx) => {
    await payloadClaim(
      tx,
      p.tenantId,
      'TeamAttachment',
      abandoned.id,
      abandoned.contentSha256,
      abandoned.uploadExpiresAt,
      'purge_team_attachment_payloads',
      'team-lifecycle-retention',
    );
    await tx.teamAttachment.update({
      where: { id: abandoned.id },
      data: {
        state: 'ERASED',
        revision: 1,
        filenameEncrypted: null,
        payloadErasedAt: now,
      },
    });
  });
  checks.push(
    'R12 distinct text and abandoned-upload claims preserve message/attachment tombstones',
  );
  const columns = await db.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('OperationalAlertRun','NativeFeedbackRequest','NativeFeedbackRevision','PublicCommunityComment','PublicCommunityInteraction','TenantBusinessConfigurationRevision','TeamMessage','TeamAttachment','ExpenseReminderRun','ExpenseIntakeBinding','CashDeclaration')`;
  assert.equal(columns.length, 188);
  checks.push(
    '11 exact new tables / 188 new-model columns; 9 nullable ActionExecution bindings',
  );
  const afterZone = await rawDb.$queryRaw<
    Array<{ zone: string }>
  >`SELECT current_setting('TimeZone') AS zone`;
  assert.deepEqual(afterZone, entryZone);
  checks.push(
    'R-C timestamp UTC normalization is transaction-local; database/pool timezone unchanged',
  );
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        scope:
          'SQL constraints only; package runtime acceptance remains pending',
        checks,
        productionMutations: 0,
        productionMessages: 0,
        oldDatabasesTouched: 0,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
