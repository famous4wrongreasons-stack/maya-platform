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
// Fixed extension for one confirmed created record; V1 stays create-only.
export const LIFECYCLE_EGRESS_CONTRACT = 'maya.phone-native-create-egress/2';
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
  const lifecycle = input?.contract === LIFECYCLE_EGRESS_CONTRACT;
  keys(input, [
    ...(lifecycle ? ['maxReschedules', 'maxCancels'] : []),
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
  assert(
    [CREATE_EGRESS_CONTRACT, LIFECYCLE_EGRESS_CONTRACT].includes(
      input.contract,
    ),
  );
  if (lifecycle) {
    assert.equal(input.maxReschedules, 1);
    assert.equal(input.maxCancels, 1);
  }
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

function classify(
  raw,
  method,
  body,
  scope,
  createdPhoneDigest,
  lifecycle,
  now,
) {
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
  if (
    scope.contract === LIFECYCLE_EGRESS_CONTRACT &&
    url.pathname.startsWith('/api/v1/record/')
  ) {
    assert(lifecycle.recordId, 'provider_created_record_required');
    assert.equal(
      url.pathname,
      `/api/v1/record/${company}/${lifecycle.recordId}`,
    );
    assert.equal(url.search, '');
    if (method === 'GET') {
      assert.equal(body.length, 0);
      return 'recordRead';
    }
    assert(
      !lifecycle.mutationPending &&
        !lifecycle.uncertain &&
        !lifecycle.cancelled,
      'lifecycle_write_not_current',
    );
    if (method === 'DELETE') {
      assert.equal(body.length, 0);
      return 'cancel';
    }
    assert.equal(method, 'PUT');
    assert(
      lifecycle.read &&
        now >= lifecycle.read.at &&
        now - lifecycle.read.at < 60000,
      'fresh_record_read_required',
    );
    const value = JSON.parse(body.toString('utf8'));
    assert(
      typeof value.datetime === 'string' &&
        /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(
          value.datetime,
        ) &&
        day(value.datetime.slice(0, 10)),
    );
    // Time-only move. Existing native serializer preserves all other fields.
    // Availability/ownership/confirmation still belong to canonical backend owners.
    assert.deepEqual(value, {
      ...lifecycle.read.body,
      datetime: value.datetime,
    });
    return 'reschedule';
  }

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

function preservedMove(record, lifecycle) {
  assert(record && !Array.isArray(record));
  assert.equal(
    String(record.id),
    lifecycle.recordId,
    'record_response_substitution',
  );
  assert(numericId(Number(record.staff?.id)));
  assert(
    Number.isSafeInteger(Number(record.seance_length)) &&
      Number(record.seance_length) > 0,
  );
  assert(record.client && typeof record.client.phone === 'string');
  // Only an already canonical provider phone format is supported here. This is
  // response correlation, never a Client-authority decision or phone resolver.
  assert(/^\+?[0-9]{10,15}$/.test(record.client.phone));
  assert.equal(
    sha(record.client.phone.replace(/^\+/, '')),
    lifecycle.phoneDigest,
  );
  const client = record.client;
  assert(numericId(Number(client.id)));
  assert(typeof client.name === 'string' && client.name.length > 0);
  const services = record.services;
  assert(
    Array.isArray(services) && services.length > 0 && services.length <= 20,
  );
  assert(new Set(services.map((s) => String(s.id))).size === services.length);
  return {
    staff_id: Number(record.staff.id),
    seance_length: Number(record.seance_length),
    save_if_busy: false,
    send_sms: false,
    client: {
      id: Number(client.id),
      phone: '+' + client.phone.replace(/^\+/, ''),
      name: client.name,
      ...(client.surname ? { surname: client.surname } : {}),
      ...(client.email ? { email: client.email } : {}),
    },
    services: services.map((service) => {
      assert(numericId(Number(service.id)));
      const cost = Number(service.cost),
        first = Number(service.first_cost),
        discount = Number(service.discount);
      assert(
        Number.isFinite(cost) && cost >= 0,
        'preserved_service_price_required',
      );
      return {
        id: Number(service.id),
        amount: 1,
        cost,
        first_cost: Number.isFinite(first) ? first : cost,
        ...(Number.isFinite(discount) ? { discount } : {}),
      };
    }),
    ...(typeof record.attendance === 'number'
      ? { attendance: record.attendance }
      : {}),
    comment: record.comment ?? '',
  };
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
    reschedules: 0,
    cancels: 0,
    completed: 0,
    refused: 0,
    uncertainTransport: 0,
    inFlight: 0,
  };
  let revoked = false,
    closed = false,
    createdPhoneDigest = null;
  const lifecycle = {
    recordId: null,
    phoneDigest: null,
    read: null,
    readEpoch: 0,
    mutationPending: false,
    uncertain: false,
    cancelled: false,
  };
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
      contract: scope.contract,
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
        writeDispatched = false,
        lifecycleWrite = false,
        readEpoch = null;
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
          kind = classify(
            req.url,
            req.method,
            body,
            scope,
            createdPhoneDigest,
            lifecycle,
            clock(),
          );
        current();
        assert(counters.inFlight < CREATE_EGRESS_LIMITS.inFlight);
        const budget = {
          create: ['creates', 'maxCreates'],
          reschedule: ['reschedules', 'maxReschedules'],
          cancel: ['cancels', 'maxCancels'],
        }[kind] ?? ['reads', 'maxReads'];
        assert(counters[budget[0]] < scope[budget[1]], 'create_egress_budget');
        try {
          append({
            event: 'attempt',
            kind,
            number:
              counters.reads +
              counters.creates +
              counters.reschedules +
              counters.cancels +
              1,
          });
        } catch (error) {
          revoke();
          throw error;
        }
        counters[budget[0]]++;
        if (kind === 'recordRead') {
          lifecycle.read = null;
          readEpoch = ++lifecycle.readEpoch;
        }
        if (kind === 'reschedule' || kind === 'cancel') {
          lifecycleWrite = true;
          lifecycle.mutationPending = true;
          lifecycle.read = null;
          lifecycle.readEpoch++;
        }
        counters.inFlight++;
        reserved = true;
        controller = new AbortController();
        controllers.add(controller);
        res.once('close', () => controller.abort());
        current();
        const url = 'https://api.yclients.com' + req.url;
        if (kind === 'create') {
          const phone = JSON.parse(body.toString('utf8')).phone;
          createdPhoneDigest = sha(phone);
          lifecycle.phoneDigest = sha(phone.replace(/^\+/, ''));
        }
        writeDispatched = kind === 'create' || lifecycleWrite;
        if (lifecycleWrite) lifecycle.uncertain = true;
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
        const emptyCancel =
          kind === 'cancel' && response.status === 204 && result.length === 0;
        const parsed = emptyCancel
          ? { success: true }
          : JSON.parse(result.toString('utf8'));
        if (
          scope.contract === LIFECYCLE_EGRESS_CONTRACT &&
          response.ok &&
          parsed.success === true
        ) {
          if (kind === 'create') {
            assert(Array.isArray(parsed.data) && parsed.data.length === 1);
            const created = parsed.data[0];
            assert.equal(created.id, 1);
            assert(
              id(String(created.record_id)),
              'explicit_provider_record_id_required',
            );
            lifecycle.recordId = String(created.record_id);
          } else if (
            kind === 'recordRead' &&
            readEpoch === lifecycle.readEpoch &&
            !lifecycle.mutationPending
          ) {
            lifecycle.read = {
              at: clock(),
              body: preservedMove(parsed.data, lifecycle),
            };
          } else if (lifecycleWrite) {
            lifecycle.uncertain = false;
            if (kind === 'cancel') lifecycle.cancelled = true;
          }
        }
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
        if (lifecycleWrite && writeDispatched) lifecycle.uncertain = true;
        controller?.abort();
        reject();
      } finally {
        if (lifecycleWrite) lifecycle.mutationPending = false;
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
      contract: scope.contract,
      ...counters,
      recordBound: lifecycle.recordId !== null,
      lifecycleUncertain: lifecycle.uncertain,
      cancelled: lifecycle.cancelled,
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
