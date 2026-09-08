const compact = (text: string) =>
  text.replace(/\s+/g, '').replace(/,([)}\]])/g, '$1');
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import {
  ASSISTANT_CAPABILITIES,
  DEFAULT_ASSISTANT_CAPABILITIES,
} from '../dashboard-preferences/assistant-capabilities.constants';
import { parseExpenseCards } from '../expense-intake/expense-intake.service';
import {
  assertVerifiedExpenseSource,
  type VerifiedExpenseSource,
} from '../expense-intake/expense-intake-source.service';
const root = resolve(__dirname, '..'),
  repo = resolve(root, '../..'),
  read = (p: string) => readFileSync(resolve(root, p), 'utf8');
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
  const tree = ts.createSourceFile(
      'candidate.ts',
      source,
      ts.ScriptTarget.Latest,
      true,
    ),
    aliases = new Set<string>(),
    found: string[] = [];
  const owns = (node: ts.Node): boolean =>
    /expense(?:ReminderRun|IntakeBinding)/.test(node.getText(tree)) ||
    (ts.isIdentifier(node) && aliases.has(node.text));
  function walk(n: ts.Node) {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      owns(n.initializer)
    )
      aliases.add(n.name.text);
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      /^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(
        n.expression.name.text,
      ) &&
      owns(n.expression.expression)
    )
      found.push(n.getText(tree));
    ts.forEachChild(n, walk);
  }
  walk(tree);
  return found;
}
describe('R13 canonical expense reminder/source/approval ownership', () => {
  it('permits new owner ORM writes only in the two approved admission owners', () => {
    expect(
      files(root)
        .filter((p) => writes(readFileSync(p, 'utf8')).length)
        .map((p) => relative(root, p)),
    ).toEqual([
      'expense-intake/expense-intake.service.ts',
      'expense-intake/expense-reminder.store.ts',
    ]);
    expect(
      writes('const bypass=db.expenseIntakeBinding;bypass.create({});'),
    ).toHaveLength(1);
  });
  it('uses default-off opt-in and never promotes an unsigned human principal', () => {
    expect(ASSISTANT_CAPABILITIES).toContain('weekly_expense_reminders');
    expect(DEFAULT_ASSISTANT_CAPABILITIES).not.toContain(
      'weekly_expense_reminders',
    );
    expect(() =>
      assertVerifiedExpenseSource({} as VerifiedExpenseSource),
    ).toThrow();
    const source = read('expense-intake/expense-intake-source.service.ts');
    for (const marker of [
      'this.reader.read(actor',
      'p.telegramId!==source.senderId',
      'p.membershipId!==actor.membershipId',
      'new LegacyStaffPrincipalController',
      'verified.add(value)',
    ])
      expect(compact(source)).toContain(compact(marker));
    expect(source).not.toMatch(/\.create\(|\.update\(|\.upsert\(|\.approve\(/);
  });
  it('keeps R10/approval/P407 as existing owners and freezes complete source bundles first', () => {
    const source = read('expense-intake/expense-intake.service.ts');
    expect(compact(source).indexOf('constprevious=')).toBeLessThan(
      compact(source).indexOf('cards=parser('),
    );
    for (const marker of [
      'pg_advisory_xact_lock',
      'IDEMPOTENCY_CONFLICT',
      'admitExpenseIntakeApproval(tx',
      'sourceItemCount:cards.length',
      'ledgerMutations:0',
    ])
      expect(compact(source)).toContain(compact(marker));
    expect(source).not.toMatch(
      /expense\.(create|delete|update)|\.approve\(|\.execute\(|send_message|fetch\(/,
    );
    const runtime = read('ai-tools/ai-tool-runtime.service.ts');
    expect(runtime).toContain('this.approvalData(');
    expect(runtime).toContain('tx.aiApprovalRequest.create');
  });
  it('requires explicit complete candidates without a current-day or model fallback', () => {
    expect(
      parseExpenseCards('/rashod 2026-09-08 | supplies | 12,34 | весь бизнес'),
    ).toEqual([
      {
        occurred_on: '2026-09-08',
        category: 'supplies',
        amount_rubles: 12.34,
        branch_id: null,
      },
    ]);
    for (const text of [
      'coffee 500',
      '2026-09-08 | supplies | 12.34',
      '2026-09-08 | supplies | 12.34 |',
    ])
      expect(() => parseExpenseCards(text)).toThrow();
  });
  it('ratchets full Python source and browser lost-response paths', () => {
    execFileSync(
      'python3',
      ['-m', 'unittest', 'test_package5_expense_intake'],
      {
        cwd: resolve(repo, 'ai администратор'),
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        stdio: 'pipe',
      },
    );
    execFileSync(
      process.execPath,
      [
        resolve(
          repo,
          'docs/rebuild/evidence/package5-wave-rc-r13-pwa.proof.cjs',
        ),
      ],
      { stdio: 'pipe' },
    );
  });
});
