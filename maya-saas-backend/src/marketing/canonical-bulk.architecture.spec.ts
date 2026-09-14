import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const backend = resolve(__dirname, '../..'),
  repo = resolve(backend, '..');
const read = (path: string) => readFileSync(resolve(backend, path), 'utf8');
const python = readFileSync(
  resolve(repo, 'ai администратор/webhook_server.py'),
  'utf8',
);
const method = (text: string, name: string, next: string) =>
  text.slice(
    text.indexOf(name),
    text.indexOf(next, text.indexOf(name) + name.length),
  );

describe('B35 permanent canonical bulk boundaries', () => {
  it('executes R07 native retirement, authority and mutated real-body AST closure proof', () => {
    const result = execFileSync(
      'python3',
      ['-m', 'unittest', 'test_package5_wave_rb_r07'],
      {
        cwd: resolve(repo, 'ai администратор'),
        encoding: 'utf8',
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
          R07_SOURCE_ROOT: resolve(repo, 'ai администратор'),
        },
      },
    );
    expect(result).toBe('');
  }, 60000);
  it('panel and retired bot sender cannot perform direct Telegram, Web Push or legacy audience writes', () => {
    const block = method(
      python,
      'async def broadcast_send_to_base(',
      'def _panel_record_seen(',
    );
    expect(block).not.toMatch(
      /send_message|_send_client_push|list_telegram_clients|telegram_chat_id|set_marketing_last_sent|_panel_resolve_role|_panel_auth/,
    );
    expect(block).toContain('B35_CANONICAL_OWNER_APPROVAL_REQUIRED_USE_PANEL');
    expect(block).toContain('asyncio.to_thread(command, mode, proof, payload)');
  });
  it('retired v1 owners cannot admit User-based bulk or perform transport effects', () => {
    for (const [path, begin, end] of [
      [
        'src/marketing/marketing.service.ts',
        '  sendCampaign(',
        '  private async consentCandidates(',
      ],
      [
        'src/communication-delivery/communication-delivery.service.ts',
        '  deliverBulkCampaign(',
        '  async deliverPrivacyTelegram(',
      ],
    ]) {
      const retired = method(read(path), begin, end);
      expect(retired).toContain('B35_CANONICAL_OWNER_REQUIRED');
      expect(retired).not.toMatch(
        /executeWithReceipt|createEnvelope|inboxItem|updateMany|fetch\(/,
      );
    }
  });
  it('HTTP/legacy initiators pass only authenticated proof and intent to the business owner', () => {
    const controller = read('src/marketing/canonical-bulk.controller.ts');
    expect(controller).toContain('bulkOperation');
    expect(controller).toContain('assertBridgeIntegrationBinding');
    expect(controller).toContain('runAsPublicTenant');
    expect(controller).not.toMatch(
      /marketingCampaign\.(create|update)|inboxItem|fetch\(|sendNotification|send_message/,
    );
  });
  it('business approval binds exact immutable intent and enters Action Engine before Communication Delivery', () => {
    const owner = read('src/marketing/canonical-bulk.service.ts');
    expect(owner).toContain('this.manifestHash(graph) !== reviewed');
    expect(owner).toMatch(
      /this\.ingress\.createExecution\(\s*this\.request\(graph\),\s*tx,?\s*\)/,
    );
    expect(owner).toContain('this.engine.decideApproval');
    expect(owner).toContain('this.runtime.completeBulkAdmissionInTransaction');
    expect(owner).toContain('this.delivery.resume(root)');
    expect(owner).not.toMatch(
      /fetch\(|sendNotification|inboxItem\.(create|upsert)|send_message/,
    );
    const module = read('src/marketing/marketing.module.ts');
    expect(module).toContain('exports: [CanonicalBulkService]');
    expect(module).not.toMatch(/\bMarketingService\b/);
  });
  it('only Communication Delivery owns attempts, provider calls and current boundary proof', () => {
    const delivery = read(
      'src/communication-delivery/communication-bulk-delivery.service.ts',
    );
    expect(delivery).toContain('this.kernel.createEnvelope');
    expect(delivery).toContain(
      'this.runtime.completeBulkAdmissionInTransaction',
    );
    expect(delivery).toContain('this.kernel.markBulkDispatchBoundary');
    expect(delivery).toContain('this.policy.current');
    expect(delivery).toContain('this.kernel.finalizeUnknown');
    expect(delivery).toContain('this.kernel.finalizeReconciliation');
    expect(delivery).not.toContain('this.policy.plan(');
  });
  it('schema fences the approved graph and one child/slot; later code cannot loosen them silently', () => {
    const sql = read(
      'prisma/migrations/20260907120000_b35_canonical_bulk_foundation/migration.sql',
    );
    for (const guard of [
      'B35_audience_client_key',
      'B35_bulk_client_key',
      'B35_recipient_slot_key',
      'B35_campaign_identity_guard',
      'B35_recipient_identity_guard',
      'B35_attempt_guard',
      'B35_outcome_guard',
      'B35_admission_graph',
    ])
      expect(sql).toContain(guard);
    expect(sql).toContain('B35 confirmed member set immutable');
    expect(sql).toContain('B35 UNKNOWN requires proven reconciliation');
    expect(sql).toContain('B35 terminal outcome cannot reopen or change');
    const later = readdirSync(resolve(backend, 'prisma/migrations')).filter(
      (name) =>
        name > '20260907120000_b35_canonical_bulk_foundation' &&
        !name.endsWith('.toml'),
    );
    for (const migration of later)
      expect(
        readFileSync(
          join(backend, 'prisma/migrations', migration, 'migration.sql'),
          'utf8',
        ),
      ).not.toMatch(/DROP (?:CONSTRAINT|TRIGGER|INDEX).*B35/i);
  });
  it('audience and owner approval never replace consent; dispatch remains Client-based', () => {
    const policy = read(
      'src/communication-delivery/communication-bulk-policy.service.ts',
    );
    expect(policy).toMatch(
      /effectiveClientConsent\(\s*tx,\s*tenantId,\s*clientId,/,
    );
    const resolver = read('src/crm/client-effective-consent.ts');
    expect(resolver).toContain('clientConsentFact.findMany');
    expect(resolver).toContain('!head.invalidation');
    expect(policy).toContain(
      "if (!consent.effective) return deny('CONSENT_NOT_GRANTED')",
    );
    expect(policy).toContain('overrides.marketing === false');
    expect(policy).toContain('canonicalHistoryStartedAt');
    expect(policy).toContain('FREQUENCY_HISTORY_UNAVAILABLE');
    expect(policy).not.toMatch(
      /recipientUserIdsJson|has_marketing_consent|list_telegram_clients|phoneHash/,
    );
  });
  it('UNKNOWN cannot force all pending sibling claims to stop or initiate cross-channel retry', () => {
    const kernel = read(
      'src/communication-delivery/communication-delivery.kernel.ts',
    );
    expect(kernel).toMatch(
      /parentRecipientId.*IS NOT NULL.*aggregateState.*UNRESOLVED/,
    );
    expect(kernel).toMatch(
      /parentRecipientId.*IS NULL OR e\."state" = 'SUCCEEDED'/,
    );
    const delivery = read(
      'src/communication-delivery/communication-bulk-delivery.service.ts',
    );
    expect(delivery).toContain("row.deliveryState === 'UNKNOWN'");
    expect(delivery).toContain("dependency === 'WAIT'");
    expect(delivery).not.toMatch(/fallback|reselectRoute|policy\.plan\(/);
  });
  it('panel preserves original campaign/hash on retry; proxy forwards only canonical owner proof', () => {
    const html = readFileSync(
      resolve(repo, 'сайт и приложение/app.html'),
      'utf8',
    );
    const block = method(
      html,
      '  function bcPersist(',
      '  // Извлекает код сертификата',
    );
    expect(block).toContain("draft.confirmed ? 'resume' : 'confirm'");
    expect(block).toContain('intentHash: draft.intentHash');
    expect(block).toContain('campaignId: draft.campaignId');
    expect(block).not.toContain("mode: 'send'");
    const proxy = read('deploy/vps/package5-b35-bulk-proxy.php');
    expect(proxy).toContain('HTTP_AUTHORIZATION');
    expect(proxy).not.toMatch(
      /telegram_chat_id|session_token|auth_data|X-Telegram-InitData/,
    );
  });
});
