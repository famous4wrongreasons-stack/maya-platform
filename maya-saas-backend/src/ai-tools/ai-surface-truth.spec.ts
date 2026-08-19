/**
 * P5 §7 — ЭТАЛОНЫ ПОЛЬЗОВАТЕЛЬСКИХ ПОВЕРХНОСТЕЙ ДО И ПОСЛЕ.
 *
 * 🔴 Эталоны в `__fixtures__/legacy-ai-cards.json` сняты прогоном кода ДО
 * миграции на той же цепочке: журнал → аналитика → канон → инструмент →
 * карточка. Побайтовое совпадение здесь НЕ требуется и местами запрещено:
 * часть старых значений противоречит семантике, утверждённой в P0 и P2.
 *
 * Поэтому каждое изменение объявлено поимённо с причиной, а всё, что не
 * объявлено, обязано совпасть.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { UserRole } from '../common/domain.enums';
import { buildChatReportCard } from './chat-report-card';
import {
  businessEvidence,
  employeeEvidence,
  FINANCE,
  internalRow,
  visit,
  type StackOptions,
} from './p5-surface-stack.spec-helper.spec';

const GOLDEN = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'legacy-ai-cards.json'), 'utf8'),
) as Record<string, { card: { widget_data: Record<string, unknown> } | null }>;

type Case = {
  name: string;
  options: StackOptions;
  personal?: boolean;
  role?: UserRole;
  userText?: string;
};

const UPSELL_TEXT = 'Сколько я мог заработать? Дай потенциал и апселл';

const CASES: Case[] = [
  {
    name: '1. деньги недоступны: контур не ответил',
    options: { visits: [visit('a', 'crm-1', 2500)], finance: 'throw' },
  },
  {
    name: '2. деньги не разрешены роли',
    options: { visits: [visit('a', 'crm-1', 2500)], finance: FINANCE() },
    role: UserRole.MANAGER,
  },
  {
    name: '3. измеренный ноль: записей нет',
    options: { visits: [], finance: FINANCE() },
  },
  {
    name: '4. записанное есть, заработок мастеру неизвестен',
    options: { visits: [visit('a', 'crm-1', 2500)], finance: FINANCE() },
    personal: true,
  },
  {
    name: '4б. виджет допродаж: заработок неизвестен',
    options: {
      visits: [visit('a', 'crm-1', 2500)],
      finance: FINANCE({
        payroll: {
          status: 'unavailable',
          verified: false,
          accrued_total: null,
          paid_total: null,
          balance_total: null,
          staff: [],
        },
      }),
    },
    personal: true,
    userText: UPSELL_TEXT,
  },
  {
    name: '5. касса и записанное расходятся',
    options: {
      visits: [visit('a', 'crm-1', 2500), visit('b', 'crm-2', 3000)],
      finance: FINANCE(),
    },
  },
  {
    name: '6. неявка из канонического присутствия',
    options: {
      visits: [
        visit('a', 'crm-1', 2500),
        visit('b', 'crm-1', 1500, 'no_show', '2026-08-11T09:00:00.000Z', null),
      ],
      finance: FINANCE(),
      reconciled: true,
      attendanceGroups: [
        { attendance: 'arrived', _count: { _all: 1 } },
        { attendance: 'no_show', _count: { _all: 1 } },
      ],
    },
  },
  {
    name: '7. присутствие сверено не полностью',
    options: {
      visits: [visit('a', 'crm-1', 2500), visit('b', 'crm-1', 2500)],
      finance: FINANCE(),
      reconciled: true,
      attendanceGroups: [
        { attendance: 'arrived', _count: { _all: 1 } },
        { attendance: null, _count: { _all: 1 } },
      ],
    },
  },
  {
    name: '8. строка мастера с неизвестной метрикой',
    options: {
      visits: [visit('a', 'crm-1', 2500)],
      finance: FINANCE({
        revenue: {
          status: 'available',
          verified: true,
          total: { currency: 'RUB', amount_kopecks: 5_000_000 },
          transaction_count: 20,
          by_account: [],
          by_staff: [],
          by_service: [],
          staff_attribution_status: 'unavailable',
          staff_attribution_coverage_percent: null,
        },
      }),
    },
  },
  {
    name: '9. внутренний календарь: кассы нет как понятия',
    options: {
      source: 'internal',
      internalRows: [internalRow('a', 'prov-1', 250_000)],
      finance: 'throw',
    },
  },
  {
    name: '10. чтение журнала оборвано',
    options: {
      visits: [visit('a', 'crm-1', 2500)],
      completeness: 'truncated',
      finance: FINANCE(),
    },
  },
];

/** Объявленные изменения: поле → причина. Пустых причин не бывает. */
const ROWS_REASON =
  'подпись строки мастера: «0 финансовых операций» при непустой сумме была деньгами ниоткуда — теперь число операций либо названо, либо честно отсутствует';
