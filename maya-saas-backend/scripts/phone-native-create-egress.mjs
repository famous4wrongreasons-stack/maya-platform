// Local preparation only. No executable entrypoint, credential loading, grant or
// deploy. The canonical CRM/Action Engine remains the business authority. A real
// executor must supply independent current execution admission; JSON is not it.
import assert from 'node:assert/strict';
import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { admittedProviderRead } from './local-yclients-read-transport.mjs';

export const CREATE_EGRESS_CONTRACT = 'maya.phone-native-create-egress/1';
export const CREATE_EGRESS_LIMITS = Object.freeze({
  requestBytes: 16384,
  responseBytes: 2097152,
  timeoutMs: 20000,
  inFlight: 4,
});
const sha = (value) => createHash('sha256').update(value).digest('hex');
const keys = (value, expected) => {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
};
const id = (value) =>
  typeof value === 'string' &&
  /^[1-9][0-9]{0,14}$/.test(value) &&
  Number.isSafeInteger(Number(value));
const numericId = (value) => typeof value === 'number' && id(String(value));
const day = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const refused =
  '{"success":false,"error":"phone_native_create_egress_refused"}';

export function validateCreateEgressScope(input, now = Date.now()) {
  keys(input, [
    'contract',
    'candidate',
    'profile',
    'tenantId',
    'companyId',
    'executionAuthorizationDigest',
    'credentialDigest',
    'notBefore',
    'expiresAt',
    'maxReads',
    'maxCreates',
  ]);
  assert.equal(input.contract, CREATE_EGRESS_CONTRACT);
  assert.equal(input.candidate, '6356db1875545337e34b6c8888b7ca858bb64361');
  assert.equal(input.profile, 'closed-input.no-handoff.no-price-goods@1');
  assert.match(input.tenantId, /^[A-Za-z0-9_-]{1,128}$/);
  assert(id(input.companyId));
  for (const key of ['executionAuthorizationDigest', 'credentialDigest'])
    assert.match(input[key], /^[a-f0-9]{64}$/);
  const start = Date.parse(input.notBefore),
    end = Date.parse(input.expiresAt);
  assert(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= now &&
      now < end &&
      end - start <= 1800000,
    'create_scope_window',
  );
  assert.equal(input.maxCreates, 1);
  assert(
    Number.isSafeInteger(input.maxReads) &&
      input.maxReads > 0 &&
      input.maxReads <= 256,
  );
  return Object.freeze({ ...input });
}

