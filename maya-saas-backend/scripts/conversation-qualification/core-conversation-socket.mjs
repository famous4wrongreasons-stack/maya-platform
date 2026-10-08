/** Finite local transport only. Admission, budget and credential access remain
 * with their existing owners. This helper never creates/unlinks a socket,
 * changes permissions, follows a redirect or falls back to TCP. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const REQUEST_MAX = 96 * 1024;
const RESPONSE_MAX = 1024 * 1024;
const ROUTES = new Map([
  ['/status', 'GET'],
  ['/chat/completions', 'POST'],
  ['/finish', 'POST'],
]);
const INIT_KEYS = new Set([
  'method',
  'body',
  'headers',
  'signal',
  'timeoutMs',
  'redirect',
]);
const HEADER_KEYS = new Set([
  'content-type',
  'x-candidate-manifest',
  'x-candidate-case',
  'x-candidate-turn',
]);
const error = (code) => new Error(code);
const requireThat = (value, code) => {
  if (!value) throw error(code);
};
const numericId = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;

/** Check the pinned OS boundary, not a claim of owner/model authorization.
 * Parent must provision the dedicated directory and UID/GID membership first.
 * A fresh broker may bind only an absent path; this helper cannot reset it. */
export function assertCoreSocket(
  target,
  { beforeListen = false, localStdin = false } = {},
) {
  try {
    requireThat(
      typeof beforeListen === 'boolean' && typeof localStdin === 'boolean',
      'core_socket_metadata_refused',
    );
    requireThat(
      target && numericId(target.brokerUid) && numericId(target.runnerUid),
      'core_socket_metadata_refused',
    );
    requireThat(
      typeof process.getuid === 'function' &&
        [target.brokerUid, target.runnerUid].includes(process.getuid()),
      'core_socket_metadata_refused',
    );
    const socket = target.brokerSocket;
    requireThat(
      socket && numericId(socket.gid),
      'core_socket_metadata_refused',
    );
    const file = socket.path;
    requireThat(
      typeof file === 'string' &&
        file.length > 0 &&
        file.length <= 4096 &&
        !/[\u0000-\u001f\u007f]/.test(file) &&
        path.isAbsolute(file) &&
        path.normalize(file) === file &&
        !file.endsWith('/'),
      'core_socket_metadata_refused',
    );
    const directory = path.dirname(file);
    requireThat(
      directory !== path.parse(file).root,
      'core_socket_metadata_refused',
    );
    const parent = fs.lstatSync(directory);
    if (localStdin) {
      const root = path.dirname(directory);
      const outer = fs.lstatSync(root);
      requireThat(
        process.platform === 'darwin' &&
          target.brokerUid > 0 &&
          target.brokerUid === target.runnerUid &&
          process.getgid() === socket.gid &&
          fs.realpathSync(root) === root &&
          outer.isDirectory() &&
          outer.uid === target.brokerUid &&
          (outer.mode & 0o7777) === 0o700,
        'core_socket_metadata_refused',
      );
    }
    requireThat(
      parent.isDirectory() &&
        !parent.isSymbolicLink() &&
        fs.realpathSync(directory) === directory &&
        parent.uid === target.brokerUid &&
        parent.gid === socket.gid &&
        (parent.mode & 0o7777) === (localStdin ? 0o700 : 0o2710),
      'core_socket_metadata_refused',
    );
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch (failure) {
      if (beforeListen && failure?.code === 'ENOENT') return;
      throw error('core_socket_metadata_refused');
    }
    requireThat(
      !beforeListen &&
        stat.isSocket() &&
        !stat.isSymbolicLink() &&
        stat.uid === target.brokerUid &&
        stat.gid === socket.gid &&
        (stat.mode & 0o7777) === (localStdin ? 0o600 : 0o660),
      'core_socket_metadata_refused',
    );
  } catch {
    // Filesystem errors can contain operator paths. No raw error is exposed.
    throw error('core_socket_metadata_refused');
  }
}

/** Exact UTF-8 bytes over one Unix HTTP connection. A Response is returned only
 * after the complete bounded body arrives. No request/response data is logged. */
