// Shared finite loopback broker server. Transport, permit admission and source
// binding belong to the explicit profile; this kernel owns scope, TTL and cleanup.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
export function serveCandidateBroker({
  report,
  save,
  expiresAt,
  limits,
  bind,
  reserve,
  onReady,
  onResponse,
  statusExtra,
  allowFinish = false,
  listenTarget,
  onListen,
}) {
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  let gate,
    manifest,
    busy = false,
    stopped = false,
    blocked = false,
    caseIndex = -1,
    turn = 0;
  const controllers = new Set(),
    inflight = new Set(),
    sockets = new Set();
  async function handle(req, res) {
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          mode: report.mode,
          paidAuthorized: report.paidAuthorized,
          upstreamCalls: report.upstreamCalls,
          blocked,
          ...statusExtra?.(),
        }),
      );
      return;
    }
    if (allowFinish && req.method === 'POST' && req.url === '/finish') {
      if (!gate) ({ gate, manifest } = bind());
      assert.equal(
        req.headers['x-candidate-manifest'],
        manifest.bindingManifestSha256,
        'dry_broker_request_binding',
      );
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ stopping: true }));
      setImmediate(() => {
        void stop('explicit_finish');
      });
      return;
    }
    const owns = !busy;
    if (owns) busy = true;
    const controller = new AbortController();
    controllers.add(controller);
    const disconnected = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once('close', disconnected);
    try {
      assert.ok(
        owns && !blocked && !stopped && Date.now() < expiresAt,
        'dry_broker_closed_or_busy',
      );
      assert.ok(
        req.method === 'POST' && req.url === '/chat/completions',
        'dry_broker_route',
      );
      assert.ok(!req.headers.authorization, 'dry_broker_credentials_refused');
      if (!gate) ({ gate, manifest } = bind());
      assert.equal(
        req.headers['x-candidate-manifest'],
        manifest.bindingManifestSha256,
        'dry_broker_request_binding',
      );
      const id = req.headers['x-candidate-case'];
      const nextIndex = manifest.selectedCaseIds.indexOf(id);
      const nextTurn = Number(req.headers['x-candidate-turn']);
      const row = manifest.cases.find((c) => c.id === id);
      assert.ok(
        nextIndex >= 0 &&
          nextIndex >= caseIndex &&
          Number.isSafeInteger(nextTurn) &&
          nextTurn > 0 &&
          nextTurn <= row.userTurns.length,
        'dry_broker_turn_scope',
      );
      assert.ok(
        nextIndex !== caseIndex || nextTurn >= turn,
        'dry_broker_rewind_refused',
      );
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) {
        controller.signal.throwIfAborted();
        bytes += chunk.length;
        assert.ok(bytes <= limits.requestBytes, 'dry_broker_body_limit');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      reserve('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        body,
      });
      if (caseIndex !== nextIndex || turn !== nextTurn) {
        if (caseIndex >= 0) gate.endTurn();
        if (caseIndex !== nextIndex) gate.dialog();
        gate.turn();
        caseIndex = nextIndex;
        turn = nextTurn;
      }
      const response = await gate.fetch(
        'https://api.deepseek.com/chat/completions',
        { method: 'POST', body, signal: controller.signal },
      );
      report.requests.push({
        caseId: id,
        turn,
        bytes,
        bodySha256: hash(body),
        status: response.status,
      });
      save();
      const text = await response.text();
      await onResponse?.({ caseId: id, turn, status: response.status, text });
      res.writeHead(response.status, { 'content-type': 'application/json' });
      res.end(text);
    } catch (error) {
      blocked = true;
      const code =
        error instanceof Error &&
        /^(dry_broker|core_broker|candidate|core_admission)_[a-z_]+$/.test(
          error.message,
        )
          ? error.message
          : 'dry_broker_prerequisite_refused';
      report.rejections.push({ code });
      save();
      if (!res.destroyed) {
        if (!res.headersSent)
          res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code } }));
      }
    } finally {
      res.off('close', disconnected);
      controllers.delete(controller);
      if (owns) busy = false;
    }
  }
  const server = http.createServer((req, res) => {
    if (stopped) {
      req.destroy();
      res.destroy();
      return;
    }
    const work = handle(req, res).catch(() => {
      void stop('handler_error');
    });
    inflight.add(work);
    void work.finally(() => inflight.delete(work));
  });
  server.on('connection', (socket) => {
    if (stopped) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.requestTimeout = limits.timeoutMs;
  server.headersTimeout = limits.timeoutMs;
  const deadline = setTimeout(
    () => {
      void stop('ttl');
    },
    Math.max(0, expiresAt - Date.now()),
  );
  async function stop(reason) {
    if (stopped) return;
    stopped = true;
    blocked = true;
    clearTimeout(deadline);
    report.stopReason = reason;
    report.connectionsAtStop = sockets.size;
    report.requestsAtStop = inflight.size;
    // Cut every socket now, including partial bodies/headers and keepalive. Also
    // cancel budget spacing/transport; closing only idle sockets cannot enforce TTL.
    for (const controller of controllers) controller.abort();
    const closed = new Promise((resolve) => server.close(resolve));
    for (const socket of sockets) socket.destroy();
    await Promise.allSettled([...inflight, closed]);
    gate?.endTurn();
    gate?.close();
    report.stopped = true;
    report.stoppedAt = new Date().toISOString();
    save();
    if (process.connected) process.disconnect();
  }
  process.on('SIGTERM', () => {
    void stop('SIGTERM');
  });
  process.on('SIGINT', () => {
    void stop('SIGINT');
  });
  process.on('disconnect', () => {
    void stop('parent_disconnect');
  });
  const listening = () => {
    if (stopped || Date.now() >= expiresAt) {
      server.close();
      void stop('ttl');
      return;
    }
    try {
      onListen?.();
    } catch {
      void stop('listen_binding_refused');
      return;
    }
    const address = server.address();
    const location =
      typeof address === 'string'
        ? { socketPath: address }
        : { port: address.port };
    if (process.connected)
      process.send?.({ type: 'ready', ...location, mode: report.mode });
    onReady?.({ ...location, mode: report.mode });
  };
  server.once('error', () => {
    void stop('listen_failed');
  });
  if (listenTarget) server.listen(listenTarget, listening);
  else server.listen(0, '127.0.0.1', listening);

  return { stop };
}
