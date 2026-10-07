/** Executable mechanics proof, NOT actual HTTP/model/domain qualification.
 * No live switch, credential input, broker permit or inherited environment use. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { freezeCurrentCandidate } from './current-candidate.mjs';
import {
  CandidateBudgetGate,
  CANDIDATE_LIMITS,
} from './current-candidate-budget.mjs';
import { replayPilot } from './replay.mjs';

if (process.argv.length !== 3)
  throw new Error(
    'usage: node current-candidate-offline.mjs NEW_OUTPUT_DIRECTORY',
  );
const output = resolve(process.argv[2]);
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const candidate = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: backend,
  encoding: 'utf8',
}).trim();
const manifest = freezeCurrentCandidate(backend, candidate);
mkdirSync(output, { mode: 0o700 }); // existing output cannot reset an old batch
const write = (name, value) =>
  writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
write('manifest.json', manifest);
let clock = 0,
  calls = 0,
  blockedNetworkCalls = 0;
const oldFetch = globalThis.fetch;
globalThis.fetch = () => {
  blockedNetworkCalls++;
  throw new Error('offline_network_forbidden');
};
const gate = new CandidateBudgetGate({
  ledgerPath: resolve(output, 'ledger.jsonl'),
  manifestSha256: manifest.manifestSha256,
  candidateCommit: candidate,
  mode: 'OFFLINE_SYNTHETIC_ONLY',
  now: () => clock,
  wait: async (ms) => {
    clock += ms;
  },
  transport: async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    if (
      init.headers !== undefined ||
      /reviewChecks|forbiddenClaims|sourceProofFile|httpBinding/.test(init.body)
    )
      throw new Error('oracle_or_headers_in_model_request');
    const n = body.messages.filter((m) => m.role === 'user').length;
    for (const [i, m] of body.messages
      .filter((m) => m.role === 'assistant')
      .entries()) {
      if (m.content !== `OFFLINE_RESPONSE_${i + 1}`)
        throw new Error('history_substitution');
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: `OFFLINE_RESPONSE_${n}` } }],
      }),
    );
  },
});
const records = [];
try {
  const result = await replayPilot(manifest, {
    budget: gate,
    record: (row) =>
      records.push({
        caseId: row.caseId,
        turn: row.turn,
        outcome: row.outcome,
      }),
    openDialog: async ({ caseId }) => ({
      chat: async (body) => {
        const response = await gate.fetch(
          'https://api.deepseek.com/chat/completions',
          {
            method: 'POST',
            body: JSON.stringify({
              model: CANDIDATE_LIMITS.model,
              messages: body.messages,
              max_tokens: 2048,
              stream: false,
              thinking: { type: 'disabled' },
            }),
          },
        );
        const value = await response.json();
        return {
          reply: value.choices[0].message.content,
          userTurn: { conversationId: `offline-${caseId}` },
        };
      },
      close: async () => {},
    }),
  });
  write('report.json', {
    mode: 'OFFLINE_TRANSPORT_REPLAY_MECHANICS_ONLY',
    ...result,
    manifestSha256: manifest.manifestSha256,
    sourceCandidate: candidate,
    stats: gate.stats,
    injectedTransportCalls: calls,
    blockedNetworkCalls,
    actualPaidCalls: 0,
    actualHttpCalls: 0,
    actualCrmEffects: 0,
    httpFixtureBindings: 'NOT_IMPLEMENTED_FOR_THIS_MANIFEST',
    actualModelSerializer: 'NOT_EXERCISED',
    modelQuality: 'NOT_EVALUATED',
    records,
  });
  console.log(
    JSON.stringify({
      status: result.status,
      dialogs: 24,
      userTurns: manifest.userTurns,
      injectedTransportCalls: calls,
      actualPaidCalls: 0,
      actualHttpCalls: 0,
    }),
  );
} finally {
  try {
    gate.close();
  } finally {
    globalThis.fetch = oldFetch;
  }
}
