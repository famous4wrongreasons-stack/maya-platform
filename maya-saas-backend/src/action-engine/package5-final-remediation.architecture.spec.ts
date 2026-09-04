import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const backend = (file: string) => read(`maya-saas-backend/src/${file}`);
function pythonFunction(source: string, name: string) {
  const match = source.match(
    new RegExp(
      `(?:^|\\n)(?:async )?def ${name}\\([\\s\\S]*?(?=\\n(?:async )?def |$)`,
    ),
  );
  if (!match) throw new Error(`Missing production function ${name}`);
  return match[0];
}
const directBusinessWrite =
  /\b(?:this\.)?(?:prisma|tx)\.(?:tenant|brandingSettings|internalProvider|internalService|internalAvailability|crmStaffAccess|staffProviderLink|staff)\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/;
const pythonConsentWrite =
  /(?:INSERT\s+INTO\s+["']?consents|UPDATE\s+["']?clients\s+SET\s+marketing_consent|(?:database\.)?(?:save_consent|set_marketing_consent)\s*\()/i;

function assertConsentInitiator(source: string) {
  if (
    pythonConsentWrite.test(source) ||
    /get_or_create_client|_authed_chat_id/.test(source) ||
    !source.includes('client_commands.channel_proof') ||
    !source.includes('client_commands.command')
  )
    throw new Error(
      'Consent must cross authenticated channel and canonical Client boundary',
    );
}
function assertCanonicalInitiator(source: string, required: string) {
  if (
    !source.includes(required) ||
    directBusinessWrite.test(source) ||
    /(?:tenantsService\.createTenant|deleteFailedTrialTenant|releaseCompletedTenant|provisionCrmTeamAccess|bootstrapCreateProvider|bootstrapCreateService)/.test(
      source,
    )
  )
    throw new Error('Direct/legacy business owner in production initiator');
}

describe('Package 5 final A18/A26/AI production bypass protection', () => {
  const python = read('ai администратор/webhook_server.py');
  const ai = backend('onboarding/ai-onboarding.service.ts');
  const coordinator = backend(
    'onboarding/ai-confirmation-coordinator.service.ts',
  );
  const trial = backend('onboarding/canonical-trial-onboarding.service.ts');
  const admin = backend('admin/admin.service.ts');

  it('keeps consent submit behind original channel verification and canonical command', () => {
    assertConsentInitiator(pythonFunction(python, 'consent_submit_handler'));
    expect(pythonFunction(python, 'consent_submit_handler')).toContain(
      'idempotencyKey',
    );
    expect(pythonFunction(python, 'client_link_consume_handler')).toContain(
      'client_commands.channel_proof',
    );
  });
  it('detects reintroduced SQL consent writers, phone resolution and legacy writer calls', () => {
    const source = pythonFunction(python, 'consent_submit_handler');
    for (const mutation of [
      'conn.execute("INSERT INTO consents VALUES (...) ")',
      'conn.execute("UPDATE clients SET marketing_consent_at = now()")',
      'database.save_consent(client_id, True)',
      'database.get_or_create_client(chat_id)',
    ])
      expect(() =>
        assertConsentInitiator(`${source}\n    ${mutation}`),
      ).toThrow();
    expect(() =>
      assertConsentInitiator(
        source.replace(
          'client_commands.channel_proof',
          'heuristic_client_resolution',
        ),
      ),
    ).toThrow();
  });
  it('keeps historical SQL consent writers closed and live readers canonical', () => {
    const database = read('ai администратор/database.py');
    for (const name of ['save_consent', 'set_marketing_consent']) {
      const fn = pythonFunction(database, name);
      expect(fn).toContain(
        'raise RuntimeError("canonical_client_consent_required")',
      );
      expect(fn).not.toMatch(/\.execute\(|INSERT\s+INTO|UPDATE\s+clients/);
    }
    for (const name of [
      'consent_gate_status',
      'has_valid_consent_by_chat_id',
      'has_marketing_consent_by_chat_id',
    ])
      expect(pythonFunction(database, name)).toContain('delivery_consent');
    expect(read('ai администратор/bot.py')).not.toMatch(
      /database\.(?:save_consent|set_marketing_consent)\(/,
    );
    const status = pythonFunction(python, 'consent_status_handler');
    expect(status).not.toMatch(
      /\.submitConsent|save_consent|set_marketing_consent|get_or_create_client/,
    );
  });
  it('keeps trial/admin and AI under their approved canonical owners', () => {
    assertCanonicalInitiator(trial, 'this.bootstrapper.activate');
    assertCanonicalInitiator(admin, 'this.canonicalTrial.activate');
    assertCanonicalInitiator(ai, 'this.confirmation.confirm');
    assertCanonicalInitiator(coordinator, 'this.canonical.execute');
    expect(coordinator).toContain('this.receipts.claim');
    expect(coordinator).toContain('this.receipts.bootstrap');
    expect(coordinator).toContain('this.receipts.readWithOwner');
  });
  it('still rejects direct admin creation, tenant compensation and direct A28 writes', () => {
    for (const site of [
      'await this.prisma.tenant.create({})',
      'await tx.tenant.delete({})',
      'await this.tenantsService.createTenant(dto)',
      'await this.prisma.internalProvider.update({})',
    ])
      expect(() =>
        assertCanonicalInitiator(
          `${coordinator}\n${site}`,
          'this.canonical.execute',
        ),
      ).toThrow();
    expect(() =>
      assertCanonicalInitiator(
        `${ai}\nthis.usersService.provisionCrmTeamAccess(data)`,
        'this.confirmation.confirm',
      ),
    ).toThrow();
  });
  it('requires a real durable CRM prerequisite and keeps completed child outcomes', () => {
    expect(coordinator).toContain("'waiting_for_crm'");
    expect(coordinator).toContain("'confirm_crm_import'");
    expect(coordinator).toContain('readTrustedNormalizedInput');
    expect(coordinator).toContain('acceptedImportSnapshotHash');
    expect(coordinator).toContain('tenantId_provider_externalId');
    expect(coordinator).toContain('staffId_tenantId');
    expect(coordinator).toContain('successful.has(child.key)');
    expect(coordinator).not.toMatch(
      /ensureBootstrapMockIntegration|provisionCrmTeamAccess|releaseCompletedTenant|\.confirmationReceiptJson\s*=/,
    );
  });
  it('requires revision CAS on every editable production draft writer', () => {
    expect(
      ai.match(/revision: draft\.revision,\s*status: 'draft'/g),
    ).toHaveLength(2);
    expect(ai.match(/revision: \{ increment: 1 \}/g)).toHaveLength(2);
    const dto = backend('onboarding/dto/ai-onboarding.dto.ts');
    expect(dto).toContain('expectedDraftRevision!: number');
    expect(
      read('maya-os-site/index.html').match(/expectedDraftRevision:/g),
    ).toHaveLength(2);
  });
  it('keeps system delivery reading separate from consent mutation authority', () => {
    const controller = backend('crm/client-channel.controller.ts');
    expect(controller).toContain('assertBridgeSecret');
    expect(controller).toContain('assertBridgeIntegrationBinding');
    expect(controller).toContain('resolveTenantByIntegration');
    const runtime = backend('crm/client-channel-runtime.service.ts');
    const reader = runtime.slice(
      runtime.indexOf('async telegramDeliveryConsent'),
    );
    expect(reader).toContain('clientChannelSubjectHash');
    expect(reader).not.toMatch(
      /\.(?:create|update|upsert|delete|submitConsent|issue|consume)\(/,
    );
  });
});