function classify(raw, method, body, scope, createdPhoneDigest) {
  assert(
    typeof raw === 'string' &&
      raw.startsWith('/api/v1/') &&
      !/[\\#\s]/.test(raw) &&
      !raw.includes('//'),
  );
  const url = new URL('https://api.yclients.com' + raw),
    company = scope.companyId;
  assert.equal(raw.split('?')[0], url.pathname, 'normalized_route_refused');
  assert(!url.pathname.includes('%'));
  if (method === 'GET') {
    assert.equal(body.length, 0);
    if (admittedProviderRead(url, { method }, company)) return 'read';
    if (url.pathname === `/api/v1/book_staff/${company}` && !url.search)
      return 'read';
    if (url.pathname === `/api/v1/book_services/${company}`) {
      assert.deepEqual([...url.searchParams.keys()], ['staff_id']);
      assert(id(url.searchParams.get('staff_id')));
      return 'read';
    }
    const route = new RegExp(
      `^/api/v1/book_times/${company}/([1-9][0-9]{0,14})/(\\d{4}-\\d{2}-\\d{2})$`,
    ).exec(url.pathname);
    assert(route && id(route[1]) && day(route[2]), 'create_read_route');
    const query = url.searchParams;
    assert.deepEqual([...new Set(query.keys())].sort(), [
      'date',
      'service_ids[]',
    ]);
    assert.equal(query.getAll('date').length, 1);
    assert.equal(query.get('date'), route[2]);
    const services = query.getAll('service_ids[]');
    assert(
      services.length >= 1 &&
        services.length <= 20 &&
        services.every(id) &&
        new Set(services).size === services.length,
    );
    return 'read';
  }
  assert.equal(method, 'POST');
  assert.equal(url.search, '');
  const value = JSON.parse(body.toString('utf8'));
  if (url.pathname === `/api/v1/company/${company}/clients/search`) {
    // Only the existing post-dispatch exact-contact reconciliation request.
    // No registry scan, arbitrary customer search or authority from a phone.
    assert(createdPhoneDigest, 'reconciliation_requires_dispatched_create');
    keys(value, ['fields', 'filters', 'page', 'page_size']);
    assert.deepEqual(value.fields, ['id', 'name', 'phone']);
    assert.equal(value.page, 1);
    assert.equal(value.page_size, 8);
    assert.equal(value.filters.length, 1);
    keys(value.filters[0], ['type', 'state']);
    assert.equal(value.filters[0].type, 'quick_search');
    keys(value.filters[0].state, ['value']);
    assert.equal(sha(value.filters[0].state.value), createdPhoneDigest);
    return 'read';
  }
  assert.equal(url.pathname, `/api/v1/book_record/${company}`);
  keys(value, [
    'phone',
    'fullname',
    'email',
    'comment',
    'type',
    'notify_by_sms',
    'notify_by_email',
    'appointments',
  ]);
  assert(
    typeof value.phone === 'string' && /^\+?[0-9]{10,15}$/.test(value.phone),
  );
  assert(typeof value.fullname === 'string' && value.fullname.length <= 256);
  assert.equal(value.email, '');
  assert(typeof value.comment === 'string' && value.comment.length <= 4096);
  assert.equal(value.type, 'mobile');
  assert.equal(value.notify_by_sms, 0);
  assert.equal(value.notify_by_email, 0);
  assert(Array.isArray(value.appointments) && value.appointments.length === 1);
  const appointment = value.appointments[0];
  keys(appointment, ['id', 'services', 'staff_id', 'datetime']);
  assert.equal(appointment.id, 1);
  assert(numericId(appointment.staff_id));
  assert(
    Array.isArray(appointment.services) &&
      appointment.services.length >= 1 &&
      appointment.services.length <= 20 &&
      appointment.services.every(numericId),
  );
  assert(new Set(appointment.services).size === appointment.services.length);
  assert(
    typeof appointment.datetime === 'string' &&
      /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(
        appointment.datetime,
      ) &&
      day(appointment.datetime.slice(0, 10)),
  );
  return 'create';
}

export function nativeCreateEgress({
  scope: input,
  ledgerPath,
  assertCurrent,
  nativeFetch = fetch,
  clock = Date.now,
}) {
  assert.equal(
    typeof assertCurrent,
    'function',
    'independent_execution_admission_required',
  );
  const scope = validateCreateEgressScope(input, clock());
  assert.equal(
    assertCurrent(scope),
    true,
    'current_execution_admission_required',
  ); // JSON alone is not authority; async callbacks are refused.
  assert(path.isAbsolute(ledgerPath));
  const parent = fs.lstatSync(path.dirname(ledgerPath));
  assert(
    parent.isDirectory() &&
      !parent.isSymbolicLink() &&
      (parent.mode & 0o077) === 0,
    'private_ledger_directory_required',
  );
  // No reset/resume path: any prior opening (including a crash before dispatch)
  // permanently burns this run's ledger. A new real run needs new admission.
  const fd = fs.openSync(ledgerPath, 'wx', 0o600);
  const ledgerIdentity = fs.fstatSync(fd);
  const counters = {
    reads: 0,
    creates: 0,
    completed: 0,
    refused: 0,
    uncertainTransport: 0,
    inFlight: 0,
  };
  let revoked = false,
    closed = false,
    createdPhoneDigest = null;
  const controllers = new Set();
  const append = (event) => {
    const bytes = Buffer.from(JSON.stringify(event) + '\n');
    let offset = 0;
    while (offset < bytes.length) {
      const n = fs.writeSync(fd, bytes, offset);
      assert(n > 0, 'ledger_write_incomplete');
      offset += n;
    }
    fs.fsyncSync(fd);
  };
  try {
    append({
      contract: CREATE_EGRESS_CONTRACT,
      scopeDigest: sha(JSON.stringify(scope)),
      event: 'opened',
    });
    const directoryFd = fs.openSync(path.dirname(ledgerPath), 'r');
    try {
      fs.fsyncSync(directoryFd);
    } finally {
      fs.closeSync(directoryFd);
    }
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
  const current = () => {
    assert(!revoked && !closed, 'create_egress_revoked');
    validateCreateEgressScope(scope, clock());
    const retained = fs.lstatSync(ledgerPath);
    assert(
      retained.isFile() &&
        !retained.isSymbolicLink() &&
        retained.ino === ledgerIdentity.ino &&
        retained.dev === ledgerIdentity.dev &&
        (retained.mode & 0o077) === 0,
      'ledger_replaced',
    );
    assert.equal(
      assertCurrent(scope),
      true,
      'current_execution_admission_required',
    );
  };
  const revoke = () => {
    revoked = true;
    for (const controller of controllers) controller.abort();
  };
  const server = http.createServer(
    { maxHeaderSize: 12288, requestTimeout: 25000, headersTimeout: 5000 },
    async (req, res) => {
      let controller,
        reserved = false,
        writeDispatched = false;
      const reject = () => {
        counters.refused++;
        if (res.destroyed) return;
        if (writeDispatched) {
          counters.uncertainTransport++;
          // A local refusal/timeout AFTER dispatch must not fabricate a provider
          // rejection. Socket failure lets the native adapter retain UNKNOWN.
          res.destroy();
        } else if (!res.headersSent)
          res
            .writeHead(403, {
              'content-type': 'application/json',
              'cache-control': 'no-store',
              connection: 'close',
            })
            .end(refused);
        else res.destroy();
      };
      try {
        current();
        const rawNames = req.rawHeaders
          .filter((_, i) => i % 2 === 0)
          .map((name) => name.toLowerCase());
        for (const name of [
          'authorization',
          'content-type',
          'content-length',
          'accept',
        ])
          assert.equal(
            rawNames.filter((x) => x === name).length,
            name === 'content-length'
              ? Number(req.headers[name] !== undefined)
              : 1,
          );
        assert.equal(req.headers.cookie, undefined);
        assert.equal(req.headers.expect, undefined);
        assert.equal(req.headers['transfer-encoding'], undefined);
        assert.equal(req.headers.accept, 'application/vnd.yclients.v2+json');
        assert.equal(req.headers['content-type'], 'application/json');
        const auth = req.headers.authorization;
        assert(
          typeof auth === 'string' &&
            /^Bearer [A-Za-z0-9_-]{16,4096}, User [A-Za-z0-9_-]{16,4096}$/.test(
              auth,
            ),
        );
        assert(
          timingSafeEqual(
            Buffer.from(sha(auth), 'hex'),
            Buffer.from(scope.credentialDigest, 'hex'),
          ),
          'credential_binding',
        );
        if (req.headers['content-length'] !== undefined)
          assert(
            /^(0|[1-9]\d*)$/.test(req.headers['content-length']) &&
              Number(req.headers['content-length']) <=
                CREATE_EGRESS_LIMITS.requestBytes,
          );
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          current();
          bytes += chunk.length;
          assert(bytes <= CREATE_EGRESS_LIMITS.requestBytes);
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks),
          kind = classify(req.url, req.method, body, scope, createdPhoneDigest);
        current();
        assert(counters.inFlight < CREATE_EGRESS_LIMITS.inFlight);
        assert(
          kind === 'create'
            ? counters.creates < scope.maxCreates
            : counters.reads < scope.maxReads,
          'create_egress_budget',
        );
        try {
          append({
            event: 'attempt',
            kind,
            number: counters.reads + counters.creates + 1,
          });
        } catch (error) {
          revoke();
          throw error;
        }
        counters[kind === 'create' ? 'creates' : 'reads']++;
        counters.inFlight++;
        reserved = true;
        controller = new AbortController();
        controllers.add(controller);
        res.once('close', () => controller.abort());
        current();
        const url = 'https://api.yclients.com' + req.url;
        if (kind === 'create')
          createdPhoneDigest = sha(JSON.parse(body.toString('utf8')).phone);
        writeDispatched = kind === 'create';
        const response = await nativeFetch(url, {
          method: req.method,
          redirect: 'error',
          headers: {
            Authorization: auth,
            Accept: 'application/vnd.yclients.v2+json',
            'Content-Type': 'application/json',
          },
          ...(body.length ? { body } : {}),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(
              Math.max(
                1,
                Math.min(
                  CREATE_EGRESS_LIMITS.timeoutMs,
                  Date.parse(scope.expiresAt) - clock(),
                ),
              ),
            ),
          ]),
        });
        current();
        assert(!response.redirected && (!response.url || response.url === url));
        assert(
          (response.status >= 200 && response.status <= 299) ||
            (response.status >= 400 && response.status <= 599),
          'redirect_refused',
        );
        const parts = [];
        let size = 0;
        for await (const chunk of response.body ?? []) {
          current();
          size += chunk.length;
          assert(size <= CREATE_EGRESS_LIMITS.responseBytes);
          parts.push(chunk);
        }
        const result = Buffer.concat(parts);
        JSON.parse(result.toString('utf8'));
        current();
        assert(!res.destroyed);
        const headers = {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        };
        for (const name of ['link', 'content-range']) {
          const value = response.headers.get(name);
          if (value !== null) headers[name] = value;
        }
        res.writeHead(response.status, headers).end(result);
        counters.completed++;
      } catch {
        controller?.abort();
        reject();
      } finally {
        controllers.delete(controller);
        if (reserved) counters.inFlight--;
      }
    },
  );
  for (const event of ['checkContinue', 'checkExpectation'])
    server.on(event, (_req, res) =>
      res.writeHead(403, { Connection: 'close' }).end(refused),
    );
  for (const event of ['connect', 'upgrade'])
    server.on(event, (_req, socket) =>
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'),
    );
  server.on('clientError', (_error, socket) =>
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'),
  );
  return {
    server,
    revoke,
    check: current,
    snapshot: () => ({
      contract: CREATE_EGRESS_CONTRACT,
      ...counters,
      revoked,
      closed,
    }),
    close() {
      revoke();
      if (!closed) {
        closed = true;
        fs.closeSync(fd);
      }
    },
  };
}
