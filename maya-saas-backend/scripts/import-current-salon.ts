import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { spawnSync } from 'child_process';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import {
  MAYA_PLAN_FEATURES,
  buildFeatureFlags,
} from '../src/common/feature-catalog';
import {
  CurrentSalonPythonConfig,
  buildCurrentSalonImportData,
} from '../src/common/current-salon-import.utils';

interface CliOptions {
  configPath: string;
  tenantSlug?: string;
  branchName?: string;
  syncEnv: boolean;
  dryRun: boolean;
}

const backendRoot = resolve(__dirname, '..');
const defaultConfigPath = resolve(backendRoot, '..', 'ai администратор', 'config.py');
const defaultEnvPath = resolve(backendRoot, '.env');

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    configPath: defaultConfigPath,
    syncEnv: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument) {
      continue;
    }

    if (argument === '--sync-env') {
      options.syncEnv = true;
      continue;
    }

    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (argument === '--config') {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error('--config requires a path value');
      }

      options.configPath = resolve(process.cwd(), nextValue);
      index += 1;
      continue;
    }

    if (argument === '--slug') {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error('--slug requires a value');
      }

      options.tenantSlug = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--branch-name') {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error('--branch-name requires a value');
      }

      options.branchName = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function loadPythonConfig(configPath: string): CurrentSalonPythonConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Python config not found: ${configPath}`);
  }

  const pythonProgram = `
import importlib.util
import json
import pathlib
import sys

config_path = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("maya_current_config", config_path)
module = importlib.util.module_from_spec(spec)
loader = spec.loader

if loader is None:
    raise RuntimeError(f"Cannot load config from {config_path}")

loader.exec_module(module)

payload = {
    "BARBERSHOP_NAME": getattr(module, "BARBERSHOP_NAME", None),
    "APP_URL": getattr(module, "APP_URL", None),
    "SITE_URL": getattr(module, "SITE_URL", None),
    "YCLIENTS_BASE_URL": getattr(module, "YCLIENTS_BASE_URL", None),
    "YCLIENTS_PARTNER_TOKEN": getattr(module, "YCLIENTS_PARTNER_TOKEN", None),
    "YCLIENTS_USER_TOKEN": getattr(module, "YCLIENTS_USER_TOKEN", None),
    "YCLIENTS_COMPANY_ID": getattr(module, "YCLIENTS_COMPANY_ID", None),
    "ACTIVE_MASTER_IDS": getattr(module, "ACTIVE_MASTER_IDS", None),
    "BARBERSHOP_PHONE": getattr(module, "BARBERSHOP_PHONE", None),
    "BARBERSHOP_ADDRESS": getattr(module, "BARBERSHOP_ADDRESS", None),
}

print(json.dumps(payload, ensure_ascii=False))
`;

  const result = spawnSync('python3', ['-c', pythonProgram, configPath], {
    cwd: backendRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const message = result.stderr.trim() || result.stdout.trim();

    throw new Error(
      `Failed to load Python config from ${configPath}: ${message}`,
    );
  }

  try {
    return JSON.parse(result.stdout) as CurrentSalonPythonConfig;
  } catch (error) {
    throw new Error(
      `Failed to parse Python config payload: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  }
}

function encryptToken(plainText: string, secret: string): string {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function escapeEnvValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertEnvFile(
  envPath: string,
  updates: Record<string, string>,
): { created: boolean; updatedKeys: string[] } {
  const created = !existsSync(envPath);
  const current = created ? '' : readFileSync(envPath, 'utf8');
  let next = current;
  const updatedKeys: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    const formattedLine = `${key}="${escapeEnvValue(value)}"`;
    const matcher = new RegExp(`^${escapeRegex(key)}=.*$`, 'm');

    if (matcher.test(next)) {
      next = next.replace(matcher, formattedLine);
    } else {
      next = `${next}${next.endsWith('\n') || next.length === 0 ? '' : '\n'}${formattedLine}\n`;
    }

    updatedKeys.push(key);
  }

  writeFileSync(envPath, next, 'utf8');

  return {
    created,
    updatedKeys,
  };
}

