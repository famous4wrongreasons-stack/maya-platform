import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { ConversationIntelligenceService } from '../../src/conversation-intelligence/conversation-intelligence.service';
import { UserRole } from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import {
  bindCandidateSource,
  type CandidateSource,
} from './support/current-candidate-sources';
import type { Fixtures } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

const output = process.env.JEST_BOOKING_CONFIRMATION_OUTPUT!;
if (!output)
  throw new Error(
    'Use booking-confirmation-proof.mjs --exact-followup --browser-only',
  );
if (
  !/^maya_widget_gate_proof_bookingconfirmation_[a-f0-9]+$/.test(
    assertProofDatabase().database,
  )
)
  throw new Error('Fresh owned database required');
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('Exact17:00 current React → canonical create/reschedule/cancel [SCRIPTED SEMANTICS / SYNTHETIC INTERNAL CRM]', () => {
  let db: FixtureContext,
    http: HttpHarness,
    fx: Fixtures,
    source: CandidateSource;
  let modelDecisions = 0,
    externalCalls = 0,
    childClosed = false;
  const observations: Record<string, unknown> = {
    realModelCalls: 0,
    realProviderCalls: 0,
    businessFixtures: 'SAME_BIND_CANDIDATE_SOURCE_AS_CURRENT_REAL_MODEL_RUN',
    qualification: 'SYNTHETIC_LIFECYCLE_NOT_REAL_PROVIDER_ACCEPTANCE',
  };
  const checkpoints: Array<Record<string, unknown>> = [];
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      externalCalls++;
      throw new Error('No external/model fetch admitted');
    });
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation(() => {
        externalCalls++;
        throw new Error('External provider forbidden');
      });
    source = await bindCandidateSource(
      db,
      http,
      fx,
      {
        id: 'core-client-create-followup',
        role: 'client',
        group: 'booking',
        variant: 'ordinary',
        userTurns: [
          'Есть время к Артёму завтра на мужскую стрижку?',
          'Запиши меня на 17:00',
        ],
        fixture: { clock: 'ACTUAL_EXECUTION_CLOCK_BOUND_ONCE' },
      },
      new Map(),
    );
    await db.prisma.internalProvider.updateMany({
      where: { tenantId: source.tenant.id },
      data: { branchId: source.branchId },
    });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        modelDecisions++;
        if (modelDecisions > 8)
          throw new Error('Bounded scripted decisions exceeded');
        const prompt =
          input.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
        const own = prompt === 'Покажи мои записи',
          followup = prompt === 'Запиши меня на 17:00';
        const employee =
          /^Есть время к (\[name removed\]@[a-f0-9]{32}_\d+) завтра на мужскую стрижку\?$/.exec(
            prompt,
          )?.[1];
        expect(own || followup || Boolean(employee)).toBe(true);
        const semanticPlan = new ConversationIntelligenceService().validatePlan(
          {
            dialogue_act: 'request',
            tasks: [
              {
                intent: own
                  ? 'booking.list_own'
                  : followup
                    ? 'booking.create_own'
                    : 'booking.find_availability',
                entities: own
                  ? {}
                  : followup
                    ? { time: '17:00' }
                    : {
                        date_or_period: 'tomorrow',
                        employee,
                        services: ['мужская стрижка'],
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
          toolCall: input.toolResults.length
            ? null
            : {
                name: own
                  ? 'appointments.own.list'
                  : 'booking.availability.read',
                arguments: {},
              },
          provider: 'openai',
          model: 'SCRIPTED_EXACT_FOLLOWUP_ONLY',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
  });
  afterAll(async () => {
    observations.checkpoints = checkpoints;
    observations.modelDecisions = modelDecisions;
    observations.externalCalls = externalCalls;
    observations.browserChildClosed = childClosed;
    writeFileSync(
      path.join(output, 'booking-followup-observations.json'),
      JSON.stringify(observations, null, 2) + '\n',
      { mode: 0o600 },
    );
    jest.restoreAllMocks();
    await fx?.teardown();
    await http?.close();
    await db?.close();
  });
  it('clicks the selected17:00 slot, explicitly confirms once, then reviews and confirms own move/cancel', async () => {
    const client = await db.prisma.client.findFirstOrThrow({
      where: { tenantId: source.tenant.id, userId: source.user.id },
    });
    expect(
      await db.prisma.clientChannelLink.count({
        where: {
          tenantId: source.tenant.id,
          clientId: client.id,
          provider: 'maya_user',
          revokedAt: null,
        },
      }),
    ).toBe(1);
    const staff = await db.prisma.internalProvider.findFirstOrThrow({
      where: { tenantId: source.tenant.id, displayName: 'Артём' },
    });
    const service = await db.prisma.internalService.findFirstOrThrow({
      where: { tenantId: source.tenant.id, name: 'Мужская стрижка' },
    });
    observations.fixture = {
      verifiedClient: true,
      serviceName: service.name,
      staffName: staff.displayName,
      start: source.startsAt,
      branchBound: staff.branchId === source.branchId,
    };
    const stages = [
      'initial-slots',
      'selected-17',
      'create-preview',
      'create-commit',
      'own-before-reschedule',
      'reschedule-preview',
      'reschedule-commit',
      'own-before-cancel',
      'cancel-preview',
      'cancel-commit',
      'reload',
    ];
    let appointmentId: string | undefined, rescheduleStart: string | undefined;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/booking-followup-browser-probe.mjs',
          ),
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      let failure: Error | undefined,
        stderr = '',
        pending = Promise.resolve();
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error));
        child.kill('SIGTERM');
      };
      const timer = setTimeout(
        () => fail(new Error('Bounded booking followup UI timeout')),
        150000,
      );
      child.stderr!.on('data', (bytes: Buffer) => {
        stderr = (stderr + bytes.toString()).slice(-3000);
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const message = raw as {
              type: string;
              name: string;
              selectedStart: string | null;
              receiptOutcome: string | null;
            };
            if (message.type === 'ready') {
              child.send({
                type: 'start',
                backendOrigin: await http.listenLoopback(),
                output,
                email: source.user.email,
                start: source.startsAt,
              });
              return;
            }
            expect(message.type).toBe('checkpoint');
            expect(message.name).toBe(stages[checkpoints.length]);
            const index = stages.indexOf(message.name),
              where = { tenantId: source.tenant.id };
            const appointments = await db.prisma.appointment.findMany({
              where,
            });
            const executions = await db.prisma.actionExecution.findMany({
              where,
              orderBy: { createdAt: 'asc' },
            });
            const expectedExecutions =
              index < 3 ? 0 : index < 6 ? 1 : index < 9 ? 2 : 3;
            expect(executions).toHaveLength(expectedExecutions);
            expect(appointments).toHaveLength(index < 3 ? 0 : 1);
            for (const execution of executions)
              expect(execution).toMatchObject({
                state: 'SUCCEEDED',
                executionAttemptCount: 1,
              });
            if (index >= 3) {
              const row = appointments[0];
              appointmentId ??= row.id;
              expect(row.id).toBe(appointmentId);
              expect(row.mayaClientId).toBe(client.id);
              expect(row.staffExternalId).toBe(staff.id);
              expect(row.serviceIds).toEqual([service.id]);
              expect(row.startAt.toISOString()).toBe(
                new Date(
                  index < 6 ? source.startsAt : rescheduleStart!,
                ).toISOString(),
              );
              expect(row.status).toBe(index < 9 ? 'confirmed' : 'canceled');
            }
            if (message.name === 'reschedule-preview') {
              expect(message.selectedStart).not.toBeNull();
              rescheduleStart = message.selectedStart!;
              expect(Date.parse(rescheduleStart)).not.toBe(
                Date.parse(source.startsAt),
              );
            }
            if (message.name.endsWith('-commit'))
              expect(message.receiptOutcome).toBe('ACCEPTED');
            expect(executions.map((e) => e.capability)).toEqual(
              [
                'crm.appointment.create.v1',
                'crm.appointment.reschedule.v1',
                'crm.appointment.cancel.v1',
              ].slice(0, expectedExecutions),
            );
            expect(externalCalls).toBe(0);
            checkpoints.push({
              name: message.name,
              receiptOutcome: message.receiptOutcome,
              appointment: appointments[0]
                ? {
                    idHash: hash(appointments[0].id),
                    clientHash: hash(appointments[0].mayaClientId!),
                    status: appointments[0].status,
                    start: appointments[0].startAt.toISOString(),
                    serviceHash: hash(service.id),
                    staffHash: hash(staff.id),
                  }
                : null,
              executions: executions.map((e) => ({
                idHash: hash(e.id),
                capability: e.capability,
                state: e.state,
                attempts: e.executionAttemptCount,
              })),
            });
            child.send({ type: 'continue:' + message.name });
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        childClosed = true;
        void pending.then(() =>
          failure
            ? reject(failure)
            : code === 0
              ? resolve()
              : reject(new Error(`Browser ${code}: ${stderr}`)),
        );
      });
    });
    expect(checkpoints).toHaveLength(11);
    expect(modelDecisions).toBeGreaterThanOrEqual(4);
    expect(externalCalls).toBe(0);
  }, 180000);
});
