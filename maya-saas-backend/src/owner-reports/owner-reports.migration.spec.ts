/**
 * P4 §4 — ЭТАЛОНЫ СВОДОК ДО МИГРАЦИИ И ПОСЛЕ.
 *
 * 🔴 Эталоны в `__fixtures__/legacy-briefs.json` сняты прогоном СТАРОГО пути
 * (сырой обзор аналитики → композиторы) на тех же фикстурах, что собираются
 * здесь. Смысл сравнения не в побайтовом совпадении: часть старых фраз
 * противоречит уже утверждённой семантике P0/P2, и сохранять ложь ради
 * совпадения запрещено прямым указанием.
 *
 * Поэтому проверяется другое, более строгое:
 *   1. ЧИСЛА не изменились — кроме сценариев, где старое число было ошибкой,
 *      и каждый такой случай назван поимённо с причиной;
 *   2. каждое намеренное изменение текста подтверждено отдельным утверждением.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  composeDailyReport,
  composeMasterMorningBrief,
  composeMorningBrief,
} from './owner-reports.composers';
import { businessBriefFacts, masterBriefFacts } from './owner-reports.facts';
import {
  buildStack,
  FINANCE_FULL,
  internalRow,
  LOCAL_DATE,
  RANGE,
  TENANT,
  visit,
  type StackOptions,
} from './brief-stack.spec-helper.spec';

const GOLDEN = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'legacy-briefs.json'), 'utf8'),
) as Record<
  string,
  Record<'morning' | 'master' | 'evening', { title: string; bodyText: string }>
>;

type Case = StackOptions & {
  name: string;
  masterExternalId: string;
  financeAllowedForEvening?: boolean;
};

const CASES: Case[] = [
  {
    name: 'внешняя CRM: обычный день',
    visits: [
      visit('a', 'crm-1', 2500),
      visit('b', 'crm-1', 2500, 'confirmed'),
      visit('c', 'crm-2', 3000, 'canceled'),
      visit('d', 'crm-2', 1500, 'no_show', '2026-08-13T12:00:00.000Z', null),
    ],
    finance: FINANCE_FULL,
    masterExternalId: 'crm-1',
    reconciled: true,
    attendanceGroups: [
      { attendance: 'arrived', _count: { _all: 1 } },
      { attendance: 'no_show', _count: { _all: 1 } },
      { attendance: 'awaiting', _count: { _all: 1 } },
    ],
  },
  {
    name: 'внешняя CRM: чтение оборвано',
    visits: [visit('a', 'crm-1', 2500)],
    completeness: 'truncated',
    finance: FINANCE_FULL,
    masterExternalId: 'crm-1',
  },
  {
    name: 'внешняя CRM: пустой день',
    visits: [],
    finance: FINANCE_FULL,
    masterExternalId: 'crm-1',
  },
  {
    name: 'внешняя CRM: деньги недоступны',
    visits: [visit('a', 'crm-1', 2500)],
    finance: 'throw',
    masterExternalId: 'crm-1',
  },
  {
    name: 'внешняя CRM: касса пустая',
    visits: [visit('a', 'crm-1', 2500)],
    finance: {
      ...FINANCE_FULL,
      revenue: {
        status: 'available',
        verified: true,
        total: { currency: 'RUB', amount_kopecks: 0 },
        transaction_count: 0,
        by_account: [],
        by_staff: [],
        by_service: [],
      },
      payroll: {
        status: 'unavailable',
        verified: false,
        accrued_total: null,
        paid_total: null,
        balance_total: null,
        staff: [],
      },
    },
    masterExternalId: 'crm-1',
  },
  {
    name: 'внутренний календарь',
    source: 'internal',
    internalRows: [
      internalRow('a', 'prov-1', 250_000),
      internalRow('b', 'prov-1', 300_000),
    ],
    finance: 'throw',
    masterExternalId: 'prov-1',
  },
  {
    name: 'мастер не найден в срезе',
    visits: [visit('a', 'crm-1', 2500)],
    finance: FINANCE_FULL,
    masterExternalId: 'crm-НЕТ-ТАКОГО',
  },
  {
    name: 'запись вне окна провайдера',
    visits: [
      visit('a', 'crm-1', 2500),
      visit('out', 'crm-1', 999_900, 'completed', '2026-09-20T09:00:00.000Z'),
    ],
    finance: FINANCE_FULL,
    masterExternalId: 'crm-1',
  },
];

async function render(kase: Case) {
  const stack = buildStack(kase);
  const read = (financeAllowed: boolean) =>
    stack.tenantContext.runAsSystemTenant(TENANT.id, () =>
      stack.businessState.business({
        tenantId: TENANT.id,
        period: RANGE,
        comparisonMode: 'none',
        comparisonPeriod: null,
        financeAllowed,
        bookedValueAllowed: true,
        operationalDetail: false,
        retryOnFailure: false,
        disclose: (rows) => ({
          names: new Map(rows.map((row) => [row.externalId, row.name ?? ''])),
          allowedExternalIds: null,
        }),
      }),
    );

  const morningState = await read(false);
  const eveningState = await read(true);
  return {
    morning: composeMorningBrief({
      facts: businessBriefFacts(morningState, LOCAL_DATE),
    }),
    master: composeMasterMorningBrief({
      facts: masterBriefFacts(morningState, kase.masterExternalId, LOCAL_DATE),
    }),
    evening: composeDailyReport({
      facts: businessBriefFacts(eveningState, LOCAL_DATE),
    }),
  };
}

const numbersIn = (text: string): string[] =>
  (text.match(/\d[\d \s]*/g) ?? [])
    .map((value) => value.replace(/[ \s]/g, ''))
    .filter((value) => value.length > 0);