async function upsertCurrentSalon(options: CliOptions) {
  const loadedConfig = loadPythonConfig(options.configPath);
  const importData = buildCurrentSalonImportData(loadedConfig, {
    tenantSlug: options.tenantSlug,
    branchName: options.branchName,
  });
  const themeJson = importData.themeJson as Prisma.InputJsonValue;

  const warnings: string[] = [];

  if (options.dryRun) {
    return {
      dryRun: true,
      tenantSlug: importData.tenantSlug,
      tenantName: importData.tenantName,
      branchName: importData.branchName,
      companyId: importData.yclientsCompanyId,
      activeMasterIdsCount: importData.activeMasterIds.length,
      configPath: options.configPath,
      envSyncPlanned: options.syncEnv,
      warnings,
    };
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required. Load .env or export it before running the import.',
    );
  }

  const encryptionSecret = process.env.CRM_ENCRYPTION_KEY;

  if (!encryptionSecret) {
    throw new Error(
      'CRM_ENCRYPTION_KEY is required. Load .env or export it before running the import.',
    );
  }

  let envSyncResult:
    | {
        created: boolean;
        updatedKeys: string[];
      }
    | undefined;

  if (options.syncEnv) {
    envSyncResult = upsertEnvFile(defaultEnvPath, {
      YCLIENTS_BASE_URL: importData.yclientsBaseUrl,
      YCLIENTS_PARTNER_TOKEN: importData.yclientsPartnerToken,
    });
  } else if (!process.env.YCLIENTS_PARTNER_TOKEN) {
    warnings.push(
      'YCLIENTS_PARTNER_TOKEN was read from the current Python config but not written to .env. Re-run with --sync-env before starting the backend if the token is not already present there.',
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const importedPlan = await prisma.subscriptionPlan.upsert({
      where: { name: 'Imported Existing Salon' },
      update: {
        priceMonthly: 19900,
        maxBranches: 5,
        maxStaff: 50,
        featuresJson: buildFeatureFlags([
          ...MAYA_PLAN_FEATURES.max,
          'ai_chatbot',
        ]) satisfies Prisma.InputJsonValue,
        isWhiteLabelEnabled: true,
      },
      create: {
        name: 'Imported Existing Salon',
        priceMonthly: 19900,
        maxBranches: 5,
        maxStaff: 50,
        featuresJson: buildFeatureFlags([
          ...MAYA_PLAN_FEATURES.max,
          'ai_chatbot',
        ]) satisfies Prisma.InputJsonValue,
        isWhiteLabelEnabled: true,
      },
    });

    const tenant = await prisma.tenant.upsert({
      where: { slug: importData.tenantSlug },
      update: {
        name: importData.tenantName,
        status: 'active',
        planId: importedPlan.id,
        allowSelfRegistration: true,
      },
      create: {
        name: importData.tenantName,
        slug: importData.tenantSlug,
        status: 'active',
        planId: importedPlan.id,
        allowSelfRegistration: true,
      },
    });

    await prisma.brandingSettings.upsert({
      where: { tenantId: tenant.id },
      update: {
        appName: importData.tenantName,
        primaryColor: '#111111',
        secondaryColor: '#C6A86A',
        fontFamily: 'Manrope',
        buttonRadius: 18,
        themeJson,
      },
      create: {
        tenantId: tenant.id,
        appName: importData.tenantName,
        primaryColor: '#111111',
        secondaryColor: '#C6A86A',
        fontFamily: 'Manrope',
        buttonRadius: 18,
        themeJson,
      },
    });

    const existingBranch = await prisma.branch.findFirst({
      where: {
        tenantId: tenant.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const branch = existingBranch
      ? await prisma.branch.update({
          where: { id: existingBranch.id },
          data: {
            name: importData.branchName,
            address: importData.address,
            phone: importData.phone,
            timezone: 'Europe/Moscow',
          },
        })
      : await prisma.branch.create({
          data: {
            tenantId: tenant.id,
            name: importData.branchName,
            address: importData.address,
            phone: importData.phone,
            timezone: 'Europe/Moscow',
          },
        });

    await prisma.crmIntegration.upsert({
      where: { tenantId: tenant.id },
      update: {
        provider: 'yclients',
        encryptedApiToken: encryptToken(
          importData.yclientsUserToken,
          encryptionSecret,
        ),
        baseUrl: importData.yclientsBaseUrl,
        status: 'active',
        settingsJson: {
          companyId: importData.yclientsCompanyId,
          activeMasterIds: importData.activeMasterIds,
          importedFrom: 'ai администратор/config.py',
        } satisfies Prisma.InputJsonValue,
      },
      create: {
        tenantId: tenant.id,
        provider: 'yclients',
        encryptedApiToken: encryptToken(
          importData.yclientsUserToken,
          encryptionSecret,
        ),
        baseUrl: importData.yclientsBaseUrl,
        status: 'active',
        settingsJson: {
          companyId: importData.yclientsCompanyId,
          activeMasterIds: importData.activeMasterIds,
          importedFrom: 'ai администратор/config.py',
        } satisfies Prisma.InputJsonValue,
      },
    });

    return {
      dryRun: false,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      branchId: branch.id,
      branchName: branch.name,
      companyId: importData.yclientsCompanyId,
      activeMasterIdsCount: importData.activeMasterIds.length,
      configPath: options.configPath,
      envSynced: Boolean(envSyncResult),
      envFileCreated: envSyncResult?.created ?? false,
      envUpdatedKeys: envSyncResult?.updatedKeys ?? [],
      warnings,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await upsertCurrentSalon(options);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown import failure';

  console.error(message);
  process.exitCode = 1;
});
