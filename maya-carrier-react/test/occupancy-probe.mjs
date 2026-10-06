// Current carrier text path. In live mode every response comes from the owned
// loopback AppModule; in offline tests the transport boundary is explicitly synthetic.
// React ReplyText is the same component ChatScreen renders. This is SSR/text
// regression evidence, not a full browser mount, screenshot or usability claim.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createConversation, projectChat, projectConversationHistory, replyMarkup } from './.bundle.mjs';
import { findAll, parse, textOf } from './html.mjs';

export async function observeOccupancy({ requestId, exchange, mode = 'chat' }) {
  const exchanges = [];
  const perform = async (method, route, body) => {
    const response = await exchange(method, route, body);
    exchanges.push({ method, route, ...response });
    assert.ok([200, 201].includes(response.status), `carrier HTTP ${response.status}`);
    return response.body;
  };
  const conversation = createConversation({
    transport: {
      chat: async (body) => {
        const raw = await perform('POST', '/api/ai/chat', body);
        const value = projectChat(raw, body.requestId);
        assert.ok(value, 'production chat projector accepts response');
        assert.equal(value.resolution, null, 'no executable widget');
        assert.equal(value.action_status, null, 'no action authority');
        return { ok: true, value };
      },
      ...(mode === 'history' ? {
        conversation: async () => {
          const raw = await perform('GET', '/api/ai/conversation');
          const value = projectConversationHistory(raw);
          assert.ok(value, 'production history projector accepts response');
          return { ok: true, value };
        },
      } : {}),
    },
    session: { view: () => ({ signedIn: true, display: { userName: 'Synthetic owner', tenantName: 'Synthetic salon' } }), subscribe: () => () => {} },
    scheduler: { now: () => Date.now() },
    newAbort: () => new AbortController(),
    newRequestId: () => requestId,
  });
  try {
    if (mode === 'chat') assert.equal(conversation.submitUserTurn('Проверь окна после отмен', 'typed').accepted, true);
    await new Promise((resolve, reject) => {
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
    const items = conversation.view().items;
    assert.equal(items.some((item) => item.kind === 'widget'), false);
    const replies = items.filter((item) => item.kind === 'assistant').map((item) => item.text);
    const expected = mode === 'chat'
      ? [exchanges[0].body.reply]
      : exchanges[0].body.turns.filter((turn) => turn.role === 'assistant').map((turn) => turn.text);
    assert.ok(replies.length > 0, 'assistant response is visible');
    assert.deepEqual(replies, expected, 'runtime preserves exact server text');
    if (mode === 'chat') assert.equal(replies.length, 1, 'one coherent response');
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
