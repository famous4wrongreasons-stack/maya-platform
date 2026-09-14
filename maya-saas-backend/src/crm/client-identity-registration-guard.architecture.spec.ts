import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

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
  {
    path: 'scripts/p4-05-all8-executable-proof.ts',
    databaseGuard: "database.startsWith('maya_c06_p405_all8_')",
    refusalMarker: 'P4-05 proof refuses non-disposable databases',
  },
  {
    path: 'scripts/p4-06-all3-executable-proof.ts',
    databaseGuard: "database.startsWith('maya_c06_p406_all3_')",
    refusalMarker: 'P4-06 proof refuses non-disposable databases',
  },
  {
    path: 'scripts/p4-09-all7-executable-proof.ts',
    databaseGuard: "database.startsWith('maya_c06_p409_all7_')",
    refusalMarker: 'P4-09 proof refuses non-disposable databases',
  },
  {
    path: 'scripts/p4-09-immutable-offer-value-version-schema-proof.ts',
    databaseGuard: "database.startsWith('maya_c06_p409_offer_')",
    refusalMarker: 'P4-09 offer proof refuses non-disposable databases',
  },
  {
    path: 'scripts/p4-09-offer-replacement-lineage-schema-proof.ts',
    databaseGuard: "database.startsWith('maya_c06_p409_lineage_')",
    refusalMarker: 'P4-09 lineage proof refuses non-disposable databases',
  },
  {
    path: 'scripts/package5-a18-client-link-challenge-proof.ts',
    databaseGuard: "url.pathname.startsWith('/maya_c06_a18_challenge_v1_')",
    refusalMarker:
      'Challenge proof requires its owned isolated PostgreSQL database',
  },
  {
    path: 'scripts/package5-common-authority-foundation-proof.ts',
    databaseGuard: "name.startsWith('maya_c06_p5_foundation_')",
    refusalMarker:
      'Package 5 foundation proof refuses non-disposable databases',
  },
  {
    path: 'scripts/package5-wave3-all8-executable-proof.ts',
    databaseGuard: "name.startsWith('maya_c06_p5_wave3_')",
    refusalMarker: 'Wave 3 proof refuses a non-disposable database',
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

function hasRawLinkMutation(code: string): boolean {
  const ast = ts.createSourceFile(
    'source.ts',
    code,
    ts.ScriptTarget.Latest,
    true,
  );
  // Match writes anywhere in a SQL statement, including a writable CTE whose
  // final statement is SELECT. A SELECT ... FOR SHARE is a read/lock, not registration.
  const mutation =
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE(?:\s+TABLE)?)\s+(?:(?:"?[A-Za-z_][A-Za-z0-9_]*"?)\s*\.\s*)?"?CrmClientLink"?\b/i;
  const rawBoundary = (name: string) =>
    /(?:^|\.)\$(?:executeRaw|queryRaw)(?:Unsafe)?$/.test(name) ||
    /^Prisma\.(?:sql|raw)$/.test(name);
  let found = false;
  const walk = (node: ts.Node) => {
    if (
      ts.isTaggedTemplateExpression(node) &&
      rawBoundary(node.tag.getText(ast)) &&
      mutation.test(node.template.getText(ast))
    )
      found = true;
    if (
      ts.isCallExpression(node) &&
      rawBoundary(node.expression.getText(ast)) &&
      node.arguments.some((arg) => mutation.test(arg.getText(ast)))
    )
      found = true;
    ts.forEachChild(node, walk);
  };
  walk(ast);
  return found;
}

