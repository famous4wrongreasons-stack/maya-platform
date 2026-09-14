import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { publicCommunityCapabilities } from '../public-community/public-community.contract';
import ts from 'typescript';

const root = resolve(__dirname, '..'),
  repo = resolve(root, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory()
      ? files(resolve(dir, x.name))
      : x.name.endsWith('.ts') && !x.name.endsWith('.spec.ts')
        ? [resolve(dir, x.name)]
        : [],
  );
}
function writes(source: string) {
  const ast = ts.createSourceFile(
      'candidate.ts',
      source,
      ts.ScriptTarget.Latest,
      true,
    ),
    aliases = new Set<string>(),
    found: string[] = [];
  const owner = (node: ts.Node): boolean =>
    /publicCommunity(?:Comment|Interaction)/.test(node.getText(ast)) ||
    (ts.isIdentifier(node) && aliases.has(node.text));
  function walk(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      owner(node.initializer)
    )
      aliases.add(node.name.text);
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      /^(?:create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(
        node.expression.name.text,
      ) &&
      owner(node.expression.expression)
    )
      found.push(node.getText(ast));
    ts.forEachChild(node, walk);
  }
  walk(ast);
  return found;
}
describe('R09 anonymous source / human moderation architectural boundary', () => {
  it('permits business writes only in the canonical owner and scoped AC6 erasure', () => {
    const writers = files(root)
      .filter((file) => writes(readFileSync(file, 'utf8')).length)
      .map((file) => relative(root, file));
    expect(writers).toEqual(['public-community/public-community.service.ts']);
    expect(
      writes('const alias=db.publicCommunityComment;alias.update({});'),
    ).toHaveLength(1);
    const sqlWriters = files(root)
      .filter((file) =>
        /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?PublicCommunity(?:Comment|Interaction)/i.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(root, file));
    expect(
      sqlWriters.every(
        (file) => file === 'package5-wave6/package5-wave-rc-payloads.ts',
      ),
    ).toBe(true);
    const owner = read('public-community/public-community.service.ts');
    for (const marker of [
      'this.ingress.createExecution(request, tx)',
      'this.kernel.claimExecution',
      'tx.actionTargetMutation.create',
      'this.kernel.finalizeSuccess',
      'assertAuthPrincipal',
      'STALE_COMMUNITY_REVISION',
      'IDEMPOTENCY_CONFLICT',
    ])
      expect(owner).toContain(marker);
    expect(owner).not.toMatch(
      /\.client\.(create|upsert|update)|\.businessReview\.(create|upsert)|fetch\(|sendTelegram|sendMessage|\.deliver/,
    );
  });
  it('registers only two approved business classes, and no provider executor', () => {
    expect(publicCommunityCapabilities().map((c) => c.actionClass)).toEqual([
      'moderate_public_community_comment',
      'publish_public_community_reply',
    ]);
    for (const cap of publicCommunityCapabilities()) {
      expect(cap.allowedSourceTypes).toEqual(['authenticated_request']);
      expect(cap.executorKey).toBe('public-community.local');
    }
    expect(read('action-engine/action-engine.policy-registry.ts')).toContain(
      "capability.startsWith('public-community.')",
    );
  });
  it('keeps public source credentials separate from moderator/Client authority', () => {
    const gateway = read(
      'public-community/public-community-gateway.service.ts',
    );
    for (const marker of [
      'timingSafeEqual',
      'PUBLIC_COMMUNITY_GATEWAYS',
      'sourceGatewayId',
      'staticPublicationKeys',
      'publishedPostNamespace',
      'this.admitted.has',
      'Source transport grants no moderator capability',
    ])
      expect(gateway).toContain(marker);
    const controller = read('public-community/public-community.controller.ts');
    expect(controller).toContain('this.gateway.verify');
    expect(controller).toContain('runAsPublicTenant');
    expect(controller).toMatch(/@Roles\(\s*UserRole\.TENANT_OWNER/);
    expect(controller).not.toMatch(/\.create\(|\.update\(|fetch\(|send|sql`/);
  });
  it('leaves feed reads pure and audience/identity projections anonymous', () => {
    const owner = read('public-community/public-community.service.ts').split(
      'async status(',
    )[1];
    expect(owner).toContain('readOnly: true');
    expect(owner).not.toMatch(/\.create\(|\.update\(|\.delete\(/);
    expect(owner).toContain("status: 'APPROVED'");
    expect(owner).toContain('retentionUntil: { gt: now }');
    expect(owner).toContain('SELECT DISTINCT ON ("visitorSubjectHash")');
  });
  it('permanently checks whole production Python modules and mutation mutants', () => {
    execFileSync(
      'python3',
      ['-m', 'unittest', 'test_package5_public_community'],
      {
        cwd: resolve(repo, 'ai администратор'),
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        stdio: 'pipe',
      },
    );
  });
  it('public and management initiators preserve explicit intent across lost responses', () => {
    for (const proof of [
      'package5-wave-rc-r09-public.proof.cjs',
      'package5-wave-rc-r09-pwa.proof.cjs',
    ])
      execFileSync(
        process.execPath,
        [resolve(repo, 'docs/rebuild/evidence', proof)],
        { stdio: 'pipe' },
      );
  });
});
