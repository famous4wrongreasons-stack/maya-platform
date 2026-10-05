/** Local-only same-origin browser fixture; never a production proxy. */
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const routes = [
  ['POST', /^\/api\/public-booking\/(sessions|availability|quotes|attempts)$/],
  ['GET', /^\/api\/public-booking\/services$/],
  ['GET', /^\/api\/public-booking\/attempts\/[0-9a-f-]{36}$/i],
];
export function loopbackBase(value) {
  const u = new URL(value);
  if (
    u.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(u.hostname) ||
    !u.port ||
    u.username ||
    u.password ||
    u.pathname !== '/' ||
    u.search ||
    u.hash
  )
    throw new Error('Explicit HTTP loopback origin required');
  return u;
}
export function createLocalProxy({ backend, frontend, origin }) {
  const targets = {
    backend: loopbackBase(backend),
    frontend: loopbackBase(frontend),
  };
  const local = loopbackBase(origin);
  if (Object.values(targets).some((u) => u.port === local.port))
    throw new Error('Proxy loop refused');
  return http.createServer((req, res) => {
    const refuse = (status) => {
      res.writeHead(status, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      });
      res.end('{"code":"LOCAL_PROXY_REFUSED"}');
    };
    if (
      req.headers.host !== local.host ||
      !req.url?.startsWith('/') ||
      req.url.startsWith('//')
    )
      return refuse(403);
    const incoming = new URL(req.url, local);
    const guest = incoming.pathname.startsWith('/api/public-booking');
    if (
      guest &&
      !routes.some(
        ([method, pattern]) =>
          method === req.method && pattern.test(incoming.pathname),
      )
    )
      return refuse(404);
    if (
      guest &&
      ((req.headers.origin && req.headers.origin !== local.origin) ||
        req.headers['sec-fetch-site'] === 'cross-site' ||
        (req.method !== 'GET' && req.headers.origin !== local.origin))
    )
      return refuse(403);
    const target = guest ? targets.backend : targets.frontend;
    const headers = { ...req.headers, host: target.host };
    for (const name of [
      'connection',
      'proxy-connection',
      'keep-alive',
      'transfer-encoding',
      'upgrade',
      'proxy-authorization',
      'proxy-authenticate',
      'forwarded',
      'x-forwarded-host',
      'x-forwarded-proto',
      'x-forwarded-for',
    ])
      delete headers[name];
    if (guest) {
      headers.origin = local.origin;
      delete headers.authorization;
      const cookies = (req.headers.cookie || '')
        .split(';')
        .map((v) => v.trim())
        .filter((v) => v.startsWith('__Host-maya_guest_booking='));
      if (cookies.length === 1) headers.cookie = cookies[0];
      else delete headers.cookie;
    }
    const upstream = http.request(
      new URL(incoming.pathname + incoming.search, target),
      { method: req.method, headers, timeout: 30000 },
      (reply) => {
        const responseHeaders = { ...reply.headers };
        for (const name of [
          'connection',
          'keep-alive',
          'transfer-encoding',
          'upgrade',
        ])
          delete responseHeaders[name];
        if (guest) responseHeaders['cache-control'] = 'no-store';
        // Preserve HttpOnly/Secure/SameSite/Path unchanged, including all Set-Cookie headers.
        res.writeHead(reply.statusCode || 502, responseHeaders);
        reply.pipe(res);
      },
    );
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => {
      if (!res.headersSent) refuse(502);
      else res.destroy();
    });
    req.on('aborted', () => upstream.destroy());
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (guest && bytes > 65536) {
        upstream.destroy();
        if (!res.headersSent) refuse(413);
      }
    });
    req.pipe(upstream);
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.length !== 5)
      throw new Error('Usage: backend-origin frontend-origin browser-origin');
    const [backend, frontend, origin] = process.argv.slice(2);
    const local = loopbackBase(origin);
    const server = createLocalProxy({ backend, frontend, origin });
    server.listen(Number(local.port), '127.0.0.1', () =>
      process.stdout.write(
        JSON.stringify({
          mode: 'loopback_only_same_origin',
          origin,
          backend,
          frontend,
          lifetimeMinutes: 30,
        }) + '\n',
      ),
    );
    const timer = setTimeout(() => server.close(), 30 * 60000);
    const stop = () => {
      clearTimeout(timer);
      server.close();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    server.on('close', () => clearTimeout(timer));
    server.on('error', () => {
      clearTimeout(timer);
      process.stderr.write('local_proxy_failed\n');
      process.exitCode = 1;
    });
  } catch {
    process.stderr.write('local_proxy_configuration_refused\n');
    process.exitCode = 1;
  }
}
