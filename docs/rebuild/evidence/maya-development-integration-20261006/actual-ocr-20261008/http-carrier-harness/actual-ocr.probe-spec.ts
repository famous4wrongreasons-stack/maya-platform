/** PREPARED, NOT EXECUTED. Actual AppModule/auth/PG and configured production OCR.
 * Synthetic images/integration metadata only; no parser, Vision or row mocks.
 * No goods search/detail, review, approval, provider request or AE is admitted. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, accessSync, constants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { bootFixtureContext, type FixtureContext } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/bootstrap';
import { bootHttp, fixturesForHttp, type HttpHarness } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/http-bootstrap';
import { assertProofDatabase } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/proof-db-guard';
import { CalendarSource, CrmProvider, UserRole } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/common/domain.enums';
import { GoodsPhotoParser } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/ai-tools/goods-photo-parser.service';
import { AiCoreModelService } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/ai-tools/ai-core-model.service';

const ROOT = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const SCRATCH = '/tmp/maya-actual-ocr-20261008';
const HARNESS = path.join(SCRATCH, 'http-carrier-harness');
const outputRaw = process.env.JEST_ACTUAL_OCR_OUTPUT;
const nativeProof = process.env.JEST_ACTUAL_OCR_NATIVE_PROOF;
const browserMode = process.env.JEST_ACTUAL_OCR_BROWSER === '1';
assertProofDatabase();
assert.ok(outputRaw && path.isAbsolute(outputRaw) && outputRaw.startsWith(SCRATCH + '/'));
const output: string = outputRaw;
assert.ok(nativeProof && path.isAbsolute(nativeProof) && nativeProof.startsWith(SCRATCH + '/'));
assert.equal(process.platform, 'darwin');
assert.equal(process.cwd(), path.join(ROOT, 'maya-saas-backend'));
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const qualified = json(nativeProof);
assert.equal(qualified.status, 'passed', 'Native synthetic OCR proof must pass first; no UI workaround');
assert.equal(qualified.dynamicPixelsChangeWordsAndRows, true);
assert.equal(qualified.scriptedOcr, false);
assert.equal(qualified.stubbedOcr, false);
const baselineHashes = json(path.join(path.dirname(nativeProof), 'source-hashes.json'));
for (const [file, digest] of Object.entries(baselineHashes)) assert.equal(hash(readFileSync(file)), digest, 'Native proof/source changed: ' + file);
const imagePaths = Object.fromEntries(['russian', 'changed', 'blank'].map(name => {
  const fixture = qualified.fixtures[name];
  assert.equal(fixture.synthetic, true);
  assert.ok(path.isAbsolute(fixture.path) && fixture.path.startsWith(SCRATCH + '/'));
  assert.equal(hash(readFileSync(fixture.path)), fixture.sha256);
  return [name, String(fixture.path)];
}));
const expected = Object.fromEntries(['russian', 'changed'].map(name => [name, qualified.cases[name].recognizedRows as Record<string, unknown>[]]));
assert.notDeepEqual(expected.russian, expected.changed);
const MALFORMED = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
const names = ['opened', 'uploaded', 'changed', 'blank', 'malformed', 'revoked'];

describe('actual local OCR upload-only HTTP/current React proof [SYNTHETIC IMAGES]', () => {
  let db: FixtureContext, http: HttpHarness, tenantId: string, ownerId: string, runtimeMark = 0;
  let baseline: unknown;
  const forbidden: string[] = [], checkpoints: string[] = [];
  const report: Record<string, unknown> = {
    contract: 'maya.actual-ocr-http-preview-proof/1', status: 'running',
    parser: 'ACTUAL_CONFIGURED_GOODS_PHOTO_PARSER_NO_SPY', images: 'SYNTHETIC_PIXELS',
    integration: 'SYNTHETIC_ACTIVE_METADATA_NOT_A17_ACCEPTANCE',
    nativeProofSha256: hash(readFileSync(nativeProof)),
    currentReactAcceptance: false, realDocumentAcceptance: false,
    deploymentAcceptance: false, restartClaim: false,
  };
  beforeAll(async () => {
    accessSync(path.join(ROOT, 'maya-saas-backend/dist/ocr/goods-photo-vision'), constants.X_OK);
    assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined, 'No real credential inherited');
    process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_PREVIEW_ONLY_PARTNER';
    db = await bootFixtureContext(); http = await bootHttp();
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true'); config.set('EMAIL_AUTH_PROVIDER', 'debug');
    config.set('GOODS_PHOTO_OCR_PROVIDER', 'apple_vision');
    const parser = http.app.get(GoodsPhotoParser);
    expect(parser).toBeInstanceOf(GoodsPhotoParser);
    expect(jest.isMockFunction(parser.parse)).toBe(false);
    expect(parser.parse).toBe(GoodsPhotoParser.prototype.parse);
    expect(jest.isMockFunction(spawn)).toBe(false);
    jest.spyOn(http.app.get(AiCoreModelService), 'decide').mockImplementation(() => { forbidden.push('model'); throw new Error('No model in upload-only proof'); });
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => { forbidden.push('provider_or_external_fetch'); throw new Error('No provider or external fetch in upload-only proof'); });
  });
  afterAll(async () => {
    if (report.status === 'running') report.status = 'failed';
    Object.assign(report, { checkpoints, forbidden, blockedProviderOrExternalFetchAttempts: forbidden.filter(value => value === 'provider_or_external_fetch').length, blockedModelAttempts: forbidden.filter(value => value === 'model').length, qualification: 'LOCAL_SYNTHETIC_IMAGES_ONLY_NO_GENERAL_INVOICE_ACCEPTANCE' });
    writeFileSync(path.join(output, 'actual-ocr-http.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    jest.restoreAllMocks(); delete process.env.YCLIENTS_PARTNER_TOKEN;
    await http?.close(); await db?.close();
  });
  async function counts() {
    return {
      actions: await db.prisma.actionExecution.count({ where: { tenantId } }),
      approvals: await db.prisma.aiApprovalRequest.count({ where: { tenantId } }),
      reads: await db.prisma.c9WorkReceipt.count({ where: { tenantId } }),
      attachments: await db.prisma.teamAttachment.count({ where: { tenantId } }),
      messages: await db.prisma.teamMessage.count({ where: { tenantId } }),
      deliveries: await db.prisma.marketingDeliveryAttempt.count({ where: { tenantId } }),
    };
  }
  async function checkpoint(name: string, body?: unknown) {
    expect(forbidden).toEqual([]); expect(await counts()).toEqual(baseline);
    const families = 'ActionExecution|AiApprovalRequest|C9WorkReceipt|Appointment|Opportunity|AgentTask|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalWorkItem|OperationalAlert|ExpenseReminder|Client|Loyalty|Bonus|Inventory';
    expect(http.recorder.since(runtimeMark).filter(op => op.write && (op.model ? new RegExp('^(' + families + ')').test(op.model) : new RegExp('\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"?(?:' + families + ')', 'i').test(op.sql ?? '')))).toEqual([]);
    checkpoints.push(name);
    report[name] = { body, noBusinessWrites: true, noC9ReadOrApproval: true };
  }
  function validPreview(body: any, name: 'russian' | 'changed') {
    expect(body).toMatchObject({ contract: 'maya.goods-photo.preview/1', recognition_acceptance: 'NOT_ACCEPTED', review_required: true, original_stored: false, persistent_draft: false });
    expect(body.photo_sha256).toBe(hash(readFileSync(imagePaths[name])));
    expect(body.source_revision).toMatch(/^[a-f0-9]{64}$/);
    expect(body.lines).toEqual(expected[name].map((row, index) => ({
      source_line: index + 1, name: row.name, quantity: row.quantity, unit_label: row.unit_label,
      unit_price: row.unit_price, line_total: row.line_total, price_kind: row.price_kind,
      parser_confidence: row.confidence, review_required: true,
    })));
  }
  async function revoke() {
    await db.prisma.membership.update({ where: { userId_tenantId: { userId: ownerId, tenantId } }, data: { status: 'suspended' } });
  }
  async function browser(email: string) {
    const malformedPath = path.join(output, 'synthetic-malformed.png');
    writeFileSync(malformedPath, MALFORMED, { flag: 'wx', mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(HARNESS, 'actual-ocr-browser.mjs')], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      let pending = Promise.resolve(), failure: Error | undefined, stderr = '', killTimer: ReturnType<typeof setTimeout> | undefined;
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error)); child.kill('SIGTERM');
        killTimer ??= setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 5000);
      };
      const timer = setTimeout(() => fail(new Error('Bounded upload-only browser timeout')), 180000);
      child.stderr!.on('data', (bytes: Buffer) => { stderr = (stderr + bytes.toString()).slice(-2000); });
      child.on('message', (message: any) => {
        pending = pending.then(async () => {
          if (message.type === 'ready') { child.send({ type: 'start', backendOrigin: await http.listenLoopback(), output, email, imagePaths: { ...imagePaths, malformed: malformedPath }, expected }); return; }
          expect(message.type).toBe('checkpoint'); expect(message.name).toBe(names[checkpoints.length]);
          if (message.name === 'uploaded') validPreview(message.body, 'russian');
          if (message.name === 'changed') validPreview(message.body, 'changed');
          if (message.name === 'blank') { expect(message.status).toBe(400); expect(message.body.message).toBe('goods_photo_ocr_table_unsupported'); }
          if (message.name === 'malformed') { expect(message.status).toBe(400); expect(message.body.message).toBe('goods_photo_image_invalid'); }
          if (message.name === 'revoked') { expect([401, 403]).toContain(message.status); expect(message.body.lines).toBeUndefined(); }
          await checkpoint(message.name, message.body);
          if (message.name === 'malformed') await revoke();
          child.send({ type: 'continue:' + message.name });
        }).catch(fail);
      });
      child.once('error', fail);
      child.once('close', code => { clearTimeout(timer); clearTimeout(killTimer); void pending.then(() => failure ? reject(failure) : code === 0 ? resolve() : reject(new Error('Browser exited ' + code + ': ' + stderr))); });
    });
    expect(checkpoints).toEqual(names);
  }
  it('exposes actual provisional image rows and bounded errors, without starting a business workflow', async () => {
    const fx = fixturesForHttp(db, http), tenant = await fx.tenant('Actual OCR synthetic', CalendarSource.EXTERNAL), owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    tenantId = tenant.id; ownerId = owner.id;
    for (const feature of ['ai.owner', 'ai.admin', 'ai.consultant', 'widgets.runtime', 'commerce.store', 'crm.integration'] as const) await fx.grantFeature(tenant, feature);
    await db.prisma.crmIntegration.create({ data: { tenantId, provider: CrmProvider.YCLIENTS, status: 'active', encryptedApiToken: db.encryption.encrypt('SYNTHETIC_PREVIEW_ONLY_USER'), baseUrl: 'http://127.0.0.1:65517/api/v1', settingsJson: { companyId: '427101', currency: 'RUB' } } });
    baseline = await counts(); runtimeMark = http.recorder.mark();
    if (browserMode) { await browser(owner.email); report.currentReactAcceptance = true; }
    else {
      const token = await http.login(tenant.slug, owner.email, owner.password);
      const upload = (bytes: Buffer) => request(http.app.getHttpServer()).post('/api/ai/goods/photo-preview').set('Authorization', 'Bearer ' + token).attach('photo', bytes, { filename: 'synthetic-invoice.png', contentType: 'image/png' });
      await checkpoint('opened');
      for (const name of ['russian', 'changed'] as const) {
        const result = await upload(readFileSync(imagePaths[name])); expect(result.status).toBe(201); validPreview(result.body, name); await checkpoint(name === 'russian' ? 'uploaded' : 'changed', result.body);
      }
      const blank = await upload(readFileSync(imagePaths.blank)); expect(blank.status).toBe(400); expect(blank.body.message).toBe('goods_photo_ocr_table_unsupported'); await checkpoint('blank', blank.body);
      const malformed = await upload(MALFORMED); expect(malformed.status).toBe(400); expect(malformed.body.message).toBe('goods_photo_image_invalid'); await checkpoint('malformed', malformed.body);
      await revoke();
      const revoked = await upload(readFileSync(imagePaths.russian)); expect([401, 403]).toContain(revoked.status); expect(revoked.body.lines).toBeUndefined(); await checkpoint('revoked', revoked.body);
    }
    for (const [file, digest] of Object.entries(baselineHashes)) expect(hash(readFileSync(file))).toBe(digest);
    report.status = 'passed';
  }, 240000);
});
