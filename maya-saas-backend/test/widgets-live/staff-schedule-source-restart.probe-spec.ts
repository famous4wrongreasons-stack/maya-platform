import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';
// Keep the existing bootstrap import graph first. These are actual owners, not overrides.
import { ActionEngineKernel } from '../../src/action-engine/action-engine.kernel';
import { ActionExecutionUncertainError } from '../../src/action-engine/action-engine.errors';
import { CrmService } from '../../src/crm/crm.service';
import {
  staffScheduleRevision,
  staffScheduleSourceRevision,
} from '../../src/crm/staff-schedule.utils';
import {
  Package5Wave3ShadowService,
  Package5Wave3ExecutableService,
  type Package5Wave3Command,
} from '../../src/package5-wave3/package5-wave3.service';
import { Package5Wave3ProductionGatewayService } from '../../src/package5-wave3/package5-wave3-production-gateway.service';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';

const stage = process.env.JEST_STAFF_SCHEDULE_STAGE;
const receipt = process.env.JEST_STAFF_SCHEDULE_RECEIPT;
const output = process.env.JEST_STAFF_SCHEDULE_OUTPUT;
const sourceHead = process.env.JEST_STAFF_SCHEDULE_SOURCE_HEAD;
const sourceBindingsDigest = process.env.JEST_STAFF_SCHEDULE_SOURCE_DIGEST;
assert.ok(
  (stage === 'prepare' || stage === 'resume') && receipt && output,
  'Use staff-schedule-source-proof.mjs',
);
const database = assertProofDatabase();
assert.ok(sourceHead && /^[a-f0-9]{40}$/.test(sourceHead));
assert.ok(sourceBindingsDigest && /^[a-f0-9]{64}$/.test(sourceBindingsDigest));
assert.match(
  database.database,
  /^maya_widget_gate_proof_staffschedule_[a-f0-9]+$/,
);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const INITIAL = [{ from: '10:00', to: '20:00' }];
const BREAK = [
  { from: '10:00', to: '14:00' },
  { from: '15:00', to: '20:00' },
];
const DIVERGENT = [{ from: '12:00', to: '18:00' }];
const BRANCH_TIMEZONE = 'Pacific/Kiritimati';
const SYNTHETIC_TOKEN = 'staff-schedule-source-synthetic-no-credential';
type Slot = { from: string; to: string };
type ProviderState = {
  company: number;
  slots: Slot[];
  divergent: boolean;
  puts: number;
  date: string | null;
};
type Salon = {
  tenant: TenantFixture;
  user: UserFixture;
  staffId: string;
  branchId: string;
  company: number;
};
type Submission = {
  contract: string;
  widget_id: string;
  intent_token: string;
  inputs: null;
  client_nonce: string;
  profile_id: string;
};
type Envelope = {
  widget_id: string;
  kind: string;
  intents: Array<{ effect: string; intent_token: string }>;
};
type Chat = {
  request_id: string;
  action: unknown;
  reply: string;
  resolution?: { receipt?: { widget_id: string } };
};
type CarrierObservation = {
  status: string;
  lines: Array<{ outcome: string; text?: string }>;
};
type ApprovedArguments = {
  staff_id: string;
  local_staff_id: string;
  source_hash: string;
  date: string;
  current_revision: string;
  current_slots: Slot[];
  slots: Slot[];
};
type ExecutionSnapshot = {
  id: string;
  state: string;
  normalizedInputHash: string;
  inputDigest: string;
  sourceIdentityHash: string;
  expectedProviderRevision: string;
  evidenceDigest: string;
  executionAttempts: number;
  reconciliationAttempts: number;
};
type ReceiptSnapshot = {
  id: string;
  outcome: string;
  actionReceiptRef: string | null;
  submittedAt: string;
};
type Saved = {
  contract: 'synthetic-staff-schedule-source-proof/1';
  database: string;
  sourceHead: string;
  sourceBindingsDigest: string;
  pid: number;
  pgStarted: string;
  salons: Salon[];
  provider: Record<string, ProviderState>;
  confirmed: Array<{
    salon: Salon;
    snapshot: ExecutionSnapshot;
    widgetId: string;
    receipt: ReceiptSnapshot;
  }>;
  unknown: {
    salon: Salon;
    approvalId: string;
    submission: Submission;
    snapshot: ExecutionSnapshot;
  };
};

