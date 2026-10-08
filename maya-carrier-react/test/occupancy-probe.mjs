// Current carrier text path. In live mode every response comes from the owned
// loopback AppModule; in offline tests the transport boundary is explicitly synthetic.
// React ReplyText is the same component ChatScreen renders. This is SSR/text
// regression evidence, not a full browser mount, screenshot or usability claim.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createConversation, projectChat, projectConversationHistory, replyMarkup } from './.bundle.mjs';
import { findAll, parse, textOf } from './html.mjs';

export const COMPOUND_PROMPTS = Object.freeze({
  compound: 'Дай общий обзор бизнеса, проверь окна после отмен и предложи следующий шаг',
  compound_scoped: 'Дай общий обзор бизнеса за сегодня, проверь окна после отмен и предложи следующий шаг',
  compound_continue: 'Да, такой ограниченный обзор',
});

export async function observeOccupancy({ requestId, exchange, mode = 'chat' }) {
  assert.ok(['chat', 'history', ...Object.keys(COMPOUND_PROMPTS)].includes(mode), 'finite carrier mode required');
  const restore = mode === 'history' || mode === 'compound_continue';
  const exchanges = [];
  let transportError = null;
  const diagnose = async (work) => {
    try { return await work(); }
    catch (error) { transportError = error; throw error; }
  };
  const perform = async (method, route, body) => {
    const response = await exchange(method, route, body);
    exchanges.push({ method, route, ...response });
    assert.ok([200, 201].includes(response.status), `carrier HTTP ${response.status}: ${JSON.stringify(response.body, (key, value) => /token|password|authorization/i.test(key) ? '[redacted]' : value)}`);
    return response.body;
  };
  const conversation = createConversation({
    transport: {
      chat: (body) => diagnose(async () => {
        const raw = await perform('POST', '/api/ai/chat', body);
        const value = projectChat(raw, body.requestId);
        assert.ok(value, 'production chat projector accepts response');
        assert.equal(value.resolution, null, 'no executable widget');
        assert.equal(value.action_status, null, 'no action authority');
        return { ok: true, value };
      }),
      ...(restore ? {
        conversation: () => diagnose(async () => {
          const raw = await perform('GET', '/api/ai/conversation');
          const value = projectConversationHistory(raw);
          assert.ok(value, 'production history projector accepts response');
          return { ok: true, value };
        }),
      } : {}),
    },
    session: { view: () => ({ signedIn: true, display: { userName: 'Synthetic owner', tenantName: 'Synthetic salon' } }), subscribe: () => () => {} },
    scheduler: { now: () => Date.now() },
    newAbort: () => new AbortController(),
    newRequestId: () => requestId,
  });
  try {
    const settled = () => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { off(); reject(new Error('carrier did not settle')); }, 15_000);
      const settled = () => {
        if (conversation.view().inFlight) return;
        clearTimeout(timeout);
        off();
        resolve();
      };
      const off = conversation.subscribe(settled);
      settled();
    });
    if (restore) await settled();
    if (transportError) throw transportError;
    if (mode !== 'history') {
      assert.equal(conversation.submitUserTurn(mode === 'chat' ? 'Проверь окна после отмен' : COMPOUND_PROMPTS[mode], 'typed').accepted, true);
      await settled();
    }
    if (transportError) throw transportError;
    const items = conversation.view().items;
    assert.equal(items.some((item) => item.kind === 'widget'), false);
    const replies = items.filter((item) => item.kind === 'assistant').map((item) => item.text);
    const historical = restore ? exchanges[0].body.turns.filter((turn) => turn.role === 'assistant').map((turn) => turn.text) : [];
    const expected = mode === 'history' ? historical : [...historical, exchanges.at(-1).body.reply];
    assert.ok(replies.length > 0, 'assistant response is visible');
    assert.deepEqual(replies, expected, 'runtime preserves exact server text');
    if (mode !== 'history') assert.equal(replies.length - historical.length, 1, 'one coherent new response');
    for (const reply of replies) {
      const root = parse(replyMarkup(reply));
      assert.equal(textOf(root), reply, 'current React ReplyText preserves visible text');
      assert.equal(findAll(root, (el) => ['button', 'a', 'form'].includes(el.tag)).length, 0, 'text grants no execution control');
    }
    return { contract: 'maya.explicit-occupancy-carrier-proof/1', mode, replies, exchanges, projection: 'current-shell', rendering: 'current-react-ReplyText-SSR', browserAcceptance: false };
  } finally { conversation.dispose(); }
}

export function assertOwnedLoopback(baseUrl) {
  const url = new URL(baseUrl);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && url.port !== '5432');
  assert.equal(url.username + url.password + url.search + url.hash, '');
  assert.equal(url.pathname, '/');
  return url.origin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let raw = '';
  for await (const part of process.stdin) raw += part;
  const input = JSON.parse(raw);
  const origin = assertOwnedLoopback(input.baseUrl);
  const result = await observeOccupancy({
    requestId: input.requestId, mode: input.mode,
    exchange: async (method, route, body) => {
      const response = await fetch(origin + route, {
        method, redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
  });
  // The access token arrived via stdin and is never part of this output.
  process.stdout.write(JSON.stringify(result));
}
