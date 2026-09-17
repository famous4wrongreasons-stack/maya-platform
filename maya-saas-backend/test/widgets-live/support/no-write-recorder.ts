// The NW (no-write) assertion of plan §4.2, in its three parts:
//   1. a Prisma client extension that records every operation on every model, and every raw
//      statement, issued through the application's store client;
//   2. zero row delta over every `Widget*` model (tenant-scoped where the model has a tenant);
//   3. the submitted record's content columns unchanged.
// Together they implement R3.9.1 / INV-24 ("a refusal at Gates 1–8-R writes nothing") for every gate
// suite that uses them.
//
// How the extension observes the application: `recordingStoreClient` builds the real `PrismaService`
// and returns it extended with one `query.$allOperations` hook that records the call and then runs
// the query unchanged (`return query(args)`). A harness bootstrap binds the application's
// `PrismaService` token to that client, so every provider under test uses the same connection, the
// same adapter and the same queries as in production, and each of its operations passes the hook. It
// is the one provider a bootstrap binds for the harness itself; it is not an owner port and changes no
// behaviour (`harness.live-spec.ts` checks both).
//
// Attribution: operations are recorded with the name of the innermost `recorder.within(scope, …)`
// they ran inside (async context), or `null` outside any window, and in order, so `mark()`/`since()`
// also give everything recorded after a point. A gateway-level test wraps each submission in its own
// scope and also reads everything since the submission began (nothing else uses the recorded client
// there). An HTTP request is served in the server's async context, not the test's, so the HTTP bootstrap
// runs the gateway's own `submit` inside the `gateway` scope instead: writes made by gates are told
// apart from writes a guard makes during the same request (a session touch, an audit line).

import { AsyncLocalStorage } from 'node:async_hooks';

import type { ConfigService } from '@nestjs/config';
import { Prisma, type PrismaClient } from '@prisma/client';

import { PrismaService } from '../../../src/prisma/prisma.service';

export interface RecordedOperation {
  readonly model: string | null;
  readonly operation: string;
  readonly write: boolean;
  readonly scope: string | null;
  /** Raw statements only: the SQL text, so a write can be told from a read. Values are never kept. */
  readonly sql?: string;
}

const MODEL_WRITES = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);
const MODEL_READS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
/** An operation name this recorder does not know is counted as a write, never silently as a read. */
const isKnownRead = (operation: string): boolean => MODEL_READS.has(operation);
const RAW_EXECUTE = new Set(['$executeRaw', '$executeRawUnsafe']);
const RAW_QUERY = new Set(['$queryRaw', '$queryRawUnsafe', '$queryRawTyped']);
const WRITING_KEYWORDS =
  /\b(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke|copy|call|do|refresh|reindex|vacuum|cluster|comment|security|lock|nextval|setval)\b/i;

const sqlText = (args: unknown): string | undefined => {
  if (typeof args === 'string') return args;
  if (Array.isArray(args) && typeof args[0] === 'string') return args[0];
  if (args && typeof args === 'object') {
    const a = args as { sql?: unknown; strings?: unknown };
    if (typeof a.sql === 'string') return a.sql;
    if (Array.isArray(a.strings)) return a.strings.join('?');
    if (Array.isArray(args) && Array.isArray((args as unknown[])[0]))
      return ((args as unknown[])[0] as string[]).join('?');
  }
  return undefined;
};

/**
 * A raw statement is a READ only when it is plainly one: it starts with SELECT, WITH or SHOW and names
 * no writing keyword anywhere. Everything else — `SET TRANSACTION`, an advisory lock, an unreadable
 * argument — counts as a write, so the NW assertion errs toward red.
 */
export const isWritingStatement = (sql: string | undefined): boolean => {
  if (sql === undefined) return true;
  const text = sql.trim();
  if (!/^(select|with|show)\b/i.test(text)) return true;
  return WRITING_KEYWORDS.test(text);
};

export class WriteRecorder {
  private readonly scopes = new AsyncLocalStorage<string>();
  private readonly log: RecordedOperation[] = [];

  /** Every operation recorded so far, oldest first. */
  get operations(): readonly RecordedOperation[] {
    return this.log;
  }

  /** Writes, optionally only those inside `scope`. */
  writes(scope?: string): RecordedOperation[] {
    return this.log.filter(
      (op) => op.write && (scope === undefined || op.scope === scope),
    );
  }

  /** Every operation, reads included, recorded inside `scope`. */
  inScope(scope: string): RecordedOperation[] {
    return this.log.filter((op) => op.scope === scope);
  }

  clear(): void {
    this.log.length = 0;
  }

  /**
   * Run `work` with its operations attributed to `scope`. The result is awaited INSIDE the scope: a Prisma
   * query is lazy and runs when it is awaited, so a query returned un-awaited from `work` would otherwise
   * run, and be recorded, outside it.
   */
  within<T>(scope: string, work: () => Promise<T>): Promise<T> {
    return this.scopes.run(scope, async () => await work());
  }

