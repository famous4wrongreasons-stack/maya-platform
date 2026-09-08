import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanConsentSecurityBoundary } from './consent-security-invalidation.architecture';
const root = join(__dirname, '..');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );
}
describe('permanent A18 security invalidation boundaries', () => {
  it('covers all backend HTTP, AI, background, delivery, and maintenance modules', () => {
    expect(
      files(root).flatMap((file) =>
        scanConsentSecurityBoundary(
          relative(root, file),
          readFileSync(file, 'utf8'),
        ).map((error) => `${relative(root, file)}: ${error}`),
      ),
    ).toEqual([]);
  });
  it.each([
    'controllers/consent.ts',
    'ai/repair.ts',
    'jobs/maintenance.ts',
    'communication-delivery/shortcut.ts',
  ])('rejects a new writer in %s', (file) => {
    expect(
      scanConsentSecurityBoundary(
        file,
        'async function run() { await db.clientConsentInvalidation.create({data: input}); }',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      scanConsentSecurityBoundary(
        file,
        'db.$executeRaw`UPDATE "ClientConsentInvalidation" SET "clientId" = ${client}`;',
      ).length,
    ).toBeGreaterThan(0);
  });
  it('rejects bypass of the admission, verifier, transaction or immutable evidence', () => {
    const file = 'package5-wave3/consent-security-invalidation.service.ts';
    const source = readFileSync(join(root, file), 'utf8');
    for (const marker of [
      'this.ingress.createExecution(',
      'this.serializable(',
      'this.approval.verify(',
      '.revokeInTransaction(',
    ])
      expect(
        scanConsentSecurityBoundary(file, source.replaceAll(marker, 'removed('))
          .length,
      ).toBeGreaterThan(0);
    expect(
      scanConsentSecurityBoundary(
        file,
        source +
          '\n db.clientConsentFact.create({data:{sourceType:"client_command",decision:"revoke"}})',
      ).length,
    ).toBeGreaterThan(0);
  });
  it('rejects invalidation-blind projection and older-grant resurrection', () => {
    const file = 'crm/client-effective-consent.ts';
    const source = readFileSync(join(root, file), 'utf8');
    expect(
      scanConsentSecurityBoundary(
        file,
        source.replace('!head.invalidation', 'true'),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      scanConsentSecurityBoundary(
        file,
        source.replace('tenantId, clientId, kind', 'tenantId, kind'),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      scanConsentSecurityBoundary(
        file,
        source + '\n const where = { invalidation: null };',
      ).length,
    ).toBeGreaterThan(0);
  });
  it('requires the authenticated platform initiator, never public or raw identity', () => {
    const controller = readFileSync(
      join(root, 'package5-wave3/consent-security-invalidation.controller.ts'),
      'utf8',
    );
    expect(controller).toContain('@Roles(UserRole.PLATFORM_OWNER)');
    expect(controller).toContain('@CurrentUser() actor');
    expect(controller).not.toMatch(
      /@Public|prisma|raw|clientConsentFact|clientChannelLink\./,
    );
  });
});
