// Offline deployment bootstrap for the first global operator only. Not an HTTP
// route, release writer, account recovery tool, or tenant-role promotion.
// No dotenv loading: the operator must select the database explicitly.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { fstatSync, readSync } from 'node:fs';

const ACTION = 'platform.operator.bootstrap';
const CONTRACT = 'maya.platform-owner-bootstrap/1';
export class BootstrapRefused extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function refuse(code: string): never {
  throw new BootstrapRefused(code);
}

export function bootstrapInput(value: unknown, execute: boolean) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    refuse('input_invalid');
  const v = value as Record<string, unknown>;
  const fields = [
    'email',
    'expectedDatabase',
    ...(execute ? ['password'] : []),
  ];
  if (
    Object.keys(v).sort().join(',') !== fields.sort().join(',') ||
    typeof v.email !== 'string' ||
    !/^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/.test(v.email) ||
    v.email.length > 254 ||
    typeof v.expectedDatabase !== 'string' ||
    !/^[a-zA-Z0-9_]{1,63}$/.test(v.expectedDatabase)
  )
    refuse('input_invalid');
  if (
    execute &&
    (typeof v.password !== 'string' ||
      v.password.length < 12 ||
      Buffer.byteLength(v.password, 'utf8') > 72 ||
      /[\r\n\0]/.test(v.password) ||
      /change-me|replace-me|changeme|example/i.test(v.password))
  )
    refuse('password_invalid');
  return {
    email: v.email.toLowerCase(),
    expectedDatabase: v.expectedDatabase,
    password: execute ? (v.password as string) : null,
  };
}

export async function bootstrapPlatformOwner(
  prisma: PrismaClient,
  value: unknown,
  execute = false,
) {
  const input = bootstrapInput(value, execute);
  // Hash before taking the table lock. No plaintext in SQL/audit/output.
  const passwordHash = input.password
    ? await bcrypt.hash(input.password, 12)
    : null;
  input.password = null;
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
      const [database] = await tx.$queryRaw<Array<{ name: string }>>`
      SELECT current_database() AS name`;
      if (database?.name !== input.expectedDatabase)
        refuse('database_mismatch');
      // A short exclusive-writer lock also covers concurrent seeds/registrations;
      // a NULL tenant composite unique key alone cannot ensure a first operator.
      await tx.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`;
      if (
        (await tx.user.count({ where: { role: 'platform_owner' } })) !== 0 ||
        (await tx.auditLog.count({ where: { action: ACTION } })) !== 0
      )
        refuse('operator_already_initialized');
      if (
        await tx.user.findFirst({
          where: {
            tenantId: null,
            email: { equals: input.email, mode: 'insensitive' },
          },
          select: { id: true },
        })
      )
        refuse('global_email_exists');
      if (!execute)
        return {
          contract: CONTRACT,
          status: 'ELIGIBLE',
          created: false,
          sessionIssued: false,
          entitlementGranted: false,
        } as const;
      const user = await tx.user.create({
        data: {
          tenantId: null,
          branchId: null,
          email: input.email,
          passwordHash: passwordHash!,
          role: 'platform_owner',
          status: 'active',
        },
        select: { id: true },
      });
      // The newly created User is the subject, never a fabricated authenticated
      // actor. The executor is the privileged offline database operator.
      await tx.auditLog.create({
        data: {
          scope: 'platform',
          tenantId: null,
          userId: null,
          action: ACTION,
          entityType: 'User',
          entityId: user.id,
          metadataJson: {
            contract: CONTRACT,
            executor: 'offline_database_operator',
            authenticatedPlatformActor: false,
            expectedGlobalOperators: 0,
            sessionIssued: false,
            entitlementGranted: false,
          },
        },
      });
      return {
        contract: CONTRACT,
        status: 'CREATED',
        created: true,
        userId: user.id,
        sessionIssued: false,
        entitlementGranted: false,
      } as const;
    },
    { maxWait: 5_000, timeout: 10_000 },
  );
}

export function bootstrapArgs(argv: string[]) {
  const execute = argv[0] === '--execute';
  if (
    !['--execute', '--dry-run'].includes(argv[0]) ||
    argv.length !== 3 ||
    argv[1] !== '--input-fd' ||
    !/^[0-9]+$/.test(argv[2])
  )
    refuse('arguments_invalid');
  const fd = Number(argv[2]);
  if (!Number.isSafeInteger(fd) || fd < 3) refuse('arguments_invalid');
  return { execute, fd };
}

export function readBootstrapInput(fd: number): unknown {
  const stat = fstatSync(fd);
  if (!stat.isFIFO() && !stat.isSocket()) refuse('anonymous_input_required');
  const bytes = Buffer.alloc(8193);
  let length = 0;
  try {
    while (length < bytes.length) {
      const read = readSync(fd, bytes, length, bytes.length - length, null);
      if (!read) break;
      length += read;
    }
    if (!length || length > 8192) refuse('input_size_invalid');
    return JSON.parse(bytes.toString('utf8', 0, length)) as unknown;
  } finally {
    bytes.fill(0);
  }
}

async function main() {
  const { execute, fd } = bootstrapArgs(process.argv.slice(2));
  const input = readBootstrapInput(fd);
  bootstrapInput(input, execute); // Refuse malformed input before connecting.
  if (!process.env.DATABASE_URL) refuse('database_not_selected');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    process.stdout.write(
      JSON.stringify(await bootstrapPlatformOwner(prisma, input, execute)) +
        '\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Never print DB/adapter exceptions, input, connection strings or stacks.
    process.stderr.write(
      JSON.stringify({
        status: 'REFUSED',
        code:
          error instanceof BootstrapRefused ? error.code : 'bootstrap_failed',
      }) + '\n',
    );
    process.exitCode = 1;
  });
}
