import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanClientLoyaltyRead } from './client-loyalty-read.architecture';
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
describe('B27 shared private loyalty read protection', () => {
  it('scans every production backend/AI/helper source', () => {
    expect(
      files(root).flatMap((file) =>
        scanClientLoyaltyRead(
          relative(root, file),
          readFileSync(file, 'utf8'),
        ).map((error) => relative(root, file) + ': ' + error),
      ),
    ).toEqual([]);
  });
  it.each([
    ['account creation', 'return db.loyaltyAccount.upsert({create:{}});'],
    ['balance update', 'return db.loyaltyAccount.update({data:{balance:7}});'],
    ['phone CRM read', 'return crm.getClientLoyalty(tenantId, user.phone);'],
    [
      'raw Telegram identity',
      'return db.authIdentity.findFirst({provider:"telegram"});',
    ],
    [
      'unverified exact Client value',
      'return db.loyaltyAccount.findUnique({where:{tenantId_clientId:{tenantId,clientId}}});',
    ],
    [
      'User account fallback',
      'return db.loyaltyAccount.findUnique({where:{userId_tenantId:{userId,tenantId}}});',
    ],
  ])('rejects %s in a new helper', (_label, body) => {
    expect(
      scanClientLoyaltyRead(
        'helpers/new-loyalty.service.ts',
        `class NewHelper { getForUser() { ${body} } }`,
      ).length,
    ).toBeGreaterThan(0);
  });
  it('cannot strip the verified link gate or database read-only fence', () => {
    const file = 'crm/client-loyalty-read.service.ts',
      code = readFileSync(join(root, file), 'utf8');
    for (const marker of [
      'links.length !== 1',
      'SET TRANSACTION READ ONLY',
      'unresolvedClientIdentityHold.findFirst',
    ]) {
      expect(
        scanClientLoyaltyRead(file, code.replace(marker, 'removed')).length,
      ).toBeGreaterThan(0);
    }
  });
});
