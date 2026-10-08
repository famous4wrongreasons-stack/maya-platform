/** Prepared, not executed. Actual HTTP/PG/C9 with DI synthetic extraction,
 * native search/item finite fetch and a separately qualified receipt stub.
 * Nothing here is OCR, A17, real-provider or current-React acceptance. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { bootFixtureContext, type FixtureContext } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/bootstrap';
import { bootHttp, fixturesForHttp, type HttpHarness } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/http-bootstrap';
import { assertProofDatabase } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/proof-db-guard';
import { object } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/test/widgets-live/support/release-booking-flow';
import { CalendarSource, CrmProvider, UserRole } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/common/domain.enums';
import { GoodsPhotoParser } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/ai-tools/goods-photo.service';
import { AiCoreModelService } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/ai-tools/ai-core-model.service';
import { CrmAdapterFactory } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/crm/adapters/yclients-crm.adapter';
import { observedGoodsItem } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/crm/yclients-goods-read';
import { GOODS_RECEIPT_CAPABILITY, GOODS_RECEIPT_TOOL, type GoodsReceiptResult } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/src/crm/goods-receipt.contract';
const output = process.env.JEST_GOODS_PHOTO_OUTPUT;
assert.ok(output && path.isAbsolute(output), 'Owned proof output required');
assertProofDatabase();
const approveSynthetic = process.env.JEST_GOODS_PHOTO_SYNTHETIC_APPROVE === '1';
const COMPANY = '427101', ORIGIN = 'http://127.0.0.1:65517', TOKEN = 'SYNTHETIC_GOODS_PHOTO_USER';
const PNG = readFileSync('/tmp/maya-goods-photo-20261008/main.png');
const imagePaths = Object.fromEntries(['main','cancel','unknown'].map(key => [key, '/tmp/maya-goods-photo-20261008/'+key+'.png']));
const hashes = new Map(Object.entries(imagePaths).map(([key,file]) => [createHash('sha256').update(readFileSync(file)).digest('hex'),key]));
const browserMode = process.env.JEST_GOODS_PHOTO_BROWSER === '1';
const PHOTO_HASH = createHash('sha256').update(PNG).digest('hex');
const NAME = 'Синтетический шампунь PHOTO_ITEM_SOURCE';
const GOODS = [{ good_id: '123', title: NAME, cost: '100', actual_cost: '40', unit_actual_cost: '4', unit_id: '11', service_unit_id: '22', unit_short_title: 'флакон', service_unit_short_title: 'мл', unit_equals: '10', loyalty_abonement_type_id: 0, loyalty_certificate_type_id: 0, actual_amounts: [{ storage_id: '9', amount: '1.250' }] }];
const RAW_LINES = [
  { name: 'Шампунь из накладной', quantity: '2.5', unit_label: 'флакон', unit_price: '300', line_total: '750', price_kind: null, confidence: 0.2, raw_ocr: 'PRIVATE_RAW_DOCUMENT', supplier: 'PRIVATE_SUPPLIER' },
  { name: 'Другой товар из накладной', quantity: '1', unit_label: 'штука', unit_price: '100', line_total: '100', price_kind: 'sale_unit', confidence: 0.6, raw_ocr: 'PRIVATE_RAW_DOCUMENT' },
];
const proposal = (version: number, cost = '10.25') => ({ goods_id: '123', store_id: '9', quantity: '2.5', unit_id: '11', unit_cost: cost, currency: 'RUB', price_kind: 'receipt_purchase_unit', received_at: '2026-10-08T09:00:00Z', photo_sha256: PHOTO_HASH, source_line: 1, review_version: version });

describe('Photo HTTP preparation [SYNTHETIC PARSER AND RECEIPT PORT]', () => {
  let db: FixtureContext, http: HttpHarness, tenantId: string, ownerId: string;
  let parserCalls = 0, contextReads = 0, phase = 'setup', expectedEffects = 0, runtimeMark = 0;
  let parserBytes: Uint8Array | undefined, duringParse: (() => Promise<void>) | undefined;
  const gets: string[] = [], forbidden: string[] = [], checkpoints: string[] = [];
  const syntheticEffects: Record<string, unknown>[] = [];
  const report: Record<string, unknown> = { contract: 'maya.goods-photo-http-proof/1', status: 'running', parser: 'DI_SYNTHETIC_NOT_OCR_ACCEPTANCE', provider: 'ACTUAL_FACTORY_NATIVE_SEARCH_ITEM_WITH_FINITE_SYNTHETIC_FETCH', receiptContextAndDispatch: 'EXPLICIT_SYNTHETIC_QUALIFIED_PORT', syntheticApproveEnabled: approveSynthetic, setup: 'SYNTHETIC_ACTIVE_INTEGRATION_ROW', a17Acceptance: false, realProviderAcceptance: false, realModelAcceptance: false, currentReactAcceptance: false, restartClaim: false };
  beforeAll(async () => {
    db = await bootFixtureContext(); http = await bootHttp();
    http.app.get(ConfigService).set('EMAIL_LOGIN_ENABLED','true');
    http.app.get(ConfigService).set('EMAIL_AUTH_PROVIDER','debug');
    if (process.env.YCLIENTS_PARTNER_TOKEN !== undefined) throw new Error('Absent real credential required');
    jest.spyOn(http.app.get(AiCoreModelService), 'decide').mockImplementation(() => { forbidden.push('model'); throw new Error('No model in structured gestures'); });
    const factory = http.app.get(CrmAdapterFactory), original = factory.create.bind(factory);
    jest.spyOn(factory, 'create').mockImplementation((provider, config) => {
      expect(provider).toBe(CrmProvider.YCLIENTS); expect(config.apiToken).toBe(TOKEN); expect(config.baseUrl).toBe(ORIGIN + '/api/v1');
      process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_GOODS_PHOTO_PARTNER';
      try {
        const adapter = original(provider, config); expect(adapter).toBeInstanceOf(YclientsCRMAdapter);
        const native = adapter as YclientsCRMAdapter;
        jest.spyOn(native, 'readGoodsReceiptContext').mockImplementation((tenant, good, store) => {
          expect(tenant).toBe(tenantId); expect(['123','124']).toContain(good); expect(store).toBe('9');
          expect(['review', 'reject', 'correction', 'approve']).toContain(phase); contextReads++;
          return Promise.resolve({ goods: observedGoodsItem(GOODS.map(row=>({...row,good_id:good,title:good==='123'?NAME:'Другой товар PHOTO_SECOND_SOURCE'})), good, COMPANY, 'RUB'), store: { id: '9', name: 'Синтетический склад', company_id: COMPANY }, can_receive: true });
        });
        jest.spyOn(native, 'createGoodsReceipt').mockImplementation(async (_tenant, args, deadline, beforeDispatch) => {
          expect(deadline).toBeGreaterThan(Date.now()); await beforeDispatch();
          if (!approveSynthetic || phase !== 'approve') { forbidden.push('unauthorized_dispatch'); throw new Error('Synthetic dispatch requires explicit approval phase'); }
          expect(_tenant).toBe(tenantId); syntheticEffects.push(structuredClone(args));
          expect(syntheticEffects).toHaveLength(1);
          const observed = Object.fromEntries(['company_id', 'goods_id', 'store_id', 'quantity', 'unit_id', 'unit_cost', 'line_total', 'currency', 'received_at'].map(k => [k, args[k]])) as GoodsReceiptResult['observed'];
          return Promise.resolve({ receipt_id: 'synthetic-photo-receipt-1', observed });
        });
        return adapter;
      } finally { delete process.env.YCLIENTS_PARTNER_TOKEN; }
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== ORIGIN || (init?.method ?? 'GET') !== 'GET' || init?.body !== undefined || init?.redirect !== 'error') { forbidden.push('unexpected_fetch'); throw new Error('Only finite native GET permitted'); }
      let data: unknown;
      if (phase === 'search' && url.pathname === '/api/v1/goods/search/' + COMPANY && ['шампунь','другой товар'].includes(url.searchParams.get('term') ?? '') && url.searchParams.get('count') === '21' && [...url.searchParams.keys()].join(',')==='term,count') data = [
        { parent_id: 0, item_id: 0, category_id: 456, title: 'Уход', is_chain: true, is_category: true, is_item: false },
        { parent_id: 456, item_id: url.searchParams.get('term')==='шампунь'?123:124, category_id: 0, title: url.searchParams.get('term')==='шампунь'?NAME:'Другой товар PHOTO_SECOND_SOURCE', is_chain: false, is_category: false, is_item: true },
      ];
      else if (phase === 'detail' && [`/api/v1/goods/${COMPANY}/123`,`/api/v1/goods/${COMPANY}/124`].includes(url.pathname) && url.search === '') data = GOODS.map(row=>({...row,good_id:url.pathname.endsWith('/123')?'123':'124',title:url.pathname.endsWith('/123')?NAME:'Другой товар PHOTO_SECOND_SOURCE'}));
      else { forbidden.push('automatic_or_unscoped_read'); throw new Error('Explicit finite read required'); }
      gets.push(phase);
      return Promise.resolve(new Response(JSON.stringify({ success: true, data, meta: { count: 1 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
  });
  afterAll(async () => {
    if (report.status === 'running') report.status = 'failed';
    Object.assign(report, { parserCalls, qualifiedContextReads: contextReads, nativeGets: gets, syntheticEffectCount: syntheticEffects.length, forbidden, checkpoints });
    writeFileSync(path.join(output, 'goods-photo-http-observations.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    jest.restoreAllMocks(); await http?.close(); await db?.close();
  });
  const post = (token: string, endpoint: string, body: object) => request(http.app.getHttpServer()).post('/api/' + endpoint).set('Authorization', 'Bearer ' + token).send(body);
  const upload = (token: string) => request(http.app.getHttpServer()).post('/api/ai/goods/photo-preview').set('Authorization', 'Bearer ' + token).attach('photo', Buffer.from(PNG), { filename: 'synthetic-invoice.png', contentType: 'image/png' });
  async function checkpoint(name: string) {
    expect(forbidden).toEqual([]); expect(syntheticEffects).toHaveLength(expectedEffects);
    expect(await db.prisma.actionExecution.count({ where: { tenantId, capability: GOODS_RECEIPT_CAPABILITY } })).toBe(expectedEffects);
    expect(await db.prisma.marketingDeliveryAttempt.count({ where: { tenantId } })).toBe(0);
    const forbiddenWriteFamily='Appointment|Opportunity|AgentTask|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalWorkItem|OperationalAlert|ExpenseReminder|Client|Loyalty|Bonus|Inventory';
    expect(http.recorder.since(runtimeMark).filter(op=>op.write && (op.model ? new RegExp('^('+forbiddenWriteFamily+')').test(op.model) : new RegExp('\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"?(?:'+forbiddenWriteFamily+')','i').test(op.sql ?? '')))).toEqual([]);
    checkpoints.push(name); report[name] = { parserCalls, nativeGets: gets.length, qualifiedContextReads: contextReads, syntheticEffects: syntheticEffects.length, outboundWrites: 0, unrelatedBusinessWrites: 0, realProviderCalls: 0, realModelCalls: 0 };
  }
  async function browserProof(email: string) {
    expect(approveSynthetic).toBe(true);
    const names = ['opened','uploaded','selected','searched','detail','reviewed','rejected','corrected','approved','cancel-start','cancel-inflight','cancelled','cancel-late','unknown-uploaded','unknown-selected','unknown-searched','unknown-detail','unknown','reload','revoked'];
    const expectedGets = [0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,3,4,4,4,4];
    const expectedParsers = [0,1,1,1,1,1,1,1,1,1,2,2,2,3,3,3,3,3,3,3];
    const expectedApprovals = [0,0,0,0,0,1,1,2,2,2,2,2,2,2,2,2,2,3,3,3];
    let witness: string | undefined;
    let prior: { id: string; encryptedArguments: string; payloadHash: string } | undefined;
    let releaseParser: (() => void) | undefined;
    let cancelStarted: Promise<void> | undefined;
    jest.spyOn(http.app.get(GoodsPhotoParser), 'parse').mockImplementation(async bytes => {
      parserCalls++; parserBytes = bytes;
      const imageKey = hashes.get(createHash('sha256').update(bytes).digest('hex'));
      expect(imageKey).toBe(phase === 'cancel' ? 'cancel' : parserCalls === 1 ? 'main' : 'unknown');
      await duringParse?.(); return structuredClone({lines: RAW_LINES});
    });
    await new Promise<void>((resolve,reject) => {
      const child = spawn(process.execPath,['/tmp/maya-goods-photo-20261008/goods-photo-browser-probe.mjs'],{stdio:['ignore','ignore','pipe','ipc']});
      let pending = Promise.resolve(), failure: Error | undefined, stderr = '', killTimer: ReturnType<typeof setTimeout> | undefined;
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error));
        releaseParser?.(); child.kill('SIGTERM');
        killTimer ??= setTimeout(() => { if(child.exitCode === null) child.kill('SIGKILL'); },5000);
      };
      const timer = setTimeout(() => fail(new Error('Bounded photo browser timeout')),540000);
      child.stderr!.on('data',(buffer: Buffer) => { stderr = (stderr + buffer.toString()).slice(-2000); });
      child.on('message',(raw: unknown) => {
        pending = pending.then(async () => {
          const message = object(raw);
          if(message.type === 'ready') {
            child.send({type:'start',backendOrigin:await http.listenLoopback(),output,email,imagePaths,itemName:NAME,otherItemName:'Другой товар PHOTO_SECOND_SOURCE'}); return;
          }
          expect(message.type).toBe('checkpoint'); const index=checkpoints.length, name=message.name;
          expect(name).toBe(names[index]); assert.ok(typeof name === 'string', 'Checkpoint name must be a string');
          if(name === 'cancel-inflight') {
            assert.ok(cancelStarted);
            let bounded: ReturnType<typeof setTimeout> | undefined;
            try { await Promise.race([cancelStarted,new Promise((_,rejectWait)=>{ bounded=setTimeout(()=>rejectWait(new Error('Parser hold not reached')),10000); })]); }
            finally { clearTimeout(bounded); }
          }
          if(name === 'cancelled') { releaseParser?.(); duringParse=undefined; }
          if(name === 'approved') expectedEffects=1;
          expect(parserCalls).toBe(expectedParsers[index]); expect(gets).toHaveLength(expectedGets[index]);
          const approvals=await db.prisma.aiApprovalRequest.findMany({where:{tenantId,toolName:GOODS_RECEIPT_TOOL}});
          expect(approvals).toHaveLength(expectedApprovals[index]);
          const reads=await db.prisma.c9WorkReceipt.findMany({where:{tenantId,kind:'TOOL_READ'}});
          expect(reads).toHaveLength(expectedGets[index]); expect(reads.every(row=>row.state==='SETTLED')).toBe(true);
          expect(reads.map(row=>row.taskKey).sort()).toEqual(gets.map(kind=>kind==='search'?'inventory.goods.search':'inventory.goods.read').sort());
          if(index<=4) expect(contextReads).toBe(0);
          if(name==='uploaded' || name==='unknown-uploaded') {
            const preview=object(message.preview);
            expect(preview).toMatchObject({contract:'maya.goods-photo.preview/1',recognition_acceptance:'NOT_ACCEPTED',original_stored:false,persistent_draft:false});
            expect(preview.lines).toHaveLength(2); expect(preview.source_revision).toMatch(/^[a-f0-9]{64}$/);
            if(name==='uploaded') { witness=String(preview.source_revision); expect(preview.photo_sha256).toBe(PHOTO_HASH); }
            else { expect(preview.source_revision).toBe(witness); expect(hashes.get(String(preview.photo_sha256))).toBe('unknown'); }
            expect(parserBytes?.every(byte=>byte===0)).toBe(true);
          }
          if(['searched','detail','reviewed','corrected','unknown-searched','unknown-detail','unknown'].includes(name)) {
            const input=object(message.input); expect(input.source_revision).toBe(witness);
            if(name==='searched' || name==='unknown-searched') expect(input.query).toBe(name==='searched'?'шампунь':'другой товар');
            if(name==='detail' || name==='unknown-detail') expect(input.goods_id).toBe(name==='detail'?'123':'124');
            if(name==='reviewed' || name==='corrected' || name==='unknown') {
              const expected={...proposal(name==='corrected'?2:1,name==='corrected'?'11.25':'10.25'),...(name==='unknown'?{goods_id:'124',photo_sha256:createHash('sha256').update(readFileSync(imagePaths.unknown)).digest('hex')}:{})};
              expect(input.proposal).toEqual(expected);
              const row=approvals.find(a=>a.status==='pending'); assert.ok(row);
              expect(object(JSON.parse(db.encryption.decrypt(row.encryptedArguments)))).toMatchObject({...expected,line_total:name==='corrected'?'28.125':'25.625'});
              if(name==='reviewed') prior=row;
              if(name!=='unknown') {
                expect(object(message.body).status).toBe('approval_required');
                expect(object(object(object(object(message.body).resolution).receipt).envelope).kind).toBe('APPROVAL');
                expect(object(message.body).approval).toBeUndefined();
              }
            }
          }
          if(index>=6) {
            assert.ok(prior); const unchanged=approvals.find(row=>row.id===prior?.id); assert.ok(unchanged);
            expect(unchanged.status).toBe('rejected'); expect(unchanged.encryptedArguments).toBe(prior.encryptedArguments);
            if(index>=7) expect(approvals.filter(row=>row.id!==prior?.id).every(row=>row.payloadHash!==prior?.payloadHash)).toBe(true);
          }
          if(index>=8) {
            expect(syntheticEffects[0]).toMatchObject({...proposal(2,'11.25'),company_id:COMPANY,line_total:'28.125'});
            const action=await db.prisma.actionExecution.findFirstOrThrow({where:{tenantId,capability:GOODS_RECEIPT_CAPABILITY}});
            expect(action.state).toBe('SUCCEEDED');
          }
          if(name==='unknown' || name==='reload' || name==='revoked') expect(approvals.filter(row=>row.status==='pending')).toHaveLength(1);
          if(name==='revoked') expect([401,403]).toContain(message.status);
          await checkpoint(name);
          if(name==='opened') phase='preview';
          if(name==='selected' || name==='unknown-selected') phase='search';
          if(name==='searched' || name==='unknown-searched') phase='detail';
          if(name==='detail' || name==='unknown-detail') phase='review';
          if(name==='reviewed') phase='reject';
          if(name==='rejected') phase='correction';
          if(name==='corrected') phase='approve';
          if(name==='cancel-start') {
            phase='cancel'; let parserEntered: (()=>void) | undefined;
            cancelStarted=new Promise<void>(resolveStart=>{parserEntered=resolveStart;});
            const held=new Promise<void>(release=>{releaseParser=release;});
            duringParse=async()=>{parserEntered?.(); await held;};
          }
          if(name==='cancel-late') {
            const deadline=Date.now()+10000; while(!parserBytes?.every(byte=>byte===0) && Date.now()<deadline) await new Promise(resolveWait=>setTimeout(resolveWait,20));
            expect(parserBytes?.every(byte=>byte===0)).toBe(true); phase='preview';
          }
          if(name==='reload') {
            phase='revocation';
            await db.prisma.membership.update({where:{userId_tenantId:{userId:ownerId,tenantId}},data:{status:'suspended'}});
          }
          child.send({type:'continue:'+name});
        }).catch(fail);
      });
      child.once('error',fail);
      child.once('close',code=>{ clearTimeout(timer); clearTimeout(killTimer); void pending.then(()=>failure?reject(failure):code===0?resolve():reject(new Error(`Photo browser ${code}: ${stderr}`))); });
    });
    expect(checkpoints).toEqual(names);
    Object.assign(report,{status:'passed',currentReactAcceptance:true,actualApprovalRecords:3,canonicalReceiptStates:['REJECTED','SUCCEEDED'],responseLoss:'ACTUAL_HTTP_201_LOST_PENDING_APPROVAL_NOT_AE_UNKNOWN',cancelLateSuppressed:true,sourceWitnessPreserved:true,noAutomaticReads:true,noReceiptAutofill:true,realProviderCalls:0,realModelCalls:0});
  }

  it('makes only explicit reads; reviews, rejects and corrects immutable owner proposals', async () => {
    const fx = fixturesForHttp(db, http), tenant = await fx.tenant('Photo proof synthetic', CalendarSource.EXTERNAL), owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    tenantId = tenant.id; ownerId = owner.id;
    for (const feature of ['ai.owner', 'ai.admin', 'ai.consultant', 'widgets.runtime', 'commerce.store', 'crm.integration'] as const) await fx.grantFeature(tenant, feature);
    await db.prisma.crmIntegration.create({ data: { tenantId, provider: CrmProvider.YCLIENTS, status: 'active', encryptedApiToken: db.encryption.encrypt(TOKEN), baseUrl: ORIGIN + '/api/v1', settingsJson: { companyId: COMPANY, currency: 'RUB' } } });
    runtimeMark=http.recorder.mark();
    if (browserMode) { await browserProof(owner.email); return; }
    const token = await http.login(tenant.slug, owner.email, owner.password);
    phase = 'default-parser'; expect((await upload(token)).status).toBe(503); expect(gets).toEqual([]); await checkpoint('default-unconfigured-parser');
    jest.spyOn(http.app.get(GoodsPhotoParser), 'parse').mockImplementation(async bytes => { parserCalls++; parserBytes = bytes; expect(hashes.has(createHash('sha256').update(bytes).digest('hex'))).toBe(true); await duringParse?.(); return structuredClone({ lines: RAW_LINES }); });
    phase = 'preview'; const preview = await upload(token); expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({ contract: 'maya.goods-photo.preview/1', photo_sha256: PHOTO_HASH, recognition_acceptance: 'NOT_ACCEPTED', review_required: true, original_stored: false, persistent_draft: false });
    expect(object(preview.body).lines).toHaveLength(2);
    expect((object(preview.body).lines as unknown[]).map(object)).toMatchObject([{ source_line: 1, price_kind: null, unit_price: '300', review_required: true }, { source_line: 2, price_kind: 'sale_unit', review_required: true }]);
    expect(JSON.stringify(preview.body)).not.toMatch(/PRIVATE_RAW_DOCUMENT|PRIVATE_SUPPLIER|raw_ocr/);
    expect(parserBytes?.every(byte => byte === 0)).toBe(true); expect(gets).toEqual([]); expect(contextReads).toBe(0);
    expect(await db.prisma.aiApprovalRequest.count({ where: { tenantId } })).toBe(0); await checkpoint('provisional-two-lines-no-matching');
    const source_revision = object(preview.body).source_revision; expect(source_revision).toMatch(/^[a-f0-9]{64}$/);
    phase = 'search'; const search = await post(token, 'ai/goods/search', { requestId: randomUUID(), source_revision, query: 'шампунь' });
    expect(search.status).toBe(201); expect(object(search.body).contract).toBe('maya.goods-photo.search/1'); const conversationId = object(search.body).conversationId; expect(typeof conversationId).toBe('string');
    expect(object(object(search.body).result).rows).toEqual([{ kind: 'category', id: '456', title: 'Уход' }, { kind: 'item', id: '123', title: NAME }]);
    expect(gets).toEqual(['search']); expect(contextReads).toBe(0); await checkpoint('explicit-native-search');
    phase = 'detail'; const detail = await post(token, 'ai/goods/item-read', { requestId: randomUUID(), conversationId, source_revision, goods_id: '123' });
    expect(detail.status).toBe(201); expect(object(detail.body).contract).toBe('maya.goods-photo.item/1');
    expect(object(object(detail.body).result)).toMatchObject({ contract: 'maya.goods-item.read/2', item: { id: '123', sale_price: '100', cost_price: '40', sale_unit_id: '11' } });
    expect(gets).toEqual(['search', 'detail']); expect(contextReads).toBe(0);
    const sourceReads = await db.prisma.c9WorkReceipt.findMany({ where: { tenantId, kind: 'TOOL_READ' } });
    expect(sourceReads.map(row => row.taskKey).sort()).toEqual(['inventory.goods.read', 'inventory.goods.search']); expect(sourceReads.every(row => row.state === 'SETTLED')).toBe(true); await checkpoint('explicit-native-item');
    phase = 'review'; const reviewed = await post(token, 'ai/goods/receipt-review', { requestId: randomUUID(), conversationId, source_revision, proposal: proposal(1) });
    expect(reviewed.status).toBe(201); expect(reviewed.body).toMatchObject({ contract: 'maya.goods-photo.review/1', status: 'approval_required' }); expect(object(reviewed.body).approval).toBeUndefined();
    expect(object(object(object(object(reviewed.body).resolution).receipt).envelope).kind).toBe('APPROVAL');
    const pending = await db.prisma.aiApprovalRequest.findFirstOrThrow({ where: { tenantId, requestedByUserId: ownerId, toolName: GOODS_RECEIPT_TOOL, status: 'pending' } });
    expect(object(JSON.parse(db.encryption.decrypt(pending.encryptedArguments)))).toMatchObject({ ...proposal(1), line_total: '25.625' }); await checkpoint('manual-fields-canonical-approval-only');
    phase = 'reject'; expect((await post(token, `ai/approvals/${pending.id}/reject`, { payloadHash: pending.payloadHash })).status).toBe(201);
    expect((await db.prisma.aiApprovalRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('rejected'); await checkpoint('canonical-rejection-no-dispatch');
    phase = 'correction'; const corrected = await post(token, 'ai/goods/receipt-review', { requestId: randomUUID(), conversationId, source_revision, proposal: proposal(2, '11.25') });
    expect(corrected.status).toBe(201); expect(object(corrected.body).status).toBe('approval_required');
    const approvals = await db.prisma.aiApprovalRequest.findMany({ where: { tenantId, toolName: GOODS_RECEIPT_TOOL } }); expect(approvals).toHaveLength(2); const next = approvals.find(row => row.status === 'pending'); assert.ok(next);
    expect(next.payloadHash).not.toBe(pending.payloadHash); expect(object(JSON.parse(db.encryption.decrypt(next.encryptedArguments)))).toMatchObject({ ...proposal(2, '11.25'), line_total: '28.125' });
    expect((await db.prisma.aiApprovalRequest.findUniqueOrThrow({ where: { id: pending.id } })).encryptedArguments).toBe(pending.encryptedArguments); await checkpoint('corrected-version-new-approval');
    if (approveSynthetic) {
      phase = 'approve'; expectedEffects = 1;
      const approved = await post(token, `ai/approvals/${next.id}/approve`, { payloadHash: next.payloadHash }); expect(approved.status).toBe(201); expect(object(approved.body).status).toBe('completed');
      expect(syntheticEffects[0]).toMatchObject({ ...proposal(2, '11.25'), company_id: COMPANY, line_total: '28.125' });
      const action = await db.prisma.actionExecution.findFirstOrThrow({ where: { tenantId, capability: GOODS_RECEIPT_CAPABILITY } }); expect(action.state).toBe('SUCCEEDED');
      const replay = await post(token, `ai/approvals/${next.id}/approve`, { payloadHash: next.payloadHash }); expect(replay.status).toBe(201); expect(object(replay.body).status).toBe('completed'); await checkpoint('explicit-canonical-approve-synthetic-effect-once');
    }
    phase='source-drift';
    const beforeDriftReads=await db.prisma.c9WorkReceipt.count({where:{tenantId,kind:'TOOL_READ'}}), beforeDriftContexts=contextReads;
    await db.prisma.crmIntegration.update({where:{tenantId},data:{settingsJson:{companyId:COMPANY,currency:'USD'}}});
    for(const [endpoint,fields] of [['search',{query:'шампунь'}],['item-read',{goods_id:'123'}],['receipt-review',{proposal:proposal(3)}]] as const) {
      const refused=await post(token,'ai/goods/'+endpoint,{requestId:randomUUID(),conversationId,source_revision,...fields});
      expect(refused.status).toBe(409); expect(object(refused.body).message).toBe('goods_source_changed');
    }
    expect(await db.prisma.c9WorkReceipt.count({where:{tenantId,kind:'TOOL_READ'}})).toBe(beforeDriftReads); expect(contextReads).toBe(beforeDriftContexts);
    expect(await db.prisma.aiApprovalRequest.count({where:{tenantId,toolName:GOODS_RECEIPT_TOOL}})).toBe(2); expect(gets).toEqual(['search','detail']);
    await checkpoint('old-source-witness-refused-before-read-or-approval');
    await db.prisma.crmIntegration.update({where:{tenantId},data:{settingsJson:{companyId:COMPANY,currency:'RUB'}}});
    const other = await fx.user(tenant, UserRole.TENANT_OWNER), otherToken = await http.login(tenant.slug, other.email, other.password); phase = 'revocation';
    duringParse = async () => { await db.prisma.membership.update({ where: { userId_tenantId: { userId: other.id, tenantId } }, data: { status: 'suspended' } }); };
    const revoked = await upload(otherToken); expect([401, 403]).toContain(revoked.status); expect(object(revoked.body).lines).toBeUndefined(); expect(parserBytes?.every(byte => byte === 0)).toBe(true); expect(gets).toEqual(['search', 'detail']);
    const count = parserCalls; expect([401, 403]).toContain((await upload(otherToken)).status); expect(parserCalls).toBe(count); await checkpoint('revoked-before-preview-return');
    Object.assign(report, { status: 'passed', provisionalRecognitionAcceptance: false, actualApprovalRecords: 2, realProviderCalls: 0, realModelCalls: 0 });
  }, browserMode ? 600000 : 180000);
});