const NOTE_REASON = 'личная карточка впервые несёт оговорку о полноте чтения';

const DECLARED: Record<string, Record<string, string>> = {
  '1. деньги недоступны: контур не ответил': {
    revenue_rub:
      'поле выручки больше не заполняется стоимостью записанного: канон сказал revenue_basis=unavailable',
    revenue_caption: 'подпись переписана под новое поведение поля',
  },
  '2. деньги не разрешены роли': {
    revenue_rub:
      'роль без права на кассу больше не получает число в поле выручки',
    revenue_caption: 'подпись переписана под новое поведение поля',
  },
  '4. записанное есть, заработок мастеру неизвестен': {
    source_complete: NOTE_REASON,
    status_text: NOTE_REASON,
    earned_unavailable_reason:
      'поле причины появилось всегда: `null` там, где начисление есть',
  },
  '4б. виджет допродаж: заработок неизвестен': {
    earned_rub:
      '🔴 стоимость записанного больше не публикуется под именем «заработано»',
    booked_rub: 'она же — рядом и своим именем, отдельным полем',
    earned_unavailable_reason:
      'причина отсутствия начисления названа кодом канона',
    source_complete: NOTE_REASON,
    status_text: NOTE_REASON,
  },
  '5. касса и записанное расходятся': { rows: ROWS_REASON },
  '6. неявка из канонического присутствия': { rows: ROWS_REASON },
  '7. присутствие сверено не полностью': { rows: ROWS_REASON },
  '9. внутренний календарь: кассы нет как понятия': {
    revenue_rub:
      'даже там, где деньги стоят на ценах журнала, поле выручки не заполняется записанным: у канона revenue_amount_kopecks пуст',
    revenue_caption: 'подпись переписана под новое поведение поля',
  },
  '10. чтение журнала оборвано': { rows: ROWS_REASON },
};

async function render(kase: Case) {
  const evidence = kase.personal
    ? await employeeEvidence(kase.options)
    : await businessEvidence(kase.options, kase.role);
  const toolName = kase.personal
    ? 'analytics.employee.query'
    : 'analytics.business.query';
  return {
    evidence: evidence as Record<string, unknown>,
    card: buildChatReportCard([{ name: toolName, result: evidence }], {
      personal: Boolean(kase.personal),
      userText: kase.userText ?? 'Покажи показатели',
    }) as { widget: string; widget_data: Record<string, unknown> } | null,
  };
}

describe('P5 §7 — карточки против эталонов до миграции', () => {
  for (const kase of CASES) {
    it(`«${kase.name}»: изменилось только объявленное`, async () => {
      const { card } = await render(kase);
      const before: Record<string, unknown> =
        GOLDEN[kase.name]?.card?.widget_data ?? {};
      const after: Record<string, unknown> = card?.widget_data ?? {};
      const declared = DECLARED[kase.name] ?? {};

      const changed: string[] = [];
      for (const key of new Set([
        ...Object.keys(before),
        ...Object.keys(after),
      ])) {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
          changed.push(key);
        }
      }

      for (const key of changed) {
        const reason: string | null = declared[key] ?? null;
        // Изменение без названной причины — это и есть тихий регресс.
        expect({ key, hasReason: reason !== null }).toEqual({
          key,
          hasReason: true,
        });
        expect((reason ?? '').length).toBeGreaterThan(15);
      }
      expect(changed.sort()).toEqual(Object.keys(declared).sort());
    });
  }
});

