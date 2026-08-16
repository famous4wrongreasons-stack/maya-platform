import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { parse } from 'dotenv';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { validateRuntimeConfig } from '../src/config/runtime-config';

interface CliOptions {
  envPath: string | null;
  skipDatabase: boolean;
  allowPending: boolean;
  help: boolean;
}

interface MigrationRow {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

interface LocalMigration {
  name: string;
  checksum: string;
}

interface AcknowledgedMigration {
  migration_name: string;
  checksum: string;
  reason: string;
}

interface HistoricalBaseline {
  acknowledged: AcknowledgedMigration[];
}

/**
 * Явно признанные миграции, применённые к боевой базе, но отсутствующие в
 * репозитории.
 *
 * 🔴 Это НЕ режим «игнорировать неизвестные миграции». Признаётся каждая
 * конкретная пара «имя + контрольная сумма». Любая новая необъяснённая запись
 * по-прежнему проваливает проверку.
 */
function loadHistoricalBaseline(): AcknowledgedMigration[] {
  const path = resolve(
    process.cwd(),
    'prisma/historical-migration-baseline.json',
  );

  if (!existsSync(path)) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as HistoricalBaseline;

  return Array.isArray(parsed.acknowledged) ? parsed.acknowledged : [];
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    envPath: null,
    skipDatabase: false,
    allowPending: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--skip-db') {
      options.skipDatabase = true;
      continue;
    }
    if (argument === '--allow-pending') {
      options.allowPending = true;
      continue;
    }
    if (argument === '--env') {
      const envPath = argv[index + 1];
      if (!envPath) {
        throw new Error('--env requires a file path');
      }
      options.envPath = resolve(envPath);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp(): void {
  process.stdout.write(
    [
      'MAYA release preflight',
      '',
      'Usage:',
      '  npm run release:preflight',
      '  npm run release:preflight -- --env .env.staging',
      '  npm run release:preflight -- --env .env.staging --skip-db',
      '  npm run release:preflight -- --allow-pending   # перед migrate deploy',
      '',
      'No secret values are printed.',
      '',
    ].join('\n'),
  );
}

function loadConfig(envPath: string | null): Record<string, unknown> {
  if (!envPath) {
    return { ...process.env };
  }
  if (!existsSync(envPath)) {
    throw new Error(`Environment file does not exist: ${envPath}`);
  }
  return parse(readFileSync(envPath));
}

function localMigrations(): LocalMigration[] {
  const directory = resolve(process.cwd(), 'prisma/migrations');
  if (!existsSync(directory)) {
    throw new Error('prisma/migrations directory is missing');
  }
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const migrationPath = join(directory, entry.name, 'migration.sql');
      if (!existsSync(migrationPath)) {
        throw new Error(`Migration is missing migration.sql: ${entry.name}`);
      }
      return {
        name: entry.name,
        checksum: createHash('sha256')
          .update(readFileSync(migrationPath))
          .digest('hex'),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function verifyDatabase(
  connectionString: string,
  migrations: LocalMigration[],
  allowPending: boolean,
): Promise<{ appliedMigrations: number; pendingMigrations: number }> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    await prisma.$queryRaw`SELECT 1`;
    const rows = await prisma.$queryRaw<MigrationRow[]>`
      SELECT migration_name, checksum, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY started_at ASC
    `;
    const failed = rows.filter(
      (row) => row.finished_at === null && row.rolled_back_at === null,
    );
    if (failed.length > 0) {
      throw new Error(
        `Database has ${failed.length} unfinished Prisma migration(s)`,
      );
    }
    const appliedRows = rows.filter(
      (row) => row.finished_at !== null && row.rolled_back_at === null,
    );
    const applied = new Map(
      appliedRows.map((row) => [row.migration_name, row.checksum]),
    );
    const local = new Map(
      migrations.map((migration) => [migration.name, migration.checksum]),
    );
    // 🔴 До `migrate deploy` неприменённые миграции — это НОРМА: их как раз
    // сейчас и будут применять. Строгий режим (после выката) требует, чтобы не
    // осталось ни одной, иначе релиз объявляется готовым при незавершённой
    // базе. Раньше проверка была только строгой, и как блокирующий шаг ПЕРЕД
    // миграцией она провалила бы любой выкат, несущий новую миграцию.
    const missing = migrations.filter(
      (migration) => !applied.has(migration.name),
    );
    if (missing.length > 0 && !allowPending) {
      const names = missing.map((migration) => migration.name).join(', ');
      throw new Error(
        `Database is missing ${missing.length} local Prisma migration(s): ${names}`,
      );
    }
    // Признанная историческая запись — это ПАРА «имя + контрольная сумма».
    // Совпадение только по имени не принимается: другая сумма означает другое
    // содержимое, то есть новое необъяснённое расхождение.
    const acknowledged = new Set(
      loadHistoricalBaseline().map(
        (entry) => `${entry.migration_name}\u0000${entry.checksum}`,
      ),
    );
    const unknown = appliedRows.filter(
      (migration) =>
        !local.has(migration.migration_name) &&
        !acknowledged.has(
          `${migration.migration_name}\u0000${migration.checksum}`,
        ),
    );
    if (unknown.length > 0) {
      const names = unknown
        .map((migration) => migration.migration_name)
        .join(', ');
      throw new Error(
        `Database has ${unknown.length} migration(s) absent from this release and from the historical baseline: ${names}`,
      );
    }
    // Сверяем контрольные суммы только у ПРИМЕНЁННЫХ: у ожидающей миграции
    // сравнивать не с чем.
    const changed = migrations.filter(
      (migration) =>
        applied.has(migration.name) &&
        applied.get(migration.name) !== migration.checksum,
    );
    if (changed.length > 0) {
      throw new Error(
        `Database checksum differs for ${changed.length} migration(s)`,
      );
    }
    return {
      appliedMigrations: applied.size,
      pendingMigrations: missing.length,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const rawConfig = loadConfig(options.envPath);
  const config = validateRuntimeConfig(rawConfig);
  if (config.NODE_ENV !== 'production') {
    throw new Error('Release preflight requires NODE_ENV=production');
  }
  const migrations = localMigrations();
  if (typeof config.DATABASE_URL !== 'string') {
    throw new Error('DATABASE_URL must be a string');
  }
  const connectionString = config.DATABASE_URL;
  const database = options.skipDatabase
    ? { status: 'skipped', applied_migrations: null, pending_migrations: null }
    : await (async () => {
        const result = await verifyDatabase(
          connectionString,
          migrations,
          options.allowPending,
        );

        return {
          status: result.pendingMigrations > 0 ? 'pending' : 'ready',
          applied_migrations: result.appliedMigrations,
          pending_migrations: result.pendingMigrations,
        };
      })();

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        environment: 'production',
        config: 'safe',
        local_migrations: migrations.length,
        database,
      },
      null,
      2,
    ) + '\n',
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: {
        code: 'release_preflight_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }) + '\n',
  );
  process.exitCode = 1;
});
