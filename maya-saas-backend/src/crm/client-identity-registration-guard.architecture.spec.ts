import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const BACKEND_ROOT = resolve(SRC_ROOT, '..');
const CANONICAL_OWNER = 'src/crm/client-identity.service.ts';
const CONTROLLED_PROOF_FIXTURES = [
  {
    path: 'scripts/p4-03-all8-executable-proof.ts',
    databaseGuard: "database.startsWith('maya_c06_p403_all8_')",
    refusalMarker: 'P4-03 proof refuses non-disposable databases',
  },
  {
    path: 'scripts/p4-04-all4-executable-proof.ts',
    databaseGuard: "database.startsWith('maya_c06_p404_all4_')",
    refusalMarker: 'P4-04 proof refuses non-disposable databases',
  },
] as const;

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

function isControlledProofFixture(file: SourceFile): boolean {
  const fixture = CONTROLLED_PROOF_FIXTURES.find(
    ({ path }) => path === file.path,
  );
  return Boolean(
    fixture &&
    file.code.includes(fixture.databaseGuard) &&
    file.code.includes(fixture.refusalMarker),
  );
}

function productionRegistrationOwners(files: SourceFile[]): string[] {
  return files
    .filter(({ code }) => isRegistrationMutation(code))
    .filter((file) => !isControlledProofFixture(file))
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
    expect(owners).toEqual([
      'scripts/p4-03-all8-executable-proof.ts',
      'scripts/p4-04-all4-executable-proof.ts',
      CANONICAL_OWNER,
    ]);

    const p403Proof = files.find(
      ({ path }) => path === 'scripts/p4-03-all8-executable-proof.ts',
    );
    expect(isControlledProofFixture(p403Proof!)).toBe(true);

    const p404Proof = files.find(
      ({ path }) => path === 'scripts/p4-04-all4-executable-proof.ts',
    );
    expect(isControlledProofFixture(p404Proof!)).toBe(true);

    expect(productionRegistrationOwners(files)).toEqual([CANONICAL_OWNER]);
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

    expect(productionRegistrationOwners(syntheticBypasses)).toEqual([
      'rogue/background-registration.job.ts',
      'rogue/http-registration.service.ts',
    ]);
  });

  it('does not exclude a lookalike proof path or the scripts directory broadly', () => {
    const lookalike: SourceFile = {
      path: 'scripts/p4-04-lookalike-executable-proof.ts',
      code: [
        "database.startsWith('maya_c06_p404_all4_')",
        'P4-04 proof refuses non-disposable databases',
        'await tx.client.create({ data });',
      ].join(';'),
    };

    expect(productionRegistrationOwners([lookalike])).toEqual([
      'scripts/p4-04-lookalike-executable-proof.ts',
    ]);
  });

  it('requires both physical disposable-database markers on the exact proof path', () => {
    const proof = files.find(
      ({ path }) => path === 'scripts/p4-04-all4-executable-proof.ts',
    );
    const withoutDatabaseGuard = proof?.code.replace(
      "database.startsWith('maya_c06_p404_all4_')",
      'database.length > 0',
    );
    const withoutRefusalMarker = proof?.code.replace(
      'P4-04 proof refuses non-disposable databases',
      'proof database rejected',
    );

    expect([
      isControlledProofFixture({ ...proof!, code: withoutDatabaseGuard! }),
      isControlledProofFixture({ ...proof!, code: withoutRefusalMarker! }),
    ]).toEqual([false, false]);
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
