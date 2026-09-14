import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { PACKAGE5_WAVE1_REGISTRATIONS } from './package5-wave1-executable.contract';

const SRC = join(process.cwd(), 'src');

function source(path: string) {
  return readFileSync(join(SRC, path), 'utf8');
}

function count(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].length;
}

function productionSources(directory = SRC): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) {
      return [];
    }
    return [path];
  });
}

describe('Package 5 Wave 1 production-bypass ratchet', () => {
  it('R04 task transport preserves identity across tabs/restart and changed input', () => {
    const run = spawnSync(
      process.execPath,
      [
        join(
          process.cwd(),
          '..',
          'docs/rebuild/evidence/package5-wave-rb-r04-pwa.proof.cjs',
        ),
      ],
      {
        encoding: 'utf8',
        timeout: 20000,
      },
    );
    expect({
      status: run.status,
      error: run.error?.message,
      output: run.status ? `${run.stdout}\n${run.stderr}` : '',
    }).toEqual({ status: 0, error: undefined, output: '' });
  }, 25000);
  it('R04 permanently rejects native parallel owners and read/background effects', () => {
    const run = spawnSync(
      'python3',
      ['-m', 'unittest', 'test_package5_operational_work'],
      {
        cwd: join(process.cwd(), '..', 'ai администратор'),
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    expect({
      status: run.status,
      error: run.error?.message,
      output: run.status ? `${run.stdout}\n${run.stderr}` : '',
    }).toEqual({ status: 0, error: undefined, output: '' });
  }, 65000);
  const dashboard = source(
    'dashboard-preferences/dashboard-preferences.service.ts',
  );
  const notifications = source(
    'appointment-notifications/appointment-notifications.service.ts',
  );
  const aiTools = source('ai-tools/ai-tool-handler.service.ts');
  const cutover = source(
    'package5-wave1/package5-wave1-canonical-cutover.service.ts',
  );
  const canonical = source('package5-wave1/package5-wave1.service.ts');
  const registry = source('action-engine/action-engine.registry.ts');

  it('keeps production setting initiators free of direct mutations after cutover', () => {
    expect(count(dashboard, /dashboardPreference\.upsert\(/g)).toBe(0);
    expect(
      count(notifications, /appointmentNotificationSetting\.upsert\(/g),
    ).toBe(0);
    expect(
      count(
        `${dashboard}\n${notifications}`,
        /(dashboardPreference|appointmentNotificationSetting)\.(create|update|upsert|delete)\(/g,
      ),
    ).toBe(0);
    expect(dashboard).toContain('canonicalWave1.updateFinance');
    expect(dashboard).toContain('canonicalWave1.updateAssistant');
    expect(notifications).toContain(
      'canonicalWave1.updateAppointmentNotifications',
    );
  });

  it('keeps AI and inbox surfaces as initiators/projections, not business owners', () => {
    expect(count(aiTools, /publishForTenant\(/g)).toBe(0);
    expect(count(aiTools, /inboxItem\.update\(/g)).toBe(0);
    expect(
      count(aiTools, /operationalWorkItem\.(create|update|upsert|delete)\(/g),
    ).toBe(0);
    expect(aiTools).toContain('requireCanonicalWave1().createTask');
    expect(aiTools).toContain('requireCanonicalWave1().completeTask');
    expect(aiTools).toContain(
      'requireCanonicalWave1().requestAdministratorContact',
    );
  });

  it('allows only explicit inbox projection after the canonical outcome', () => {
    expect(cutover).toContain('Package5Wave1ExecutableService');
    expect(count(cutover, /executor\.(execute|resume)\(/g)).toBe(5);
    expect(count(cutover, /publishForTenant\(/g)).toBe(2);
    expect(count(cutover, /projectOperationalWorkItemCompletion\(/g)).toBe(1);
    expect(cutover).not.toMatch(
      /(dashboardPreference|appointmentNotificationSetting|operationalWorkItem)\.(create|update|upsert|delete)\(/,
    );
  });

  it('keeps all six canonical mutations behind ActionExecution', () => {
    expect(count(canonical, /actionTargetMutation\.create\(/g)).toBe(1);
    expect(count(canonical, /operationalWorkItem\.create\(/g)).toBe(1);
    expect(count(canonical, /operationalWorkItem\.update\(/g)).toBe(1);
    expect(canonical).toContain('CanonicalActionIngressService');
    expect(canonical).toContain('ActionEngineKernel');
    expect(canonical).not.toMatch(/inboxItem\.(create|update|upsert|delete)/);
  });

  it('rejects a new production-reachable Wave 1 writer outside the canonical executor', () => {
    const canonicalPath = join(SRC, 'package5-wave1/package5-wave1.service.ts');
    const bypasses = productionSources()
      .filter((path) => path !== canonicalPath)
      .filter((path) =>
        /(dashboardPreference|appointmentNotificationSetting|operationalWorkItem)\.(create|update|upsert|delete)\(/.test(
          readFileSync(path, 'utf8'),
        ),
      );
    expect(bypasses).toEqual([]);
  });

  it('registers every Shadow/executable pair through the narrow Wave 1 registry', () => {
    expect(PACKAGE5_WAVE1_REGISTRATIONS).toHaveLength(8);
    expect(registry).toContain('package5Wave1Capability');
    for (const registration of PACKAGE5_WAVE1_REGISTRATIONS) {
      expect(registration.shadowCapability.endsWith('.shadow.v1')).toBe(true);
      expect(registration.executableCapability.endsWith('.execute.v1')).toBe(
        true,
      );
    }
  });
});
