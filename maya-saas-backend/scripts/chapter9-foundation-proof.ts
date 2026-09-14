/** Executable P01 proof; refuses every database except the new owned synthetic C9 cluster. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { ClientChannelLinkService } from '../src/crm/client-channel-link.service';
import { clientChannelSubjectHash } from '../src/crm/client-channel-subject';
import { Package5Wave6MaintenanceService } from '../src/package5-wave6/package5-wave6.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { C9Authority } from '../src/orchestration/c9.authority';
import { C9RequestIdentity } from '../src/orchestration/c9.identity';
import { C9Store, C9Proposal, c9Insert } from '../src/orchestration/c9.store';
import { C9WorkService } from '../src/orchestration/c9.work';
import { C9Sources } from '../src/orchestration/c9.sources';
import {
  C9Object,
  C9_RETENTION,
  c9Hash,
} from '../src/orchestration/c9.contract';
import { ClientChannelRuntimeService } from '../src/crm/client-channel-runtime.service';
import { MeasurementReadService } from '../src/measurement/measurement.read.service';
import { C8ReadService } from '../src/valuation/c8.read';

const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55529');
assert.equal(url.pathname, '/maya_c9_replay');
assert.equal(url.username, 'maya_c9');
const cfg = new ConfigService({
  DATABASE_URL: url.toString(),
  MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN: 'synthetic-c9-telegram',
  CRM_ENCRYPTION_KEY: 'c9-local-only-synthetic-'.repeat(3),
});
const db = new PrismaService(cfg),
  ctx = new TenantContextService(),
  encryption = new EncryptionService(cfg);
const channels = new ClientChannelRuntimeService(
  db,
  ctx,
  new ClientChannelAuthenticatorService(cfg, ctx, encryption),
  encryption,
  {} as never,
  {} as never,
);
const authority = new C9Authority(ctx, channels),
  identity = new C9RequestIdentity(encryption);
const reader = {
  snapshot: () => Promise.reject(new Error('owner-reader-required')),
};
const sources = new C9Sources(
  reader as unknown as MeasurementReadService,
  reader as unknown as C8ReadService,
);
const store = new C9Store(db, authority, identity, encryption, sources),
  work = new C9WorkService(store);
const checks: string[] = [];
async function proof(name: string, fn: () => unknown) {
  await fn();
  checks.push(name);
  console.log('PASS ' + name);
}
const exposure = {
  maxActions: 0,
  maxRecipients: 0,
  maxMessages: 0,
  providerCost: null,
  verifiedZeroCost: null,
  offerRef: null,
  maxDiscountMinorUnits: null,
  maxDiscountBps: null,
};
const oneOff = {
  discounts: 'forbidden',
  branchRefs: [],
  serviceRefs: [],
  requestedPeriod: null,
};
async function main() {
  await db.$connect();
  const tenant = await db.tenant.create({
    data: {
      name: 'C9 synthetic',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    },
  });
  const other = await db.tenant.create({
    data: {
      name: 'C9 unrelated synthetic',
      slug: randomUUID(),
      status: 'active',
    },
  });
  const user = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: randomUUID() + '@proof.invalid',
      passwordHash: 'not-login',
      role: 'tenant_owner',
      status: 'active',
      memberships: {
        create: { tenantId: tenant.id, role: 'tenant_owner', status: 'active' },
      },
    },
  });
  const member = await db.membership.findFirstOrThrow({
    where: { tenantId: tenant.id, userId: user.id },
  });
  const asUser = <T>(fn: () => T) =>
    ctx.run(randomUUID(), () => {
      ctx.setResolvedTenant({
        tenantId: tenant.id,
        userId: user.id,
        membershipId: member.id,
        role: 'tenant_owner',
        source: 'membership',
      });
      return fn();
    });
  await asUser(async () => {
    const event = await store.event();
    const detail = await store.transaction(undefined, (_tx, p, now) =>
      Promise.resolve(identity.verify(event.eventToken, p, now)),
    );
    const request = {
      contract: 'maya.c9-request/1',
      eventEnvelopeHash: detail.hash,
      eventIssuedAt: detail.envelope.issuedAt,
      eventExpiresAt: detail.envelope.expiresAt,
      objectiveKey: 'c9.review_day',
      safeQuestion: 'Что требует внимания?',
      period: null,
      subjectRefs: [],
      oneOffConstraints: oneOff,
      entryRef: null,
    };
    const root = await store.admit(event.eventToken, request);
    await proof(
      'same event and material request converge concurrently',
      async () => {
        const r = await Promise.all(
          Array.from({ length: 6 }, () =>
            store.admit(event.eventToken, request),
          ),
        );
        assert(r.every((x) => x.id === root.id));
      },
    );
    await proof('same key changed material conflicts before work', async () => {
      await assert.rejects(
        store.admit(event.eventToken, {
          ...request,
          safeQuestion: 'Другая задача',
        }),
      );
      assert.equal(
        await db.c9WorkReceipt.count({ where: { runId: root.id } }),
        0,
      );
    });
    await proof('nonrenewing24h intent and365d derived retention', () => {
      assert(root.validUntil.getTime() - root.admittedAt.getTime() <= 86400000);
      assert.equal(
        root.retentionUntil.getTime() - root.admittedAt.getTime(),
        C9_RETENTION,
      );
    });
    const draft: C9Proposal = {
      objective: {
        key: 'c9.review_day',
        safeDescription: 'Проверить день',
        subjectScopeHash: c9Hash('scope/1', [tenant.id]),
        successCriteria: [],
      },
      constraints: {
        scopeRefs: [],
        oneOff,
        sourcePolicyRefs: [],
        budgetManifestHash: root.budgetManifestHash,
        exposure,
        requiredApprovalAdapters: [],
      },
      alternatives: [
        {
          key: 'observe',
          title: 'Сохранить текущий план',
          kind: 'NO_ACTION',
          why: 'Нет подтверждённого действия',
          evidenceRefs: [],
          scopeHash: c9Hash('scope/1', [tenant.id]),
          knownBenefit: { factRefs: [], proposalText: 'Предложение, не факт' },
          unknowns: ['Нет подтверждённых данных'],
          risks: [],
          costSummary: {
            reservationRefs: [],
            sourceQuoteRefs: [],
            unavailableReasons: [],
          },
          approvalAdapterRefs: [],
          recommended: true,
        },
      ],
      evidenceRefs: [],
      skills: [],
      validUntil: root.validUntil.toISOString(),
      steps: [
        {
          optionKey: 'observe',
          stepKey: 'done',
          ordinal: 1,
          domain: 'ADMIN',
          kind: 'NO_ACTION',
          capability: 'c9.no_action',
          intentContract: 'c9.no_action:input/1',
          intent: null,
          dependencies: [],
          evidenceRefs: [],
          budgetSlice: {
            callReservationKey: null,
            exposure,
            sourcePreviewRefs: [],
          },
          validUntil: root.validUntil.toISOString(),
        },
      ],
    };
    const rev = await store.revision(root.id, 'edit-1', draft);
    await proof(
      'full graph validates with pinned registry and snapshot digest',
      async () => {
        assert.equal(rev.state, 'VALIDATED');
        const [r] = await db.$queryRaw<
          { valid: boolean }[]
        >`SELECT "C9_validate_graph"(${tenant.id},${rev.id}::uuid) valid`;
        assert(r.valid);
      },
    );
    await proof('concurrent revision retry preserves one graph', async () => {
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          store.revision(root.id, 'edit-1', draft),
        ),
      );
      assert(results.every((x) => x.id === rev.id));
      assert.equal(
        await db.c9PlanStep.count({ where: { revisionId: rev.id } }),
        1,
      );
    });
    await proof('material edit under old edit identity conflicts', () =>
      assert.rejects(
        store.revision(root.id, 'edit-1', {
          ...draft,
          objective: {
            ...(draft.objective as C9Object),
            safeDescription: 'Изменить день',
          },
        }),
      ),
    );
    const reviewed = await store.review(
      root.id,
      rev.id,
      'review-1',
      rev.snapshotHash,
      'observe',
      true,
    );
    await proof(
      'strategy review creates no source effect or blanket approval',
      async () => {
        assert.equal(reviewed.reviewDecision, 'ACCEPTED');
        assert.equal(
          await db.actionExecution.count({ where: { tenantId: tenant.id } }),
          0,
        );
        assert.equal(
          await db.aiApprovalRequest.count({ where: { tenantId: tenant.id } }),
          0,
        );
      },
    );
    await proof('retry review returns same immutable review', async () => {
      assert.equal(
        (
          await store.review(
            root.id,
            rev.id,
            'review-1',
            rev.snapshotHash,
            'observe',
            true,
          )
        ).id,
        rev.id,
      );
      await assert.rejects(
        store.review(
          root.id,
          rev.id,
          'review-1',
          rev.snapshotHash,
          'observe',
          false,
        ),
      );
    });
    const revision2 = await store.revision(root.id, 'edit-2', {
      ...draft,
      objective: {
        ...(draft.objective as C9Object),
        safeDescription: 'Уточнённый обзор дня',
      },
    });
    await proof(
      'new material revision preserves original review and invalidates future old work',
      async () => {
        const old = await db.c9StrategyRevision.findUniqueOrThrow({
          where: { id: rev.id },
        });
        assert.equal(old.state, 'SUPERSEDED');
        assert.equal(old.reviewHash, reviewed.reviewHash);
        assert.equal(revision2.revision, 2);
        assert.equal(revision2.reviewedAt, null);
      },
    );
    await proof(
      'current projection and restart use the same plan',
      async () => {
        const restarted = new C9Store(
          db,
          authority,
          identity,
          encryption,
          sources,
        );
        const result = await restarted.snapshot(root.id);
        assert.equal(result.run.currentRevision, 2);
        assert.equal(result.revisions[1].id, revision2.id);
        assert.equal(
          (await restarted.admit(event.eventToken, request)).id,
          root.id,
        );
      },
    );
    await proof('immutable request and revision SQL guards', async () => {
      await assert.rejects(
        db.c9Run.update({
          where: { id: root.id },
          data: { requestHash: 'a'.repeat(64) },
        }),
      );
      await assert.rejects(
        db.c9StrategyRevision.update({
          where: { id: rev.id },
          data: { objectiveJson: { forged: true } },
        }),
      );
    });
    await proof('cross tenant graph ref rejected by PostgreSQL', async () => {
      const exactStep = await db.c9PlanStep.findFirstOrThrow({
        where: { revisionId: revision2.id },
      });
      await assert.rejects(
        db.$transaction((tx) =>
          c9Insert(tx, 'C9PlanStep', {
            ...exactStep,
            id: randomUUID(),
            tenantId: other.id,
            revisionId: revision2.id,
          }),
        ),
      );
    });
    await proof(
      'late insert into accepted graph cannot alter plan',
      async () => {
        const step = await db.c9PlanStep.findFirstOrThrow({
          where: { revisionId: revision2.id },
        });
        await assert.rejects(
          db.$transaction((tx) =>
            c9Insert(tx, 'C9PlanStep', {
              ...step,
              id: randomUUID(),
              stepKey: 'injected',
              ordinal: 2,
            }),
          ),
        );
      },
    );
    const input = {
      callKey: 'read1',
      domain: 'ADMIN' as const,
      kind: 'TOOL_READ' as const,
      taskKey: 'c9.no_action',
      inputHash: c9Hash('input/1', []),
      evidenceRefs: [],
      reservation: {
        contract: 'maya.c9-reservation/1',
        toolCalls: 1,
        modelCalls: 0,
        domain: 'ADMIN',
        inputTokens: 0,
        outputTokens: 0,
        costMicros: '0',
        priceHash: null,
        zeroCostEvidenceRef: 'local:c9.no_action:no-provider-charge',
        stepRef: null,
      },
    };
    const receipt = await work.reserve(root.id, input);
    await proof('concurrent same call reserves exactly once', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => work.reserve(root.id, input)),
      );
      assert(results.every((x) => x.id === receipt.id));
      assert.equal(
        await db.c9WorkReceipt.count({ where: { runId: root.id } }),
        1,
      );
    });
    const lease = await work.claim(root.id, receipt.id);
    assert(lease);
    await proof(
      'concurrent claim cannot dispatch same call twice',
      async () => {
        assert.equal(await work.claim(root.id, receipt.id), null);
      },
    );
    const result = {
      contract: 'c9.no_action:output/1',
      evidenceRefs: [],
      completeness: 'UNAVAILABLE',
      safeData: { effect: 'NONE' },
    };
    const usage = {
      contract: 'maya.c9-usage/1',
      usageReceiptRef: 'local-no-effect',
      verifiedAt: new Date().toISOString(),
      inputTokens: 0,
      outputTokens: 0,
      costMicros: '0',
      priceHash: null,
      completionKind: 'CONFIRMED',
    };
    await work.settle(lease, result, usage);
    await proof(
      'settled call skips after restart and does not reset counters',
      async () => {
        assert.equal(await work.claim(root.id, receipt.id), null);
        assert.equal((await work.settle(lease, result, usage)).id, receipt.id);
        const r = await db.c9Run.findUniqueOrThrow({ where: { id: root.id } });
        assert.equal(
          (r.budgetStateJson as C9Object).tool &&
            ((r.budgetStateJson as C9Object).tool as C9Object).settled,
          1,
        );
      },
    );
    const uncertain = await work.reserve(root.id, {
        ...input,
        callKey: 'read2',
      }),
      unknownLease = await work.claim(root.id, uncertain.id);
    assert(unknownLease);
    await work.hold(unknownLease);
    await proof(
      'UNKNOWN holds same receipt; independent work can continue without resend',
      async () => {
        assert.equal(
          (
            await db.c9WorkReceipt.findUniqueOrThrow({
              where: { id: uncertain.id },
            })
          ).state,
          'HELD_UNKNOWN',
        );
        assert.equal(await work.claim(root.id, uncertain.id), null);
        const independent = await work.reserve(root.id, {
          ...input,
          callKey: 'independent-after-unknown',
        });
        assert.equal(independent.state, 'RESERVED');
        assert.equal(
          (await work.reserve(root.id, { ...input, callKey: 'read2' })).id,
          uncertain.id,
        );
      },
    );
    await proof(
      'SQL settlement requires exact current dispatch fence',
      async () => {
        const r = await work.reserve(root.id, {
          ...input,
          callKey: 'fence-negative',
        });
        const l = await work.claim(root.id, r.id);
        assert(l);
        await assert.rejects(
          db.c9WorkReceipt.update({
            where: { id: r.id },
            data: { state: 'HELD_UNKNOWN' },
          }),
        );
        await assert.rejects(work.hold({ ...l, token: 'wrong-token' }));
        await work.hold(l);
      },
    );
    await proof(
      'restart recovers expired dispatch as held, charges lost window, never resends',
      async () => {
        const r = await work.reserve(root.id, {
          ...input,
          callKey: 'crash-negative',
        });
        const l = await work.claim(root.id, r.id);
        assert(l);
        const pending = await db.c9WorkReceipt.findUniqueOrThrow({
          where: { id: r.id },
        });
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, pending.leaseUntil!.getTime() - Date.now() + 50),
          ),
        );
        const recovered = await work.recover(root.id);
        assert.equal(
          recovered.find((x) => x.id === r.id)?.state,
          'HELD_UNKNOWN',
        );
        assert.equal(
          (await work.recover(root.id)).find((x) => x.id === r.id)?.id,
          r.id,
        );
        await assert.rejects(work.settle(l, result, usage));
        const stopped = await db.c9Run.findUniqueOrThrow({
          where: { id: root.id },
        });
        assert.equal(stopped.state, 'STOPPED');
        assert.equal(stopped.reasoningUsedMs, 120000);
        assert.equal(
          (await work.reserve(root.id, { ...input, callKey: 'crash-negative' }))
            .id,
          r.id,
        );
      },
    );
    await proof(
      'generic deletion and truncate denied without exact AC6 claim',
      async () => {
        await assert.rejects(db.c9Run.delete({ where: { id: root.id } }));
        await assert.rejects(db.$executeRaw`TRUNCATE "C9WorkReceipt"`);
      },
    );
    await proof(
      'current revoked membership denies retained plan read',
      async () => {
        await db.membership.update({
          where: { id: member.id },
          data: { status: 'suspended' },
        });
        await assert.rejects(store.snapshot(root.id));
        await db.membership.update({
          where: { id: member.id },
          data: { status: 'active' },
        });
      },
    );
  });
  await proof(
    'real signed channel plus verified Client link works without Maya User',
    async () => {
      const client = await db.client.create({ data: { tenantId: tenant.id } }),
        subject = String(Date.now());
      const providerSubjectHash = clientChannelSubjectHash(
        encryption,
        'telegram',
        subject,
      );
      const digest = (v: unknown) =>
        createHash('sha256').update(JSON.stringify(v)).digest('hex');
      const verificationIdentityHash = digest(['link', client.id]);
      const evidence = {
        contract: 'a18.client-channel-verification.v1',
        verifier: 'synthetic-c9-channel-fixture',
        channelControlProofHash: digest(['channel', subject]),
        clientAuthorityProofHash: digest(['client', client.id]),
        verificationIdentityHash,
        tenantId: tenant.id,
        provider: 'telegram',
        providerSubjectHash,
        clientId: client.id,
      };
      const link = await db.clientChannelLink.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          provider: 'telegram',
          providerSubjectHash,
          verificationMethod: 'explicit_verified_challenge',
          verificationIdentityHash,
          verificationEvidenceJson: evidence,
          verificationEvidenceHash: digest(evidence),
        },
      });
      const fields = {
        auth_date: String(Math.floor(Date.now() / 1000)),
        id: subject,
      };
      const material = Object.entries(fields)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      const signed = {
        ...fields,
        hash: createHmac(
          'sha256',
          createHash('sha256').update('synthetic-c9-telegram').digest(),
        )
          .update(material)
          .digest('hex'),
      };
      const channelProof = JSON.stringify({
        type: 'telegram_widget',
        credential: JSON.stringify(signed),
      });
      const before = {
        clients: await db.client.count(),
        users: await db.user.count(),
        links: await db.clientChannelLink.count(),
        actions: await db.actionExecution.count(),
        consents: await db.clientConsentFact.count(),
        challenges: await db.clientLinkChallenge.count(),
      };
      await ctx.runAsPublicTenant(tenant.id, async () => {
        const e = await store.event(channelProof),
          detail = await store.transaction(channelProof, (_tx, p, now) =>
            Promise.resolve(identity.verify(e.eventToken, p, now)),
          );
        const request = {
          contract: 'maya.c9-request/1',
          eventEnvelopeHash: detail.hash,
          eventIssuedAt: detail.envelope.issuedAt,
          eventExpiresAt: detail.envelope.expiresAt,
          objectiveKey: 'c9.own_visit',
          safeQuestion: 'Проверить свой визит',
          period: null,
          subjectRefs: [],
          oneOffConstraints: oneOff,
          entryRef: null,
        };
        const r = await store.admit(e.eventToken, request, channelProof);
        assert.equal((r.principalJson as C9Object).clientId, client.id);
        assert.equal((r.principalJson as C9Object).userId, null);
        await assert.rejects(
          store.event(
            JSON.stringify({
              type: 'telegram_widget',
              credential: JSON.stringify({ ...signed, id: '999999999' }),
            }),
          ),
        );
        const links = new ClientChannelLinkService(db, ctx, {
          verifyLink: () => Promise.reject(new Error('no auto-link')),
          verifyRevocation: () =>
            Promise.resolve({
              tenantId: tenant.id,
              provider: 'telegram',
              providerSubjectHash,
              linkId: link.id,
              revocationIdentityHash: digest(['revoke', link.id]),
              actorProofHash: digest(['actor', link.id]),
              reason: 'synthetic verified revocation',
              validUntil: new Date(Date.now() + 60000),
            }),
        });
        await links.revoke({ proof: 'synthetic-explicit-revocation' });
        await assert.rejects(store.snapshot(r.id, channelProof));
        await assert.rejects(store.event(channelProof));
      });
      await assert.rejects(
        ctx.runAsPublicTenant(other.id, () => store.event(channelProof)),
      );
      assert.equal(await db.client.count(), before.clients);
      assert.equal(await db.user.count(), before.users);
      assert.equal(await db.clientChannelLink.count(), before.links);
      assert.equal(await db.actionExecution.count(), before.actions);
      assert.equal(await db.clientConsentFact.count(), before.consents);
      assert.equal(await db.clientLinkChallenge.count(), before.challenges);
    },
  );
  await proof(
    'AC6 due child cleanup stops continuation but preserves live root identity and all source facts',
    async () => {
      let rootId = '',
        childId = '';
      const sourceBefore = {
        users: await db.user.count(),
        clients: await db.client.count(),
        links: await db.clientChannelLink.count(),
        actions: await db.actionExecution.count(),
      };
      await asUser(async () => {
        const e = await store.event(),
          detail = await store.transaction(undefined, (_tx, p, now) =>
            Promise.resolve(identity.verify(e.eventToken, p, now)),
          );
        const r = await store.admit(e.eventToken, {
          contract: 'maya.c9-request/1',
          eventEnvelopeHash: detail.hash,
          eventIssuedAt: detail.envelope.issuedAt,
          eventExpiresAt: detail.envelope.expiresAt,
          objectiveKey: 'c9.retention',
          safeQuestion: 'Короткий derived результат',
          period: null,
          subjectRefs: [],
          oneOffConstraints: oneOff,
          entryRef: null,
        });
        rootId = r.id;
        const receipt = await work.reserve(r.id, {
          callKey: 'retained-read',
          domain: 'ADMIN',
          kind: 'TOOL_READ',
          taskKey: 'c9.no_action',
          inputHash: c9Hash('input/1', []),
          evidenceRefs: [],
          reservation: {
            contract: 'maya.c9-reservation/1',
            toolCalls: 1,
            modelCalls: 0,
            domain: 'ADMIN',
            inputTokens: 0,
            outputTokens: 0,
            costMicros: '0',
            priceHash: null,
            zeroCostEvidenceRef: 'local:c9.no_action:no-provider-charge',
            stepRef: null,
          },
        });
        // Prospective synthetic INSERT with shorter child retention; no trigger bypass/backdate/source mutation.
        await store.transaction(undefined, async (tx, p, now) => {
          childId = randomUUID();
          await c9Insert(tx, 'C9WorkReceipt', {
            ...receipt,
            id: childId,
            callKeyHash: c9Hash('short-child/1', [childId]),
            admittedAt: now,
            retentionUntil: new Date(now.getTime() + 250),
          });
          const [current] = await tx.$queryRaw<
            { budget: object }[]
          >`SELECT "C9_validate_budget"(${p.tenantId},${r.id}::uuid) budget`;
          await tx.c9Run.update({
            where: { id: r.id },
            data: {
              budgetStateJson: current.budget,
              counterVersion: { increment: 1 },
              updatedAt: now,
            },
          });
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 350));
      await ctx.runAsSystemTenant(tenant.id, async () => {
        const maintenance = new Package5Wave6MaintenanceService(
          db,
          ctx,
          () => new Date(Date.now() + 60000),
        );
        const plan = await maintenance.prepare({
          actionClass: 'expire_c9_orchestration_runs',
          batchSize: 10,
        });
        const one = await maintenance.execute(plan);
        await maintenance.execute(plan);
        assert.equal(one.deleted, 1);
      });
      assert.equal(await db.c9WorkReceipt.count({ where: { id: childId } }), 0);
      assert.equal(
        (await db.c9Run.findUniqueOrThrow({ where: { id: rootId } })).state,
        'STOPPED',
      );
      assert.equal(await db.user.count(), sourceBefore.users);
      assert.equal(await db.client.count(), sourceBefore.clients);
      assert.equal(await db.clientChannelLink.count(), sourceBefore.links);
      assert.equal(await db.actionExecution.count(), sourceBefore.actions);
      await assert.rejects(
        new Package5Wave6MaintenanceService(db).prepare({
          actionClass: 'expire_c9_orchestration_runs',
        }),
      );
    },
  );
  await proof(
    'atomic budget reservation caps domains and calls under concurrency without resetting on retry',
    () =>
      asUser(async () => {
        const e = await store.event(),
          d = await store.transaction(undefined, (_tx, p, now) =>
            Promise.resolve(identity.verify(e.eventToken, p, now)),
          );
        const request = {
          contract: 'maya.c9-request/1',
          eventEnvelopeHash: d.hash,
          eventIssuedAt: d.envelope.issuedAt,
          eventExpiresAt: d.envelope.expiresAt,
          objectiveKey: 'c9.budget',
          safeQuestion: 'Проверка лимита',
          period: null,
          subjectRefs: [],
          oneOffConstraints: oneOff,
          entryRef: null,
        };
        const r = await store.admit(e.eventToken, request);
        const input = (
          key: string,
          domain: 'ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY',
        ) => ({
          callKey: key,
          domain,
          kind: 'TOOL_READ' as const,
          taskKey: 'c9.no_action',
          inputHash: c9Hash('input/1', []),
          evidenceRefs: [],
          reservation: {
            contract: 'maya.c9-reservation/1',
            toolCalls: 1,
            modelCalls: 0,
            domain,
            inputTokens: 0,
            outputTokens: 0,
            costMicros: '0',
            priceHash: null,
            zeroCostEvidenceRef: 'local:c9.no_action:no-provider-charge',
            stepRef: null,
          },
        });
        const raced = await Promise.allSettled(
          Array.from({ length: 9 }, (_, i) =>
            work.reserve(r.id, input('admin-' + i, 'ADMIN')),
          ),
        );
        assert.equal(raced.filter((x) => x.status === 'fulfilled').length, 6);
        assert.equal(
          await db.c9WorkReceipt.count({ where: { runId: r.id } }),
          6,
        );
        await work.reserve(r.id, input('client-1', 'CLIENT_LIFECYCLE'));
        await assert.rejects(
          work.reserve(r.id, input('occupancy-1', 'OCCUPANCY')),
        );
        for (let i = 2; i <= 6; i++)
          await work.reserve(r.id, input('client-' + i, 'CLIENT_LIFECYCLE'));
        assert.equal(
          await db.c9WorkReceipt.count({ where: { runId: r.id } }),
          12,
        );
        await assert.rejects(
          work.reserve(r.id, input('client-7', 'CLIENT_LIFECYCLE')),
        );
        assert.equal((await store.admit(e.eventToken, request)).id, r.id);
        assert.equal(
          await db.c9WorkReceipt.count({ where: { runId: r.id } }),
          12,
        );
        const receipt = await db.c9WorkReceipt.findFirstOrThrow({
          where: { runId: r.id },
        });
        await assert.rejects(
          db.$transaction((tx) =>
            c9Insert(tx, 'C9WorkReceipt', {
              ...receipt,
              id: randomUUID(),
              callKeyHash: c9Hash('bad-null/1', []),
              reservationJson: {
                ...(receipt.reservationJson as C9Object),
                inputTokens: null,
              },
            }),
          ),
        );
        await assert.rejects(
          work.reserve(r.id, {
            ...input('paid', 'ADMIN'),
            kind: 'MODEL',
            taskKey: 'c9.admin',
            skillHash: 'a'.repeat(64),
            providerModelKey: 'not-configured',
          }),
        );
      }),
  );
  await proof(
    'expired signed request cannot insert a replacement after elapsed validity',
    () =>
      asUser(async () => {
        const token = await store.transaction(undefined, (_tx, p, now) =>
          Promise.resolve(
            identity.issue(p, now, new Date(now.getTime() + 350)),
          ),
        );
        const d = await store.transaction(undefined, (_tx, p, now) =>
          Promise.resolve(identity.verify(token, p, now)),
        );
        const request = {
          contract: 'maya.c9-request/1',
          eventEnvelopeHash: d.hash,
          eventIssuedAt: d.envelope.issuedAt,
          eventExpiresAt: d.envelope.expiresAt,
          objectiveKey: 'c9.expiry',
          safeQuestion: 'Короткий запрос',
          period: null,
          subjectRefs: [],
          oneOffConstraints: oneOff,
          entryRef: null,
        };
        const r = await store.admit(token, request);
        await new Promise((resolve) => setTimeout(resolve, 400));
        await assert.rejects(store.admit(token, request));
        assert.equal(
          await db.c9Run.count({
            where: { tenantId: tenant.id, requestKeyHash: r.requestKeyHash },
          }),
          1,
        );
      }),
  );
  await proof('unauthenticated context cannot create strategy', () =>
    assert.rejects(store.event()),
  );
  const columns = await db.$queryRaw<
    { table_name: string; count: bigint }[]
  >`SELECT table_name,count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('C9Run','C9StrategyRevision','C9PlanStep','C9StepBinding','C9WorkReceipt') GROUP BY table_name`;
  await proof('exact five tables and123 physical fields', () => {
    assert.equal(columns.length, 5);
    assert.equal(
      columns.reduce((n, x) => n + Number(x.count), 0),
      123,
    );
  });
  console.log(
    JSON.stringify({
      contract: 'maya.c9-p01-postgresql-proof/1',
      checks: checks.length,
      passed: checks,
      productionEffects: 0,
    }),
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
