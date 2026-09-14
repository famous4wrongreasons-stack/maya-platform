import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Prisma, type ExpenseReminderRun } from '@prisma/client';
import {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../action-engine';
import { stableActionJson } from '../action-engine/action-engine.identity';
import { AiToolPolicyService } from '../ai-tools/ai-tool-policy.service';
import { AiToolRegistryService } from '../ai-tools/ai-tool-registry.service';
import { UserRole } from '../common/domain.enums';
import { isPostgresSerializationConflict } from '../common/postgres-transaction-conflict';
import type { ReminderDispatch } from '../communication-delivery/appointment-reminder.contract';
import { filterAssistantCapability } from '../dashboard-preferences/assistant-preferences.read';
import { EncryptionService } from '../encryption/encryption.service';
import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import {
  localCalendarDate,
  localHour,
} from '../owner-reports/owner-reports.time';
import { staffTelegramEligible } from '../package5-wave1/governed-settings.read';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  EXPENSE_REMINDER_CONTRACT,
  EXPENSE_REMINDER_TYPE,
  EXPENSE_REMINDER_CAPABILITY,
  expenseAuditUntil,
  expenseDay,
  expenseHash,
  expenseReminderRequest,
  normalizeExpenseReminder,
  reminderSlotKey,
  type ExpenseReminderPlan,
  type ExpenseReminderSlot,
} from './expense-reminder.contract';

