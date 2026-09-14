/**
 * Executable P02 proof: the real Orchestrator, the real budget ledger and the real
 * PostgreSQL guards. Refuses every database except the owned synthetic C9 cluster.
 *
 * Scope note, stated rather than implied: the C7/C8 reader boundary is left unwired here,
 * so the checks below cover routing, delegation accounting, budget exhaustion, request
 * identity, tenant isolation, cancellation and the paid-work denial. The grounded-answer
 * shape over qualified projections is proved deterministically by
 * `src/orchestration/c9.context-and-bi.spec.ts` against the same production code, and the
 * projections themselves remain certified by the C7 and C8 suites.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { ClientChannelRuntimeService } from '../src/crm/client-channel-runtime.service';
import { C9Authority } from '../src/orchestration/c9.authority';
import { C9RequestIdentity } from '../src/orchestration/c9.identity';
import { C9Store } from '../src/orchestration/c9.store';
import { C9WorkService } from '../src/orchestration/c9.work';
import { C9Sources } from '../src/orchestration/c9.sources';
import { C9Allowance } from '../src/orchestration/c9.allowance';
import { GovernedSettingsReadService } from '../src/package5-wave1/governed-settings.read';
import { C9Agents } from '../src/orchestration/c9.agents';
import { C9ContextService } from '../src/orchestration/c9.context';
import { C9ModelGateway } from '../src/orchestration/c9.model';
import { C9Orchestrator } from '../src/orchestration/c9.orchestrator';
import { C9Object } from '../src/orchestration/c9.contract';
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
const reader = {
  snapshot: () => Promise.reject(new Error('owner-reader-required')),
};
const sources = new C9Sources(
  reader as unknown as MeasurementReadService,
  reader as unknown as C8ReadService,
);
const authority = new C9Authority(ctx, channels),
  identity = new C9RequestIdentity(encryption);
// No price manifest and no cap are configured, so this run funds no paid reasoning at all.
const allowance = new C9Allowance(cfg);
// The real confirmed-configuration reader: with no confirmed c9_orchestration revision it
// reports an explicit absence, so the released ceilings apply unchanged.
const governed = new GovernedSettingsReadService(db, ctx, encryption, cfg);
const store = new C9Store(
    db,
    authority,
    identity,
    encryption,
    sources,
    allowance,
    governed,
  ),
  work = new C9WorkService(store),
  context = new C9ContextService(store, sources),
  agents = new C9Agents(),
  model = new C9ModelGateway(allowance, work),
  orchestrator = new C9Orchestrator(store, context, work, agents, allowance);

const checks: string[] = [];
async function proof(name: string, fn: () => unknown) {
  await fn();
  checks.push(name);
  console.log('PASS ' + name);
}
const oneOff = {
  discounts: 'forbidden',
  branchRefs: [],
  serviceRefs: [],
  requestedPeriod: null,
};
const BUSINESS_TABLES = [
  'Appointment',
  'Client',
  'ActionExecution',
  'MarketingCampaign',
  'AiToolExecution',
] as const;
async function businessRows(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of BUSINESS_TABLES) {
    const [row] = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "${table}"`,
    );
    out[table] = Number(row.n);
  }
  return out;
}

async function main() {
  await db.$connect();
  const before = await businessRows();
  const tenant = await db.tenant.create({
    data: {
      name: 'C9 P02 synthetic',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    },
  });
  const other = await db.tenant.create({
    data: { name: 'C9 P02 unrelated', slug: randomUUID(), status: 'active' },
  });
  const owner = async (tenantId: string) => {
    const user = await db.user.create({
      data: {
        tenantId,
        email: randomUUID() + '@proof.invalid',
        passwordHash: 'not-login',
        role: 'tenant_owner',
        status: 'active',
        memberships: {
          create: { tenantId, role: 'tenant_owner', status: 'active' },
        },
      },
    });
    const member = await db.membership.findFirstOrThrow({
      where: { tenantId, userId: user.id },
    });
    return <T>(fn: () => T) =>
      ctx.run(randomUUID(), () => {
        ctx.setResolvedTenant({
          tenantId,
          userId: user.id,
          membershipId: member.id,
          role: 'tenant_owner',
          source: 'membership',
        });
        return fn();
      });
  };
  const asOwner = await owner(tenant.id),
    asStranger = await owner(other.id);
  const ask = async (objectiveKey: string, question: string) => {
    const event = await orchestrator.requestIdentity();
    const detail = await store.transaction(undefined, (_tx, p, now) =>
      Promise.resolve(identity.verify(event.eventToken, p, now)),
    );
    const request = {
      contract: 'maya.c9-request/1',
      eventEnvelopeHash: detail.hash,
      eventIssuedAt: detail.envelope.issuedAt,
      eventExpiresAt: detail.envelope.expiresAt,
      objectiveKey,
      safeQuestion: question,
      period: null,
      subjectRefs: [],
      oneOffConstraints: oneOff,
      entryRef: null,
    };
    return {
      eventToken: event.eventToken,
      request,
      answer: await orchestrator.coordinate(event.eventToken, request),
    };
  };

  await asOwner(async () => {
    const simple = await ask('c9.unmapped_objective', 'Просто вопрос');
    await proof(
      'a simple request is answered without delegating to any agent',
      () => {
        assert.deepEqual(simple.answer.domains, []);
        assert.equal(simple.answer.answers.length, 0);
        assert.equal(simple.answer.completeness.status, 'UNAVAILABLE');
        assert(
          simple.answer.completeness.reasonCodes.includes(
            'no_delegated_domain_required',
          ),
        );
      },
    );
    await proof(
      'a coordinator-only answer consumes no delegated call',
      async () => {
        assert.equal(
          await db.c9WorkReceipt.count({
            where: { runId: simple.answer.runId },
          }),
          0,
        );
        const budget = simple.answer.budget;
        assert.deepEqual(budget.domains, []);
        assert.deepEqual(budget.tool, {
          reserved: 0,
          settled: 0,
          held: 0,
          byDomain: {},
        });
        assert.deepEqual(budget.aiCostMicros, {
          reserved: '0',
          settled: '0',
          held: '0',
        });
      },
    );
    await proof(
      'the same request event returns the same run, not a second one',
      async () => {
        const again = await orchestrator.coordinate(
          simple.eventToken,
          simple.request,
        );
        assert.equal(again.runId, simple.answer.runId);
        assert.equal(
          await db.c9Run.count({ where: { tenantId: tenant.id } }),
          1,
        );
      },
    );
    await proof('routing is bounded by the approved two-domain ceiling', () => {
      const manifest = { domainsMax: 2 };
      assert.deepEqual(orchestrator.route('c9.business_overview', manifest), [
        'BUSINESS_INTELLIGENCE',
      ]);
      assert.deepEqual(orchestrator.route('c9.client_value', manifest), [
        'BUSINESS_INTELLIGENCE',
        'CLIENT_LIFECYCLE',
      ]);
      // A tenant may tighten the ceiling; the released table can never widen it.
      assert.throws(() =>
        orchestrator.route('c9.client_value', { domainsMax: 1 }),
      );
      assert.deepEqual(
        orchestrator.route('c9.unmapped_objective', manifest),
        [],
      );
    });
    const bi = await ask('c9.business_overview', 'Как идут дела?');
    await proof(
      'a delegated domain answers honestly with no permitted evidence',
      () => {
        assert.deepEqual(bi.answer.domains, ['BUSINESS_INTELLIGENCE']);
        const [result] = bi.answer.answers as C9Object[];
        assert.equal(result.agent_id, 'BUSINESS_INTELLIGENCE');
        assert.deepEqual(result.proposed_action_intents, []);
        assert.deepEqual(result.facts_used, []);
        assert.equal(result.confidence, 'low');
        assert.deepEqual(
          (result.completeness as C9Object).status,
          'UNAVAILABLE',
        );
        assert((result.limitations as string[]).length > 0);
      },
    );
    await proof(
      'an unavailable answer states its reason and invents no number',
      () => {
        const body = JSON.stringify(bi.answer);
        assert(
          bi.answer.completeness.reasonCodes.includes(
            'no_permitted_qualified_evidence',
          ),
        );
        // Absence stays absent: no numeric prediction and no value list are carried,
        // and the only mention of prediction is the boundary that denies it.
        assert(!/"numericPrediction":(?!null)/.test(body));
        assert(!/"values":\[[^\]]/.test(body));
        assert(!/[0-9]+(?:[.,][0-9]+)?\s*%/.test(body));
        assert.equal(bi.answer.reasoning.paid, false);
        assert.equal(
          bi.answer.reasoning.reason,
          'paid_capability_not_activated',
        );
        assert.deepEqual(bi.answer.boundaries, {
          factIsPrediction: false,
          strategyIsApproval: false,
          resultIsConsent: false,
          memoryIsPolicy: false,
          unknownIsFailure: false,
        });
      },
    );
    await proof(
      'paid reasoning stays closed without a released price basis',
      async () => {
        assert.equal(model.available(new Date()), false);
        const outcome = await model.reason(
          bi.answer.runId,
          {
            callKey: 'paid-' + randomUUID(),
            taskKey: 'c9.bi',
            domain: 'BUSINESS_INTELLIGENCE',
            skillHash: 'a'.repeat(64),
            providerModelKey: 'unconfigured-provider',
            inputTokens: 100,
            outputTokens: 100,
            inputHash: 'b'.repeat(64),
            evidenceRefs: [],
          },
          () => Promise.reject(new Error('no paid call may be attempted')),
          new Date(),
        );
        assert.deepEqual(outcome, {
          status: 'UNAVAILABLE',
          reason: 'paid_capability_not_activated',
        });
        // The same denial holds at the ledger, not only at the gateway.
        await assert.rejects(
          work.reserve(bi.answer.runId, {
            callKey: 'direct-' + randomUUID(),
            domain: 'BUSINESS_INTELLIGENCE',
            kind: 'MODEL',
            taskKey: 'c9.bi',
            inputHash: 'c'.repeat(64),
            evidenceRefs: [],
            skillHash: 'd'.repeat(64),
            providerModelKey: 'unconfigured-provider',
            priceBasis: null,
            reservation: {
              contract: 'maya.c9-reservation/1',
              toolCalls: 0,
              modelCalls: 1,
              domain: 'BUSINESS_INTELLIGENCE',
              inputTokens: 10,
              outputTokens: 10,
              costMicros: '0',
              priceHash: null,
              zeroCostEvidenceRef: null,
              stepRef: null,
            },
          }),
          /c9_paid_capability_not_activated/,
        );
        assert.equal(
          await db.c9WorkReceipt.count({
            where: { runId: bi.answer.runId, kind: 'MODEL' },
          }),
          0,
        );
      },
    );
    await proof(
      'a run cannot be cancelled twice under a different key',
      async () => {
        const cancelled = await store.cancel(simple.answer.runId, 'stop-once');
        assert.equal(cancelled.state, 'CANCELLED');
        assert.equal(
          (
            await store.cancel(simple.answer.runId, 'stop-once')
          ).cancelledAt?.getTime(),
          cancelled.cancelledAt?.getTime(),
        );
        await assert.rejects(
          store.cancel(simple.answer.runId, 'stop-differently'),
          /c9_cancel_conflict/,
        );
      },
    );
    await proof(
      'a cancelled run admits no further coordination work',
      async () => {
        await assert.rejects(
          work.reserve(simple.answer.runId, {
            callKey: 'after-cancel',
            domain: 'BUSINESS_INTELLIGENCE',
            kind: 'TOOL_READ',
            taskKey: 'c8.result.read',
            inputHash: 'e'.repeat(64),
            evidenceRefs: [],
            reservation: {
              contract: 'maya.c9-reservation/1',
              toolCalls: 1,
              modelCalls: 0,
              domain: 'BUSINESS_INTELLIGENCE',
              inputTokens: 0,
              outputTokens: 0,
              costMicros: '0',
              priceHash: null,
              zeroCostEvidenceRef: 'local:c8.result.read:no-provider-charge',
              stepRef: null,
            },
          }),
          /c9_run_expired_or_terminal/,
        );
      },
    );
    await proof(
      'the snapshot projection exposes no raw request payload',
      async () => {
        const view = await store.snapshot(bi.answer.runId);
        const body = JSON.stringify(view.steps);
        assert(!body.includes('intentEncrypted'));
        assert.equal(view.run.tenantId, tenant.id);
      },
    );
  });

  await asStranger(async () => {
    const view = await db.c9Run.findMany({ where: { tenantId: other.id } });
    await proof('another tenant sees no run and cannot open one', async () => {
      assert.deepEqual(view, []);
      const rows = await db.c9Run.findMany({ where: { tenantId: tenant.id } });
      assert(rows.length > 0);
      await assert.rejects(store.snapshot(rows[0].id));
    });
  });

  await proof(
    'unauthenticated context cannot coordinate anything',
    async () => {
      await assert.rejects(orchestrator.requestIdentity());
    },
  );

  const after = await businessRows();
  await proof('no business, provider or message effect was produced', () => {
    for (const table of BUSINESS_TABLES)
      assert.equal(after[table], before[table]);
  });

  console.log(
    JSON.stringify({
      contract: 'maya.c9-p02-postgresql-proof/1',
      checks: checks.length,
      passed: checks,
      paidReasoning: 'DISABLED',
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
