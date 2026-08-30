import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const BACKEND_ROOT = resolve(SRC_ROOT, '..');
const CANONICAL_OWNER = 'src/crm/client-identity.service.ts';
const CONTROLLED_PROOF_FIXTURE = 'scripts/p4-03-all8-executable-proof.ts';

type SourceFile = { path: string; code: string };

function productionTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return productionTypeScriptFiles(path);
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) {
      return [];
    }
    return [path];
  });
}

function isRegistrationMutation(code: string): boolean {
  return [
    /\b(?:this\.)?prisma\.client\.(?:create|createMany|upsert)\s*\(/,
    /\b(?:this\.)?prisma\.crmClientLink\.(?:create|createMany|upsert)\s*\(/,
    /\btx\.client\.(?:create|createMany|upsert)\s*\(/,
    /\btx\.crmClientLink\.(?:create|createMany|upsert)\s*\(/,
    /\bcrmLinks\s*:\s*\{[\s\S]{0,240}\bcreate\s*:/,
    /\$(?:executeRaw|queryRaw)[\s\S]{0,400}["'`]CrmClientLink["'`]/,
  ].some((pattern) => pattern.test(code));
}

function registrationOwners(files: SourceFile[]): string[] {
  return files
    .filter(({ code }) => isRegistrationMutation(code))
    .map(({ path }) => path)
    .sort();
}

describe('P4-03 unresolved client identity runtime registration guard', () => {
  const files = [join(BACKEND_ROOT, 'src'), join(BACKEND_ROOT, 'scripts')]
    .flatMap(productionTypeScriptFiles)
    .map((path) => ({
      path: relative(BACKEND_ROOT, path),
      code: readFileSync(path, 'utf8'),
    }));

  it('keeps one production identity-registration owner', () => {
    const owners = registrationOwners(files);
    expect(owners).toEqual([CONTROLLED_PROOF_FIXTURE, CANONICAL_OWNER]);

    const proof = files.find(
      ({ path }) => path === CONTROLLED_PROOF_FIXTURE,
    )?.code;
    expect(proof).toContain("database.startsWith('maya_c06_p403_all8_')");
    expect(proof).toContain('P4-03 proof refuses non-disposable databases');

    expect(owners.filter((path) => path !== CONTROLLED_PROOF_FIXTURE)).toEqual([
      CANONICAL_OWNER,
    ]);
  });

  it('still catches a real direct Client or CrmClientLink owner', () => {
    const syntheticBypasses: SourceFile[] = [
      {
        path: 'rogue/http-registration.service.ts',
        code: 'await this.prisma.crmClientLink.create({ data });',
      },
      {
        path: 'rogue/background-registration.job.ts',
        code: 'await tx.client.create({ data });',
      },
    ];

    expect(registrationOwners(syntheticBypasses)).toEqual([
      'rogue/background-registration.job.ts',
      'rogue/http-registration.service.ts',
    ]);
  });

  it('checks the tenant-qualified active hold inside the write transaction', () => {
    const owner = files.find(({ path }) => path === CANONICAL_OWNER)?.code;
    expect(owner).toBeDefined();
    expect(owner).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(owner).toContain('await this.assertRegistrationAllowed(tx, {');
    expect(owner).toContain('tx.crmClientLink.findUnique({');
    expect(owner).toContain('tx.client.create({');
    expect(owner).toContain('db.unresolvedClientIdentityHold.findUnique({');
    expect(owner).toContain('tenantId_provider_externalId: {');
    expect(owner).toContain('hold?.resolvedAt === null');
    expect(owner).toContain("'client_identity_unresolved'");

    const guard =
      owner?.indexOf('await this.assertRegistrationAllowed(tx, {') ?? -1;
    const linkLookup = owner?.indexOf('tx.crmClientLink.findUnique({') ?? -1;
    const clientCreate = owner?.indexOf('tx.client.create({') ?? -1;
    expect(guard).toBeGreaterThan(0);
    expect(linkLookup).toBeGreaterThan(guard);
    expect(clientCreate).toBeGreaterThan(linkLookup);
  });

  it('has no second production call surface that bypasses the canonical owner', () => {
    const callSurfaces = files
      .filter(
        ({ path, code }) =>
          path !== CANONICAL_OWNER &&
          /\.(?:tryRegisterCrmClient|registerCrmClient)\s*\(/.test(code),
      )
      .map(({ path }) => path)
      .sort();

    expect(callSurfaces).toEqual(['src/crm/crm.service.ts']);
  });
});