export async function socketRequest(
  target,
  route,
  init = {},
  options = { localStdin: false },
) {
  requireThat(
    options &&
      Object.keys(options).length === 1 &&
      typeof options.localStdin === 'boolean',
    'core_socket_metadata_refused',
  );
  requireThat(ROUTES.has(route), 'core_socket_route_refused');
  requireThat(
    init &&
      typeof init === 'object' &&
      !Array.isArray(init) &&
      Object.keys(init).every((key) => INIT_KEYS.has(key)),
    'core_socket_request_refused',
  );
  const method = ROUTES.get(route);
  requireThat(
    init.method === undefined || init.method === method,
    'core_socket_request_refused',
  );
  requireThat(
    init.redirect === undefined ||
      init.redirect === 'error' ||
      init.redirect === 'manual',
    'core_socket_request_refused',
  );
  requireThat(
    init.body === undefined || typeof init.body === 'string',
    'core_socket_request_refused',
  );
  requireThat(
    method !== 'GET' || init.body === undefined,
    'core_socket_request_refused',
  );
  requireThat(
    route !== '/chat/completions' ||
      (typeof init.body === 'string' && init.body.length > 0),
    'core_socket_request_refused',
  );
  const body = Buffer.from(init.body ?? '', 'utf8');
  requireThat(body.length <= REQUEST_MAX, 'core_socket_request_limit');
  const timeoutMs =
    init.timeoutMs ?? (route === '/chat/completions' ? 30000 : 5000);
  requireThat(
    Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000,
    'core_socket_timeout_refused',
  );
  const signal = init.signal ?? undefined;
  requireThat(
    signal === undefined || signal instanceof AbortSignal,
    'core_socket_request_refused',
  );
  const headers = {};
  let headerBytes = 0;
  try {
    for (const [key, value] of new Headers(init.headers)) {
      requireThat(
        HEADER_KEYS.has(key) && value.length <= 1024,
        'core_socket_request_refused',
      );
      headerBytes += Buffer.byteLength(key + value);
      headers[key] = value;
    }
    requireThat(headerBytes <= 4096, 'core_socket_request_refused');
  } catch {
    throw error('core_socket_request_refused');
  }
  if (method === 'POST') headers['content-length'] = String(body.length);
  headers.connection = 'close';
  assertCoreSocket(target, options);
  const aborted = () => new DOMException('core_socket_aborted', 'AbortError');
  if (signal?.aborted) throw aborted();
  return new Promise((resolve, reject) => {
    let req,
      incoming,
      timer,
      done = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const fail = (failure) => {
      if (done) return;
      done = true;
      cleanup();
      incoming?.destroy();
      req?.destroy();
      reject(failure);
    };
    const onAbort = () => fail(aborted());
    signal?.addEventListener('abort', onAbort, { once: true });
    // Adding the listener and checking again closes the pre-dispatch abort gap.
    if (signal?.aborted) {
      onAbort();
      return;
    }
    timer = setTimeout(() => fail(error('core_socket_timeout')), timeoutMs);
    try {
      req = http.request(
        {
          socketPath: target.brokerSocket.path,
          path: route,
          method,
          headers,
          agent: false,
          maxHeaderSize: 8192,
        },
        (res) => {
          incoming = res;
          if (done) {
            res.destroy();
            return;
          }
          const length = res.headers['content-length'];
          if (
            length !== undefined &&
            (!/^\d+$/.test(length) || Number(length) > RESPONSE_MAX)
          ) {
            fail(error('core_socket_response_limit'));
            return;
          }
          let bytes = 0;
          const chunks = [];
          res.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > RESPONSE_MAX) {
              fail(error('core_socket_response_limit'));
              return;
            }
            chunks.push(chunk);
          });
          res.once('aborted', () =>
            fail(error('core_socket_transport_failed')),
          );
          res.once('error', () => fail(error('core_socket_transport_failed')));
          res.once('close', () => {
            if (!res.complete) fail(error('core_socket_transport_failed'));
          });
          res.once('end', () => {
            if (done) return;
            if (!res.complete) {
              fail(error('core_socket_transport_failed'));
              return;
            }
            try {
              requireThat(
                Number.isInteger(res.statusCode) &&
                  res.statusCode >= 200 &&
                  res.statusCode <= 599,
                'core_socket_response_refused',
              );
              const responseHeaders = new Headers();
              for (let index = 0; index < res.rawHeaders.length; index += 2)
                responseHeaders.append(
                  res.rawHeaders[index],
                  res.rawHeaders[index + 1],
                );
              const emptyStatus = [204, 205, 304].includes(res.statusCode);
              requireThat(
                !emptyStatus || bytes === 0,
                'core_socket_response_refused',
              );
              const response = new Response(
                emptyStatus ? null : Buffer.concat(chunks, bytes),
                { status: res.statusCode, headers: responseHeaders },
              );
              done = true;
              cleanup();
              req.destroy();
              resolve(response);
            } catch {
              fail(error('core_socket_response_refused'));
            }
          });
        },
      );
      req.once('error', () => fail(error('core_socket_transport_failed')));
      req.once('upgrade', (_res, socket) => {
        socket.destroy();
        fail(error('core_socket_response_refused'));
      });
      req.end(method === 'POST' ? body : undefined);
    } catch {
      fail(error('core_socket_transport_failed'));
    }
  });
}
