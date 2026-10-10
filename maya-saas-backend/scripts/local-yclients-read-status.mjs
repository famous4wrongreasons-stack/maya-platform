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
const TRACE_ROUTES = Object.freeze(['auth', 'connect', 'activate', 'operation', 'companies', 'company', 'book_services', 'services', 'categories', 'team', 'unlisted']);
const CONNECTION_FAILURE_CODES = Object.freeze(['crm_credentials_rejected', 'crm_company_not_found', 'crm_provider_unreachable', 'crm_platform_configuration_error', 'crm_connection_failed']);
const TRACE_CODES = Object.freeze([...CONNECTION_FAILURE_CODES, 'provider_response_read', 'provider_http_error', 'provider_rejected', 'provider_scope_refused', 'provider_transport_unavailable', 'response_closed', 'local_onboarding_origin_refused', 'local_yclients_diagnostic_route_disabled', 'local_yclients_read_route_disabled']);
export const TEAM_ISSUES = Object.freeze(['payload_shape', 'success_unconfirmed', 'data_shape', 'member_limit', 'pagination_present', 'meta_shape', 'unknown_meta_fields', 'total_count_type', 'total_count_mismatch', 'count_mismatch', 'page_not_first', 'row_shape', 'invalid_staff_id', 'duplicate_staff_id', 'foreign_company']);
export const TEAM_COUNT_ENCODINGS = Object.freeze(['number', 'decimal_string', 'missing', 'null', 'invalid_number', 'invalid_string', 'other']);
function projectTeamCollectionCheck(value) {
  const keys = ['requestRoute', 'v2Accept', 'responseUrl', 'http200', 'redirected', 'metaFields', 'outerFields', 'paginationHeader', 'everyRowCompanyPresent'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) return null;
  if (!['management_exact', 'legacy_exact', 'other'].includes(value.requestRoute) || !['absent', 'exact', 'other'].includes(value.responseUrl) || !['v2Accept', 'http200', 'redirected', 'paginationHeader'].every(key => typeof value[key] === 'boolean') || ![null, true, false].includes(value.everyRowCompanyPresent)) return null;
  for (const [key, allowed] of [['metaFields', ['total_count', 'count', 'page', 'other']], ['outerFields', ['success', 'data', 'meta', 'other']]]) {
    const list = value[key];
    if (list !== null && (!Array.isArray(list) || list.length > allowed.length || list.some((field, index) => !allowed.includes(field) || (index > 0 && allowed.indexOf(field) <= allowed.indexOf(list[index - 1]))))) return null;
  }
  return Object.fromEntries(keys.map(key => [key, Array.isArray(value[key]) ? [...value[key]] : value[key]]));
}
export function projectReadTrace(message) {
  const fields = ['type', 'contract', 'sequence', 'elapsedMs', 'surface', 'route', 'method', 'stage', 'status', 'code'];
  // Optional closed diagnosis only: no values, field names, IDs, counts or body.
  if (message && Object.hasOwn(message, 'teamIssues')) fields.push('teamIssues');
  if (message && Object.hasOwn(message, 'teamCountEncoding')) fields.push('teamCountEncoding');
  if (message && Object.hasOwn(message, 'teamCompleteness')) fields.push('teamCompleteness');
  if (message && Object.hasOwn(message, 'teamCollectionCheck')) fields.push('teamCollectionCheck');
  if (!message || typeof message !== 'object' || Array.isArray(message) || Object.keys(message).length !== fields.length || !fields.every(key => Object.hasOwn(message, key))) return null;
  if (message.type !== 'read-trace' || message.contract !== 'maya.local-yclients-read-trace/1' || !Number.isSafeInteger(message.sequence) || message.sequence < 1 || message.sequence > READ_TRACE_LIMIT || !Number.isSafeInteger(message.elapsedMs) || message.elapsedMs < 0 || message.elapsedMs > 1200000) return null;
  if (!['http', 'provider'].includes(message.surface) || !TRACE_ROUTES.includes(message.route) || !['GET', 'POST', 'OTHER'].includes(message.method) || !['entered', 'completed', 'refused', 'closed'].includes(message.stage)) return null;
  if (message.status !== null && (!Number.isSafeInteger(message.status) || message.status < 100 || message.status > 599)) return null;
  if (message.code !== null && !TRACE_CODES.includes(message.code)) return null;
  if (fields.includes('teamIssues')) {
    const issues = message.teamIssues;
    if (message.surface !== 'provider' || message.route !== 'team' || message.stage !== 'refused' || message.code !== 'provider_scope_refused' || message.status < 200 || message.status >= 300 || !Array.isArray(issues) || issues.length === 0 || issues.length > TEAM_ISSUES.length || issues.some((issue, index) => !TEAM_ISSUES.includes(issue) || (index > 0 && TEAM_ISSUES.indexOf(issue) <= TEAM_ISSUES.indexOf(issues[index - 1])))) return null;
  }
  if (fields.includes('teamCountEncoding') && (message.surface !== 'provider' || message.route !== 'team' || !['completed', 'refused'].includes(message.stage) || !['provider_response_read', 'provider_scope_refused'].includes(message.code) || message.status < 200 || message.status >= 300 || !TEAM_COUNT_ENCODINGS.includes(message.teamCountEncoding))) return null;
  if (fields.includes('teamCompleteness')) {
    if (message.surface !== 'provider' || message.route !== 'team' || message.method !== 'GET' || message.stage !== 'completed' || message.code !== 'provider_response_read' || message.status < 200 || message.status >= 300) return null;
    if (message.teamCompleteness === 'management_collection_contract') {
      if (message.status !== 200 || message.teamCountEncoding !== 'missing') return null;
    } else if (message.teamCompleteness !== 'explicit_total' || !['number', 'decimal_string'].includes(message.teamCountEncoding)) return null;
  }
  let collectionCheck;
  if (fields.includes('teamCollectionCheck')) {
    if (message.surface !== 'provider' || message.route !== 'team' || message.method !== 'GET' || message.stage !== 'refused' || message.code !== 'provider_scope_refused' || message.status < 200 || message.status >= 300) return null;
    collectionCheck = projectTeamCollectionCheck(message.teamCollectionCheck);
    if (!collectionCheck || collectionCheck.http200 !== (message.status === 200)) return null;
  }
  return Object.fromEntries(fields.map(key => [key, key === 'teamIssues' ? [...message[key]] : key === 'teamCollectionCheck' ? collectionCheck : message[key]]));
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
  // Retain only a canonical public failure code. Never stringify/copy the body,
  // invoke its getters, or change the application's response or error behavior.
  let connectionFailure = null;
  if (['connect', 'activate'].includes(route) && typeof response.json === 'function') {
    const originalJson = response.json;
    response.json = function (...args) {
      try {
        const body = args[0];
        const error = body && typeof body === 'object' && !Array.isArray(body)
          ? Object.getOwnPropertyDescriptor(body, 'error')?.value : null;
        const candidate = error && typeof error === 'object' && !Array.isArray(error)
          ? Object.getOwnPropertyDescriptor(error, 'code')?.value : null;
        connectionFailure = CONNECTION_FAILURE_CODES.includes(candidate) ? candidate : null;
      } catch { connectionFailure = null; }
      return Reflect.apply(originalJson, this, args);
    };
  }
  let finished = false;
  response.once('finish', () => {
    if (finished) return; finished = true;
    emit({ ...base, stage: response.statusCode >= 400 ? 'refused' : 'completed', status: response.statusCode, code: code ?? (response.statusCode >= 400 ? connectionFailure : null) });
  });
  response.once('close', () => {
    if (finished) return; finished = true;
    emit({ ...base, stage: 'closed', status: null, code: 'response_closed' });
  });
}
