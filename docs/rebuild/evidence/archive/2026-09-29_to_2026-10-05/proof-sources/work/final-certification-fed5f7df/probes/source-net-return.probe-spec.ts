/** Read-only presentation integration probe over isolated internal-calendar fixtures.
 * Reaches the unmodified runtime/React drawer. No production grant or external provider. */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { CalendarSource, UserRole } from '/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/maya-controlled-integration/maya-saas-backend/src/common/domain.enums';
import { applyWidgetsLiveEnvironment } from '/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/maya-controlled-integration/maya-saas-backend/test/widgets-live/support/environment';
import { bootFixtureContext } from '/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/maya-controlled-integration/maya-saas-backend/test/widgets-live/support/bootstrap';
import { bootHttp, fixturesForHttp } from '/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/maya-controlled-integration/maya-saas-backend/test/widgets-live/support/http-bootstrap';
const object = (v: unknown): Record<string, unknown> => {
  assert(v !== null && typeof v === 'object' && !Array.isArray(v));
  return v as Record<string, unknown>;
};
async function main() {
  applyWidgetsLiveEnvironment();
  const db = await bootFixtureContext();
  const http = await bootHttp();
  const fx = fixturesForHttp(db, http);
  const observations: unknown[] = [];
  try {
    const baseUrl = await http.listenLoopback();
    for (const mode of ['personal', 'journal'] as const) {
      const tenant = await fx.tenant(
        'Approved source carrier probe',
        CalendarSource.INTERNAL,
      );
      const user = await fx.user(
        tenant,
        mode === 'personal' ? UserRole.CLIENT : UserRole.TENANT_OWNER,
      );
      if (mode === 'personal') await fx.binView().bookingSource(tenant, user);
      for (const feature of [
        'widgets.runtime',
        'ai.consultant',
        'ai.owner',
        'booking',
        'booking.customer_app',
        'crm.integration',
      ] as const)
        await fx.grantFeature(tenant, feature);
      const accessToken = await http.login(
        tenant.slug,
        user.email,
        user.password,
      );
      const initial = await http.executeTool(
        accessToken,
        mode === 'personal'
          ? 'catalog.services.read'
          : 'operations.journal.read',
        {
          arguments: mode === 'personal' ? {} : { date: '2026-09-24' },
          surface: 'web',
        },
        randomUUID(),
      );
      assert.equal(initial.status, 201);
      const envelope = object(
        object(object(initial.body).resolution).receipt,
      ).envelope;
      const observed = await new Promise<unknown>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            path.resolve(
              '/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/final-certification-fed5f7df/probes/source-net-return.mjs',
            ),
          ],
          { stdio: ['pipe', 'pipe', 'pipe'] },
        );
        let stdout = '',
          stderr = '';
        child.stdout.on('data', (v: Buffer) => {
          stdout += v.toString();
        });
        child.stderr.on('data', (v: Buffer) => {
          stderr += v.toString();
        });
        child.once('error', reject);
        child.once('close', (code) =>
          code === 0
            ? resolve(JSON.parse(stdout) as unknown)
            : reject(new Error(`carrier probe ${mode}: ${stderr}`)),
        );
        child.stdin.end(
          JSON.stringify({
            mode,
            baseUrl,
            accessToken,
            login: { business: tenant.slug, email: user.email, password: user.password },
            tenantName: tenant.slug,
            envelope,
          }),
        );
      });
      if (mode === 'personal') {
        const state = await fx.binView().bookingProofState(tenant);
        assert.equal(state.appointments.length, 1);
        if (object(observed).createRescheduleCancel === true) {
          assert.equal(state.appointments[0].status, 'canceled');
          assert.equal(state.executions.length, 3);
        }
      }
      observations.push(observed);
    }
    const out = process.env.GITHUB_SOURCE_PROBE_OUT;
    if (!out) throw new Error('explicit report path required');
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          contract: 'maya.approved-source-carrier-observation/1',
          observations,
        },
        null,
        2,
      ) + '\n',
    );
    assert(
      observations.every(
        (v) =>
          object(v).createRescheduleCancel === true ||
          object(v).roundTripPassed === true,
      ),
      'source carrier integration incomplete; see observation receipt',
    );
  } finally {
    await fx.teardown();
    await http.close();
    await db.close();
  }
}
it(
  'FBE2E canonical live net client with real login and complete source roundtrip',
  main,
  120_000,
);
