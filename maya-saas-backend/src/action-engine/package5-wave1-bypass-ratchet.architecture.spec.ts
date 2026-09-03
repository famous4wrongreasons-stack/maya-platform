import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE5_WAVE1_REGISTRATIONS } from './package5-wave1-executable.contract';

const SRC = join(process.cwd(), 'src');

function source(path: string) {
  return readFileSync(join(SRC, path), 'utf8');
}

function count(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].length;
}

describe('Package 5 Wave 1 production-bypass ratchet', () => {
  const dashboard = source(
    'dashboard-preferences/dashboard-preferences.service.ts',
  );
  const notifications = source(
    'appointment-notifications/appointment-notifications.service.ts',
  );
  const aiTools = source('ai-tools/ai-tool-handler.service.ts');
  const canonical = source('package5-wave1/package5-wave1.service.ts');
  const registry = source('action-engine/action-engine.registry.ts');

  it('classifies the exact pre-cutover setting-owner baseline without a broad exclusion', () => {
    expect(count(dashboard, /dashboardPreference\.upsert\(/g)).toBe(2);
    expect(
      count(notifications, /appointmentNotificationSetting\.upsert\(/g),
    ).toBe(1);
    expect(
      count(
        `${dashboard}\n${notifications}`,
        /(dashboardPreference|appointmentNotificationSetting)\.(create|update|upsert|delete)\(/g,
      ),
    ).toBe(3);
  });

  it('classifies only the current A23 business mutations, not inbox transport state', () => {
    expect(count(aiTools, /publishForTenant\(/g)).toBe(2);
    expect(count(aiTools, /inboxItem\.update\(/g)).toBe(1);
    expect(
      count(aiTools, /operationalWorkItem\.(create|update|upsert|delete)\(/g),
    ).toBe(0);
  });

  it('keeps all six canonical mutations behind ActionExecution', () => {
    expect(count(canonical, /actionTargetMutation\.create\(/g)).toBe(1);
    expect(count(canonical, /operationalWorkItem\.create\(/g)).toBe(1);
    expect(count(canonical, /operationalWorkItem\.update\(/g)).toBe(1);
    expect(canonical).toContain('CanonicalActionIngressService');
    expect(canonical).toContain('ActionEngineKernel');
    expect(canonical).not.toMatch(/inboxItem\.(create|update|upsert|delete)/);
  });

  it('registers every Shadow/executable pair through the narrow Wave 1 registry', () => {
    expect(PACKAGE5_WAVE1_REGISTRATIONS).toHaveLength(6);
    expect(registry).toContain('package5Wave1Capability');
    for (const registration of PACKAGE5_WAVE1_REGISTRATIONS) {
      expect(registration.shadowCapability.endsWith('.shadow.v1')).toBe(true);
      expect(registration.executableCapability.endsWith('.execute.v1')).toBe(
        true,
      );
    }
  });
});
