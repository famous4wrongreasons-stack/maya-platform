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
      const typedWidgetText = mode === 'journal' ? (await db.prisma.widgetIntentRecord.findFirstOrThrow({where:{tenantId:tenant.id,widgetId:String(object(envelope).widget_id),effect:'CONTROL'}})).utteranceTemplate : null;
      const observed = await new Promise<unknown>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            path.resolve(
              '/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/final-fbe2e-decisions-20261002/probes/source-net-turn.mjs',
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
            typedWidgetText,
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
      if (mode === 'journal') {
        const proof = object(object(observed).typedTurnProof);
        const rows = proof.rows as Array<Record<string, unknown>>;
        assert.equal(rows.length, 2);
        const dbProof: unknown[] = [];
        for (const view of rows) {
          const ref = object(view.userTurn);
          const stored = await db.prisma.widgetTimelineTurn.findUniqueOrThrow({where:{id:String(ref.turnId)}});
          assert.equal(stored.tenantId, tenant.id);
          assert.equal(stored.conversationId, ref.conversationId);
          assert.equal(stored.role,'user'); assert.equal(stored.textContent,view.text);
          const binds = await db.prisma.auditLog.findMany({where:{tenantId:tenant.id,action:'chat.user_turn_bound',entityId:String(ref.turnId)}});
          assert.equal(binds.length,1); assert.equal(binds[0].userId,user.id);
          dbProof.push({turnId:stored.id,conversationId:stored.conversationId,canonicalRows:1,bindingAudits:1,actualActor:true});
        }
        assert.notEqual(object(rows[0].userTurn).turnId,object(rows[1].userTurn).turnId);
        assert.equal(object(rows[0].userTurn).conversationId,object(rows[1].userTurn).conversationId);
        object(observed).persistedTurnProof=dbProof;
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
  'FBE2E actual net + NS-1 + canonical persisted typed-widget and ordinary identities',
  main,
  120_000,
);
