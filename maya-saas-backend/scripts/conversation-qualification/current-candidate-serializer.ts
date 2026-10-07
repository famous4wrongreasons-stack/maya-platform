/** Actual AiCoreModelService serializer/parser with canned output. No HTTP,
 * auth, domain sources, PII sanitizer or tool execution is claimed by this probe. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ConfigService } from '@nestjs/config';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiToolRegistryService } from '../../src/ai-tools/ai-tool-registry.service';
import { UserRole } from '../../src/common/domain.enums';
import type {
  AiCoreMessage,
  AiCoreModelInput,
} from '../../src/ai-tools/ai-core.types';
import { freezeCurrentCandidate } from './current-candidate.mjs';
import { CandidateBudgetGate } from './current-candidate-budget.mjs';

async function main() {
  if (process.argv.length !== 3)
    throw new Error('new_output_directory_required');
  const output = resolve(process.argv[2]);
  const backend = resolve(__dirname, '../..');
  const candidate = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: backend,
    encoding: 'utf8',
  }).trim();
  const manifest = freezeCurrentCandidate(backend, candidate);
  mkdirSync(output, { mode: 0o700 });
  const write = (name: string, value: unknown) =>
    writeFileSync(
      resolve(output, name),
      JSON.stringify(value, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  write('manifest.json', manifest);
  const config: Record<string, string> = {
    AI_CORE_PROVIDER: 'deepseek',
    DEEPSEEK_AI_CORE_MODEL: 'deepseek-v4-pro',
    DEEPSEEK_API_KEY: 'OFFLINE_PLACEHOLDER_NOT_A_CREDENTIAL',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    AI_CORE_MAX_OUTPUT_TOKENS: '2048',
  };
  // A closed getter prevents ConfigService from falling back to process secrets.
  const service = new AiCoreModelService({
    get: (key: string) => config[key],
  } as ConfigService);
  const registry = new AiToolRegistryService();
  const roles: Record<string, UserRole> = {
    owner: UserRole.TENANT_OWNER,
    admin: UserRole.ADMINISTRATOR,
    client: UserRole.CLIENT,
    employee: UserRole.EMPLOYEE,
  };
  let clock = 0,
    attemptedSerializerCalls = 0,
    transportCalls = 0,
    maxAdmittedBodyBytes = 0,
    maxAttemptedBodyBytes = 0;
  const observations: Array<Record<string, unknown>> = [];
  const gate = new CandidateBudgetGate({
    ledgerPath: resolve(output, 'ledger.jsonl'),
    manifestSha256: manifest.manifestSha256,
    candidateCommit: candidate,
    mode: 'OFFLINE_SYNTHETIC_ONLY',
    now: () => clock,
    wait: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    transport: (_url, init) => {
      transportCalls++;
      assert.equal(init?.headers, undefined);
      assert.equal(typeof init?.body, 'string');
      const raw = init!.body as string;
      maxAdmittedBodyBytes = Math.max(
        maxAdmittedBodyBytes,
        Buffer.byteLength(raw),
      );
      assert.doesNotMatch(
        raw,
        /OFFLINE_PLACEHOLDER_NOT_A_CREDENTIAL|sourceProofFile|httpBinding|forbiddenClaims|reviewChecks/,
      );
      const body = JSON.parse(raw) as { response_format?: unknown };
      // Canned output is intentionally unrelated to corpus expected decisions.
      // This proves serialization/parser mechanics only, not language quality.
      const content = body.response_format
        ? JSON.stringify({
            semantic_plan: {
              parent_request: 'Синтетическая проверка',
              language: 'ru',
              dialogue_act: 'request',
              tasks: [
                {
                  id: 'task_1',
                  intent: 'small_talk.greeting',
                  entities_json: '{}',
                  depends_on: [],
                  confidence: 1,
                  requires_clarification: true,
                  clarification_question: 'Уточните синтетический запрос.',
                },
              ],
              context: {
                carried_slots: [],
                replaced_slots: [],
                unresolved_references: [],
              },
            },
            tool_call: null,
          })
        : 'Синтетический ответ сериализатора.';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: 'deepseek-v4-pro',
            choices: [{ message: { content }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      );
    },
  });
  const oldFetch = globalThis.fetch;
  let currentCase: string | null = null;
  let currentStage: 'planner' | 'final' = 'planner';
  const requestSizes: Array<Record<string, unknown>> = [];
  let admissionFailure: Record<string, unknown> | null = null;
  globalThis.fetch = async (url, init) => {
    attemptedSerializerCalls++;
    const bytes =
      typeof init?.body === 'string' ? Buffer.byteLength(init.body) : null;
    maxAttemptedBodyBytes = Math.max(maxAttemptedBodyBytes, bytes ?? 0);
    requestSizes.push({ caseId: currentCase, stage: currentStage, bytes });
    try {
      return await gate.fetch(url, init);
    } catch (error) {
      const code =
        error instanceof Error &&
        [
          'candidate_body_limit',
          'candidate_input_token_limit',
          'candidate_output_token_limit',
          'candidate_attempt_limit',
          'candidate_spend_limit',
          'candidate_attempt_unresolved',
        ].includes(error.message)
          ? error.message
          : 'candidate_request_refused';
      admissionFailure = {
        caseId: currentCase,
        stage: currentStage,
        bytes,
        code,
      };
      throw error;
    }
  };
  let failure: string | null = null;
  try {
    for (const item of manifest.cases) {
      currentCase = item.id;
      gate.dialog();
      const role = roles[item.role];
      assert.ok(role);
      const tools = registry
        .list()
        .filter(
          (t) =>
            t.allowedRoles.includes(role) && t.allowedSurfaces.includes('web'),
        )
        .map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
          risk_tier: t.riskTier,
          approval_policy: t.approvalPolicy,
        }));
      const messages: AiCoreMessage[] = [];
      for (const text of item.userTurns) {
        gate.turn();
        try {
          messages.push({ role: 'user', content: text });
          const input: AiCoreModelInput = {
            surface: 'web',
            persona: role === UserRole.TENANT_OWNER ? 'director' : 'admin',
            principalRole: role,
            messages: structuredClone(messages),
            tools,
            toolResults: [],
            allowToolCall: true,
            requiredToolNames: [],
            nowUtc: item.fixture.clock,
            businessTimezone: 'Europe/Moscow',
          };
          currentStage = 'planner';
          const plan = await service.decide(input);
          assert.equal(plan?.reply, 'Уточните синтетический запрос.');
          assert.equal(plan?.toolCall, null);
          currentStage = 'final';
          const answer = await service.decide({
            ...input,
            allowToolCall: false,
          });
          assert.equal(answer?.reply, 'Синтетический ответ сериализатора.');
          messages.push({ role: 'assistant', content: answer.reply });
          observations.push({
            caseId: item.id,
            turn: messages.filter((m) => m.role === 'user').length,
            role,
            tools: tools.length,
            serializer: 'planner_and_final',
            status: 'CANNED_PARSER_PASS',
          });
        } finally {
          gate.endTurn();
        }
      }
    }
  } catch {
    // Raw model/provider exceptions never become evidence payloads.
    failure = 'SERIALIZER_PROBE_STOPPED_REMAINING_UNEXECUTED';
  } finally {
    try {
      gate.close();
    } finally {
      globalThis.fetch = oldFetch;
    }
  }
  const report = {
    mode: 'ACTUAL_MODEL_SERIALIZER_CANNED_TRANSPORT_ONLY',
    status: failure ?? 'PASS',
    candidate,
    manifestSha256: manifest.manifestSha256,
    attemptedSerializerCalls,
    transportCalls,
    maxAdmittedBodyBytes,
    maxAttemptedBodyBytes,
    requestSizes,
    admissionFailure,
    stats: gate.stats,
    observations,
    modelQuality: 'NOT_EVALUATED',
    actualPaidCalls: 0,
    actualHttpCalls: 0,
    actualCrmEffects: 0,
    authDomainPiiPipeline: 'NOT_EXERCISED',
    fixtureBindings: 'NOT_IMPLEMENTED_FOR_THIS_MANIFEST',
    registryScope:
      'CURRENT_ROLE_ALLOWED_WEB_DESCRIPTORS_ALL_FEATURES_ASSUMED_NO_TOOL_EXECUTION',
  };
  write('report.json', report);
  console.log(
    JSON.stringify({
      status: report.status,
      attemptedSerializerCalls,
      transportCalls,
      maxAdmittedBodyBytes,
      maxAttemptedBodyBytes,
      admissionFailure,
      observedTurns: observations.length,
      actualPaidCalls: 0,
    }),
  );
  if (failure) process.exitCode = 1;
}
void main();