/**
 * Объявленные различия чисел: что исчезло, что появилось и ПОЧЕМУ.
 *
 * Пустых причин не бывает. Изменение числа в сводке владельца без названной
 * причины — это и есть тихий регресс, ради которого эталоны снимались с
 * боевого кода.
 */
type NumberDelta = { dropped: string[]; added: string[]; why: string };

const DECLARED: Record<
  string,
  Partial<Record<'morning' | 'master' | 'evening', NumberDelta>>
> = {
  'внешняя CRM: обычный день': {
    morning: {
      dropped: [],
      added: ['1'],
      why: 'присутствие уехало из статусной строки в каноническое наблюдение: провайдерский `no_show` — это статус записи, а не факт неявки',
    },
    master: {
      dropped: ['0'],
      added: [],
      why: 'личный бриф больше не печатает провайдерскую неявку как наблюдение присутствия: по мастеру зеркало главы 3 не сверяется',
    },
    evening: {
      dropped: [],
      added: ['1', '500'],
      why: 'присутствие каноническое, а неотнесённые провайдером счета теперь названы вслух — раньше эти деньги молча выпадали из «наличные + карта»',
    },
  },
  'внешняя CRM: чтение оборвано': {
    morning: {
      dropped: ['0'],
      added: [],
      why: 'присутствие уехало из статусной строки в каноническое наблюдение: провайдерский `no_show` — это статус записи, а не факт неявки',
    },
    master: {
      dropped: ['0'],
      added: [],
      why: 'личный бриф больше не печатает провайдерскую неявку как наблюдение присутствия: по мастеру зеркало главы 3 не сверяется',
    },
    evening: {
      dropped: ['0'],
      added: ['500'],
      why: 'присутствие каноническое, а неотнесённые провайдером счета теперь названы вслух — раньше эти деньги молча выпадали из «наличные + карта»',
    },
  },
  'внешняя CRM: пустой день': {
    morning: {
      dropped: ['0'],
      added: [],
      why: 'присутствие уехало из статусной строки в каноническое наблюдение: провайдерский `no_show` — это статус записи, а не факт неявки',
    },
    master: {
      dropped: ['0'],
      added: [],
      why: 'личный бриф больше не печатает провайдерскую неявку как наблюдение присутствия: по мастеру зеркало главы 3 не сверяется',
    },
    evening: {
      dropped: ['0'],
      added: ['500'],
      why: 'присутствие каноническое, а неотнесённые провайдером счета теперь названы вслух — раньше эти деньги молча выпадали из «наличные + карта»',
    },
  },
  'внешняя CRM: деньги недоступны': {
    morning: {
      dropped: ['0'],
      added: [],
      why: 'присутствие уехало из статусной строки в каноническое наблюдение: провайдерский `no_show` — это статус записи, а не факт неявки',
    },
    master: {
      dropped: ['0'],
      added: [],
      why: 'личный бриф больше не печатает провайдерскую неявку как наблюдение присутствия: по мастеру зеркало главы 3 не сверяется',
    },
    evening: {
      dropped: ['0'],
      added: [],
      why: 'присутствие каноническое, а неотнесённые провайдером счета теперь названы вслух — раньше эти деньги молча выпадали из «наличные + карта»',
    },
  },
  'внешняя CRM: касса пустая': {
    morning: {
      dropped: ['0'],
      added: [],
      why: 'присутствие уехало из статусной строки в каноническое наблюдение: провайдерский `no_show` — это статус записи, а не факт неявки',
    },
    master: {
      dropped: ['0'],
      added: [],
      why: 'личный бриф больше не печатает провайдерскую неявку как наблюдение присутствия: по мастеру зеркало главы 3 не сверяется',
    },
    evening: {
      dropped: ['0'],
      added: [],
      why: 'присутствие каноническое, а неотнесённые провайдером счета теперь названы вслух — раньше эти деньги молча выпадали из «наличные + карта»',
    },
  },
  'внутренний календарь': {
    morning: {
      dropped: ['0'],
      added: [],
      why: 'присутствие уехало из статусной строки в каноническое наблюдение: провайдерский `no_show` — это статус записи, а не факт неявки',
    },
    master: {
      dropped: ['0', '0', '0'],
      added: ['120', '2', '2'],
      why: '🔴 сопоставление по внешнему id: у собственного календаря `staff_id` пуст всегда, поэтому внутренний мастер получал бриф с нулями вместо своего дня',
    },
    evening: {
      dropped: ['0'],
      added: [],
      why: 'присутствие каноническое, а неотнесённые провайдером счета теперь названы вслух — раньше эти деньги молча выпадали из «наличные + карта»',
    },
  },
  'мастер не найден в срезе': {
    morning: {
      dropped: ['0'],
      added: [],
      why: 'присутствие уехало из статусной строки в каноническое наблюдение: провайдерский `no_show` — это статус записи, а не факт неявки',
    },
    master: {
      dropped: ['0'],
      added: [],
      why: 'личный бриф больше не печатает провайдерскую неявку как наблюдение присутствия: по мастеру зеркало главы 3 не сверяется',
    },
    evening: {
      dropped: ['0'],
      added: ['500'],
      why: 'присутствие каноническое, а неотнесённые провайдером счета теперь названы вслух — раньше эти деньги молча выпадали из «наличные + карта»',
    },
  },
  'запись вне окна провайдера': {
    morning: {
      dropped: ['0'],
      added: [],
      why: 'присутствие уехало из статусной строки в каноническое наблюдение: провайдерский `no_show` — это статус записи, а не факт неявки',
    },
    master: {
      dropped: ['0'],
      added: [],
      why: 'личный бриф больше не печатает провайдерскую неявку как наблюдение присутствия: по мастеру зеркало главы 3 не сверяется',
    },
    evening: {
      dropped: ['0'],
      added: ['500'],
      why: 'присутствие каноническое, а неотнесённые провайдером счета теперь названы вслух — раньше эти деньги молча выпадали из «наличные + карта»',
    },
  },
};

