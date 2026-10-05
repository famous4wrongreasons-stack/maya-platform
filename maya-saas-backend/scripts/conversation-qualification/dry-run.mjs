import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freezePilot, replayPilot } from './replay.mjs';
import { PilotBudgetGate } from './budget-gate.mjs';

// Offline only. This executable has no live-model mode, no HTTP adapter and no credential input.
// The output directory must be explicitly supplied; exclusive files prevent replacing evidence.
const directory = process.argv[2];
if (!directory || process.argv.length !== 3)
  throw new Error('usage: node dry-run.mjs EXISTING_OUTPUT_DIRECTORY');
const output = resolve(directory);
const source = readFileSync(
  new URL(
    '../../datasets/conversation-intelligence/multi-turn.jsonl',
    import.meta.url,
  ),
  'utf8',
);
const manifest = freezePilot(source, 12, ['client']);
writeFileSync(
  resolve(output, 'pilot-manifest.json'),
  JSON.stringify(manifest, null, 2),
  { flag: 'wx', mode: 0o600 },
);
const gate = new PilotBudgetGate({
  ledgerPath: resolve(output, 'budget-ledger.jsonl'),
  approved: false,
  transport: () => {
    throw new Error('offline_transport_must_never_run');
  },
});
let turnCount = 0,
  opened = 0,
  closed = 0;
const observed = [];
try {
  const result = await replayPilot(manifest, {
    budget: gate,
    openDialog: async ({ caseId }) => {
      opened++;
      let count = 0;
      return {
        chat: async (body) => {
          // Confirm that each previous assistant entry is exactly the adapter's actual result.
          const replies = body.messages.filter((m) => m.role === 'assistant');
          if (
            replies.some(
              (m, i) => m.content !== `OFFLINE_ADAPTER_RESPONSE_${i + 1}`,
            )
          )
            throw new Error('history_not_from_actual_responses');
          count++;
          turnCount++;
          return {
            reply: `OFFLINE_ADAPTER_RESPONSE_${count}`,
            userTurn: { conversationId: `offline-${caseId}` },
          };
        },
        close: async () => {
          closed++;
        },
      };
    },
    record: ({ caseId, turn, outcome }) =>
      observed.push({ caseId, turn, outcome }),
  });
  const report = {
    mode: 'offline_replay_mechanics_only',
    ...result,
    manifestSha256: manifest.manifestSha256,
    independentFamilies: manifest.independentFamilies,
    opened,
    closed,
    userTurns: turnCount,
    providerRequests: gate.requests,
    reservedNanoUsd: gate.reservedNanoUsd,
    httpRequests: 0,
    realCrmEffects: 0,
    acceptance: 'NOT_RUN',
    records: observed,
  };
  writeFileSync(
    resolve(output, 'dry-run-report.json'),
    JSON.stringify(report, null, 2),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      mode: report.mode,
      dialogs: opened,
      independentFamilies: manifest.independentFamilies,
      turns: turnCount,
      providerRequests: gate.requests,
      acceptance: report.acceptance,
      manifestSha256: manifest.manifestSha256,
    }),
  );
} finally {
  gate.close();
}
