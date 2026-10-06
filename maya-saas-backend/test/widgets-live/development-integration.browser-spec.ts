import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { developmentIntegrationFixture } from '../widgets-diagnostics/support/development-integration-fixture';
import { assertProofDatabase } from './support/proof-db-guard';

// Explicit browser entry, outside the default live regex. Actual DOM assertions
// drive the same HTTP/auth/C9/AE owners; a ready listener is never a PASS.
describe('combined current React carrier [SCRIPTED SYNTHETIC]', () => {
  it('checks pricing, C9 evidence, restricted schedule denial, history, offline and revocation', async () => {
    const database = assertProofDatabase();
    if (
      database.mode !== 'local' ||
      database.database !== 'maya_widget_gate_proof_unified'
    )
      throw new Error(
        'Combined carrier needs its owned unified local proof database',
      );
    const output = process.env.JEST_COMBINED_BROWSER_OUTPUT;
    if (!output || !path.isAbsolute(output) || existsSync(output))
      throw new Error('Fresh absolute JEST_COMBINED_BROWSER_OUTPUT required');
    mkdirSync(output, { recursive: true, mode: 0o700 });
    const f = await developmentIntegrationFixture();
    try {
      f.config.set('EMAIL_LOGIN_ENABLED', 'true');
      f.config.set('EMAIL_AUTH_PROVIDER', 'debug');
      const salon = await f.salon();
      await f.restrict(salon);
      const before = await f.businessState(salon);
      const unchanged = await f.businessState(salon, false);
      let mark = f.http.recorder.mark();
      const expected = [
        'general',
        'occupancy',
        'price',
        'approved',
        'schedule',
        'history',
        'offline',
        'retry',
        'revoked',
      ];
      const completed: string[] = [];
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            path.resolve(
              '../maya-carrier-react/test/development-integration-browser-probe.mjs',
            ),
          ],
          { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
        );
        let failure: Error | undefined,
          stderr = '',
          pending = Promise.resolve();
        const fail = (error: unknown) => {
          failure ??= error instanceof Error ? error : new Error(String(error));
          child.kill('SIGTERM');
        };
        const timer = setTimeout(
          () => fail(new Error('Combined browser timed out')),
          180000,
        );
        child.stderr!.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.on('message', (raw: unknown) => {
          pending = pending
            .then(async () => {
              const message = raw as {
                type: string;
                name: string;
                body?: { coordination?: { run_id: string } };
              };
              if (message.type === 'ready') {
                child.send({
                  type: 'start',
                  backendOrigin: await f.http.listenLoopback(),
                  ownerEmail: salon.owner.email,
                  output,
                });
                return;
              }
              expect(message.type).toBe('checkpoint');
              expect(message.name).toBe(expected[completed.length]);
              expect(f.unexpected).toEqual([]);
              expect(
                f.businessWrites(mark, message.name === 'approved'),
              ).toEqual([]);
              expect(await f.businessState(salon, false)).toEqual(unchanged);
              expect(salon.state.scheduleWrites).toBe(0);
              expect(salon.state.priceWrites).toBe(
                completed.length < 3 ? 0 : 1,
              );
              if (['general', 'occupancy', 'price'].includes(message.name))
                expect(await f.businessState(salon)).toEqual(before);
              if (message.name === 'approved') {
                const actions = await f.db.prisma.actionExecution.findMany({
                  where: { tenantId: salon.tenant.id },
                });
                expect(actions).toHaveLength(1);
                expect(actions[0]).toMatchObject({
                  capability: 'crm.service.fixed-price.update.v1',
                  state: 'SUCCEEDED',
                  executionAttemptCount: 1,
                });
              }
              if (message.name === 'occupancy' || message.name === 'retry') {
                const run = await f.db.prisma.c9Run.findUniqueOrThrow({
                  where: { id: message.body!.coordination!.run_id },
                });
                expect(run).toMatchObject({
                  tenantId: salon.tenant.id,
                  currentRevision: 1,
                  principalJson: { userId: salon.owner.id },
                });
              }
              if (message.name === 'retry')
                await f.db.prisma.membership.update({
                  where: {
                    userId_tenantId: {
                      userId: salon.owner.id,
                      tenantId: salon.tenant.id,
                    },
                  },
                  data: { status: 'suspended' },
                });
              mark = f.http.recorder.mark();
              completed.push(message.name);
              child.send({ type: 'continue:' + message.name });
            })
            .catch(fail);
        });
        child.on('error', fail);
        child.on('close', (code) => {
          clearTimeout(timer);
          void pending.then(() => {
            if (failure) reject(failure);
            else if (code !== 0)
              reject(
                new Error(
                  `Combined browser exited ${code}: ${stderr.slice(-2000)}`,
                ),
              );
            else {
              try {
                expect(completed).toEqual(expected);
                resolve();
              } catch (error) {
                reject(error as Error);
              }
            }
          });
        });
      });
    } finally {
      await f.close();
    }
  }, 200000);
});
