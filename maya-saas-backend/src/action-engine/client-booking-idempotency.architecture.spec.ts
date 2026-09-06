import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'src');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(resolve(path, entry.name))
      : entry.name.endsWith('.ts') &&
          !entry.name.endsWith('.spec.ts') &&
          !entry.name.endsWith('.architecture.ts')
        ? [resolve(path, entry.name)]
        : [],
  );
}

describe('B31 immutable booking ingress permanent ratchet', () => {
  it('allows binding writes only in the canonical Action Engine kernel', () => {
    for (const file of files(root).filter(
      (file) => !file.endsWith('/action-engine.kernel.ts'),
    )) {
      expect(readFileSync(file, 'utf8')).not.toMatch(
        /actionExecutionIdempotencyBinding\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/,
      );
    }
    const kernel = source('action-engine/action-engine.kernel.ts');
    expect(kernel).not.toMatch(
      /actionExecutionIdempotencyBinding\.(?:update|updateMany|upsert|delete|deleteMany)\(/,
    );
    expect(kernel.match(/await this\.bindClientBookingKey\(/g)).toHaveLength(2);
    expect(kernel).toContain(
      'normalized.bookingIntent && isUniqueConflict(error)',
    );
    expect(kernel).toContain(
      'execution.bookingIntentHash !== normalized.bookingIntent?.hash',
    );
  });
  it('requires the shared booking context/authorization before either calendar can execute a Client create', () => {
    const crm = source('crm/crm.service.ts');
    const method = crm.slice(
      crm.indexOf('async executeCanonicalClientCreateWithReceipt('),
      crm.indexOf('async canonicalClientBookingTarget('),
    );
    expect(method).toContain('!invocation.bookingIntent');
    expect(method).toContain('!invocation.callerIdempotency');
    expect(method).toContain('authorizeIngress: invocation.authorizationCheck');
    expect(method).toContain('this.actionEngineRuntime.executeWithReceipt(');
    const creator = source('appointments/client-appointment-create.service.ts');
    expect(creator).toContain('scope: CLIENT_BOOKING_IDEMPOTENCY_SCOPE');
    expect(creator).not.toContain('scope: invocation.callerIdempotency');
  });
  it('hashes the normalized versioned descriptor and preserves the existing UNKNOWN path', () => {
    const kernel = source('action-engine/action-engine.kernel.ts');
    expect(kernel).toMatch(
      /normalizeClientBookingIntent\(\s*request\.tenantId,\s*normalizedInput,/,
    );
    expect(kernel).toMatch(
      /this\.identity\.hmac\(\s*CLIENT_BOOKING_INTENT_CONTRACT,\s*snapshot\.descriptor/,
    );
    expect(kernel).not.toMatch(/hmac\([^;]*JSON\.stringify\(request/s);
    const runtime = source('action-engine/action-engine.runtime.ts');
    expect(runtime).toContain('return this.kernel.resolveClientBookingRetry(');
    expect(runtime).toContain('ActionExecutionState.UNKNOWN');
  });
});
