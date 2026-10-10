// Closed service diagnostics only. Never serialize an Error, input or credential.
export const RUNTIME_STAGES = Object.freeze(['environment_validating', 'network_guard_installing', 'app_importing', 'app_creating', 'http_configuring', 'backend_listening', 'runtime_ready', 'runtime_stopping']);
export const RUNTIME_CODES = Object.freeze(['environment_refused', 'private_state_refused', 'ipc_required', 'network_guard_failed', 'app_import_failed', 'app_create_failed', 'http_setup_failed', 'listen_failed', 'startup_provider_attempt', 'runtime_cleanup_failed']);
const CAUSES = Object.freeze(['assertion', 'module_missing', 'access_denied', 'port_in_use', 'connection_refused', 'connection_reset', 'timed_out', 'prisma_initialization', 'dependency_resolution', 'unknown']);
export function safeRuntimeCause(error) {
  const codes = { ERR_ASSERTION: 'assertion', MODULE_NOT_FOUND: 'module_missing', ERR_MODULE_NOT_FOUND: 'module_missing', ENOENT: 'module_missing', EACCES: 'access_denied', EPERM: 'access_denied', EADDRINUSE: 'port_in_use', ECONNREFUSED: 'connection_refused', ECONNRESET: 'connection_reset', ETIMEDOUT: 'timed_out' };
  if (Object.hasOwn(codes, error?.code)) return codes[error.code];
  if (error?.name === 'PrismaClientInitializationError') return 'prisma_initialization';
  if (error?.name === 'UnknownDependenciesException') return 'dependency_resolution';
  return 'unknown';
}
export function projectRuntimeStatus(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || Object.keys(message).length !== 6 || !['type', 'contract', 'stage', 'outcome', 'code', 'cause'].every(key => Object.hasOwn(message, key))) return null;
  if (message.type !== 'runtime-status' || message.contract !== 'maya.local-yclients-read-status/1' || !RUNTIME_STAGES.includes(message.stage) || !['entered', 'failed', 'completed'].includes(message.outcome)) return null;
  if (message.outcome === 'failed' ? !RUNTIME_CODES.includes(message.code) || !CAUSES.includes(message.cause) : message.code !== null || message.cause !== null) return null;
  return { type: message.type, contract: message.contract, stage: message.stage, outcome: message.outcome, code: message.code, cause: message.cause };
}
export function runtimeStatus(stage, outcome = 'entered', code = null, error) {
  const message = projectRuntimeStatus({ type: 'runtime-status', contract: 'maya.local-yclients-read-status/1', stage, outcome, code, cause: outcome === 'failed' ? safeRuntimeCause(error) : null });
  if (!message) throw new Error('Invalid closed runtime status');
  return message;
}

// First 64 closed events only. Relative timing is diagnostic, never request identity.
export const READ_TRACE_LIMIT = 64;
const TRACE_ROUTES = Object.freeze(['connect', 'activate', 'operation', 'companies', 'company', 'book_services', 'services', 'categories', 'team', 'unlisted']);
const TRACE_CODES = Object.freeze(['provider_response_read', 'provider_http_error', 'provider_rejected', 'provider_scope_refused', 'provider_transport_unavailable', 'response_closed', 'local_onboarding_origin_refused', 'local_yclients_diagnostic_route_disabled', 'local_yclients_read_route_disabled']);
export function projectReadTrace(message) {
  const fields = ['type', 'contract', 'sequence', 'elapsedMs', 'surface', 'route', 'method', 'stage', 'status', 'code'];
  if (!message || typeof message !== 'object' || Array.isArray(message) || Object.keys(message).length !== fields.length || !fields.every(key => Object.hasOwn(message, key))) return null;
  if (message.type !== 'read-trace' || message.contract !== 'maya.local-yclients-read-trace/1' || !Number.isSafeInteger(message.sequence) || message.sequence < 1 || message.sequence > READ_TRACE_LIMIT || !Number.isSafeInteger(message.elapsedMs) || message.elapsedMs < 0 || message.elapsedMs > 1200000) return null;
  if (!['http', 'provider'].includes(message.surface) || !TRACE_ROUTES.includes(message.route) || !['GET', 'POST', 'OTHER'].includes(message.method) || !['entered', 'completed', 'refused', 'closed'].includes(message.stage)) return null;
  if (message.status !== null && (!Number.isSafeInteger(message.status) || message.status < 100 || message.status > 599)) return null;
  if (message.code !== null && !TRACE_CODES.includes(message.code)) return null;
  return Object.fromEntries(fields.map(key => [key, message[key]]));
}
export function createReadTrace(send, clock = Date.now) {
  const start = clock(); let sequence = 0;
  return value => {
    if (sequence >= READ_TRACE_LIMIT) return;
    const event = projectReadTrace({ ...value, type: 'read-trace', contract: 'maya.local-yclients-read-trace/1', sequence: sequence + 1, elapsedMs: Math.max(0, Math.min(1200000, Math.floor(clock() - start))) });
    if (!event) return;
    sequence++;
    // Diagnostics cannot turn a domain response into a retry or failure.
    try { send(event); } catch { /* IPC may already be closing. */ }
  };
}
export function traceHttpRequest(request, response, emit, refusal = null) {
  const routes = { '/api/integrations/crm/connect': 'connect', '/api/integrations/crm/activate': 'activate', '/api/integrations/crm/operation': 'operation' };
  const route = routes[typeof request.originalUrl === 'string' ? request.originalUrl.split('?')[0] : ''];
  if (!route || !['GET', 'POST'].includes(request.method)) return;
  const base = { surface: 'http', route, method: request.method };
  const code = TRACE_CODES.includes(refusal) ? refusal : null;
  emit({ ...base, stage: 'entered', status: null, code });
  let finished = false;
  response.once('finish', () => {
    if (finished) return; finished = true;
    emit({ ...base, stage: response.statusCode >= 400 ? 'refused' : 'completed', status: response.statusCode, code });
  });
  response.once('close', () => {
    if (finished) return; finished = true;
    emit({ ...base, stage: 'closed', status: null, code: 'response_closed' });
  });
}