  /** A position in the log; `since(mark)` returns what was recorded after it, whatever its scope. */
  mark(): number {
    return this.log.length;
  }

  since(mark: number): RecordedOperation[] {
    return this.log.slice(mark);
  }

  /** The extension. `query(args)` is returned as is: the hook observes and never alters. */
  extend<C extends PrismaClient>(client: C) {
    return client.$extends({
      name: 'widgets-live-write-recorder',
      query: {
        $allOperations: ({ model, operation, args, query }) => {
          const raw = RAW_EXECUTE.has(operation) || RAW_QUERY.has(operation);
          const sql = raw ? sqlText(args) : undefined;
          const write =
            MODEL_WRITES.has(operation) ||
            RAW_EXECUTE.has(operation) ||
            (RAW_QUERY.has(operation) && isWritingStatement(sql)) ||
            (!raw && !isKnownRead(operation));
          this.log.push({
            model: model ?? null,
            operation,
            write,
            scope: this.scopes.getStore() ?? null,
            ...(sql === undefined ? {} : { sql }),
          });
          return query(args);
        },
      },
    });
  }
}

/**
 * The application's store client, recorded. Bound to the `PrismaService` token by the bootstraps.
 * The object is the extension of a real `PrismaService` (same adapter, same connection string).
 */
export const recordingStoreClient = (
  recorder: WriteRecorder,
  config: ConfigService,
): PrismaService =>
  recorder.extend(new PrismaService(config)) as unknown as PrismaService;

/** `Widget*` model names, from the generated client. */
export const WIDGET_MODELS: readonly string[] = Object.freeze(
  Object.keys(Prisma.ModelName).filter((name) => name.startsWith('Widget')),
);

const delegateName = (model: string) =>
  model.charAt(0).toLowerCase() + model.slice(1);

const hasTenant = (model: string): boolean =>
  Prisma.dmmf.datamodel.models
    .find((m) => m.name === model)
    ?.fields.some((f) => f.name === 'tenantId') ?? false;

type CountDelegate = {
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
};

/**
 * Row counts of every `Widget*` model: the tenant's rows where the model has a tenant, every row where
 * it does not (the registry-shaped models). Read through a client that is NOT recorded, so the
 * measurement itself is not part of what is measured.
 */
export async function widgetRowCounts(
  db: PrismaClient,
  tenantId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const model of WIDGET_MODELS) {
    const delegate = (db as unknown as Record<string, CountDelegate>)[
      delegateName(model)
    ];
    counts[model] = await delegate.count(
      hasTenant(model) ? { where: { tenantId } } : undefined,
    );
  }
  return counts;
}

/** Every column of one intent record, as stored. */
export async function intentRecordColumns(
  db: PrismaClient,
  tenantId: string,
  intentTokenHash: string,
): Promise<Record<string, unknown> | null> {
  return db.widgetIntentRecord.findFirst({
    where: { tenantId, intentTokenHash },
  });
}

export interface NoWriteBaseline {
  readonly rowCounts: Record<string, number>;
  readonly record: Record<string, unknown> | null;
  /** The recorder's position when the baseline was taken (see `noWriteViolations`). */
  readonly mark: number;
}

export async function noWriteBaseline(
  recorder: WriteRecorder,
  db: PrismaClient,
  tenantId: string,
  intentTokenHash: string | null,
): Promise<NoWriteBaseline> {
  return {
    rowCounts: await widgetRowCounts(db, tenantId),
    record:
      intentTokenHash === null
        ? null
        : await intentRecordColumns(db, tenantId, intentTokenHash),
    mark: recorder.mark(),
  };
}

/**
 * The NW verdict for one window: every write the recorder saw inside `scope` or after the baseline's mark
 * (both, so a write is caught whether or not its async context carried the scope — at the gateway level
 * nothing else uses the recorded client while a test runs in band), the row-count delta per `Widget*`
 * model, and whether the record's columns changed. All three empty/false means NW holds.
 */
export async function noWriteViolations(
  recorder: WriteRecorder,
  scope: string,
  db: PrismaClient,
  tenantId: string,
  intentTokenHash: string | null,
  before: NoWriteBaseline,
): Promise<{
  writes: RecordedOperation[];
  rowDelta: Record<string, number>;
  recordChanged: boolean;
}> {
  const after = await noWriteBaseline(recorder, db, tenantId, intentTokenHash);
  const rowDelta: Record<string, number> = {};
  for (const model of WIDGET_MODELS) {
    const delta = after.rowCounts[model] - before.rowCounts[model];
    if (delta !== 0) rowDelta[model] = delta;
  }
  const writes = [
    ...new Set([
      ...recorder.writes(scope),
      ...recorder.since(before.mark).filter((op) => op.write),
    ]),
  ];
  return {
    writes,
    rowDelta,
    recordChanged:
      JSON.stringify(after.record) !== JSON.stringify(before.record),
  };
}
