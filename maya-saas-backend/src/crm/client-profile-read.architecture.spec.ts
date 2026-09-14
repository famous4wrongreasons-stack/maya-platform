import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanClientProfileRead } from './client-profile-read.architecture';
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
describe('B28 shared private CustomerProfile read protection', () => {
  it('scans every production backend/AI/helper source', () => {
    expect(
      files(root).flatMap((file) =>
        scanClientProfileRead(
          relative(root, file),
          readFileSync(file, 'utf8'),
        ).map((error) => relative(root, file) + ': ' + error),
      ),
    ).toEqual([]);
  });
  it.each([
    [
      'User profile lookup',
      'return db.customerProfile.findUnique({where:{userId_tenantId:{userId,tenantId}}});',
    ],
    [
      'unverified Client selector',
      'return db.customerProfile.findUnique({where:{tenantId_clientId:{tenantId,clientId}}});',
    ],
    ['hidden profile create', 'return db.customerProfile.create({data:{}});'],
    ['hidden profile update', 'return db.customerProfile.update({data:{}});'],
    ['hidden Client create', 'return db.client.create({data:{}});'],
    ['hidden link mutation', 'return db.clientChannelLink.update({data:{}});'],
    [
      'hidden consent mutation',
      'return db.clientConsentFact.create({data:{}});',
    ],
    [
      'User relation',
      'return db.user.findFirst({include:{customerProfiles:true}});',
    ],
  ])('rejects %s in any new production helper', (_label, body) => {
    expect(
      scanClientProfileRead(
        'helpers/new-profile.service.ts',
        `class Helper { getOwnProfile() { ${body} } }`,
      ).length,
    ).toBeGreaterThan(0);
  });
  it('keeps the bulk internal policy read limited to current consent/preferences', () => {
    const file = 'communication-delivery/communication-bulk-policy.service.ts';
    const code = readFileSync(join(root, file), 'utf8');
    expect(
      scanClientProfileRead(
        file,
        code.replace('privacyConsentAt: true', 'encryptedNotes: true'),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      scanClientProfileRead(
        file,
        code.replaceAll('this.links.assertClientEligible', 'removed'),
      ).length,
    ).toBeGreaterThan(0);
  });
  it('limits R08 internal invitation policy to qualified effective consent/preferences', () => {
    const file = 'native-feedback/native-feedback-policy.service.ts';
    const source = readFileSync(join(root, file), 'utf8');
    for (const marker of [
      'privacyConsentAt: true',
      'this.links.assertClientEligible',
      'effectiveClientConsents(tx, tenantId, clientId, now)',
      'lockClientConsent(tx, tenantId, clientId)',
    ])
      expect(
        scanClientProfileRead(file, source.replaceAll(marker, 'removed'))
          .length,
      ).toBeGreaterThan(0);
  });
  it('rejects predicate mismatch, stripped verified binding and missing database fence', () => {
    const file = 'crm/client-profile-read.service.ts',
      code = readFileSync(join(root, file), 'utf8');
    for (const marker of [
      'profile.clientId !== clientId',
      'profile.tenantId !== tenantId',
      'links.length !== 1',
      'revokedAt: null',
      'SET TRANSACTION READ ONLY',
    ]) {
      expect(
        scanClientProfileRead(file, code.replaceAll(marker, 'removed')).length,
      ).toBeGreaterThan(0);
    }
  });
  it('rejects a portal bypass and changes outside narrowly classified internal methods', () => {
    expect(
      scanClientProfileRead(
        'customer-portal/customer-portal.service.ts',
        'class Portal { getOverview() { return db.customerProfile.findFirst({where:{userId}}); } }',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      scanClientProfileRead(
        'marketing/marketing.service.ts',
        'class Marketing { getOwnProfile() { return db.customerProfile.findFirst({where:{userId}}); } }',
      ).length,
    ).toBeGreaterThan(0);
  });
  it('rejects any reintroduced profile authority in the retired issuer', () => {
    const file = 'crm/maya-user-client-association-issuer.ts';
    expect(
      scanClientProfileRead(file, readFileSync(join(root, file), 'utf8')),
    ).toEqual([]);
    expect(
      scanClientProfileRead(
        file,
        'class Issuer { resolve() { return tx.customerProfile.findMany({where:{userId}}); } }',
      ).length,
    ).toBeGreaterThan(0);
  });
});
