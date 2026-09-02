/**
 * СОСТЯЗАТЕЛЬНЫЙ ПРОГОН: запись расхода из чата.
 *
 * Временный файл ревизии. Настоящие рантайм/реестр/политика/обработчик/сервис,
 * подменена только БД — как в ai-tool-expenses-create.spec.ts, но здесь мы
 * пытаемся СЛОМАТЬ путь, а не подтвердить happy path.
 */
import { CustomersService } from '../customers/customers.service';
import { StaffService } from '../staff/staff.service';
import { BusinessStateService } from '../business-state/business-state.service';
import { ForbiddenException } from '@nestjs/common';

import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { resolveExpenseCategory } from '../expenses/expense-category';
import { ExpensesService } from '../expenses/expenses.service';
import { P407ExpenseCanonicalCutoverService } from '../expenses/p4-07-expense-canonical-cutover.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';

const KEY_A = '2f1c2f52-1e1b-4a2c-9d4f-7f1a8f0a01b2';
const KEY_B = '9c3a1f77-4d2e-4b7a-8c11-2e5b6d9f0a33';

const owner: AuthenticatedUser = {
  userId: 'owner_12345678',
  sessionId: 'session-a',
  tenantId: 'tenant-a',
  role: UserRole.TENANT_OWNER,
  email: 'redacted@example.invalid',
  branchId: null,
  membershipId: 'membership-a',
  membershipStatus: 'active',
};

type Harness = ReturnType<typeof createHarness>;

async function prepare(
  h: Harness,
  args: Record<string, unknown>,
  key = KEY_A,
  as: AuthenticatedUser = owner,
) {
  return (await h.run(() =>
    h.runtime.execute(as, 'expenses.create', {
      arguments: args,
      surface: 'native',
      idempotencyKey: key,
    }),
  )) as { approval: { id: string; payload_hash: string } };
}

