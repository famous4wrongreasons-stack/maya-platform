import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const root = join(process.cwd(), '..'),
  src = join(process.cwd(), 'src');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')
        ? [join(dir, e.name)]
        : [],
  );
}
function calls(source: string, model: string, verbs: string[]) {
  const ast = ts.createSourceFile(
      'candidate.ts',
      source,
      ts.ScriptTarget.Latest,
      true,
    ),
    aliases = new Set<string>(),
    matches: string[] = [];
  const references = (n: ts.Node) =>
    n.getText(ast).includes(model) ||
    (ts.isIdentifier(n) && aliases.has(n.text));
  function visit(n: ts.Node) {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      references(n.initializer)
    )
      aliases.add(n.name.text);
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      verbs.includes(n.expression.name.text) &&
      references(n.expression.expression)
    )
      matches.push(n.getText(ast));
    ts.forEachChild(n, visit);
  }
  visit(ast);
  return matches;
}
describe('R06 canonical producer/admission/effect boundary', () => {
  it('all new Inbox cards are written only in Communication Delivery, including aliased writers', () => {
    const found = files(src).filter(
      (p) =>
        !relative(src, p).startsWith('communication-delivery/') &&
        calls(readFileSync(p, 'utf8'), 'inboxItem', [
          'create',
          'createMany',
          'upsert',
        ]).length,
    );
    expect(found).toEqual([]);
    for (const sample of [
      'await db.inboxItem.create({});',
      'const writer=db.inboxItem; await writer.upsert({});',
    ])
      expect(calls(sample, 'inboxItem', ['create', 'upsert'])).toHaveLength(1);
  });
  it('only the finite alert store creates an OperationalAlertRun; AC6 only clears its payload', () => {
    const found = files(src).filter(
      (p) =>
        relative(src, p) !== 'operational-alerts/operational-alert.store.ts' &&
        calls(readFileSync(p, 'utf8'), 'operationalAlertRun', [
          'create',
          'createMany',
          'upsert',
          'delete',
          'deleteMany',
        ]).length,
    );
    expect(found).toEqual([]);
    const store = readFileSync(
      join(src, 'operational-alerts/operational-alert.store.ts'),
      'utf8',
    );
    expect(store).toContain('this.ingress.createExecution');
    expect(store).toContain('Serializable');
    expect(store).toContain('IDEMPOTENCY_CONFLICT');
    expect(
      readFileSync(
        join(src, 'operational-alerts/operational-alert.contract.ts'),
        'utf8',
      ),
    ).toMatch(/channelOrder:\s*\['inbox'\]/);
  });
  it('route/AI/jobs cannot use raw APNS or Telegram delivery outside the protected existing transport', () => {
    const found = files(src).filter(
      (p) =>
        !relative(src, p).startsWith('communication-delivery/') &&
        !relative(src, p).startsWith('inbox/apns-push') &&
        /\b(?:prepareInboxApnsCanonical|sendInboxApns)\s*\(/.test(
          readFileSync(p, 'utf8'),
        ),
    );
    expect(found).toEqual([]);
    const apns = readFileSync(join(src, 'inbox/apns-push.ts'), 'utf8');
    expect(apns).not.toMatch(/async function sendOne\(/);
    expect(apns).toContain('R06_CANONICAL_COMMUNICATION_DELIVERY_REQUIRED');
    for (const name of [
      'inbox/canonical-inbox-projection.service.ts',
      'operational-alerts/operational-alerts.service.ts',
      'operational-alerts/canonical-appointment-alerts.service.ts',
    ])
      expect(readFileSync(join(src, name), 'utf8')).not.toMatch(
        /\bfetch\s*\(|sendMessage|sendDocument|\b(?:http|https|http2)\.request\s*\(|\.appointment\.(?:create|update|delete)|\.clientWantedSlotInterest\.(?:create|update|delete)/,
      );
  });
  it('legacy generic ingress and alert/reminder helpers cannot bypass their producer admission', () => {
    const inbox = readFileSync(join(src, 'inbox/inbox.service.ts'), 'utf8');
    expect(inbox).not.toContain('announcePush');
    expect(inbox).not.toContain('sendInboxApns');
    expect(inbox).toContain('R06_CANONICAL_PRODUCER_ADMISSION_REQUIRED');
    const delivery = readFileSync(
      join(src, 'communication-delivery/communication-delivery.service.ts'),
      'utf8',
    );
    for (const barrier of [
      'R06_DELIVERY_BEFORE_ADMISSION',
      'R06_CANONICAL_PRIMARY_ADMISSION_REQUIRED',
      'R06_LEGACY_NEW_APPOINTMENT_ADMISSION_RETIRED',
      'this.kernel.claimReconciliation',
      'this.kernel.finalizeReconciliation',
    ])
      expect(delivery).toContain(barrier);
    expect(delivery).not.toContain("outcome: 'PROVEN_NOT_EXECUTED' as const");
    const wanted = readFileSync(
      join(src, 'crm/client-wanted-slot.service.ts'),
      'utf8',
    );
    expect(wanted).toContain(
      'R06 exact canonical released-capacity event required',
    );
    expect(wanted).toMatch(
      /this\.assertPendingDelivery\(\s*matched,\s*endpoint,?\s*\)/,
    );
  });
  it('actual native producer bodies, indirect effect and sent-marker mutants are permanently checked', () => {
    const result = spawnSync(
      'python3',
      ['-m', 'unittest', 'test_package5_operational_delivery'],
      {
        cwd: join(root, 'ai администратор'),
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        encoding: 'utf8',
        timeout: 20000,
      },
    );
    expect({
      status: result.status,
      output: result.status ? result.stderr : '',
    }).toEqual({ status: 0, output: '' });
  });
});
