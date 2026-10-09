import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { serveCandidateBroker } from './candidate-broker-server.mjs';

// Synthetic lifecycle mechanics only: actual loopback sockets, no model,
// credentials, permits, filesystem, PostgreSQL or external network transport.
const signals = ['SIGTERM', 'SIGINT', 'disconnect'];
const listeners = () => signals.map((name) => process.listeners(name));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture(overrides = {}) {
  const report = {
    mode: 'SYNTHETIC_LIFECYCLE_ONLY',
    paidAuthorized: false,
    upstreamCalls: 0,
    requests: [],
    rejections: [],
  };
  const gate = {
    dialog() {},
    turn() {},
    endTurn() {},
    close() {},
    fetch: async () => new Response('{}', { status: 200 }),
  };
  const broker = serveCandidateBroker({
    report,
    save() {},
    expiresAt: Date.now() + 5000,
    limits: { timeoutMs: 1000, requestBytes: 1024 },
    bind: () => ({
      gate,
      manifest: {
        bindingManifestSha256: 'synthetic-binding',
        selectedCaseIds: ['synthetic-case'],
        cases: [{ id: 'synthetic-case', userTurns: ['synthetic turn'] }],
      },
    }),
    reserve() {},
    ...overrides,
  });
  return { broker, report, gate };
}
function request(port, pathname, method = 'GET') {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        agent: false,
        headers: {
          'x-candidate-manifest': 'synthetic-binding',
          'x-candidate-case': 'synthetic-case',
          'x-candidate-turn': '1',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString(),
          }),
        );
        res.on('error', (error) => resolve({ error: error.code }));
      },
    );
    req.on('error', (error) => resolve({ error: error.code }));
    req.end(method === 'POST' ? '{}' : undefined);
  });
}

test(
  'concurrent stop callers join request drain and gate closure; owned listeners remain until full stop',
  { timeout: 5000 },
  async () => {
    const before = listeners();
    const entered = deferred(),
      aborted = deferred(),
      releaseRequest = deferred();
    const closing = deferred(),
      releaseGate = deferred();
    const { broker, report, gate } = fixture();
    let closes = 0;
    gate.fetch = async (_url, { signal }) => {
      signal.addEventListener('abort', () => aborted.resolve(), { once: true });
      entered.resolve();
      await releaseRequest.promise;
      signal.throwIfAborted();
      throw new Error('synthetic_request_not_aborted');
    };
    gate.close = async () => {
      closes += 1;
      closing.resolve();
      await releaseGate.promise;
    };
    try {
      const { port } = await broker.ready;
      const response = request(port, '/chat/completions', 'POST');
      await entered.promise;
      const first = broker.stop('first_stop');
      const second = broker.stop('second_stop');
      assert.equal(first, second);
      assert.equal(first, broker.closed);
      let finished = false;
      void first.then(() => {
        finished = true;
      });
      await aborted.promise;
      assert.equal(finished, false);
      assert.equal(report.stopped, undefined);
      assert.equal(report.stopReason, 'first_stop');
      assert.equal(report.requestsAtStop, 1);
      listeners().forEach((current, index) => {
        assert.equal(current.length, before[index].length + 1);
        assert.ok(before[index].every((handler) => current.includes(handler)));
      });
      releaseRequest.resolve();
      await closing.promise;
      assert.equal(finished, false);
      releaseGate.resolve();
      await first;
      await response;
      assert.equal(closes, 1);
      assert.equal(report.stopped, true);
      assert.equal(broker.stop('after_close'), first);
      assert.deepEqual(listeners(), before);
    } finally {
      releaseRequest.resolve();
      releaseGate.resolve();
      await broker.stop('test_cleanup');
    }
  },
);

test(
  'two sequential brokers report readiness and close without accumulating process listeners',
  { timeout: 5000 },
  async () => {
    const sentinel = () => {};
    for (const name of signals) process.on(name, sentinel);
    const before = listeners();
    try {
      for (let index = 0; index < 2; index += 1) {
        const { broker, report } = fixture();
        try {
          const address = await broker.ready;
          assert.equal(address.mode, report.mode);
          assert.ok(Number.isInteger(address.port));
          assert.equal((await request(address.port, '/status')).status, 200);
        } finally {
          await broker.stop('sequential_done');
        }
        await broker.closed;
        assert.deepEqual(listeners(), before);
      }
    } finally {
      for (const name of signals) process.off(name, sentinel);
    }
  },
);

test(
  'onListen failure rejects ready and drains before closed; onReady is withheld',
  { timeout: 5000 },
  async () => {
    const before = listeners();
    let announced = false;
    const { broker, report } = fixture({
      onListen() {
        throw new Error('synthetic_binding_failure');
      },
      onReady() {
        announced = true;
      },
    });
    try {
      await assert.rejects(broker.ready, /dry_broker_listen_binding_refused/);
      await broker.closed;
      assert.equal(announced, false);
      assert.equal(report.stopReason, 'listen_binding_refused');
      assert.equal(report.stopped, true);
      assert.deepEqual(listeners(), before);
    } finally {
      await broker.stop('test_cleanup');
    }
  },
);

test(
  'stop before the listen callback joins pending startup and never announces ready',
  { timeout: 5000 },
  async () => {
    const before = listeners();
    let announced = false;
    const { broker, report } = fixture({
      onReady() {
        announced = true;
      },
    });
    const stopping = broker.stop('immediate_stop');
    await assert.rejects(broker.ready, /dry_broker_stopped_before_ready/);
    await stopping;
    assert.equal(announced, false);
    assert.equal(report.stopped, true);
    assert.deepEqual(listeners(), before);
  },
);

test(
  'synchronous listen failure settles both lifecycle promises and removes only owned listeners',
  { timeout: 5000 },
  async () => {
    const before = listeners();
    const { broker, report } = fixture({
      listenTarget: { host: '127.0.0.1', port: -1 },
    });
    await assert.rejects(broker.ready, /dry_broker_listen_failed/);
    await broker.closed;
    assert.equal(report.stopReason, 'listen_failed');
    assert.equal(report.stopped, true);
    assert.deepEqual(listeners(), before);
  },
);

test(
  'validated frozen case/turn context reaches offline reservation before dispatch',
  { timeout: 5000 },
  async () => {
    let context;
    const { broker, gate } = fixture({
      reserve(_url, _init, scope) {
        context = scope;
      },
    });
    gate.fetch = async () => {
      assert.deepEqual(context, { caseId: 'synthetic-case', turn: 1 });
      assert.equal(Object.isFrozen(context), true);
      return new Response('{}', { status: 200 });
    };
    try {
      const { port } = await broker.ready;
      assert.equal(
        (await request(port, '/chat/completions', 'POST')).status,
        200,
      );
    } finally {
      await broker.stop('synthetic-context-test');
    }
  },
);
