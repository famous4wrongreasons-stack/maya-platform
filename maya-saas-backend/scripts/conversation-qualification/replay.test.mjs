import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freezePilot, replayPilot } from './replay.mjs';

const source = readFileSync(
  new URL(
    '../../datasets/conversation-intelligence/multi-turn.jsonl',
    import.meta.url,
  ),
  'utf8',
);
const budget = () => ({ dialog() {}, turn() {}, endTurn() {} });
test('freezes reproducible balanced dev selection, identifies correlated families, and keeps test holdout untouched', () => {
  const manifest = freezePilot(source);
  assert.deepEqual(manifest, freezePilot(source));
  assert.equal(manifest.dialogs, 50);
  assert.ok(manifest.userTurns <= 200);
  assert.ok(manifest.independentFamilies < manifest.dialogs);
  assert.equal(new Set(manifest.cases.map((c) => c.group)).size, 7);
  const heldout = new Set(
    source
      .trim()
      .split('\n')
      .map(JSON.parse)
      .filter((r) => r.split === 'test')
      .map((r) => r.family_id),
  );
  assert.ok(manifest.cases.every((c) => !heldout.has(c.familyId)));
  const rows = source.trim().split('\n').map(JSON.parse);
  rows.push({ ...rows[0], id: 'leaking-family', split: 'test' });
  assert.throws(
    () => freezePilot(rows.map(JSON.stringify).join('\n')),
    /family_split_leakage/,
  );
});
test('replays only real assistant responses with canonical body, no labels or gold responses', async () => {
  const manifest = freezePilot(source, 1),
    calls = [],
    records = [];
  let closed = 0;
  const result = await replayPilot(manifest, {
    budget: budget(),
    record: (row) => records.push(row),
    openDialog: async (actor) => {
      assert.deepEqual(Object.keys(actor).sort(), ['caseId', 'role']);
      return {
        close: async () => {
          closed++;
        },
        chat: async (body) => {
          calls.push(body);
          return {
            reply: `ACTUAL_RESPONSE_${calls.length}`,
            userTurn: { conversationId: 'isolated-conversation' },
          };
        },
      };
    },
  });
  assert.ok(calls.length >= 2);
  assert.deepEqual(calls[1].messages[1], {
    role: 'assistant',
    content: 'ACTUAL_RESPONSE_1',
  });
  assert.equal(calls[1].conversationId, 'isolated-conversation');
  assert.deepEqual(Object.keys(calls[0]).sort(), [
    'messages',
    'requestId',
    'surface',
  ]);
  assert.equal(result.qualification, 'not_evaluated');
  assert.equal(result.status, 'replayed_ungraded');
  assert.equal(records.length, calls.length);
  assert.equal(closed, 1);
});
test('unknown result stops without retry, closes fixture and does not serialize exception secrets', async () => {
  let calls = 0,
    closes = 0,
    ends = 0;
  const records = [];
  const result = await replayPilot(freezePilot(source, 2), {
    budget: {
      ...budget(),
      endTurn: () => {
        ends++;
      },
    },
    record: (r) => records.push(r),
    openDialog: async () => ({
      close: async () => {
        closes++;
      },
      chat: async () => {
        calls++;
        throw new Error('PRIVATE_PROVIDER_SECRET');
      },
    }),
  });
  assert.equal(calls, 1);
  assert.equal(closes, 1);
  assert.equal(ends, 1);
  assert.equal(result.status, 'stopped');
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE_PROVIDER_SECRET/);
});
test('tampered manifest refuses before opening fixture', async () => {
  const manifest = freezePilot(source, 1);
  manifest.cases[0].userTurns[0] = 'tampered';
  await assert.rejects(
    replayPilot(manifest, { openDialog: () => assert.fail('must not open') }),
    /manifest_hash_mismatch/,
  );
});

test('missing or changed conversation correlation stops before any follow-up or retry', async () => {
  for (const missingAt of [1, 2]) {
    for (const invalidId of [undefined, '', '   ', 'foreign-conversation']) {
      if (missingAt === 1 && invalidId === 'foreign-conversation') continue;
      let calls = 0,
        closed = 0;
      const records = [];
      const result = await replayPilot(freezePilot(source, 2), {
        budget: budget(),
        record: (row) => records.push(row),
        openDialog: async () => ({
          close: async () => {
            closed++;
          },
          chat: async () => {
            calls++;
            return {
              reply: 'Actual reply',
              userTurn: {
                conversationId:
                  calls === missingAt ? invalidId : 'own-conversation',
              },
            };
          },
        }),
      });
      assert.equal(result.status, 'stopped');
      assert.equal(calls, missingAt);
      assert.equal(closed, 1);
      assert.equal(records.at(-1).outcome, 'unresolved');
      assert.equal(records.at(-1).reply, undefined);
    }
  }
});

test('retains the current 3500-character reply in actual history and refuses an oversized response', async () => {
  for (const length of [3500, 3501]) {
    const calls = [],
      records = [];
    const result = await replayPilot(freezePilot(source, 1), {
      budget: budget(),
      record: (row) => records.push(row),
      openDialog: async () => ({
        close: async () => {},
        chat: async (body) => {
          calls.push(body);
          return {
            reply: 'я'.repeat(length),
            userTurn: { conversationId: 'own-conversation' },
          };
        },
      }),
    });
    if (length === 3500) {
      assert.equal(result.status, 'replayed_ungraded');
      assert.deepEqual(calls[1].messages[1], {
        role: 'assistant',
        content: 'я'.repeat(length),
      });
      assert.equal(records[0].reply.length, length);
    } else {
      assert.equal(result.status, 'stopped');
      assert.equal(calls.length, 1);
      assert.equal(records[0].outcome, 'unresolved');
    }
  }
});

test('client-first slice covers only booking groups and keeps independent families visible', () => {
  const manifest = freezePilot(source, 12, ['client']);
  assert.ok(manifest.cases.every((c) => c.role === 'client'));
  assert.equal(manifest.independentFamilies, 7);
  assert.equal(manifest.userTurns, 36);
  assert.deepEqual([...new Set(manifest.cases.map((c) => c.group))].sort(), [
    'booking_carry_over',
    'cancel_pending_action',
    'high_risk_confirmation',
  ]);
});
