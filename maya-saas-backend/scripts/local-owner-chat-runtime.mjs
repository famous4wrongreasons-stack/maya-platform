// Local qualification adapter around the existing AppModule, AiCore and broker.
// No alternate assistant, provider data, grants, identities or business writer.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { socketRequest } from './conversation-qualification/core-conversation-socket.mjs';
import { candidateReservation } from './conversation-qualification/current-candidate-budget.mjs';
import { OWNER_CHAT_PROFILE, OWNER_CHAT_TOOLS, assertOwnerChatActor, createOwnerChatWindow } from './local-owner-chat-policy.mjs';

export async function verifyOwnerChatDatabase(prisma, scope) {
  const [tenant, user, membership, branch, integration] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { slug: true, status: true } }),
    prisma.user.findUnique({ where: { id: scope.userId }, select: { tenantId: true, role: true, status: true } }),
    prisma.membership.findFirst({ where: { tenantId: scope.tenantId, userId: scope.userId, role: 'tenant_owner', status: 'active' }, select: { id: true } }),
    prisma.branch.findUnique({ where: { id: scope.branchId }, select: { tenantId: true } }),
    prisma.crmIntegration.findUnique({ where: { tenantId: scope.tenantId }, select: { status: true, provider: true, baseUrl: true, verifiedAt: true, settingsJson: true } }),
  ]);
  assert.ok(tenant?.slug === scope.tenantSlug && ['active', 'trial'].includes(tenant.status)
    && user?.tenantId === scope.tenantId && user.role === 'tenant_owner' && user.status === 'active'
    && membership && branch?.tenantId === scope.tenantId, 'owner_chat_current_membership_refused');
  const settings = integration?.settingsJson;
  assert.ok(integration?.status === 'active' && integration.provider === 'yclients' && !integration.baseUrl && integration.verifiedAt
    && String(settings?.companyId) === scope.companyId && settings?.branchBinding?.branchId === scope.branchId
    && String(settings?.branchBinding?.companyId) === scope.companyId
    && settings?.branchBinding?.contract === 'maya.crm-branch-binding/1'
    && /^[a-f0-9]{64}$/.test(settings?.acceptedImportSnapshotHash ?? ''), 'owner_chat_current_crm_refused');
  return scope.companyId;
}

export async function installOwnerChat({ app, prisma, require, backend, launch, providerFetch, diagnostic = () => {} }) {
  launch.assertCurrent();
  const scope = launch.manifest.ownerScope;
  await verifyOwnerChatDatabase(prisma, scope);
  const context = new AsyncLocalStorage();
  const window = createOwnerChatWindow(scope, { durationMs: Math.max(1, Math.min(600000, launch.admission.expiresAt - Date.now())) });
  const load = file => require(path.join(backend, 'dist/src', file));
  const { ConfigService } = require('@nestjs/config');
  const { ForbiddenException } = require('@nestjs/common');
  const { AiCoreService } = load('ai-tools/ai-core.service.js');
  const { AiToolRuntimeService } = load('ai-tools/ai-tool-runtime.service.js');
  const { ActionEngineRuntimeService } = load('action-engine/action-engine.runtime.js');
  const core = app.get(AiCoreService), tools = app.get(AiToolRuntimeService), engine = app.get(ActionEngineRuntimeService);
  const refuse = () => { throw new ForbiddenException({ error: { code: 'local_owner_chat_effect_refused' } }); };
  const current = async user => {
    launch.assertCurrent(); assertOwnerChatActor(user, scope);
    await verifyOwnerChatDatabase(prisma, scope);
  };
  // Nest invokes interceptors after its ordinary authentication/tenant guards.
  app.useGlobalInterceptors({ async intercept(execution, next) {
    const req = execution.switchToHttp().getRequest();
    if (!['/api/health', '/api/health/ready', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout'].includes(req.originalUrl)) {
      try { await current(req.user); } catch { return refuse(); }
    }
    return next.handle();
  } });
  const chat = core.chat.bind(core);
  core.chat = async (user, body) => {
    await current(user);
    const request = { user, body };
    let turn;
    try { turn = window.begin(request); } catch { return refuse(); }
    diagnostic({ kind: 'chat', stage: 'entered', turn: window.state.attemptedTurns });
    try {
      return await context.run({ user, turn }, () => chat(user, body));
    } finally { turn.finish(); diagnostic({ kind: 'chat', stage: 'completed', turn: window.state.attemptedTurns }); }
  };
  const list = tools.listTools.bind(tools);
  tools.listTools = async (...args) => {
    await current(args[0]);
    const result = await list(...args);
    return { ...result, tools: result.tools.filter(tool => OWNER_CHAT_TOOLS.includes(tool.name)) };
  };
  for (const method of ['execute', 'replayCompletedRead']) {
    const original = tools[method].bind(tools);
    tools[method] = async (...args) => {
      const active = context.getStore();
      if (!active || !OWNER_CHAT_TOOLS.includes(args[1])) return refuse();
      active.turn.assertCurrent(args[0]); await current(args[0]);
      return original(...args);
    };
  }
  // Additional local restriction; this grants no substitute Action Engine authority.
  for (const method of ['execute', 'executeWithReceipt']) {
    assert.equal(typeof engine[method], 'function', 'owner_chat_action_engine_owner_required');
    engine[method] = refuse;
  }
  const config = app.get(ConfigService);
  for (const [key, value] of Object.entries({ AI_CORE_PROVIDER: 'deepseek', DEEPSEEK_AI_CORE_MODEL: launch.manifest.limits.model,
    DEEPSEEK_API_KEY: 'CORE_BROKER_PLACEHOLDER_NOT_A_CREDENTIAL', DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    AI_CORE_MAX_OUTPUT_TOKENS: String(launch.manifest.limits.outputPerAttempt) })) config.set(key, value);
  const fetch = async (raw, init) => {
    if (!['https://api.deepseek.com/chat/completions', 'https://api.deepseek.com/v1/chat/completions'].includes(String(raw))) return providerFetch(raw, init);
    const active = context.getStore();
    assert.ok(active, 'owner_chat_model_request_required');
    active.turn.assertCurrent(active.user); await current(active.user);
    candidateReservation(raw, init, OWNER_CHAT_PROFILE);
    // No application header/token crosses the existing broker boundary.
    return socketRequest(launch.manifest.admissionContext.target, '/chat/completions', {
      method: 'POST', body: init.body, signal: init.signal, redirect: 'error', headers: {
        'content-type': 'application/json', 'x-candidate-manifest': launch.manifest.manifestSha256,
        'x-candidate-case': active.turn.caseId, 'x-candidate-turn': '1',
      },
    }, { localStdin: true });
  };
  return { fetch, stop: () => window.close(), state: () => window.state,
    async allowProvider(request) {
      const active = context.getStore();
      if (!active || request.method !== 'POST' || request.originalUrl !== '/api/ai/chat') return false;
      active.turn.assertCurrent(request.user); await current(request.user); return true;
    } };
}
