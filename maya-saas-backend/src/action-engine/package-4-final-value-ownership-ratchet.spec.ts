import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';

const SRC_ROOT = resolve(__dirname, '..');
const BACKEND_ROOT = resolve(SRC_ROOT, '..');

const VALUE_MODELS = new Set([
  'loyaltyAccount',
  'loyaltyTransaction',
  'loyaltyRedemptionGrant',
  'loyaltyRedemption',
  'customerReferral',
  'referralRewardIssuance',
  'referralReward',
  'referralRewardFulfillment',
  'customerSubscription',
  'customerSubscriptionUsage',
  'giftCertificate',
  'giftCertificateRedemption',
  'expense',
  'expensePeriodDeclaration',
  'expensePeriodDeclarationInvalidation',
  'billingPayment',
  'tenantCatalogItem',
  'tenantCatalogItemValueVersion',
  'referralProgram',
  'commerceIntegration',
]);

const MUTATION_OPERATIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

const CANONICAL_OWNER_FILES = new Set([
  'src/billing/p4-08-tenant-billing-executable.service.ts',
  'src/business-content/p4-09-value-configuration-executable.service.ts',
  'src/commerce/p4-10-commerce-credential-executable.service.ts',
  'src/customer-subscriptions/p4-05-customer-subscription-executable.service.ts',
  'src/expenses/p4-07-expense-executable.service.ts',
  'src/gift-certificates/p4-06-gift-certificate-executable.service.ts',
  'src/loyalty/p4-03-legacy-loyalty-executable.service.ts',
  'src/package5-wave4/package5-wave4.service.ts',
  'src/referrals/p4-04-referral-reward-executable.service.ts',
]);

const CONTROLLED_VALUE_PROOFS = [
  {
    path: 'scripts/package5-b27-loyalty-read-proof.ts',
    databaseGuard: "url.pathname !== '/maya_c06_b27_owned'",
    refusalMarker: 'Owned isolated B27 database required',
  },
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
    path: 'scripts/p4-07-expense-period-declaration-epoch-schema-proof.ts',
    databaseGuard: "database.startsWith('maya_c06_p407_epoch_')",
    refusalMarker: 'P4-07 epoch proof refuses non-disposable databases',
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
    path: 'scripts/p4-10-all4-executable-proof.ts',
    databaseGuard: "database.startsWith('maya_c06_p410_all4_')",
    refusalMarker: 'P4-10 proof refuses non-disposable databases',
  },
  {
    path: 'scripts/package5-wave4-all12-executable-proof.ts',
    databaseGuard: "name.startsWith('maya_c06_p5_wave4_')",
    refusalMarker: 'Wave 4 proof refuses a non-disposable database',
  },
] as const;

type SourceFile = { path: string; code: string };

type ValueWriteSite = {
  path: string;
  method: string;
  model: string;
  operation: string;
  code: string;
};

function productionTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    if (
      !entry.name.endsWith('.ts') ||
      entry.name.endsWith('.spec.ts') ||
      entry.name.endsWith('.test.ts')
    ) {
      return [];
    }
    return [path];
  });
}

function valueWriteSites(files: readonly SourceFile[]): ValueWriteSite[] {
  const sites: ValueWriteSite[] = [];
  for (const file of files) {
    const sourceFile = ts.createSourceFile(
      file.path,
      file.code,
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node, method = '<module>'): void => {
      const currentMethod = ts.isMethodDeclaration(node)
        ? node.name.getText(sourceFile)
        : ts.isFunctionDeclaration(node) && node.name
          ? node.name.text
          : method;
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        MUTATION_OPERATIONS.has(node.expression.name.text) &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        VALUE_MODELS.has(node.expression.expression.name.text)
      ) {
        sites.push({
          path: file.path,
          method: currentMethod,
          model: node.expression.expression.name.text,
          operation: node.expression.name.text,
          code: node.getText(sourceFile),
        });
      }
      ts.forEachChild(node, (child) => visit(child, currentMethod));
    };
    visit(sourceFile);
  }
  return sites;
}

function isControlledProof(file: SourceFile): boolean {
  const contract = CONTROLLED_VALUE_PROOFS.find(
    (candidate) => candidate.path === file.path,
  );
  return Boolean(
    contract &&
    file.code.includes(contract.databaseGuard) &&
    file.code.includes(contract.refusalMarker),
  );
}