describe('РАСХОД ИЗ ЧАТА — состязательный прогон', () => {
  // ── 1. Можно ли записать расход без подтверждения человеком ────────────
  describe('1. запись без подтверждения', () => {
    it('подготовка не пишет ничего', async () => {
      const h = createHarness();
      await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      expect(h.store.expenses).toHaveLength(0);
      expect(h.store.approvals[0].status).toBe('pending');
    });

    it('отклонение не пишет ничего и закрывает карточку навсегда', async () => {
      const h = createHarness();
      const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      await h.run(() =>
        h.runtime.reject(owner, p.approval.id, {
          payloadHash: p.approval.payload_hash,
        }),
      );
      await expect(
        h.run(() =>
          h.runtime.approve(owner, p.approval.id, {
            payloadHash: p.approval.payload_hash,
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: 'ai_approval_already_decided' } },
      });
      expect(h.store.expenses).toHaveLength(0);
    });

    it('истёкшая карточка не исполняется', async () => {
      const h = createHarness();
      const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      h.store.approvals[0].expiresAt = new Date(Date.now() - 1000);
      await expect(
        h.run(() =>
          h.runtime.approve(owner, p.approval.id, {
            payloadHash: p.approval.payload_hash,
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: 'ai_approval_expired' } },
      });
      expect(h.store.approvals[0].status).toBe('expired');
      expect(h.store.expenses).toHaveLength(0);
    });

    it('повтор tool_call с другими аргументами под тем же ключом — конфликт, карточка не подменяется', async () => {
      const h = createHarness();
      await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      await expect(
        prepare(h, { category: 'rent', amount_rubles: 600_000 }, KEY_A),
      ).rejects.toMatchObject({
        response: { error: { code: 'ai_approval_idempotency_conflict' } },
      });
      expect(h.store.approvals).toHaveLength(1);
      expect(
        (h.store.approvals[0].payloadPreviewJson as Record<string, unknown>)
          .amount_rubles,
      ).toBe(60_000);
      expect(h.store.expenses).toHaveLength(0);
    });

    it('подмена сохранённых аргументов между подготовкой и подтверждением ловится хешем', async () => {
      const h = createHarness();
      const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      // Злоумышленник с доступом к строке подменил зашифрованные аргументы.
      h.store.approvals[0].encryptedArguments = h.encryption.encrypt(
        JSON.stringify({ category: 'rent', amount_rubles: 600_000 }),
      );
      await expect(
        h.run(() =>
          h.runtime.approve(owner, p.approval.id, {
            payloadHash: p.approval.payload_hash,
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: 'ai_approval_payload_mismatch' } },
      });
      expect(h.store.expenses).toHaveLength(0);
    });

    it('подтверждение чужим payload_hash не проходит', async () => {
      const h = createHarness();
      const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      await expect(
        h.run(() =>
          h.runtime.approve(owner, p.approval.id, {
            payloadHash: 'a'.repeat(64),
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: 'ai_approval_payload_mismatch' } },
      });
      expect(h.store.expenses).toHaveLength(0);
    });
  });

  // ── 2. Идемпотентность ─────────────────────────────────────────────────
  describe('2. идемпотентность', () => {
    it('двойное «Подтвердить» подряд — один расход', async () => {
      const h = createHarness();
      const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      await h.approve(p);
      await h.approve(p);
      expect(h.store.expenses).toHaveLength(1);
    });

    it('гонка двух подтверждений — один расход', async () => {
      const h = createHarness();
      const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      const results = await Promise.allSettled([
        h.approve(p),
        h.approve(p),
        h.approve(p),
      ]);
      expect(h.store.expenses).toHaveLength(1);
      expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    });

    it('🔴 ПОВТОР ЗАПРОСА: то же намерение новым ключом → ДВА расхода', async () => {
      const h = createHarness();
      const args = {
        category: 'rent',
        amount_rubles: 60_000,
        occurred_on: '2026-08-07',
      };
      const first = await prepare(h, args, KEY_A);
      await h.approve(first);
      // Владелец повторил ту же фразу в чате: новый requestId → новый ключ.
      const second = await prepare(h, args, KEY_B);
      await h.approve(second);

      expect(h.store.expenses).toHaveLength(2);
      expect(h.store.expenses.map((r) => r.amountKopecks)).toEqual([
        6_000_000, 6_000_000,
      ]);
    });

    it('🔴 ДВЕ ЖИВЫЕ КАРТОЧКИ об одном расходе: подтверждаются обе', async () => {
      const h = createHarness();
      const args = {
        category: 'rent',
        amount_rubles: 60_000,
        occurred_on: '2026-08-07',
      };
      // Владелец переспросил «ты записала?» — модель предложила расход ещё раз,
      // первая карточка при этом всё ещё ждёт подтверждения.
      const first = await prepare(h, args, KEY_A);
      const second = await prepare(h, args, KEY_B);
      expect(h.store.approvals).toHaveLength(2);
      expect(h.store.approvals.map((a) => String(a.status))).toEqual([
        'pending',
        'pending',
      ]);
      // Хеш у них ОДИНАКОВЫЙ — система знает, что это одно и то же намерение.
      expect(first.approval.payload_hash).toBe(second.approval.payload_hash);

      await h.approve(first);
      await h.approve(second);
      expect(h.store.expenses).toHaveLength(2);
    });

    it('сбой canonical audit откатывает expense вместе с локальной транзакцией', async () => {
      const h = createHarness();
      h.failAuditAction('expense.created.canonical');
      const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      await expect(h.approve(p)).rejects.toBeDefined();

      // Канонический локальный owner не оставляет value fact без его audit.
      expect(h.store.expenses).toHaveLength(0);
      expect(h.store.approvals[0].status).toBe('failed');
      expect(h.store.executions[0].status).toBe('failed');

      await expect(h.approve(p)).rejects.toMatchObject({
        response: { error: { code: 'ai_approval_already_decided' } },
      });
      h.failAuditAction(null);
      const retry = await prepare(
        h,
        {
          category: 'rent',
          amount_rubles: 60_000,
        },
        KEY_B,
      );
      await h.approve(retry);
      expect(h.store.expenses).toHaveLength(1);
    });

    it('🔴 ТАЙМАУТ рантайма: вставка доезжает, человеку сказано «не вышло»', async () => {
      jest.useFakeTimers();
      try {
        const h = createHarness();
        // Запись в БД занимает 12 с — дольше timeoutMs инструмента (10 с).
        h.delayExpenseInsert(12_000);
        const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
        const decision = h.approve(p);
        const settled = decision.then(
          () => 'ok',
          (error: unknown) => error,
        );
        await jest.advanceTimersByTimeAsync(12_500);
        const outcome = await settled;

        // Инструмент отчитался таймаутом...
        expect(outcome).toMatchObject({
          response: { error: { code: 'ai_tool_timeout_unknown' } },
        });
        expect(h.store.executions[0].status).toBe('failed');
        expect(h.store.approvals[0].status).toBe('failed');
        // ...а расход в БД лежит.
        expect(h.store.expenses).toHaveLength(1);
        expect(h.store.expenses[0].amountKopecks).toBe(6_000_000);
      } finally {
        jest.useRealTimers();
      }
    });

    it('гонка на уровне сервиса: тот же ключ идемпотентности → один расход', async () => {
      const h = createHarness();
      const dto = {
        category: 'rent',
        amountKopecks: 6_000_000,
        currency: 'RUB',
        occurredAt: '2026-08-07T09:00:00.000Z',
      };
      await Promise.allSettled([
        h.run(() =>
          h.expensesService.create('tenant-a', owner.userId, dto, {
            idempotencyKey: 'same-key',
          }),
        ),
        h.run(() =>
          h.expensesService.create('tenant-a', owner.userId, dto, {
            idempotencyKey: 'same-key',
          }),
        ),
      ]);
      expect(h.store.expenses).toHaveLength(1);
    });
  });

  // ── 3. Суммы ───────────────────────────────────────────────────────────
  describe('3. суммы: что уходит в БД', () => {
    const accepted: Array<[unknown, number]> = [
      [60_000, 6_000_000], // «шестьдесят тысяч»
      [60_000.5, 6_000_050], // дробные рубли
      [0.5, 50], // полтинник копеек
      [0.01, 1], // минимальная копейка
      [1_234_567.89, 123_456_789], // плавающая точка
      [10_000_000, 1_000_000_000], // потолок
    ];
    it.each(accepted)('%p ₽ → %p копеек в БД', async (input, kopecks) => {
      const h = createHarness();
      const p = await prepare(h, { category: 'rent', amount_rubles: input });
      await h.approve(p);
      expect(h.store.expenses[0].amountKopecks).toBe(kopecks);
      expect(h.store.expenses[0].currency).toBe('RUB');
    });

    const rejected: unknown[] = [
      0,
      -100,
      -0.01,
      '60000',
      '60 000',
      100.005,
      0.001,
      10_000_000.01,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      null,
      true,
      [60_000],
      { value: 60_000 },
    ];
    it.each(rejected.map((v) => [v]))(
      'amount_rubles=%p отвергается до карточки',
      async (input) => {
        const h = createHarness();
        await expect(
          prepare(h, { category: 'rent', amount_rubles: input }),
        ).rejects.toMatchObject({ status: 400 });
        expect(h.store.approvals).toHaveLength(0);
        expect(h.store.expenses).toHaveLength(0);
      },
    );

    it('карточка показывает и рубли, и копейки — два числа об одной сумме', async () => {
      const h = createHarness();
      await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      const preview = h.store.approvals[0].payloadPreviewJson as Record<
        string,
        unknown
      >;
      expect(preview.amount_rubles).toBe(60_000);
      expect(preview.amount_kopecks).toBe(6_000_000);
    });

    it('модель, спутавшая копейки с рублями, проходит фенс (60 000 → 6 000 000 ₽)', async () => {
      const h = createHarness();
      const p = await prepare(h, {
        category: 'rent',
        amount_rubles: 6_000_000,
      });
      await h.approve(p);
      expect(h.store.expenses[0].amountKopecks).toBe(600_000_000);
    });
  });

  // ── 4. Роли ────────────────────────────────────────────────────────────
  describe('4. роли', () => {
    const denied = [
      UserRole.PROVIDER,
      UserRole.EMPLOYEE,
      UserRole.STAFF,
      UserRole.MANAGER,
      UserRole.BRANCH_MANAGER,
      UserRole.CLIENT,
      UserRole.CUSTOMER,
    ];
    it.each(denied.map((r) => [r]))(
      '%s не может завести расход',
      async (role) => {
        const h = createHarness();
        await expect(
          prepare(h, { category: 'rent', amount_rubles: 60_000 }, KEY_A, {
            ...owner,
            role,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(h.store.approvals).toHaveLength(0);
        expect(h.store.expenses).toHaveLength(0);
      },
    );

    it('администратор чужого тенанта не видит и не подтверждает карточку', async () => {
      const h = createHarness();
      const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      const foreign = {
        ...owner,
        userId: 'owner_87654321',
        tenantId: 'tenant-b',
      };
      // Контекст запроса — его тенант, а карточка чужая.
      await expect(
        h.runAs('tenant-b', () =>
          h.runtime.approve(foreign, p.approval.id, {
            payloadHash: p.approval.payload_hash,
          }),
        ),
      ).rejects.toMatchObject({ status: 404 });
      // Подделать tenantId в токене тоже не выйдет: контекст запроса другой.
      await expect(
        h.runAs('tenant-b', () =>
          h.runtime.approve(
            { ...foreign, tenantId: 'tenant-a' },
            p.approval.id,
            {
              payloadHash: p.approval.payload_hash,
            },
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.store.expenses).toHaveLength(0);
    });

    it('🔴 инициатора понизили в роли — карточка застревает в approved навсегда', async () => {
      const h = createHarness();
      const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      // Пока карточка ждала, инициатор перестал быть финансовой ролью.
      h.store.approvals[0].requesterRole = UserRole.PROVIDER;
      await expect(h.approve(p)).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.store.expenses).toHaveLength(0);
      // Ни failed, ни expired: статус «одобрено», и он больше не изменится.
      expect(h.store.approvals[0].status).toBe('approved');
      // Повторная попытка уже не 403, а «уже обработано» — карточка мертва,
      // но в списке ожидающих остаётся (listApprovals берёт и approved).
      await expect(h.approve(p)).rejects.toMatchObject({
        response: { error: { code: 'ai_approval_already_decided' } },
      });
      expect(h.store.approvals[0].status).toBe('approved');
      expect(h.store.expenses).toHaveLength(0);
    });

    it('бухгалтер не может даже подготовить расход владельца', async () => {
      const h = createHarness();
      const accountant = { ...owner, role: UserRole.ACCOUNTANT };
      await expect(
        prepare(
          h,
          { category: 'supplies', amount_rubles: 4_500 },
          KEY_A,
          accountant,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.store.approvals).toHaveLength(0);
      expect(h.store.expenses).toHaveLength(0);
    });

    it('бухгалтер не может создать расход через подтверждение владельца', async () => {
      const h = createHarness();
      const accountant = { ...owner, role: UserRole.ACCOUNTANT };
      await expect(
        prepare(
          h,
          { category: 'supplies', amount_rubles: 4_500 },
          KEY_A,
          accountant,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.store.approvals).toHaveLength(0);
      expect(h.store.expenses).toHaveLength(0);
    });
  });

  // ── 5. Категории ───────────────────────────────────────────────────────
  describe('5. категории', () => {
    it('вне справочника — отказ до карточки', async () => {
      const h = createHarness();
      for (const category of ['arenda', 'arenda-avgust', 'rent_august', '']) {
        await expect(
          prepare(h, { category, amount_rubles: 1000 }),
        ).rejects.toMatchObject({ status: 400 });
      }
      expect(h.store.approvals).toHaveLength(0);
    });

    it('payroll руками — отказ и в инструменте, и в сервисе', async () => {
      const h = createHarness();
      await expect(
        prepare(h, { category: 'payroll', amount_rubles: 180_000 }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        h.run(() =>
          h.expensesService.create('tenant-a', owner.userId, {
            category: 'payroll',
            amountKopecks: 100,
            occurredAt: '2026-08-07T09:00:00.000Z',
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(h.store.expenses).toHaveLength(0);
    });

    it('регистр и пробелы нормализуются, хеш подтверждения стабилен', async () => {
      const h = createHarness();
      const p = await prepare(h, { category: ' RENT ', amount_rubles: 1000 });
      await h.approve(p);
      expect(h.store.expenses[0].category).toBe('rent');
    });

    it('🔴 Cycle 04 P8: синоним читается своей статьёй, неопознанное — «Прочее»', () => {
      // Раньше здесь стояло «все четыре строки читаются как other», и рядом
      // висел комментарий: аналитика для тех же строк канонизирует иначе —
      // 'ads' → marketing, 'zarplata'/'salary' → salary. Две разные правды.
      // P8 оставил одну: синонимы знает справочник, и знает их один раз.
      for (const [legacy, slug] of [
        ['ads', 'marketing'],
        ['zarplata', 'payroll'],
        ['salary', 'payroll'],
        ['rent-payment', 'rent'],
      ] as const) {
        const resolved = resolveExpenseCategory(legacy);
        expect(resolved.slug).toBe(slug);
        expect(resolved.match).toBe('legacy_alias');
        expect(resolved.known).toBe(true);
        // Написание не теряется: опознали статью, а не переписали историю.
        expect(resolved.raw).toBe(legacy);
      }
      // Незнакомая строка по-прежнему «Прочее», а не выдуманная статья.
      const unknown = resolveExpenseCategory('arenda-avgust');
      expect(unknown.slug).toBe('other');
      expect(unknown.match).toBe('unknown');
      expect(unknown.known).toBe(false);
      expect(unknown.raw).toBe('arenda-avgust');
    });
  });

  // ── 6. Карточка подтверждения на фронте ────────────────────────────────
  describe('6. что видит человек в карточке (логика app.html)', () => {
    // Точный код из app.html:
    // Object.keys(payload_preview).filter(k => k !== 'action').slice(0, 6)
    const visible = (preview: Record<string, unknown>) =>
      Object.keys(preview)
        .filter((k) => k !== 'action')
        .slice(0, 6);

    it('сумма, дата и статья — первые три поля, дату больше не отрезает', async () => {
      const h = createHarness();
      await prepare(h, {
        category: 'rent',
        amount_rubles: 60_000,
        occurred_on: '2026-08-05',
        note: 'Аренда за август',
      });
      const preview = h.store.approvals[0].payloadPreviewJson as Record<
        string,
        unknown
      >;
      expect(visible(preview).slice(0, 3)).toEqual(['sum', 'date', 'type']);
      expect(preview.sum).toBe('60 000 ₽');
      expect(preview.date).toBe('05.08.2026');
      expect(preview.type).toBe('Аренда');
      expect(h.store.approvals[0].summary).toBe(
        'Записать расход: Аренда — 60 000 ₽ за 05.08.2026.',
      );
    });

    it('после Postgres jsonb порядок ключей тот же — важное всё равно первое', async () => {
      const h = createHarness();
      await prepare(h, {
        category: 'rent',
        amount_rubles: 60_000,
        occurred_on: '2026-08-05',
        note: 'Аренда за август',
      });
      const preview = h.store.approvals[0].payloadPreviewJson as Record<
        string,
        unknown
      >;
      // jsonb сортирует ключи: сначала по длине, потом побайтово. Имена полей
      // подобраны так, чтобы эта сортировка совпадала с нужным порядком.
      const jsonbOrder = Object.fromEntries(
        Object.entries(preview).sort(
          ([l], [r]) => l.length - r.length || (l < r ? -1 : 1),
        ),
      );
      expect(visible(jsonbOrder)).toEqual(visible(preview));
      expect(visible(jsonbOrder).slice(0, 3)).toEqual(['sum', 'date', 'type']);
    });

    it('дата в карточке проставлена даже когда человек её не называл', async () => {
      const h = createHarness();
      // 🔴 «Сегодня» разрешается ДО показа карточки: иначе владелец
      // подтверждает расход, не видя, за какое число он пишется.
      await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      const preview = h.store.approvals[0].payloadPreviewJson as Record<
        string,
        unknown
      >;
      expect(preview.date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
      expect(String(h.store.approvals[0].summary)).toContain(' за ');
    });

    it('и записывается ровно та дата, которую показали', async () => {
      const h = createHarness();
      const p = await prepare(h, { category: 'rent', amount_rubles: 60_000 });
      const shownDay = String(
        (h.store.approvals[0].payloadPreviewJson as Record<string, unknown>)
          .date,
      );
      await h.approve(p);
      const stored = h.store.expenses[0].occurredAt;
      const written = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(stored);
      expect(written).toBe(shownDay);
    });
  });

  // ── 7. Задвоение ручного и импортированного расхода ────────────────────
  describe('7. один платёж из двух источников', () => {
    const visible = (preview: Record<string, unknown>) =>
      Object.keys(preview)
        .filter((k) => k !== 'action')
        .slice(0, 6);

    it('помечает вероятный дубль в карточке, но не блокирует запись', async () => {
      const h = createHarness();
      // Тот же платёж уже приехал из CRM днём раньше.
      h.store.expenses.push({
        id: 'expense-crm',
        tenantId: 'tenant-a',
        branchId: null,
        branchTenantId: null,
        createdById: null,
        createdByTenantId: null,
        category: 'rent',
        amountKopecks: 6_000_000,
        currency: 'RUB',
        occurredAt: new Date('2026-08-04T09:00:00.000Z'),
        encryptedNote: null,
        source: 'crm',
        externalId: 'crm-payment-1',
        idempotencyKey: null,
        createdAt: new Date('2026-08-04T09:00:00.000Z'),
        updatedAt: new Date('2026-08-04T09:00:00.000Z'),
      });

      const p = await prepare(h, {
        category: 'rent',
        amount_rubles: 60_000,
        occurred_on: '2026-08-05',
      });
      const preview = h.store.approvals[0].payloadPreviewJson as Record<
        string,
        unknown
      >;
      expect(String(preview.alert)).toContain('Похоже на дубль');
      expect(String(preview.alert)).toContain('из CRM');
      // Предупреждение обязано попасть в те шесть полей, которые видно.
      expect(visible(preview)).toContain('alert');

      // Блокировки нет: владелец может знать лучше.
      const result = (await h.approve(p)) as {
        result: { recorded: boolean; possible_duplicate: unknown };
      };
      expect(result.result.recorded).toBe(true);
      expect(result.result.possible_duplicate).toMatchObject({
        status: 'suspected',
      });
      expect(h.store.expenses).toHaveLength(2);
    });

    it('второй ручной расход подряд дублем не считается', async () => {
      const h = createHarness();
      const first = await prepare(h, {
        category: 'supplies',
        amount_rubles: 3_000,
        occurred_on: '2026-08-05',
      });
      await h.approve(first);

      const second = await prepare(
        h,
        {
          category: 'supplies',
          amount_rubles: 3_000,
          occurred_on: '2026-08-05',
        },
        KEY_B,
      );
      const preview = h.store.approvals[1].payloadPreviewJson as Record<
        string,
        unknown
      >;
      // Два одинаковых ручных платежа в один день — осознанное действие
      // человека, а не рассинхрон систем. Пугать его нечем.
      expect(preview.alert).toBeUndefined();
      const result = (await h.approve(second)) as {
        result: { possible_duplicate: unknown };
      };
      expect(result.result.possible_duplicate).toBeNull();
    });
  });
});

interface ExpenseRow {
  id: string;
  tenantId: string;
  branchId: string | null;
  branchTenantId: string | null;
  createdById: string | null;
  createdByTenantId: string | null;
  category: string;
  amountKopecks: number;
  currency: string;
  occurredAt: Date;
  encryptedNote: string | null;
  source: string;
  externalId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

class FakeUniqueError extends Error {
  readonly code = 'P2002';
  constructor() {
    super('Unique constraint failed');
  }
}

function createHarness() {
  const store = {
    expenses: [] as ExpenseRow[],
    approvals: [] as Record<string, any>[],
    executions: [] as Record<string, any>[],
  };
  let sequence = 0;
  let failingAuditAction: string | null = null;
  let expenseInsertDelayMs = 0;
  const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

  const matchesExpense = (row: ExpenseRow, where: Record<string, unknown>) =>
    Object.entries(where).every(
      ([key, value]) =>
        (row as unknown as Record<string, unknown>)[key] === value,
    );

  const prisma = {
    expense: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const data = args.data;
        // Настоящий уникальный индекс (tenantId, idempotencyKey).
        const clash = store.expenses.some(
          (row) =>
            row.tenantId === data.tenantId &&
            data.idempotencyKey != null &&
            row.idempotencyKey === data.idempotencyKey,
        );
        if (clash) {
          return Promise.reject(new FakeUniqueError());
        }
        const now = new Date('2026-08-07T09:00:00.000Z');
        const row = {
          id: nextId('expense'),
          createdAt: now,
          updatedAt: now,
          ...data,
        } as unknown as ExpenseRow;
        if (expenseInsertDelayMs > 0) {
          return new Promise<ExpenseRow>((resolve) => {
            setTimeout(() => {
              store.expenses.push(row);
              resolve(row);
            }, expenseInsertDelayMs);
          });
        }
        store.expenses.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn((args: { where: Record<string, unknown> }) =>
        Promise.resolve(
          store.expenses.find((row) => matchesExpense(row, args.where)) ?? null,
        ),
      ),
      // Настоящая выборка по хранилищу: поиск вероятных дублей читает её, и
      // заглушка «всегда пусто» прятала бы ровно то, что мы проверяем.
      findMany: jest.fn((args: { where: Record<string, unknown> }) => {
        const where = args.where as {
          occurredAt?: { gte?: Date; lte?: Date };
          [key: string]: unknown;
        };
        const scalars = Object.fromEntries(
          Object.entries(where).filter(([key]) => key !== 'occurredAt'),
        );
        return Promise.resolve(
          store.expenses.filter((row) => {
            if (!matchesExpense(row, scalars)) return false;
            const range = where.occurredAt;
            if (!range) return true;
            const at = row.occurredAt.getTime();
            if (range.gte && at < range.gte.getTime()) return false;
            if (range.lte && at > range.lte.getTime()) return false;
            return true;
          }),
        );
      }),
      delete: jest.fn(),
    },
    expensePeriodDeclaration: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        calendarSource: 'external',
        defaultTimezone: 'Europe/Moscow',
      }),
    },
    branch: { findFirst: jest.fn() },
    membership: {
      findUnique: jest.fn(
        (args: {
          where: { userId_tenantId: { userId: string; tenantId: string } };
        }) =>
          Promise.resolve({
            role: String(
              store.approvals.find(
                (a) =>
                  a.requestedByUserId === args.where.userId_tenantId.userId,
              )?.requesterRole ?? UserRole.TENANT_OWNER,
            ),
            status: 'active',
            user: { id: args.where.userId_tenantId.userId, status: 'active' },
          }),
      ),
    },
    aiApprovalRequest: {
      findUnique: jest.fn((args: { where: Record<string, unknown> }) => {
        const key = args.where as {
          id_tenantId?: { id: string; tenantId: string };
          tenantId_idempotencyKey?: {
            tenantId: string;
            idempotencyKey: string;
          };
        };
        if (key.id_tenantId) {
          return Promise.resolve(
            store.approvals.find(
              (row) =>
                row.id === key.id_tenantId!.id &&
                row.tenantId === key.id_tenantId!.tenantId,
            ) ?? null,
          );
        }
        return Promise.resolve(
          store.approvals.find(
            (row) =>
              row.tenantId === key.tenantId_idempotencyKey!.tenantId &&
              row.idempotencyKey ===
                key.tenantId_idempotencyKey!.idempotencyKey,
          ) ?? null,
        );
      }),
      findUniqueOrThrow: jest.fn(
        (args: {
          where: { id_tenantId: { id: string; tenantId: string } };
        }) => {
          const found = store.approvals.find(
            (row) => row.id === args.where.id_tenantId.id,
          );
          if (!found) {
            throw new Error('approval not found');
          }
          return Promise.resolve({ ...found });
        },
      ),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = {
          id: nextId('approval'),
          decidedByUserId: null,
          decidedByTenantId: null,
          decidedAt: null,
          executedAt: null,
          errorCode: null,
          createdAt: now,
          updatedAt: now,
          ...args.data,
        };
        store.approvals.push(row);
        return Promise.resolve({ ...row });
      }),
      updateMany: jest.fn(
        (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const where = args.where as {
            id?: string;
            tenantId?: string;
            status?: string | { in: string[] };
            expiresAt?: { gt?: Date; lte?: Date };
          };
          let count = 0;
          for (const row of store.approvals) {
            if (where.id && row.id !== where.id) continue;
            if (where.tenantId && row.tenantId !== where.tenantId) continue;
            if (
              typeof where.status === 'string' &&
              row.status !== where.status
            ) {
              continue;
            }
            if (
              where.status &&
              typeof where.status === 'object' &&
              !where.status.in.includes(row.status as string)
            ) {
              continue;
            }
            if (
              where.expiresAt?.gt &&
              (row.expiresAt as Date).getTime() <= where.expiresAt.gt.getTime()
            ) {
              continue;
            }
            if (
              where.expiresAt?.lte &&
              (row.expiresAt as Date).getTime() > where.expiresAt.lte.getTime()
            ) {
              continue;
            }
            Object.assign(row, args.data);
            count += 1;
          }
          return Promise.resolve({ count });
        },
      ),
      update: jest.fn(
        (args: {
          where: { id_tenantId: { id: string } };
          data: Record<string, unknown>;
        }) => {
          const found = store.approvals.find(
            (row) => row.id === args.where.id_tenantId.id,
          );
          if (found) {
            Object.assign(found, args.data);
          }
          return Promise.resolve(found ?? {});
        },
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiToolExecution: {
      findUnique: jest.fn((args: { where: Record<string, unknown> }) => {
        const key = args.where as {
          tenantId_idempotencyKey?: {
            tenantId: string;
            idempotencyKey: string;
          };
          approvalRequestId_approvalTenantId?: {
            approvalRequestId: string;
            approvalTenantId: string;
          };
        };
        if (key.tenantId_idempotencyKey) {
          return Promise.resolve(
            store.executions.find(
              (row) =>
                row.tenantId === key.tenantId_idempotencyKey!.tenantId &&
                row.idempotencyKey ===
                  key.tenantId_idempotencyKey!.idempotencyKey,
            ) ?? null,
          );
        }
        return Promise.resolve(
          store.executions.find(
            (row) =>
              row.approvalRequestId ===
              key.approvalRequestId_approvalTenantId!.approvalRequestId,
          ) ?? null,
        );
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const data = args.data;
        const clash = store.executions.some(
          (row) =>
            row.tenantId === data.tenantId &&
            row.idempotencyKey === data.idempotencyKey,
        );
        if (clash) {
          return Promise.reject(new FakeUniqueError());
        }
        const row = {
          id: nextId('execution'),
          encryptedResult: null,
          errorCode: null,
          completedAt: null,
          ...data,
        };
        store.executions.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(
        (args: { where: { id: string }; data: Record<string, unknown> }) => {
          const found = store.executions.find(
            (row) => row.id === args.where.id,
          );
          if (found) {
            Object.assign(found, args.data);
          }
          return Promise.resolve(found ?? {});
        },
      ),
    },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  } as unknown as PrismaService;

  const tenantContext = new TenantContextService();
  const encryption = {
    encrypt: jest.fn(
      (value: string) =>
        `encrypted:${Buffer.from(value, 'utf8').toString('base64url')}`,
    ),
    decrypt: jest.fn((value: string) =>
      Buffer.from(value.slice('encrypted:'.length), 'base64url').toString(
        'utf8',
      ),
    ),
  } as unknown as EncryptionService;
  const auditLog = {
    log: jest.fn((params: { action: string }) => {
      if (failingAuditAction && params.action === failingAuditAction) {
        return Promise.reject(new Error('audit log write failed'));
      }
      return Promise.resolve({ id: 'audit-a' });
    }),
  } as unknown as AuditLogService;
  const entitlements = {
    getEffectiveEntitlements: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      planId: 'max',
      features: { 'ai.owner': true, 'ai.admin': true, 'expenses.core': true },
      featureKeys: ['ai.owner', 'ai.admin', 'expenses.core'],
    }),
    assertFeature: jest.fn().mockResolvedValue(undefined),
  } as unknown as EntitlementsService;
  const tenantsService = {
    assertBranchBelongsToTenant: jest.fn().mockResolvedValue(undefined),
  } as unknown as TenantsService;
  const inFlightCreates = new Map<string, Promise<Record<string, unknown>>>();
  const canonicalCutover = {
    create: jest.fn(
      (
        tenantId: string,
        actorUserId: string,
        dto: {
          category: string;
          amountKopecks: number;
          currency?: string;
          occurredAt: string;
          branchId?: string;
          note?: string;
        },
        invocation: { sourceIntentRef: string },
      ) => {
        const key = `${tenantId}:${invocation.sourceIntentRef}`;
        const active = inFlightCreates.get(key);
        if (active) return active;
        const operation = (async () => {
          const existing = store.expenses.find(
            (row) =>
              row.tenantId === tenantId &&
              row.idempotencyKey === invocation.sourceIntentRef,
          );
          if (existing) {
            return {
              actionClass: 'create_expense',
              actionExecutionId: `execution:${key}`,
              expenseId: existing.id,
              invalidatedDeclarationIds: [],
              expenseCreates: 0,
              expenseDeletes: 0,
              declarationCreates: 0,
              unknownApplicable: false,
              providerWrites: 0,
            };
          }
          const row = await prisma.expense.create({
            data: {
              tenantId,
              branchId: dto.branchId ?? null,
              branchTenantId: dto.branchId ? tenantId : null,
              createdById: actorUserId,
              createdByTenantId: tenantId,
              category: dto.category,
              amountKopecks: dto.amountKopecks,
              currency: dto.currency ?? 'RUB',
              occurredAt: new Date(dto.occurredAt),
              encryptedNote: dto.note ? encryption.encrypt(dto.note) : null,
              source: 'manual',
              externalId: null,
              idempotencyKey: invocation.sourceIntentRef,
            },
          });
          try {
            await auditLog.log({ action: 'expense.created.canonical' });
          } catch (error) {
            const index = store.expenses.findIndex(
              (item) => item.id === row.id,
            );
            if (index >= 0) store.expenses.splice(index, 1);
            throw error;
          }
          return {
            actionClass: 'create_expense',
            actionExecutionId: `execution:${key}`,
            expenseId: row.id,
            invalidatedDeclarationIds: [],
            expenseCreates: 1,
            expenseDeletes: 0,
            declarationCreates: 0,
            unknownApplicable: false,
            providerWrites: 0,
          };
        })().finally(() => inFlightCreates.delete(key));
        inFlightCreates.set(key, operation);
        return operation;
      },
    ),
  } as unknown as P407ExpenseCanonicalCutoverService;

  const expensesService = new ExpensesService(
    prisma,
    tenantContext,
    tenantsService,
    encryption,
    auditLog,
    canonicalCutover,
  );
  const registry = new AiToolRegistryService();
  const handler = new AiToolHandlerService(
    {} as CrmService,
    {} as AppointmentsService,
    {} as LoyaltyService,
    {} as OperationsAnalyticsService,
    expensesService,
    prisma,
    // Арность конструктора соблюдена: недостающие зависимости раньше молча
    // становились `undefined`, и спека закрепляла обход как норму.
    {} as CustomersService,
    {} as StaffService,
    new BusinessStateService({} as OperationsAnalyticsService, prisma),
    // 🔴 Cycle 04 P6. Канонический читатель периода.
    new AppointmentPeriodReader({} as CrmService),
    new ClientRecencyFactsService({} as CrmService),
  );
  const runtime = new AiToolRuntimeService(
    prisma,
    tenantContext,
    registry,
    new AiToolPolicyService(tenantContext, entitlements, registry),
    handler,
    encryption,
    auditLog,
  );

  const run = <T>(operation: () => Promise<T>) =>
    tenantContext.runAsSystemTenant('tenant-a', operation);

  return {
    runtime,
    registry,
    expensesService,
    encryption,
    store,
    run,
    runAs: <T>(tenantId: string, operation: () => Promise<T>) =>
      tenantContext.runAsSystemTenant(tenantId, operation),
    failAuditAction: (action: string | null) => {
      failingAuditAction = action;
    },
    delayExpenseInsert: (ms: number) => {
      expenseInsertDelayMs = ms;
    },
    approve: (p: { approval: { id: string; payload_hash: string } }) =>
      run(() =>
        runtime.approve(owner, p.approval.id, {
          payloadHash: p.approval.payload_hash,
        }),
      ),
  };
}
