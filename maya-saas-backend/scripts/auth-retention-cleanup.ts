import 'dotenv/config';

import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { AuthRetentionRepository } from '../src/auth/auth-retention.repository';
import { AuthRetentionService } from '../src/auth/auth-retention.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface CliOptions {
  batchSize?: number;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: true,
    help: false,
  };
  let explicitMode: 'dry-run' | 'execute' | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    if (argument === '--execute' || argument === '--dry-run') {
      const nextMode = argument === '--execute' ? 'execute' : 'dry-run';

      if (explicitMode && explicitMode !== nextMode) {
        throw new Error('Choose either --execute or --dry-run, not both');
      }

      explicitMode = nextMode;
      options.dryRun = nextMode === 'dry-run';
      continue;
    }

    if (argument === '--batch-size') {
      const rawValue = argv[index + 1];
      const batchSize = Number(rawValue);

      if (
        !rawValue ||
        !Number.isInteger(batchSize) ||
        batchSize < 1 ||
        batchSize > 10_000
      ) {
        throw new Error('--batch-size requires an integer from 1 to 10000');
      }

      options.batchSize = batchSize;
      index += 1;
      continue;
    }

    throw new Error('Unknown argument: ' + argument);
  }

  return options;
}

function printHelp(): void {
  process.stdout.write(
    [
      'MAYA auth retention cleanup',
      '',
      'Usage:',
      '  npm run auth:cleanup',
      '  npm run auth:cleanup -- --execute [--batch-size 1000]',
      '',
      'The default mode is dry-run. --execute is required to delete rows.',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required for auth retention cleanup');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const configService = {
    get: (key: string) => process.env[key],
  } as unknown as ConfigService;
  const repository = new AuthRetentionRepository(
    prisma as unknown as PrismaService,
  );
  const service = new AuthRetentionService(configService, repository);

  try {
    const result = await service.run({
      batchSize: options.batchSize,
      dryRun: options.dryRun,
    });

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown auth retention error';

  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: {
        code: 'auth_retention_failed',
        message,
      },
    }) + '\n',
  );
  process.exitCode = 1;
});