@Injectable()
export class ExpenseReminderStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly policy: AiToolPolicyService,
    private readonly registry: AiToolRegistryService,
    @Optional() readonly clock: () => Date = () => new Date(),
  ) {}
  async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let n = 0; n < 5; n++)
      try {
        return await canonicalUtcTransaction(this.prisma, work);
      } catch (e) {
        if (
          n < 4 &&
          (isPostgresSerializationConflict(e) ||
            (e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === 'P2002'))
        )
          continue;
        throw e;
      }
    throw new ConflictException('Expense admission contention');
  }
  find(
    tenantId: string,
    start: string,
    end: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ExpenseReminderRun | null> {
    this.context.assertTenantId(tenantId);
    if (!tx)
      return canonicalUtcTransaction(
        this.prisma,
        (t) => this.find(tenantId, start, end, t),
        { readOnly: true },
      );
    return tx.expenseReminderRun.findUnique({
      where: {
        tenantId_reminderType_periodStartLocalDate_periodEndLocalDate: {
          tenantId,
          reminderType: EXPENSE_REMINDER_TYPE,
          periodStartLocalDate: start,
          periodEndLocalDate: end,
        },
      },
    });
  }
  load(tenantId: string, id: string) {
    this.context.assertTenantId(tenantId);
    return canonicalUtcTransaction(
      this.prisma,
      (tx) =>
        tx.expenseReminderRun.findUniqueOrThrow({
          where: { id_tenantId: { id, tenantId } },
        }),
      { readOnly: true },
    );
  }
  read(root: ExpenseReminderRun) {
    this.context.assertTenantId(root.tenantId);
    if (!root.intentEncrypted)
      throw new ForbiddenException('Expense reminder payload unavailable');
    const p = normalizeExpenseReminder(
      JSON.parse(
        this.encryption.decrypt(root.intentEncrypted),
      ) as ExpenseReminderPlan,
    );
    if (
      p.tenantId !== root.tenantId ||
      p.periodStartLocalDate !== root.periodStartLocalDate ||
      p.periodEndLocalDate !== root.periodEndLocalDate ||
      p.timezone !== root.timezone ||
      p.expiresAt !== root.expiresAt.toISOString() ||
      expenseHash(EXPENSE_REMINDER_CONTRACT, p) !== root.intentHash
    )
      throw new ForbiddenException('Expense reminder manifest mismatch');
    return p;
  }
  async actor(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
    this.context.assertTenantId(tenantId);
    const m = await tx.membership.findUnique({
      where: { userId_tenantId: { tenantId, userId } },
      include: {
        user: { select: { status: true } },
        tenant: { select: { status: true } },
      },
    });
    if (
      !m ||
      m.status !== 'active' ||
      m.user.status !== 'active' ||
      m.tenant.status !== 'active' ||
      !['tenant_owner', 'business_owner'].includes(m.role)
    )
      throw new ForbiddenException(
        'Current canonical expense AI owner required',
      );
    await this.policy.assertCanExecute(
      this.policy.buildPrincipal(
        tenantId,
        userId,
        m.role as UserRole,
        'telegram',
      ),
      this.registry.get('expenses.create'),
    );
    return m;
  }
  async eligible(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    expected?: ExpenseReminderSlot,
  ) {
    const m = await this.actor(tx, tenantId, userId);
    if (
      !(
        await filterAssistantCapability(
          tx,
          tenantId,
          [userId],
          'weekly_expense_reminders',
        )
      ).length ||
      !(await staffTelegramEligible(tx, tenantId, userId, m.id, this.clock()))
    )
      throw new ForbiddenException(
        'Explicit weekly opt-in and current Telegram eligibility required',
      );
    const routes = await tx.authIdentity.findMany({
      where: { tenantId, userId, provider: 'telegram' },
      take: 2,
    });
    if (
      routes.length !== 1 ||
      !/^[1-9][0-9]{0,19}$/.test(routes[0].providerUserId)
    )
      throw new ForbiddenException(
        'One verified canonical Telegram route required',
      );
    const route = routes[0];
    if (
      expected &&
      (expected.membershipId !== m.id ||
        expected.role !== m.role ||
        expected.authIdentityId !== route.id ||
        expected.telegramId !== route.providerUserId)
    )
      throw new ForbiddenException('Admitted expense recipient changed');
    return { m, route };
  }
  async admit(
    tenantId: string,
    start: string,
    end: string,
    explicit?: ExpenseReminderPlan,
  ) {
    this.context.assertTenantId(tenantId);
    return this.transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r13/reminder/${tenantId}/${start}/${end}`},0))::text`,
      );
      const old = await this.find(tenantId, start, end, tx);
      if (old) {
        if (
          explicit &&
          old.intentHash !==
            expenseHash(
              EXPENSE_REMINDER_CONTRACT,
              normalizeExpenseReminder(explicit),
            )
        )
          throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return old;
      }
      const now = this.clock(),
        tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
        timezone = tenant.defaultTimezone;
      if (
        tenant.status !== 'active' ||
        localCalendarDate(timezone, now) !== end ||
        localHour(timezone, now) !== 20 ||
        new Date(`${end}T00:00:00Z`).getUTCDay() !== 0 ||
        expenseDay(start, 6) !== end
      )
        throw new ForbiddenException(
          'Only Sunday 20:00–21:00 first admission is allowed',
        );
      const p: ExpenseReminderPlan = {
        contract: EXPENSE_REMINDER_CONTRACT,
        tenantId,
        reminderType: EXPENSE_REMINDER_TYPE,
        contractVersion: 1,
        periodStartLocalDate: start,
        periodEndLocalDate: end,
        timezone,
        periodStartAt: localDateMinuteToUtc(start, 0, timezone).toISOString(),
        periodEndExclusiveAt: localDateMinuteToUtc(
          expenseDay(end, 1),
          0,
          timezone,
        ).toISOString(),
        expiresAt: localDateMinuteToUtc(
          expenseDay(end, 8),
          0,
          timezone,
        ).toISOString(),
        content: {
          version: 1,
          title: 'Расходы за неделю',
          bodyText: `Проверьте незаписанные расходы за ${start} — ${end} по текущий момент. Для каждого укажите дату, статью, сумму и филиал либо весь бизнес. Каждая карточка требует отдельного подтверждения. Это напоминание не подтверждает полноту расходов.`,
        },
        slots: [],
      };
      const members = await tx.membership.findMany({
        where: {
          tenantId,
          status: 'active',
          role: { in: ['tenant_owner', 'business_owner'] },
          user: { status: 'active' },
        },
        orderBy: { userId: 'asc' },
        take: 10001,
      });
      if (members.length > 10000)
        throw new ConflictException('Expense audience too large');
      for (const member of members) {
        let eligible;
        try {
          eligible = await this.eligible(tx, tenantId, member.userId);
        } catch (e) {
          if (e instanceof ForbiddenException) continue;
          throw e;
        }
        const slotKey = reminderSlotKey(p, member.userId, eligible.route.id);
        p.slots.push({
          slotKey,
          executionRef: `expense-reminder:${slotKey}`,
          userId: member.userId,
          membershipId: member.id,
          role: member.role as ExpenseReminderSlot['role'],
          authIdentityId: eligible.route.id,
          telegramId: eligible.route.providerUserId,
          channel: 'telegram',
        });
      }
      const plan = normalizeExpenseReminder(p),
        intentHash = expenseHash(EXPENSE_REMINDER_CONTRACT, plan);
      if (
        explicit &&
        intentHash !==
          expenseHash(
            EXPENSE_REMINDER_CONTRACT,
            normalizeExpenseReminder(explicit),
          )
      )
        throw new ConflictException('IDEMPOTENCY_CONFLICT');
      const root = await tx.expenseReminderRun.create({
        data: {
          tenantId,
          reminderType: EXPENSE_REMINDER_TYPE,
          periodStartLocalDate: start,
          periodEndLocalDate: end,
          contractVersion: 1,
          timezone,
          intentHash,
          intentEncrypted: this.encryption.encrypt(stableActionJson(plan)),
          admittedAt: now,
          expiresAt: new Date(plan.expiresAt),
          payloadRetentionUntil: new Date(plan.expiresAt),
          auditRetentionUntil: expenseAuditUntil(now),
        },
      });
      for (const slot of plan.slots) {
        const request = expenseReminderRequest(root.id, plan, slot);
        if ((await this.ingress.preview(request)).policyDecision !== 'ALLOW')
          throw new ForbiddenException('Weekly expense A13 denied');
        const row = await this.ingress.createExecution(request, tx);
        if (
          row.state !== 'READY' ||
          row.expenseReminderRunId !== root.id ||
          row.expenseReminderSlotKey !== slot.slotKey
        )
          throw new ForbiddenException('Atomic full expense slot set required');
      }
      return root;
    });
  }
  async executions(
    root: ExpenseReminderRun,
    plan = this.read(root),
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const rows = await tx.actionExecution.findMany({
      where: { tenantId: root.tenantId, expenseReminderRunId: root.id },
    });
    if (
      rows.length !== plan.slots.length ||
      rows.some(
        (r) =>
          !plan.slots.some(
            (s) =>
              s.slotKey === r.expenseReminderSlotKey &&
              s.executionRef === r.sourceRef,
          ) ||
          r.capability !== EXPENSE_REMINDER_CAPABILITY ||
          r.intentExpiresAt?.getTime() !== root.expiresAt.getTime(),
      )
    )
      throw new ForbiddenException(
        'Complete immutable expense execution set required',
      );
    return rows;
  }
  async dispatch(
    tenantId: string,
    runId: string,
    slotKey: string,
  ): Promise<ReminderDispatch> {
    const root = await this.load(tenantId, runId),
      plan = this.read(root),
      slot = plan.slots.find((s) => s.slotKey === slotKey);
    if (!slot) throw new ForbiddenException('Unknown expense reminder slot');
    const rows = await this.executions(root, plan),
      row = rows.find((r) => r.expenseReminderSlotKey === slotKey)!,
      request = expenseReminderRequest(runId, plan, slot),
      preview = this.kernel.previewExecution(request);
    if (
      row.normalizedInputHash !== preview.normalizedInputHash ||
      row.identityFingerprint !== preview.identityFingerprint
    )
      throw new ForbiddenException('Expense execution manifest mismatch');
    return {
      request,
      authorize: async () => {
        const current = await this.load(tenantId, root.id);
        if (
          current.expiresAt <= this.clock() ||
          !current.intentEncrypted ||
          current.intentHash !== root.intentHash
        )
          throw new ForbiddenException('Expense reminder expired');
        await this.eligible(this.prisma, tenantId, slot.userId, slot);
      },
    };
  }
}
