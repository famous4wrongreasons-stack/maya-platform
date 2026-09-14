import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { scanReviewAuthority } from '../business-content/review-authority.architecture';

const root = resolve(__dirname, '../../..');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory()
      ? files(resolve(dir, item.name))
      : [resolve(dir, item.name)],
  );
}

describe('B34 sole immutable AC4 review owner', () => {
  it('scans all backend modules, including background and future entrants', () => {
    const src = resolve(root, 'maya-saas-backend/src');
    for (const file of files(src).filter((f) => f.endsWith('.ts')))
      expect(
        scanReviewAuthority(relative(src, file), readFileSync(file, 'utf8')),
      ).toEqual([]);
  });

  it.each([
    'p.businessReview.create({data})',
    "p['businessReview']['upsert']({data})",
    'const delegate = p.businessReview; delegate.update({data})',
    'const {create: bypass} = p.businessReview; bypass({data})',
    'p.tenant.update({data: {businessReviews: {create: input}}})',
    'p.$executeRaw`UPDATE "BusinessReview" SET rating=1`',
  ])('rejects direct, aliased and SQL bypass: %s', (source) => {
    expect(scanReviewAuthority('later/background.ts', source)).not.toEqual([]);
    expect(
      scanReviewAuthority('later/review-authority.architecture.ts', source),
    ).not.toEqual([]);
  });

  it('rejects evidence updates even inside the approved owner', () => {
    const path = 'package5-wave4/package5-wave4.service.ts';
    const source = readFileSync(
      resolve(root, 'maya-saas-backend/src', path),
      'utf8',
    );
    expect(
      scanReviewAuthority(
        path,
        source.replace('tx.businessReview.create', 'tx.businessReview.upsert'),
      ),
    ).not.toEqual([]);
  });

  it('enforces active Python route/module/job retirement and executable no-write regressions', () => {
    execFileSync(
      'python3',
      [
        '-B',
        '-m',
        'unittest',
        'test_package5_b34_review_retirement',
        'test_reputation',
      ],
      {
        cwd: resolve(root, 'ai администратор'),
        stdio: 'pipe',
      },
    );
  });
});
