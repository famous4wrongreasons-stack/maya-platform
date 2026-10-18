/** Wire qualification only. Native adapter + bounded egress + real loopback
 * sockets + disposable provider PG ledger. No application/AE authority claim. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { Client } from 'pg';
import { CrmProvider } from '../../src/common/domain.enums';
import { YclientsCRMAdapter } from '../../src/crm/adapters/yclients-crm.adapter';
import { CrmOutcomeUnknownError } from '../../src/crm/crm-request.errors';
import { assertProofDatabase } from '../widgets-live/support/proof-db-guard';

const proof = assertProofDatabase();
assert.match(
  proof.database,
  /^maya_widget_gate_proof_native_socket_[a-f0-9]+$/,
);
const output = process.env.JEST_NATIVE_SOCKET_OUTPUT!;
assert.ok(output && process.env.JEST_NATIVE_CREATE_EGRESS);
const nativeFetch = globalThis.fetch;
const auth =
  'Bearer SYNTHETIC_NATIVE_SOCKET_PARTNER, User SYNTHETIC_NATIVE_SOCKET_USER';
const observations: Record<string, any> = {
  contract: 'maya.native-provider-lifecycle-wire/1',
  candidate: '6356db1875545337e34b6c8888b7ca858bb64361',
  status: 'INCOMPLETE',
  realProviderEffects: 0,
  realModelCalls: 0,
  scope: 'ADAPTER_TRANSPORT_ONLY_NOT_ACTION_ENGINE_OR_PHONE_ACCEPTANCE',
  syntheticAdmissionOnly: true,
  providerUniquenessOrIdempotencyGuard: false,
  releaseCertification: 'NOT_ISSUED',
};

describe('native lifecycle wire through bounded transport [isolated HTTP/PG]', () => {
  let db: Client, server: Server, origin: string, schema: string;
  let contractFailures = 0,
    passed = 0;
  const proxies: any[] = [];
  const companies = new Map<
    number,
    {
      mode: string;
      recordId?: number;
      posts: number;
      puts: number;
      deletes: number;
      socketLosses: number;
    }
  >();
  const rows = async (company: number) =>
    (
      await db.query(
        `SELECT id::int, record, cancelled FROM ${schema}.bookings WHERE company=$1`,
        [company],
      )
    ).rows;
  beforeAll(async () => {
    db = new Client({ connectionString: proof.connectionString });
    await db.connect();
    schema = 'native_lifecycle_' + randomUUID().replaceAll('-', '');
    await db.query(`CREATE SCHEMA ${schema}`);
    // A repeated POST creates another row. Repeated PUT/DELETE gets another event.
    await db.query(
      `CREATE TABLE ${schema}.bookings (id bigserial primary key, company integer not null, record jsonb not null, cancelled boolean not null default false)`,
    );
    await db.query(
      `CREATE TABLE ${schema}.effects (id bigserial primary key, company integer not null, method text not null)`,
    );
    server = createServer((req, res) => {
      void (async () => {
        try {
          assert.equal(req.headers.authorization, auth);
          assert.equal(req.headers.accept, 'application/vnd.yclients.v2+json');
          const url = new URL(req.url!, 'http://127.0.0.1');
          const parts = url.pathname.split('/').slice(3);
          const company = Number(parts[1]),
            state = companies.get(company)!;
          assert(state);
          assert.equal(url.search, '');
          const reply = (data: unknown) =>
            res
              .writeHead(200, { 'content-type': 'application/json' })
              .end(JSON.stringify({ success: true, data }));
          if (req.method === 'GET') {
            if (parts[0] === 'book_services') {
              reply({ services: [{ id: 81, seance_length: 1800 }] });
              return;
            }
            assert.equal(parts[0], 'record');
            assert.equal(Number(parts[2]), state.recordId);
            reply((await rows(company))[0].record);
            return;
          }
          let raw = '';
          for await (const chunk of req) {
            raw += String(chunk);
            assert(Buffer.byteLength(raw) < 16384);
          }
          const body = raw ? JSON.parse(raw) : null;
          const transaction = new Client({
            connectionString: proof.connectionString,
          });
          await transaction.connect();
          try {
            await transaction.query('BEGIN');
            if (req.method === 'POST') {
              assert.equal(parts[0], 'book_record');
              assert.equal(body.notify_by_sms, 0);
              assert.equal(body.notify_by_email, 0);
              assert.equal(
                body.appointments[0].datetime,
                '2026-11-02T17:00:00',
              );
              const record = {
                staff: { id: 71 },
                client: {
                  id: 91,
                  phone: body.phone.replace(/^\+/, ''),
                  name: body.fullname,
                  email: 'synthetic@example.invalid',
                },
                services: [
                  { id: 81, cost: 1200, first_cost: 1500, discount: 20 },
                ],
                seance_length: 1800,
                attendance: 0,
                comment: 'preserved synthetic note',
                datetime: body.appointments[0].datetime,
              };
              const inserted = await transaction.query(
                `INSERT INTO ${schema}.bookings(company,record) VALUES($1,$2::jsonb) RETURNING id::int`,
                [company, JSON.stringify(record)],
              );
              state.recordId = inserted.rows[0].id;
              await transaction.query(
                `UPDATE ${schema}.bookings SET record=record || jsonb_build_object('id',id) WHERE id=$1`,
                [state.recordId],
              );
              state.posts++;
            } else {
              assert.equal(parts[0], 'record');
              assert.equal(Number(parts[2]), state.recordId);
              if (req.method === 'PUT') {
                const record = (await rows(company))[0].record;
                assert.deepEqual(body, {
                  staff_id: 71,
                  datetime: '2026-11-02T18:00:00',
                  seance_length: 1800,
                  save_if_busy: false,
                  send_sms: false,
                  client: { ...record.client, phone: '+79990000001' },
                  services: [
                    {
                      id: 81,
                      amount: 1,
                      cost: 1200,
                      first_cost: 1500,
                      discount: 20,
                    },
                  ],
                  attendance: 0,
                  comment: record.comment,
                });
                await transaction.query(
                  `UPDATE ${schema}.bookings SET record=jsonb_set(record,'{datetime}',to_jsonb($1::text)) WHERE id=$2`,
                  [body.datetime, state.recordId],
                );
                state.puts++;
              } else {
                assert.equal(req.method, 'DELETE');
                assert.equal(body, null);
                await transaction.query(
                  `UPDATE ${schema}.bookings SET cancelled=true WHERE id=$1`,
                  [state.recordId],
                );
                state.deletes++;
              }
            }
            await transaction.query(
              `INSERT INTO ${schema}.effects(company,method) VALUES($1,$2)`,
              [company, req.method],
            );
            await transaction.query('COMMIT');
          } catch (error) {
            await transaction.query('ROLLBACK');
            throw error;
          } finally {
            await transaction.end();
          }
          if (
            (state.mode === 'move-loss' && req.method === 'PUT') ||
            (state.mode === 'cancel-loss' && req.method === 'DELETE')
          ) {
            state.socketLosses++;
            req.socket.destroy();
          } else if (req.method === 'POST')
            reply([{ id: 1, record_id: state.recordId }]);
          else if (req.method === 'DELETE') res.writeHead(204).end();
          else reply({});
        } catch {
          contractFailures++;
          res.destroy();
        }
      })();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    assert(address && typeof address !== 'string');
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    observations.status = passed === 3 ? 'PASS' : 'FAIL';
    observations.providerContractFailures = contractFailures;
    observations.fetchIdentityUnchanged = globalThis.fetch === nativeFetch;
    observations.syntheticCounters = Object.fromEntries(
      [...companies.values()].map((s) => [
        s.mode,
        {
          posts: s.posts,
          puts: s.puts,
          deletes: s.deletes,
          socketLosses: s.socketLosses,
        },
      ]),
    );
    writeFileSync(output, JSON.stringify(observations, null, 2) + '\n', {
      mode: 0o600,
    });
    for (const proxy of proxies) {
      proxy.close();
      proxy.server.closeAllConnections();
      await new Promise<void>((resolve) => proxy.server.close(() => resolve()));
    }
    server?.closeAllConnections();
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (db) {
      if (schema) await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
    }
  });
  async function fixture(company: number, mode: string) {
    companies.set(company, {
      mode,
      posts: 0,
      puts: 0,
      deletes: 0,
      socketLosses: 0,
    });
    const { nativeCreateEgress, LIFECYCLE_EGRESS_CONTRACT } = await import(
      process.env.JEST_NATIVE_CREATE_EGRESS!
    );
    const proxy = nativeCreateEgress({
      scope: {
        contract: LIFECYCLE_EGRESS_CONTRACT,
        candidate: observations.candidate,
        profile: 'closed-input.no-handoff.no-price-goods@1',
        tenantId: 'synthetic-lifecycle-' + company,
        companyId: String(company),
        executionAuthorizationDigest: 'a'.repeat(64),
        credentialDigest: createHash('sha256').update(auth).digest('hex'),
        notBefore: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        maxReads: 128,
        maxCreates: 1,
        maxReschedules: 1,
        maxCancels: 1,
      },
      ledgerPath: path.join(
        path.dirname(output),
        'lifecycle-' + company + '.jsonl',
      ),
      assertCurrent: () => true,
      nativeFetch: async (raw: string, init: RequestInit) => {
        const url = new URL(raw);
        assert.equal(url.origin, 'https://api.yclients.com');
        const response = await nativeFetch(
          origin + url.pathname + url.search,
          init,
        );
        return new Response(response.body, {
          status: response.status,
          headers: response.headers,
        });
      },
    });
    proxies.push(proxy);
    await new Promise<void>((resolve) =>
      proxy.server.listen(0, '127.0.0.1', resolve),
    );
    const adapter = new YclientsCRMAdapter(
      {
        provider: CrmProvider.YCLIENTS,
        tenantId: 'synthetic-lifecycle-' + company,
        apiToken: 'SYNTHETIC_NATIVE_SOCKET_USER',
        settings: { companyId: company, currency: 'RUB' },
        baseUrl: `http://127.0.0.1:${proxy.server.address().port}/api/v1`,
      },
      'SYNTHETIC_NATIVE_SOCKET_PARTNER',
    );
    const created = await adapter.createAppointment({
      tenantId: 'synthetic-lifecycle-' + company,
      timezone: 'Europe/Moscow',
      clientId: 'synthetic-client',
      clientName: 'Synthetic client',
      clientPhone: '+79990000001',
      staffId: '71',
      serviceIds: ['81'],
      start: '2026-11-02T14:00:00Z',
      notifyBySmsHours: 0,
    });
    assert.equal(created.external_id, String(companies.get(company)!.recordId));
    const move = () =>
      adapter.rescheduleAppointment({
        tenantId: 'synthetic-lifecycle-' + company,
        timezone: 'Europe/Moscow',
        externalId: created.external_id,
        start: '2026-11-02T15:00:00Z',
      });
    const cancel = () =>
      adapter.cancelAppointment({
        tenantId: 'synthetic-lifecycle-' + company,
        externalId: created.external_id,
      });
    return { proxy, adapter, created, move, cancel };
  }
  it('healthy native create → preserving PUT → empty 204 DELETE', async () => {
    const f = await fixture(460001, 'healthy');
    const moved = await f.move();
    assert.equal(moved.external_id, f.created.external_id);
    assert.equal(moved.status, 'confirmed');
    assert.equal((await f.cancel()).status, 'canceled');
    const persisted = await rows(460001);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].cancelled, true);
    assert.equal(persisted[0].record.datetime, '2026-11-02T18:00:00');
    const state = companies.get(460001)!;
    assert.deepEqual([state.posts, state.puts, state.deletes], [1, 1, 1]);
    assert.equal(f.proxy.snapshot().refused, 0);
    observations.healthy = {
      state: 'SUCCEEDED',
      sameRecord: true,
      syntheticEffects: 3,
    };
    passed++;
  });
  for (const mode of ['move-loss', 'cancel-loss'])
    it(
      'durable ' +
        mode +
        ' preserves native UNKNOWN and the bounded channel refuses normal/concurrent redispatch',
      async () => {
        const company = mode === 'move-loss' ? 460002 : 460003,
          f = await fixture(company, mode);
        const operation = mode === 'move-loss' ? f.move : f.cancel;
        let error: unknown;
        try {
          await operation();
        } catch (e) {
          error = e;
        }
        const state = companies.get(company)!;
        observations[mode] = {
          errorClass: error instanceof Error ? error.constructor.name : 'none',
          persistedBookings: (await rows(company)).length,
          posts: state.posts,
          puts: state.puts,
          deletes: state.deletes,
          socketLosses: state.socketLosses,
        };
        assert(
          error instanceof CrmOutcomeUnknownError,
          'Post-dispatch loss must remain native UNKNOWN',
        );
        await assert.rejects(operation());
        const retries = await Promise.allSettled(
          Array.from({ length: 6 }, operation),
        );
        assert(retries.every((r) => r.status === 'rejected'));
        assert.equal(state.posts, 1);
        assert.equal(state.puts + state.deletes, 1);
        assert.equal(state.socketLosses, 1);
        const persisted = await rows(company);
        assert.equal(persisted.length, 1);
        if (mode === 'move-loss')
          assert.equal(persisted[0].record.datetime, '2026-11-02T18:00:00');
        else assert.equal(persisted[0].cancelled, true);
        const effects = await db.query(
          `SELECT count(*)::int AS count FROM ${schema}.effects WHERE company=$1`,
          [company],
        );
        assert.equal(effects.rows[0].count, 2);
        assert.equal(f.proxy.snapshot().lifecycleUncertain, true);
        observations[mode].normalAndConcurrentRetriesRefused = true;
        passed++;
      },
    );
});
