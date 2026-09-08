import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { ActionCapabilityRegistry } from './action-engine.registry';
const src = join(process.cwd(), 'src');
function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [join(dir, e.name)] : []); }
function writers(source: string) {
  const ast = ts.createSourceFile('candidate.ts', source, ts.ScriptTarget.Latest, true), aliases = new Set<string>(), writes: string[] = [];
  const owner = (n: ts.Node): boolean => /nativeFeedback(?:Request|Revision)/.test(n.getText(ast)) || ts.isIdentifier(n) && aliases.has(n.text);
  function walk(n: ts.Node) { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && owner(n.initializer)) aliases.add(n.name.text); if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^(?:create|createMany|upsert|update|updateMany|delete|deleteMany)$/.test(n.expression.name.text) && owner(n.expression.expression)) writes.push(n.getText(ast)); ts.forEachChild(n, walk); }
  walk(ast); return writes;
}
describe('R08 native feedback canonical owner ratchet', () => {
  it('all root/revision writes belong to the one business executor, including alias mutations', () => {
    expect(files(src).filter(file => relative(src, file) !== 'native-feedback/native-feedback.service.ts' && writers(readFileSync(file, 'utf8')).length)).toEqual([]);
    expect(writers('const alias=db.nativeFeedbackRevision;alias.update({});')).toHaveLength(1);
  });
  it('uses exactly three business action classes and two existing communication classes', () => {
    const caps = new ActionCapabilityRegistry().list().filter(c => c.capability.startsWith('native-feedback.') || c.capability.startsWith('communication.native-feedback.'));
    expect(caps.map(c => c.actionClass).sort()).toEqual(['deliver_business_alert', 'deliver_report_briefing', 'request_native_feedback', 'submit_native_feedback_revision', 'withdraw_native_feedback'].sort());
  });
  it('initiators cannot own business writes, providers, direct follow-up or raw Client identity', () => {
    for (const file of files(join(src, 'native-feedback'))) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/\bfetch\s*\(|sendMessage|sendDocument|sendNotification|\.inboxItem\.(?:create|upsert)|\.businessReview\.(?:create|update)|\.appointment\.(?:create|update)|\.client\.(?:create|upsert)/);
    }
    const owner = readFileSync(join(src, 'native-feedback/native-feedback.service.ts'), 'utf8');
    for (const boundary of ['this.channels.resolve(proof, tx)', 'this.kernel.claimExecution', 'this.kernel.finalizeSuccess', 'this.ingress.createExecution(request, tx)', 'STALE_FEEDBACK_REVISION', 'IDEMPOTENCY_CONFLICT']) expect(owner).toContain(boundary);
    expect(owner).not.toContain('appointment.clientId');
  });
  it('lower admission and dispatch enforce frozen owner, prefix order and confirmed parent', () => {
    const store = readFileSync(join(src, 'native-feedback/native-feedback.store.ts'), 'utf8');
    for (const boundary of ['nativeFeedbackSlot:', 'this.sequence(tx, plan, slot)', 'this.sequence(tx, loaded.plan, slot)', 'this.policy.authorize', "execution.state !== 'SUCCEEDED'", 'existing.normalizedInputHash !== preview.normalizedInputHash']) expect(store).toContain(boundary);
    const kernel = readFileSync(join(src, 'action-engine/action-engine.kernel.ts'), 'utf8'); expect(kernel).toContain('R08 exact native feedback parent/slot binding required');
    expect(readFileSync(join(src, 'native-feedback/native-feedback.scheduler.ts'), 'utf8')).not.toMatch(/\.request\(|\.respond\(|\.send\(|nativeFeedbackRequest\.(?:create|update)/);
  });
  it('Python helpers/callbacks/SQL and hidden delegate mutations are guarded', () => {
    const result = spawnSync('python3', ['-m', 'unittest', 'test_package5_native_feedback'], { cwd: join(process.cwd(), '..', 'ai администратор'), env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, encoding: 'utf8', timeout: 20000 });
    expect({ status: result.status, error: result.status ? result.stderr : '' }).toEqual({ status: 0, error: '' });
  });
});