describe('P5 §2 — три доказанных дефекта закрыты', () => {
  it('🔴 A. стоимость записанного не выдаёт себя за заработок', async () => {
    const { card } = await render({
      name: 'A',
      options: {
        visits: [visit('a', 'crm-1', 2500)],
        finance: FINANCE({
          payroll: {
            status: 'unavailable',
            verified: false,
            accrued_total: null,
            paid_total: null,
            balance_total: null,
            staff: [],
          },
        }),
      },
      personal: true,
      userText: UPSELL_TEXT,
    });
    const data = card?.widget_data as Record<string, unknown>;

    expect(card?.widget).toBe('master_upsell');
    expect(data.earned_rub).toBeNull();
    expect(data.booked_rub).toBe(2500);
    expect(data.earned_unavailable_reason).toEqual(expect.any(String));
  });

  it('🔴 B. поле выручки не заполняется, когда кассы нет', async () => {
    const { card, evidence } = await render({
      name: 'B',
      options: { visits: [visit('a', 'crm-1', 2500)], finance: 'throw' },
    });
    const data = card?.widget_data as Record<string, unknown>;
    const metrics = evidence.metrics as Record<string, unknown>;

    expect(metrics.revenue_basis).toBe('unavailable');
    expect(data.revenue_rub).toBeNull();
    // Стоимость записанного при этом на месте и названа своим именем.
    expect(data.booked_value_rub).toBe(2500);
    expect(data.booked_value_caption).toBe('Стоимость записанного');
  });

  it('🔴 B-2. неизмеренное не печатается нулём операций и нулём процентов', async () => {
    const { card } = await render({
      name: 'B2',
      options: {
        visits: [visit('a', 'crm-1', 2500)],
        finance: FINANCE({
          revenue: {
            status: 'available',
            verified: true,
            total: { currency: 'RUB', amount_kopecks: 5_000_000 },
            transaction_count: 20,
            by_account: [],
            by_staff: [
              { staff_id: 'crm-1', currency: 'RUB', amount_kopecks: 3_000_000 },
            ],
            by_service: [],
            staff_attribution_status: 'partial',
            staff_attribution_coverage_percent: null,
          },
        }),
      },
    });
    const data = card?.widget_data as Record<string, unknown>;

    expect(JSON.stringify(data)).not.toContain('0% кассы');
    expect(JSON.stringify(data)).not.toContain('0 финансовых операций');
  });
});

describe('P5 §8 — одна семантика на всех поверхностях', () => {
  it('канон, инструмент и карточка называют один факт одинаково', async () => {
    const options: StackOptions = {
      visits: [visit('a', 'crm-1', 2500), visit('b', 'crm-2', 3000)],
      finance: FINANCE(),
      reconciled: true,
      attendanceGroups: [
        { attendance: 'arrived', _count: { _all: 1 } },
        { attendance: 'no_show', _count: { _all: 1 } },
      ],
    };
    const { evidence, card } = await render({ name: '§8', options });
    const metrics = evidence.metrics as Record<string, number | string | null>;
    const data = card?.widget_data as Record<string, unknown>;

    // Выручка: одно число и одно основание.
    expect(metrics.revenue_basis).toBe('provider_transactions');
    expect(data.revenue_rub).toBe(
      (metrics.revenue_amount_kopecks as number) / 100,
    );
    expect(data.revenue_basis).toBe(metrics.revenue_basis);

    // Стоимость записанного: другое число, другое основание, другое поле.
    expect(data.booked_value_rub).toBe(
      (metrics.booked_value_amount_kopecks as number) / 100,
    );
    expect(data.booked_value_basis).toBe('booked_prices');
    expect(data.revenue_rub).not.toBe(data.booked_value_rub);

    // Счётчики и присутствие — те же, что у канона.
    expect(data.appointments).toBe(metrics.appointments_total);
    expect(data.cancellations).toBe(metrics.appointments_cancelled);
    expect(metrics.attendance_no_show).toBe(1);
    expect(metrics.attended_appointments).toBe(1);
  });

  it('🔴 роль без права на деньги не получает их ни одним полем', async () => {
    const { evidence, card } = await render({
      name: '§8 роль',
      options: { visits: [visit('a', 'crm-1', 2500)], finance: FINANCE() },
      role: UserRole.BRANCH_MANAGER,
    });
    const metrics = evidence.metrics as Record<string, unknown>;
    const wire = JSON.stringify(card?.widget_data ?? {});

    expect(metrics.revenue_amount_kopecks).toBeNull();
    // 5 000 000 копеек = 50 000 ₽ — подтверждённая касса из фикстуры.
    expect(wire).not.toContain('50000');
    expect(
      (card?.widget_data as Record<string, unknown>).revenue_rub,
    ).toBeNull();
  });
});
