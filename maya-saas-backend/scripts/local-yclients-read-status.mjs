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
