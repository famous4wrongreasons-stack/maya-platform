/** One approved security incident initiator. All domain writes stay in A18.
 * Run only from a prepared release while the old public unit is stopped. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { AuthSessionService } from '../src/auth/auth-session.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import type { AuthenticatedUser } from '../src/common/authenticated-user.interface';
import { ActionEngineKernel } from '../src/action-engine';
import { ActionIdentityService } from '../src/action-engine/action-engine.identity';
import {
  normalizeSecurityCommand,
  CONSENT_SECURITY_INCIDENT,
  consentSecurityHash,
} from '../src/action-engine/consent-security-invalidation.contract';
import { ConsentSecurityInvalidationService } from '../src/package5-wave3/consent-security-invalidation.service';

async function main() {
  assert.deepEqual(process.argv.slice(2, 3), ['--execute-approved-fdecfbb4']);
  assert.equal(
    process.argv.length,
    4,
    'Exact encrypted evidence path required',
  );
  const root = realpathSync(process.cwd());
  assert(
    root.startsWith('/opt/maya-saas/releases/'),
    'Prepared production release required',
  );
  const status = spawnSync('systemctl', ['is-active', 'maya-saas'], {
    encoding: 'utf8',
  });
  assert.equal(status.status, 3);
  assert.equal(
    status.stdout.trim(),
    'inactive',
    'Old public runtime must be stopped',
  );
  const evidenceFile = realpathSync(process.argv[3]);
  assert(evidenceFile.startsWith('/opt/maya-saas/incident-evidence/'));
  assert.equal(
    statSync(evidenceFile).mode & 0o077,
    0,
    'Private evidence permissions required',
  );
  const current = realpathSync('/opt/maya-saas/current');
  assert.notEqual(
    root,
    current,
    'Correction uses the prepared release before public cutover',
  );
  // Process-local overrides only: no jobs, provider work, listeners or messages.
  for (const name of [
    'OWNER_REPORTS_SCHEDULER_ENABLED',
    'BILLING_SCHEDULER_ENABLED',
    'APPOINTMENT_REMINDERS_SCHEDULER_ENABLED',
    'INGESTION_QUARANTINE_RETENTION_ENABLED',
    'CRM_RECONCILIATION_SCHEDULER_ENABLED',
  ])
    process.env[name] = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  let actor: AuthenticatedUser | undefined;
  try {
    const config = app.get(ConfigService);
    const identity = new ActionIdentityService(
      config.get<string>('ACTION_ENGINE_IDENTITY_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
      config.get<string>('ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET') ??
        config.getOrThrow<string>('CRM_ENCRYPTION_KEY'),
    );
    const protectedSnapshot = JSON.parse(
      identity.decryptNormalizedPayload(
        readFileSync(evidenceFile, 'utf8').trim(),
      ),
    ) as {
      contract: string;
      command: unknown;
      backupFile: string;
      backupSha256: string;
    };
    assert.equal(
      protectedSnapshot.contract,
      'maya.a18.security-prestate-snapshot/1',
    );
    const command = normalizeSecurityCommand(protectedSnapshot.command);
    assert.equal(command.incidentId, CONSENT_SECURITY_INCIDENT);
    assert(
      protectedSnapshot.backupFile.startsWith(
        '/opt/maya-saas/incident-evidence/',
      ),
    );
    assert.equal(statSync(protectedSnapshot.backupFile).mode & 0o077, 0);
    assert.equal(
      execFileSync('sha256sum', [protectedSnapshot.backupFile], {
        encoding: 'utf8',
      }).split(' ')[0],
      protectedSnapshot.backupSha256,
    );
    // Authenticate with the existing configured platform credential through the
    // ordinary auth owner; never choose a User/session row or mint a JWT here.
    const login = await app.get(AuthService).login(
      {
        email: config.getOrThrow<string>('SEED_PLATFORM_OWNER_EMAIL'),
        password: config.getOrThrow<string>('SEED_PLATFORM_OWNER_PASSWORD'),
      },
      { userAgent: 'Maya canonical A18 consent security correction' },
    );
    const payload = new JwtService().verify<
      Parameters<JwtStrategy['validate']>[0]
    >(login.access_token, {
      secret: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
    actor = await app.get(JwtStrategy).validate(payload);
    const owner = app.get(ConsentSecurityInvalidationService);
    const execution = await owner.admit(actor, command);
    const input = await app
      .get(ActionEngineKernel)
      .readTrustedNormalizedInput(command.tenantId, execution.id);
    const receiptFile = resolve(evidenceFile + '.admission');
    const admittedEvidence = {
      contract: 'maya.a18.security-admission-snapshot/1',
      actionExecutionId: execution.id,
      input,
      originalSnapshotHash: consentSecurityHash(protectedSnapshot),
    };
    try {
      writeFileSync(
        receiptFile,
        identity.encryptNormalizedPayload(JSON.stringify(admittedEvidence)),
        { mode: 0o600, flag: 'wx' },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const previous = JSON.parse(
        identity.decryptNormalizedPayload(readFileSync(receiptFile, 'utf8')),
      ) as unknown;
      assert.equal(
        consentSecurityHash(previous),
        consentSecurityHash(admittedEvidence),
        'Admission snapshot cannot be overwritten',
      );
    }
    await owner.execute(actor, execution.id, command.tenantId);
    console.log(
      JSON.stringify({
        status: 'PASS',
        incident: CONSENT_SECURITY_INCIDENT,
        executionFingerprint: consentSecurityHash(execution.id),
        outcome: 'one link revoked and two exact grants invalidated',
        providerEffects: 0,
        messages: 0,
        historicalRewrites: 0,
      }),
    );
  } finally {
    try {
      if (actor) await app.get(AuthSessionService).logout(actor);
    } finally {
      await app.close();
    }
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.name : 'SecurityCorrectionFailed',
  );
  process.exitCode = 1;
});