function isRegistrationMutation(code: string): boolean {
  return (
    [
      /\b(?:this\.)?prisma\.client\.(?:create|createMany|upsert)\s*\(/,
      /\b(?:this\.)?prisma\.crmClientLink\.(?:create|createMany|upsert)\s*\(/,
      /\btx\.client\.(?:create|createMany|upsert)\s*\(/,
      /\btx\.crmClientLink\.(?:create|createMany|upsert)\s*\(/,
      /\bcrmLinks\s*:\s*\{[\s\S]{0,240}\bcreate\s*:/,
    ].some((pattern) => pattern.test(code)) || hasRawLinkMutation(code)
  );
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
    file.code.includes(fixture.refusalMarker) &&
    (file.path !== 'scripts/package5-a18-client-link-challenge-proof.ts' ||
      (file.code.includes("url.hostname !== '127.0.0.1'") &&
        file.code.includes("url.port !== '55487'"))),
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
      'scripts/p4-05-all8-executable-proof.ts',
      'scripts/p4-06-all3-executable-proof.ts',
      'scripts/p4-09-all7-executable-proof.ts',
      'scripts/p4-09-immutable-offer-value-version-schema-proof.ts',
      'scripts/p4-09-offer-replacement-lineage-schema-proof.ts',
      'scripts/package5-a18-client-link-challenge-proof.ts',
      'scripts/package5-common-authority-foundation-proof.ts',
      'scripts/package5-wave3-all8-executable-proof.ts',
      CANONICAL_OWNER,
    ]);

    for (const fixture of CONTROLLED_PROOF_FIXTURES) {
      const file = files.find(({ path }) => path === fixture.path);
      expect(file).toBeDefined();
      expect(isControlledProofFixture(file!)).toBe(true);
    }

    expect(productionRegistrationOwners(files)).toEqual([CANONICAL_OWNER]);
  });

  it('requires loopback and the owned port for the exact A18 challenge proof', () => {
    const file = files.find(
      (x) => x.path === 'scripts/package5-a18-client-link-challenge-proof.ts',
    )!;
    for (const marker of [
      "url.hostname !== '127.0.0.1'",
      "url.port !== '55487'",
    ])
      expect(
        productionRegistrationOwners([
          { ...file, code: file.code.replace(marker, 'false') },
        ]),
      ).toEqual([file.path]);
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

  it.each([
    'await tx.$queryRaw`INSERT INTO "CrmClientLink" (id) VALUES (1)`;',
    'await tx.$executeRaw`UPDATE "CrmClientLink" SET "clientId"=1`;',
    'await tx.$executeRaw`DELETE FROM public."CrmClientLink" WHERE id=1`;',
    'await tx.$queryRaw`WITH changed AS (UPDATE "CrmClientLink" SET "clientId"=1 RETURNING id) SELECT * FROM changed`;',
    'const query = Prisma.sql`WITH added AS (INSERT INTO "CrmClientLink" (id) VALUES (1) RETURNING id) SELECT * FROM added`; await tx.$queryRaw(query);',
    'await tx.$executeRawUnsafe(\'TRUNCATE TABLE "CrmClientLink"\');',
  ])('detects raw identity mutations including writable CTEs: %s', (code) => {
    expect(
      productionRegistrationOwners([{ path: 'rogue/raw.ts', code }]),
    ).toEqual(['rogue/raw.ts']);
  });

  it.each([
    'await tx.$queryRaw`SELECT id FROM "CrmClientLink" WHERE "tenantId"=${tenantId} FOR SHARE`;',
    'await tx.$queryRaw(Prisma.sql`SELECT id FROM "CrmClientLink" WHERE "clientId"=${clientId} FOR SHARE`);',
    'await tx.$queryRaw`WITH links AS (SELECT id FROM "CrmClientLink" FOR SHARE) SELECT * FROM links`;',
    'await tx.$queryRaw`SELECT id FROM "Client" FOR SHARE`; const owner = "CrmClientLink";',
  ])(
    'permits source reads and publication locks without naming them registration: %s',
    (code) => {
      expect(
        productionRegistrationOwners([{ path: 'reader/read.ts', code }]),
      ).toEqual([]);
    },
  );

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
    for (const fixture of CONTROLLED_PROOF_FIXTURES) {
      const file = files.find(({ path }) => path === fixture.path)!;
      expect(
        isControlledProofFixture({
          ...file,
          code: file.code.replace(fixture.databaseGuard, 'database.length > 0'),
        }),
      ).toBe(false);
      expect(
        isControlledProofFixture({
          ...file,
          code: file.code.replace(
            fixture.refusalMarker,
            'proof database rejected',
          ),
        }),
      ).toBe(false);
    }
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

    // B27 removes the last read-triggered identity registration caller.
    expect(callSurfaces).toEqual([]);
  });
});