function isApprovedProductionOwner(site: ValueWriteSite): boolean {
  if (CANONICAL_OWNER_FILES.has(site.path)) return true;
  if (site.path === 'src/loyalty/loyalty.service.ts') {
    return ['applyInternalAdjustment', 'bindConcurrentAdjustment'].includes(
      site.method,
    );
  }
  return false;
}

function productionViolations(files: readonly SourceFile[]): ValueWriteSite[] {
  const controlledProofPaths = new Set(
    files.filter(isControlledProof).map((file) => file.path),
  );
  return valueWriteSites(files).filter(
    (site) =>
      !controlledProofPaths.has(site.path) && !isApprovedProductionOwner(site),
  );
}

describe('Package 4 final value execution ownership ratchet', () => {
  const files = [join(BACKEND_ROOT, 'src'), join(BACKEND_ROOT, 'scripts')]
    .flatMap(productionTypeScriptFiles)
    .map((path) => ({
      path: relative(BACKEND_ROOT, path),
      code: readFileSync(path, 'utf8'),
    }));

  it('has no production value mutation owner outside canonical executors', () => {
    expect(productionViolations(files)).toEqual([]);

    const productionOwnerFiles = [
      ...new Set(
        valueWriteSites(files)
          .filter(
            (site) =>
              !CONTROLLED_VALUE_PROOFS.some(
                (proof) => proof.path === site.path,
              ),
          )
          .filter(
            (site) =>
              !(
                site.path === 'src/loyalty/loyalty.service.ts' &&
                site.method === 'getForUser' &&
                !/\bbalance\s*:/.test(site.code)
              ),
          )
          .map((site) => site.path),
      ),
    ].sort();
    expect(productionOwnerFiles).toEqual([
      'src/billing/p4-08-tenant-billing-executable.service.ts',
      'src/business-content/p4-09-value-configuration-executable.service.ts',
      'src/commerce/p4-10-commerce-credential-executable.service.ts',
      'src/customer-subscriptions/p4-05-customer-subscription-executable.service.ts',
      'src/expenses/p4-07-expense-executable.service.ts',
      'src/gift-certificates/p4-06-gift-certificate-executable.service.ts',
      'src/loyalty/loyalty.service.ts',
      'src/loyalty/p4-03-legacy-loyalty-executable.service.ts',
      'src/package5-wave4/package5-wave4.service.ts',
      'src/referrals/p4-04-referral-reward-executable.service.ts',
    ]);

    expect(
      valueWriteSites(files)
        .filter(
          (site) =>
            site.path === 'src/business-content/business-content.service.ts',
        )
        .map((site) => site.method),
    ).toEqual([]);
  });

  it('classifies proof writers only through exact disposable database contracts', () => {
    for (const proof of CONTROLLED_VALUE_PROOFS) {
      const file = files.find((candidate) => candidate.path === proof.path);
      expect(file).toBeDefined();
      expect(isControlledProof(file!)).toBe(true);
    }
  });

  it('detects a new production direct value writer', () => {
    const bypass: SourceFile = {
      path: 'src/rogue/read-owned-loyalty-writer.ts',
      code: `
        class RogueReadWriter {
          constructor(private readonly prisma: any) {}
          async getBalance() {
            return this.prisma.loyaltyAccount.update({
              where: { id: 'account' },
              data: { balance: 900 },
            });
          }
        }
      `,
    };

    expect(productionViolations([bypass])).toMatchObject([
      {
        path: bypass.path,
        method: 'getBalance',
        model: 'loyaltyAccount',
        operation: 'update',
      },
    ]);
  });

  it('does not exempt a lookalike proof filename', () => {
    const lookalike: SourceFile = {
      path: 'scripts/p4-03-lookalike-executable-proof.ts',
      code: [
        "database.startsWith('maya_c06_p403_all8_')",
        'P4-03 proof refuses non-disposable databases',
        'await prisma.loyaltyAccount.update({ data: { balance: 900 } });',
      ].join(';'),
    };

    expect(productionViolations([lookalike])).toHaveLength(1);
  });

  it('rejects an approved proof when either database guard is missing', () => {
    for (const proof of CONTROLLED_VALUE_PROOFS) {
      const file = files.find((candidate) => candidate.path === proof.path)!;
      expect(
        isControlledProof({
          ...file,
          code: file.code.replace(proof.databaseGuard, 'database.length > 0'),
        }),
      ).toBe(false);
      expect(
        isControlledProof({
          ...file,
          code: file.code.replace(
            proof.refusalMarker,
            'proof database rejected',
          ),
        }),
      ).toBe(false);
    }
  });
});