const multisetDiff = (left: string[], right: string[]): string[] => {
  const rest = [...right];
  const out: string[] = [];
  for (const value of left) {
    const at = rest.indexOf(value);
    if (at === -1) out.push(value);
    else rest.splice(at, 1);
  }
  return out.sort();
};

describe('P4 §4 — сводки после миграции против эталонов', () => {
  for (const kase of CASES) {
    it(`«${kase.name}»: заголовки сохранены, числа не поехали молча`, async () => {
      const actual = await render(kase);
      const golden = GOLDEN[kase.name];
      expect(golden).toBeDefined();

      for (const kind of ['morning', 'master', 'evening'] as const) {
        // Заголовок — часть контракта карточки: он не менялся.
        expect(actual[kind].title).toBe(golden[kind].title);

        const before = numbersIn(golden[kind].bodyText);
        const after = numbersIn(actual[kind].bodyText);
        const declared = DECLARED[kase.name]?.[kind];
        const delta = {
          dropped: multisetDiff(before, after),
          added: multisetDiff(after, before),
        };
        if (declared) {
          expect(declared.why.length).toBeGreaterThan(15);
        }
        expect({ kind, ...delta }).toEqual({
          kind,
          dropped: declared?.dropped ?? [],
          added: declared?.added ?? [],
        });
      }
    });
  }

  it('🔴 средний чек по ценам журнала больше не называется чеком', async () => {
    const actual = await render(CASES[0]);

    expect(GOLDEN['внешняя CRM: обычный день'].morning.bodyText).toContain(
      'средний чек',
    );
    expect(actual.morning.bodyText).not.toContain('средний чек');
    expect(actual.morning.bodyText).toContain('средняя стоимость записи');
  });

  it('🔴 «пустая ИЛИ недоступна» разделено на два разных утверждения', async () => {
    const unavailable = await render(CASES[3]);
    const measuredZero = await render(CASES[4]);

    // В эталоне оба случая печатались одной фразой.
    expect(GOLDEN['внешняя CRM: деньги недоступны'].evening.bodyText).toContain(
      'пока пустая или недоступна',
    );
    expect(unavailable.evening.bodyText).toContain('недоступна');
    expect(unavailable.evening.bodyText).not.toContain('пустая');
    expect(measuredZero.evening.bodyText).toContain('пустая');
    expect(measuredZero.evening.bodyText).not.toContain('недоступна');
  });

  it('🔴 мастер внутреннего календаря получает свой день, а не нули', async () => {
    const actual = await render(CASES[5]);

    // До миграции: `staff_id` у собственного календаря пуст, сопоставление не
    // срабатывало никогда, и мастеру уезжало «Записей: 0».
    expect(GOLDEN['внутренний календарь'].master.bodyText).toContain(
      'Записей: 0',
    );
    expect(actual.master.bodyText).toContain('Записей: 2');
    expect(actual.master.bodyText).toContain('Мастер Внутренний');
  });

  it('🔴 присутствие в вечернем отчёте — из зеркала, а не из статуса', async () => {
    const actual = await render(CASES[0]);

    // Статусная «неявка» была в эталоне; каноническое присутствие — своё.
    expect(GOLDEN['внешняя CRM: обычный день'].evening.bodyText).toContain(
      'неявок 1',
    );
    expect(actual.evening.bodyText).toContain(
      'Присутствие: пришли 1, неявок 1',
    );
    expect(actual.evening.bodyText).not.toMatch(/Статусы:[^\n]*неявок/);
  });

  it('🔴 присутствие не сверено — отчёт молчит о неявках вместо нуля', async () => {
    const actual = await render(CASES[4]);

    expect(actual.evening.bodyText).toContain('не сверено');
    expect(actual.evening.bodyText).not.toMatch(/неявок \d/);
  });
});
