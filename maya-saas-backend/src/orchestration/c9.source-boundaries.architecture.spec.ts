import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
/** Finite C9 package writer check plus negative fixtures. Existing C6/C7/C8 guards stay mandatory. */
function forbiddenSource(text: string): boolean {
  return /\b(?:fetch|axios)\s*\(|\b(?:book_record|sendMessage|sendPhoto|sendDocument)\s*\(|\.(?:appointment|client|loyaltyTransaction|expense|actionExecution|communicationDelivery)\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(|\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+"(?:Appointment|Client|Expense|ActionExecution|CommunicationDelivery)"/.test(
    text,
  );
}
describe('C9 coordination cannot acquire source mutation ownership', () => {
  test('production C9 code has no provider/direct source writers', () => {
    for (const name of readdirSync(__dirname).filter(
      (n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'),
    ))
      expect({
        name,
        forbidden: forbiddenSource(readFileSync(join(__dirname, name), 'utf8')),
      }).toEqual({ name, forbidden: false });
  });
  test.each([
    'db.appointment.create({})',
    'tx.expense.update({})',
    'fetch(providerUrl)',
    'book_record(args)',
    'sendMessage(chat,text)',
    'UPDATE "ActionExecution" SET state=1',
  ])('guard rejects injected bypass %s', (s) =>
    expect(forbiddenSource(s)).toBe(true),
  );
  test('AC6 only deletes C9 derived leaves; no source cascade', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/20260913160000_chapter9_orchestration_foundation/migration.sql',
      ),
      'utf8',
    );
    expect(sql).not.toMatch(/ON DELETE CASCADE|ON UPDATE CASCADE/);
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(5);
    expect(sql.match(/CREATE TRIGGER /g)).toHaveLength(10);
    expect(sql.match(/CREATE FUNCTION /g)).toHaveLength(8);
    expect(sql).toContain('c9_exact_ac6_claim_required');
    expect(sql).not.toMatch(/INSERT INTO "(?:Client|Appointment|C9Run)"/);
  });
});