describe('native schedule source [full-scope-existing-authority] [synthetic transport] [HTTP/PG restart]', () => {
  let db: FixtureContext, http: HttpHarness;
  let saved: Saved;
  const provider: Record<string, ProviderState> = {};
  const own = new Set<string>();
  const transport: Array<{
    tenantId: string;
    method: string;
    resource: string;
    company: number;
  }> = [];
  const unexpected: string[] = [];
  let modelCalls = 0;
  const report: Record<string, unknown> = {
    stage,
    sourceHead,
    sourceBindingsDigest,
    approvalScope: 'full-scope-existing-authority',
    realNativeAdapter: true,
    syntheticTransport: true,
    realProviderAcceptance: false,
    realModelAcceptance: false,
    closedProfileAcceptance: false,
    browserAcceptance: false,
    presentation: 'existing current carrier and React SSR helper',
  };

  const respond = (data: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify({ success: true, data }), { status: 200 }),
    );
  beforeAll(async () => {
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
    process.env.YCLIENTS_PARTNER_TOKEN = SYNTHETIC_TOKEN;
    if (stage === 'resume') {
      saved = JSON.parse(readFileSync(receipt, 'utf8')) as Saved;
      assert.equal(saved.contract, 'synthetic-staff-schedule-source-proof/1');
      assert.equal(saved.database, database.database);
      assert.equal(saved.sourceHead, sourceHead);
      assert.equal(saved.sourceBindingsDigest, sourceBindingsDigest);
      assert.notEqual(
        saved.pid,
        process.pid,
        'Node process must actually restart',
      );
      for (const salon of saved.salons) own.add(salon.tenant.id);
      Object.assign(provider, saved.provider);
    }
    // The only mocked boundary is the finite provider transport. Factory, CRM,
    // approvals, widget minter, AE planner/runtime and reconciliation are real.
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const match = /^\/synthetic\/([^/]+)\/(.+)$/.exec(url.pathname);
      const method = init?.method ?? 'GET';
      const state = match ? provider[match[1]] : undefined;
      if (
        url.origin !== 'http://127.0.0.1:9' ||
        !match ||
        !state ||
        !own.has(match[1])
      ) {
        unexpected.push('unowned_provider_request');
        throw new Error('Only the finite synthetic provider is permitted');
      }
      const tenantId = match[1],
        resource = match[2];
      const mark = () =>
        transport.push({
          tenantId,
          method,
          resource: resource.split('/')[0],
          company: state.company,
        });
      if (
        method === 'GET' &&
        resource === `company/${state.company}/staff` &&
        !url.search
      ) {
        mark();
        return respond([
          { id: 71, name: 'Антон Соколов', bookable: true, fired: false },
        ]);
      }
      const schedule = /^schedule\/(\d+)\/71\/(\d{4}-\d{2}-\d{2})\/\2$/.exec(
        resource,
      );
      if (
        method === 'GET' &&
        schedule &&
        Number(schedule[1]) === state.company &&
        !url.search
      ) {
        if (state.date !== null) assert.equal(schedule[2], state.date);
        state.date = schedule[2];
        mark();
        return respond([
          {
            date: schedule[2],
            is_working: state.slots.length > 0,
            slots: state.slots,
          },
        ]);
      }
      if (method === 'GET' && resource === `records/${state.company}`) {
        assert.ok(state.date);
        assert.deepEqual(Object.fromEntries(url.searchParams), {
          start_date: state.date,
          end_date: state.date,
          count: '200',
          page: '1',
          staff_id: '71',
        });
        mark();
        return respond([]);
      }
      if (
        method === 'PUT' &&
        resource === `company/${state.company}/staff/schedule` &&
        !url.search
      ) {
        assert.equal(init?.redirect, 'error');
        assert.ok(typeof init?.body === 'string');
        const body: unknown = JSON.parse(init.body);
        const dayoff = {
          schedules_to_set: [],
          schedules_to_delete: [{ staff_id: 71, dates: [state.date] }],
        };
        const breakDay = {
          schedules_to_set: [
            { staff_id: 71, dates: [state.date], slots: BREAK },
          ],
          schedules_to_delete: [],
        };
        assert.ok(
          digest(body) === digest(dayoff) || digest(body) === digest(breakDay),
          'Only the exact approved dayoff/break payload is permitted',
        );
        state.puts += 1;
        assert.equal(state.puts, 1, 'No compensation or repeat PUT');
        state.slots = structuredClone(
          state.divergent
            ? DIVERGENT
            : digest(body) === digest(dayoff)
              ? []
              : BREAK,
        );
        mark();
        return respond({});
      }
      unexpected.push('unsupported_provider_path:' + method + ':' + resource);
      throw new Error('Unsupported synthetic native transport request');
    });
    db = await bootFixtureContext();
    http = await bootHttp();
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        modelCalls += 1;
        throw new Error('Explicit schedule command must not call a model');
      });
  });

  afterAll(async () => {
    report.transport = transport;
    report.modelCalls = modelCalls;
    report.unexpected = unexpected;
    report.providerPuts = Object.fromEntries(
      Object.entries(provider).map(([id, state]) => [id, state.puts]),
    );
    try {
      writeFileSync(
        path.join(output, stage + '-observations.json'),
        JSON.stringify(report, null, 2) + '\n',
        { mode: 0o600 },
      );
    } finally {
      try {
        if (stage === 'resume' && db)
          for (const tenantId of own)
            await db.prisma.tenant.update({
              where: { id: tenantId },
              data: { status: 'cancelled' },
            });
      } finally {
        try {
          await http?.close();
        } finally {
          await db?.close();
          jest.restoreAllMocks();
          delete process.env.YCLIENTS_PARTNER_TOKEN;
        }
      }
    }
  });

  async function pgStarted() {
    const rows = await db.prisma.$queryRaw<
      Array<{ started: string }>
    >`SELECT pg_postmaster_start_time()::text AS started`;
    return rows[0].started;
  }
  function tomorrow(timeZone: string) {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const next = new Date(date + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  }
  function asActor<T>(salon: Salon, callback: () => T): T {
    return http.app.get(TenantContextService).runAsAuthPrincipal(
      {
        tenantId: salon.tenant.id,
        userId: salon.user.id,
        role: UserRole.MANAGER,
      },
      callback,
    );
  }
  const login = (salon: Salon) =>
    http.login(salon.tenant.slug, salon.user.email, salon.user.password);
  async function salon(company: number, divergent = false): Promise<Salon> {
    const fx = fixturesForHttp(db, http);
    const tenant = await fx.tenant(
      'Native schedule synthetic',
      CalendarSource.EXTERNAL,
    );
    const user = await fx.user(tenant, UserRole.MANAGER);
    own.add(tenant.id);
    for (const feature of [
      'crm.integration',
      'ai.consultant',
      'widgets.runtime',
      'booking',
      'ai.admin',
      'ai.owner',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: 'Pacific/Honolulu' },
    });
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic native schedule branch',
        timezone: BRANCH_TIMEZONE,
      },
    });
    const staff = await fx.staff(tenant, user, 'Антон Соколов');
    await db.prisma.staff.update({
      where: { id: staff.id },
      data: { branchId: branch.id },
    });
    await db.prisma.staffProviderLink.create({
      data: {
        tenantId: tenant.id,
        staffId: staff.id,
        provider: CrmProvider.YCLIENTS,
        externalId: '71',
      },
    });
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        encryptedApiToken: db.encryption.encrypt(SYNTHETIC_TOKEN),
        baseUrl: `http://127.0.0.1:9/synthetic/${tenant.id}`,
        status: 'active',
        settingsJson: {
          companyId: company,
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            branchId: branch.id,
            companyId: company,
          },
        },
      },
    });
    provider[tenant.id] = {
      company,
      slots: structuredClone(INITIAL),
      divergent,
      puts: 0,
      date: null,
    };
    return { tenant, user, staffId: staff.id, branchId: branch.id, company };
  }
  async function argumentsFor(approvalId: string, tenantId: string) {
    const approval = await db.prisma.aiApprovalRequest.findUniqueOrThrow({
      where: { id_tenantId: { id: approvalId, tenantId } },
    });
    const args = JSON.parse(
      db.encryption.decrypt(approval.encryptedArguments),
    ) as ApprovedArguments;
    assert.ok(
      typeof args.source_hash === 'string' &&
        /^[a-f0-9]{64}$/.test(args.source_hash),
    );
    assert.ok(
      typeof args.local_staff_id === 'string' &&
        typeof args.date === 'string' &&
        typeof args.current_revision === 'string',
    );
    assert.ok(
      Array.isArray(args.slots) &&
        args.slots.every(
          (slot) =>
            typeof slot.from === 'string' && typeof slot.to === 'string',
        ),
    );
    return { approval, args };
  }
  async function prepare(s: Salon, content: string) {
    const token = await login(s);
    const response = await request(http.app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({
        surface: 'web',
        audience: 'owner',
        requestId: randomUUID(),
        messages: [{ role: 'user', content }],
      });
    assert.equal(response.status, 201);
    const chat = response.body as Chat;
    assert.equal(chat.action, null);
    assert.ok(
      chat.resolution?.receipt?.widget_id,
      'Existing approval widget must be produced',
    );
    const page = await http.resolveWidgets(token, {
      thread_page: { limit: 20 },
    });
    assert.equal(page.status, 200);
    const envelope = (
      page.body as { widgets: Array<{ envelope: Envelope }> }
    ).widgets.find(
      (row) => row.envelope.widget_id === chat.resolution?.receipt?.widget_id,
    )?.envelope;
    assert.ok(envelope && envelope.kind === 'SETTINGS_DRAFT');
    const intent = envelope.intents.find((row) => row.effect === 'COMMIT');
    assert.ok(
      intent,
      'The full-scope existing profile must retain the real COMMIT',
    );
    const approvals = await db.prisma.aiApprovalRequest.findMany({
      where: {
        tenantId: s.tenant.id,
        requestedByUserId: s.user.id,
        toolName: 'staff.schedule.update',
      },
      take: 2,
    });
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].status, 'pending');
    const { args } = await argumentsFor(approvals[0].id, s.tenant.id);
    assert.equal(args.staff_id, '71');
    assert.equal(args.local_staff_id, s.staffId);
    assert.equal(args.date, tomorrow(BRANCH_TIMEZONE));
    assert.notEqual(
      args.date,
      tomorrow('Pacific/Honolulu'),
      'Relative day must use the bound branch timezone',
    );
    assert.equal(
      args.current_revision,
      staffScheduleSourceRevision(
        staffScheduleRevision('71', args.date, INITIAL),
        args.source_hash,
      ),
    );
    const current = await asActor(s, () =>
      http.app.get(CrmService).resolveStaffScheduleSource(s.tenant.id, '71'),
    );
    assert.equal(current.sourceHash, args.source_hash);
    assert.equal(provider[s.tenant.id].puts, 0);
    assert.equal(
      await db.prisma.actionExecution.count({
        where: { tenantId: s.tenant.id },
      }),
      0,
      'Preview is not action admission',
    );
    const submission: Submission = {
      contract: 'maya.widget.intent.submission/1',
      widget_id: envelope.widget_id,
      intent_token: intent.intent_token,
      inputs: null,
      client_nonce: randomUUID(),
      profile_id: 'pwa.default',
    };
    return { token, chat, submission, approvalId: approvals[0].id, args };
  }

  async function carrier(
    token: string,
    submission: Submission,
    chatResponse: Chat,
  ): Promise<CarrierObservation> {
    const baseUrl = await http.listenLoopback();
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.resolve('test/widgets-live/support/schedule-carrier-proof.mjs')],
        { stdio: ['pipe', 'pipe', 'pipe'], env: process.env },
      );
      let stdout = '',
        stderr = '',
        timedOut = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const terminate = () => {
        timedOut = true;
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 2000);
      };
      const timer = setTimeout(terminate, 45_000);
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
        if (stdout.length > 65_536) terminate();
      });
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > 65_536) terminate();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        if (code !== 0 || timedOut)
          return reject(
            new Error(
              `Carrier failed (${code}, timedOut=${timedOut}, diagnosticHash=${digest(stderr)})`,
            ),
          );
        try {
          resolve(JSON.parse(stdout) as CarrierObservation);
        } catch {
          reject(new Error('Carrier returned invalid JSON'));
        }
      });
      child.stdin.on('error', () => terminate());
      child.stdin.end(
        JSON.stringify({ baseUrl, token, submission, chatResponse }),
      );
    });
  }
  async function actionSnapshot(s: Salon): Promise<ExecutionSnapshot> {
    const rows = await db.prisma.actionExecution.findMany({
      where: { tenantId: s.tenant.id },
      take: 2,
    });
    assert.equal(rows.length, 1);
    const execution = rows[0];
    const kernel = http.app.get(ActionEngineKernel);
    const input = await kernel.readTrustedNormalizedInput(
      s.tenant.id,
      execution.id,
    );
    assert.equal(input.operation, 'update_staff_schedule_day');
    assert.ok(
      typeof input.sourceIdentityHash === 'string' &&
        typeof input.expectedProviderRevision === 'string',
    );
    const attempts = (await kernel.getAudit(s.tenant.id, execution.id))
      .attempts;
    return {
      id: execution.id,
      state: execution.state,
      normalizedInputHash: execution.normalizedInputHash,
      inputDigest: digest(input),
      sourceIdentityHash: input.sourceIdentityHash,
      expectedProviderRevision: input.expectedProviderRevision,
      evidenceDigest: digest(execution.evidenceRefsJson),
      executionAttempts: attempts.filter((row) => row.kind === 'EXECUTION')
        .length,
      reconciliationAttempts: attempts.filter(
        (row) => row.kind === 'RECONCILIATION',
      ).length,
    };
  }
  function sameOriginal(before: ExecutionSnapshot, after: ExecutionSnapshot) {
    for (const key of [
      'id',
      'normalizedInputHash',
      'inputDigest',
      'sourceIdentityHash',
      'expectedProviderRevision',
      'evidenceDigest',
      'executionAttempts',
    ] as const)
      assert.equal(
        after[key],
        before[key],
        'Original AE source/material and dispatch count must be retained: ' +
          key,
      );
    assert.equal(after.state, before.state);
  }
  async function receiptSnapshot(
    s: Salon,
    widgetId: string,
  ): Promise<ReceiptSnapshot> {
    const rows = await db.prisma.widgetIntentReceipt.findMany({
      where: { tenantId: s.tenant.id, widgetId },
    });
    assert.equal(rows.length, 1);
    const row = rows[0];
    return {
      id: row.id,
      outcome: row.outcome,
      actionReceiptRef: row.actionReceiptRef,
      submittedAt: row.submittedAt.toISOString(),
    };
  }
  async function changeCompany(s: Salon) {
    const company = s.company + 1000;
    await db.prisma.crmIntegration.update({
      where: { tenantId: s.tenant.id },
      data: {
        settingsJson: {
          companyId: company,
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            branchId: s.branchId,
            companyId: company,
          },
        },
      },
    });
    provider[s.tenant.id].company = company;
    const current = await asActor(s, () =>
      http.app.get(CrmService).resolveStaffScheduleSource(s.tenant.id, '71'),
    );
    return current.sourceHash;
  }
  async function noUnrelatedEffects(tenants: Salon[]) {
    const where = { tenantId: { in: tenants.map((s) => s.tenant.id) } };
    assert.equal(await db.prisma.appointment.count({ where }), 0);
    assert.equal(await db.prisma.marketingDeliveryAttempt.count({ where }), 0);
    assert.equal(await db.prisma.teamMessage.count({ where }), 0);
    assert.equal(modelCalls, 0);
    assert.deepEqual(unexpected, []);
  }
  async function resumeUnknown(
    s: Salon,
    approvalId: string,
    expected: ExecutionSnapshot,
  ) {
    const { approval, args } = await argumentsFor(approvalId, s.tenant.id);
    const command: Package5Wave3Command = {
      operation: 'update_staff_schedule_day',
      sourceIntentRef: approval.idempotencyKey,
      staffId: args.local_staff_id,
      localDate: args.date,
      expectedProviderRevision: args.current_revision,
      sourceIdentityHash: args.source_hash,
      slots: args.slots,
    };
    let errorCode: string | null = null;
    await asActor(s, async () => {
      const prepared = await http.app
        .get(Package5Wave3ShadowService)
        .build(s.tenant.id, { userId: s.user.id }, command, 'execute');
      assert.equal(
        prepared.existingExecution?.id,
        expected.id,
        'Resume must use the actual persisted action',
      );
      try {
        await http.app.get(Package5Wave3ExecutableService).resume(prepared);
      } catch (error) {
        assert.ok(error instanceof ActionExecutionUncertainError);
        errorCode = error.code;
      }
    });
    assert.ok(
      errorCode,
      'Divergent UNKNOWN must never be reported as successful',
    );
    const after = await actionSnapshot(s);
    sameOriginal(expected, after);
    assert.equal(provider[s.tenant.id].puts, 1);
    return { errorCode, after };
  }

  it(
    stage === 'prepare'
      ? 'previews, confirms once and retains actual native UNKNOWN'
      : 'resumes the original UNKNOWN after separate Node and PostgreSQL restart',
    async () => {
      if (stage === 'prepare') {
        const dayoff = await salon(99101);
        const off = await prepare(
          dayoff,
          'Сделай Антону Соколову выходной завтра',
        );
        assert.deepEqual(off.args.slots, []);
        const offOutcome = await carrier(off.token, off.submission, off.chat);
        assert.equal(offOutcome.status, 'settled');
        assert.equal(offOutcome.lines[0]?.outcome, 'CONFIRMED');
        assert.equal(offOutcome.lines[0]?.text, 'График обновлён.');
        assert.deepEqual(provider[dayoff.tenant.id].slots, []);
        assert.equal(provider[dayoff.tenant.id].puts, 1);
        const offSnapshot = await actionSnapshot(dayoff);
        assert.equal(offSnapshot.state, 'SUCCEEDED');
        assert.equal(offSnapshot.sourceIdentityHash, off.args.source_hash);
        const offReplay = await http.postIntent(off.token, {
          ...off.submission,
          client_nonce: randomUUID(),
        });
        assert.equal(offReplay.status, 200);
        assert.equal(provider[dayoff.tenant.id].puts, 1);

        const breakSalon = await salon(99102);
        const pause = await prepare(
          breakSalon,
          'Поставь Антону завтра перерыв с 14 до 15',
        );
        assert.deepEqual(pause.args.slots, BREAK);
        const breakOutcome = await carrier(
          pause.token,
          pause.submission,
          pause.chat,
        );
        assert.equal(breakOutcome.lines[0]?.outcome, 'CONFIRMED');
        assert.deepEqual(provider[breakSalon.tenant.id].slots, BREAK);
        assert.equal(provider[breakSalon.tenant.id].puts, 1);
        const breakSnapshot = await actionSnapshot(breakSalon);
        assert.equal(breakSnapshot.state, 'SUCCEEDED');
        assert.equal(breakSnapshot.sourceIdentityHash, pause.args.source_hash);
        const offReceipt = await receiptSnapshot(
          dayoff,
          off.submission.widget_id,
        );
        const breakReceipt = await receiptSnapshot(
          breakSalon,
          pause.submission.widget_id,
        );
        for (const confirmed of [offReceipt, breakReceipt]) {
          assert.equal(confirmed.outcome, 'CONFIRMED');
          assert.ok(confirmed.actionReceiptRef);
        }

        const drift = await salon(99103);
        const pending = await prepare(
          drift,
          'Сделай Антону Соколову выходной завтра',
        );
        const changedSource = await changeCompany(drift);
        assert.notEqual(changedSource, pending.args.source_hash);
        const driftReadStart = transport.length;
        const driftOutcome = await carrier(
          pending.token,
          pending.submission,
          pending.chat,
        );
        assert.equal(driftOutcome.lines[0]?.outcome, 'NOT_CONFIRMED');
        assert.equal(provider[drift.tenant.id].puts, 0);
        assert.deepEqual(provider[drift.tenant.id].slots, INITIAL);
        assert.equal(
          transport.length,
          driftReadStart,
          'Stale approval source is refused before provider I/O',
        );
        const driftProviderCalls = transport.length - driftReadStart;

        const unknownSalon = await salon(99104, true);
        const unknown = await prepare(
          unknownSalon,
          'Сделай Антону Соколову выходной завтра',
        );
        const unknownOutcome = await carrier(
          unknown.token,
          unknown.submission,
          unknown.chat,
        );
        assert.equal(unknownOutcome.lines[0]?.outcome, 'SUBMITTED');
        assert.equal(provider[unknownSalon.tenant.id].puts, 1);
        assert.deepEqual(provider[unknownSalon.tenant.id].slots, DIVERGENT);
        const snapshot = await actionSnapshot(unknownSalon);
        assert.equal(snapshot.state, 'UNKNOWN');
        assert.equal(snapshot.sourceIdentityHash, unknown.args.source_hash);
        assert.equal(
          snapshot.expectedProviderRevision,
          unknown.args.current_revision,
        );
        assert.equal(snapshot.executionAttempts, 1);
        const salons = [dayoff, breakSalon, drift, unknownSalon];
        await noUnrelatedEffects(salons);
        saved = {
          contract: 'synthetic-staff-schedule-source-proof/1',
          database: database.database,
          sourceHead,
          sourceBindingsDigest,
          pid: process.pid,
          pgStarted: await pgStarted(),
          salons,
          provider,
          confirmed: [
            {
              salon: dayoff,
              snapshot: offSnapshot,
              widgetId: off.submission.widget_id,
              receipt: offReceipt,
            },
            {
              salon: breakSalon,
              snapshot: breakSnapshot,
              widgetId: pause.submission.widget_id,
              receipt: breakReceipt,
            },
          ],
          unknown: {
            salon: unknownSalon,
            approvalId: unknown.approvalId,
            submission: unknown.submission,
            snapshot,
          },
        };
        // Synthetic credentials and sealed submissions stay outside the evidence directory.
        writeFileSync(receipt, JSON.stringify(saved), {
          mode: 0o600,
          flag: 'wx',
        });
        report.dayoff = {
          outcome: offOutcome.lines[0]?.outcome,
          action: offSnapshot,
          replayHttpStatus: offReplay.status,
        };
        report.break = {
          outcome: breakOutcome.lines[0]?.outcome,
          action: breakSnapshot,
        };
        report.preApprovalCompanyChange = {
          outcome: driftOutcome.lines[0]?.outcome,
          oldSource: pending.args.source_hash,
          newSource: changedSource,
          providerCalls: driftProviderCalls,
        };
        report.unknown = {
          outcome: unknownOutcome.lines[0]?.outcome,
          action: snapshot,
        };
        report.noPreApprovalPut = true;
        report.branchLocalDate = off.args.date;
        report.pid = process.pid;
        report.pgStarted = saved.pgStarted;
        return;
      }

      const started = await pgStarted();
      assert.notEqual(
        started,
        saved.pgStarted,
        'PostgreSQL must actually restart',
      );
      const confirmedRestart = [];
      for (const original of saved.confirmed) {
        const current = await actionSnapshot(original.salon);
        sameOriginal(original.snapshot, current);
        assert.equal(current.state, 'SUCCEEDED');
        const retainedReceipt = await receiptSnapshot(
          original.salon,
          original.widgetId,
        );
        assert.deepEqual(retainedReceipt, original.receipt);
        const confirmedToken = await login(original.salon);
        const confirmedPage = await http.resolveWidgets(confirmedToken, {
          thread_page: { limit: 20 },
        });
        assert.equal(confirmedPage.status, 200);
        assert.ok(
          JSON.stringify(confirmedPage.body).includes('График обновлён.'),
        );
        assert.equal(provider[original.salon.tenant.id].puts, 1);
        confirmedRestart.push({ action: current, receipt: retainedReceipt });
      }
      report.confirmedRestart = confirmedRestart;
      const s = saved.unknown.salon;
      const before = await actionSnapshot(s);
      sameOriginal(saved.unknown.snapshot, before);
      const token = await login(s);
      const replay = await http.postIntent(token, {
        ...saved.unknown.submission,
        client_nonce: randomUUID(),
      });
      assert.equal(replay.status, 200);
      assert.equal(provider[s.tenant.id].puts, 1);
      const page = await http.resolveWidgets(token, {
        thread_page: { limit: 20 },
      });
      assert.equal(page.status, 200);
      const receipts = await db.prisma.widgetIntentReceipt.findMany({
        where: {
          tenantId: s.tenant.id,
          widgetId: saved.unknown.submission.widget_id,
        },
      });
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].outcome, 'SUBMITTED');
      assert.equal(receipts[0].actionReceiptRef, null);
      const originalResume = await resumeUnknown(
        s,
        saved.unknown.approvalId,
        before,
      );
      const changedSource = await changeCompany(s);
      assert.notEqual(changedSource, before.sourceIdentityHash);
      const readsBeforeChangedResume = transport.length;
      const changedResume = await resumeUnknown(
        s,
        saved.unknown.approvalId,
        before,
      );
      assert.equal(
        transport.length,
        readsBeforeChangedResume,
        'Old UNKNOWN may not read the replacement source',
      );
      const input = await http.app
        .get(ActionEngineKernel)
        .readTrustedNormalizedInput(s.tenant.id, before.id);
      assert.ok(
        typeof input.desiredStateHash === 'string' &&
          typeof input.providerRequestIdentityHash === 'string',
      );
      const reconcile = await asActor(s, () =>
        http.app.get(Package5Wave3ProductionGatewayService).reconcileStaffDay({
          tenantId: s.tenant.id,
          provider: CrmProvider.YCLIENTS,
          staffId: s.staffId,
          branchId: s.branchId,
          externalStaffId: '71',
          localDate: provider[s.tenant.id].date!,
          desiredStateHash: input.desiredStateHash as string,
          expectedProviderRevision: before.expectedProviderRevision,
          requestIdentityHash: input.providerRequestIdentityHash as string,
          sourceIdentityHash: before.sourceIdentityHash,
        }),
      );
      assert.equal(reconcile, 'STILL_UNKNOWN');
      assert.equal(transport.length, readsBeforeChangedResume);
      await noUnrelatedEffects(saved.salons);
      report.processRestart = {
        preparePid: saved.pid,
        resumePid: process.pid,
        preparePgStarted: saved.pgStarted,
        resumePgStarted: started,
      };
      report.widgetReplay = {
        httpStatus: replay.status,
        retainedOutcome: receipts[0].outcome,
        providerPutsAfterRestart: transport.filter(
          (row) => row.method === 'PUT',
        ).length,
      };
      report.originalResume = originalResume;
      report.changedSourceResume = {
        ...changedResume,
        currentSourceHash: changedSource,
        directGatewayReconciliation: reconcile,
        providerCalls: transport.length - readsBeforeChangedResume,
      };
    },
  );
});
