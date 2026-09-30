import type { Server } from 'node:http';

import { bootHttp } from './support/http-bootstrap';

describe('HTTP harness listener ownership', () => {
  it('HAR-LOOPBACK owns one ready IPv4 listener across requests and closes it at teardown', async () => {
    const http = await bootHttp();
    const server = http.app.getHttpServer() as Server;
    let requests = 0;
    server.on('request', () => requests++);
    try {
      // Supertest must never select its own wildcard listener before a request:
      // on Darwin an existing IPv4 loopback listener can shadow that same port.
      const address = server.address();
      expect(address).toMatchObject({
        address: '127.0.0.1',
        family: 'IPv4',
        port: expect.any(Number) as unknown,
      });
      const [first, second] = await Promise.all([
        http.listenLoopback(),
        http.listenLoopback(),
      ]);
      expect(first).toBe(second);
      expect(first).toBe(
        `http://127.0.0.1:${(address as { port: number }).port}`,
      );
      for (let i = 0; i < 2; i++) {
        expect((await http.postIntentUnauthenticated({})).status).toBe(401);
        expect(server.address()).toEqual(address);
        expect(server.listening).toBe(true);
      }
      // The intended server received both requests; no neighboring listener did.
      expect(requests).toBe(2);
    } finally {
      await http.close();
    }
    expect(server.listening).toBe(false);
    expect(server.address()).toBeNull();
  });
});
