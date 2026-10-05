import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const repo = path.resolve(__dirname, '../../..');
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(repo, relativePath), 'utf8');

describe('I-MIG2 migration-2 fold', () => {
  const schema = read('maya-saas-backend/prisma/schema.prisma');
  const migration = read(
    'maya-saas-backend/prisma/migrations/20260916120100_widget_layer_runtime/migration.sql',
  );
  const fixture = read(
    'maya-saas-backend/test/widgets-live/support/fixtures.ts',
  );

  it('MIG-1/MIG-2 keeps the frozen additive envelope and exact new constraints', () => {
    const widgetModels = schema.match(/^model Widget\w+\s*\{/gm) ?? [];
    const widgetChecks = migration.match(/_check" CHECK/g) ?? [];
    const widgetFks = migration.match(/FOREIGN KEY/g) ?? [];

    expect(widgetModels).toHaveLength(14);
    // Migration 1 owns five registry checks; the runtime migration owns 34 base checks plus the
    // owner-approved, tightly scoped journal-date check.
    expect(widgetChecks).toHaveLength(35);
    expect(widgetFks).toHaveLength(18);
    expect(migration).toContain(
      "\"confirmationSubject\" IN ('create', 'reschedule', 'cancel')",
    );
    expect(migration).toContain(
      "\"approvalDecision\" IN ('approve', 'reject')",
    );
    expect(migration).toContain('"refusalCode" IN (\'intent_divergence\')');
    expect(migration).toContain(
      '("resolvedIntentTokenHash" IS NULL) = ("resolvedEffect" IS NULL)',
    );
    expect(migration).not.toMatch(/(?:ALTER|CREATE) TABLE "(?!Widget)/);
    expect(migration).not.toMatch(/\b(?:DROP|RENAME)\b/);
  });

  it('MIG-3 classifies every new field as AUDIT_RETAINED', () => {
    const model = schema.slice(
      schema.indexOf('model WidgetIntentDivergenceAudit {'),
      schema.indexOf(
        '\n}',
        schema.indexOf('model WidgetIntentDivergenceAudit {'),
      ),
    );
    const physical = model
      .split('\n')
      .filter(
        (line) => /^\s{2}\w+\s+\S/.test(line) && !line.includes('@relation'),
      );

    expect(physical).toHaveLength(8);
    expect(physical.every((line) => /\/\/ A(?:\s|$)/.test(line))).toBe(true);
  });

  it('MIG-4 retains the baseline plus exact SB-1, NS-1 and existing public-booking owner migrations', () => {
    const dirs = fs
      .readdirSync(path.join(repo, 'maya-saas-backend/prisma/migrations'), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const successor = '20260929190000_client_link_challenge_json_v2';
    expect(dirs.filter((name) => name === successor)).toEqual([successor]);
    const navigation = '20260930120000_journal_detail_retained_date';
    expect(dirs.filter((name) => name === navigation)).toEqual([navigation]);
    // Separate website owner checkpoint b3fdbfe1a70ef1bb3232f1a3895a89c32e811f64.
    // These existing bytes are pinned, not a wildcard allowance for new migrations.
    // The widget baseline stays 99; this test never changes or applies website SQL.
    const publicBookingOwnerMigrations: Readonly<Record<string, string>> = {
      '20261005160000_public_booking_guest':
        'e02cd1b34c3c1a70e2c038e77e800926776aaa5b837a78dfe646c59a52366a42',
      '20261005160100_public_booking_rejected_intent':
        '85ee849ad4bcbce80c582b8f0a3b562d4e48812c85f609e3c5a463f1bacb752a',
      '20261005160200_public_booking_action_source':
        '8c7fab5a9bef40d719d2c7bb164609bbfafb072402fbee046552f4bfa9cc6766',
      '20261005160300_public_booking_utc_clock':
        '678d2accbbef88a17b3f766bd39aa41143fb872ae7d7d0d8d75beaa4d7edca52',
    };
    for (const [name, digest] of Object.entries(publicBookingOwnerMigrations)) {
      expect(dirs.filter((entry) => entry === name)).toEqual([name]);
      expect(
        createHash('sha256')
          .update(
            read(`maya-saas-backend/prisma/migrations/${name}/migration.sql`),
          )
          .digest('hex'),
      ).toBe(digest);
    }
    expect(
      dirs.filter(
        (name) =>
          name !== successor &&
          name !== navigation &&
          !Object.prototype.hasOwnProperty.call(
            publicBookingOwnerMigrations,
            name,
          ),
      ),
    ).toHaveLength(99);
    const nav = read(
      `maya-saas-backend/prisma/migrations/${navigation}/migration.sql`,
    );
    expect(nav).not.toMatch(/CREATE TABLE|ADD COLUMN|DROP TABLE|DROP COLUMN/);
    expect(nav.match(/ALTER TABLE/g)).toHaveLength(2);
    expect(nav).toContain('WidgetIntentRecord_journal_date_scope_check');
    expect(nav).toContain('fs.calendar');
    expect(nav).toContain('operations.journal.read');
    const extension = read(
      `maya-saas-backend/prisma/migrations/${successor}/migration.sql`,
    );
    expect(extension).not.toMatch(
      /CREATE TABLE|ADD COLUMN|(?:ALTER|CREATE) TABLE "Widget/,
    );
    expect(dirs.filter((name) => name.includes('widget_layer'))).toEqual([
      '20260916120000_widget_layer_ledgers',
      '20260916120100_widget_layer_runtime',
      '20260925150000_widget_layer_source_capability',
    ]);
  });

  it('MIG-6 makes only the three approved content columns nullable', () => {
    expect(migration).toContain('"composedEnvelopeJson" JSONB,');
    expect(migration).toContain('"emittedEnvelopeJson" JSONB,');
    expect(migration).toContain('"diffJson" JSONB,');
    expect(migration).not.toContain('"composedEnvelopeJson" JSONB NOT NULL');
    expect(migration).not.toContain('"emittedEnvelopeJson" JSONB NOT NULL');
    expect(migration).not.toContain('"diffJson" JSONB NOT NULL');
  });

  it('MIG-7 deletes divergence rows before their RESTRICT parent', () => {
    const child = fixture.indexOf('widgetIntentDivergenceAudit.deleteMany');
    const parent = fixture.indexOf('widgetIntentRecord.deleteMany');

    expect(child).toBeGreaterThan(-1);
    expect(parent).toBeGreaterThan(child);
  });
});
