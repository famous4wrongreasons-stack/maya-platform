import { buildChatReportCard } from './chat-report-card';

describe('buildChatReportCard', () => {
  it('builds business_report from analytics.business.query', () => {
    const card = buildChatReportCard(
      [
        {
          name: 'analytics.business.query',
          result: {
            verified: true,
            period: { label_ru: '7 августа' },
            metrics: {
              revenue_amount_kopecks: 4_150_000,
              appointments_total: 19,
              unique_clients: 17,
              clients_new: 4,
              clients_returning: 13,
              average_ticket_amount_kopecks: 218_400,
              appointments_cancelled: 1,
            },
            current: {
              finance: {
                revenue: {
                  staff_attribution_status: 'partial',
                  staff_attribution_coverage_percent: 80,
                },
              },
              staff_summary: [
                {
                  name: 'Стас',
                  confirmed_revenue: {
                    status: 'available',
                    amount: { amount_kopecks: 2_000_000 },
                    transaction_count: 9,
                  },
                },
                {
                  name: 'Илья',
                  confirmed_revenue: { status: 'unavailable', amount: null },
                },
              ],
            },
          },
        },
      ],
      { personal: false, userText: 'сколько выручки за 7 августа' },
    );
    expect(card?.widget).toBe('business_report');
    expect(card?.widget_data).toMatchObject({
      period_label: '7 августа',
      revenue_rub: 41500,
      appointments: 19,
      unique_clients: 17,
      average_ticket_rub: 2184,
      rows_title: 'Касса по мастерам',
      rows: [
        expect.objectContaining({ label: 'Стас', value_rub: 20000 }),
        expect.objectContaining({ label: 'Илья', value_rub: null }),
      ],
    });
    expect(String(card?.widget_data.status_text)).toContain('80%');
  });

  it('builds master_earn for employee stats without upsell intent', () => {
    const card = buildChatReportCard(
      [
        {
          name: 'analytics.employee.query',
          result: {
            period: { label_ru: 'сегодня' },
            metrics: {
              booked_value_amount_kopecks: 2_000_000,
              appointments_total: 8,
              unique_clients: 7,
            },
            money_motivation: {
              potential_rub: 14000,
              upside_rub: 4000,
              target_check_rub: 2800,
              footnote: 'Потенциал из истории чеков.',
            },
            current: {
              staff_summary: [
                {
                  salary: {
                    status: 'available',
                    accrued: { amount_kopecks: 1_000_000 },
                  },
                },
              ],
            },
          },
        },
      ],
      { personal: true, userText: 'моя статистика за сегодня' },
    );
    expect(card?.widget).toBe('master_earn');
    expect(card?.widget_data).toMatchObject({
      earned_rub: 10000,
      booked_rub: 20000,
      potential_rub: 14000,
      upside_rub: 4000,
      appointments: 8,
    });
    expect(String(card?.widget_data.footnote)).not.toContain('+18%');
  });

  it('builds master_upsell when master asks about potential / допродажи', () => {
    const card = buildChatReportCard(
      [
        {
          name: 'analytics.employee.query',
          result: {
            period: { label_ru: 'сегодня' },
            metrics: { booked_value_amount_kopecks: 1_000_000 },
            money_motivation: {
              potential_rub: 8000,
              upside_rub: 3000,
              target_check_rub: 2500,
            },
            upsell_opportunities: [
              {
                tip: 'Раньше гость брал «Уход за бородой» (1500 ₽). Если снова возьмёт — +750 ₽ тебе.',
              },
            ],
            current: {
              service_summary: [{ name: 'Уход за бородой', delta: -2 }],
              staff_summary: [
                {
                  salary: {
                    status: 'available',
                    accrued: { amount_kopecks: 500_000 },
                  },
                },
              ],
            },
          },
        },
      ],
      { personal: true, userText: 'сколько я мог заработать с апселлом' },
    );
    expect(card?.widget).toBe('master_upsell');
    expect(card?.widget_data.tips).toEqual(
      expect.arrayContaining([expect.stringContaining('Уход за бородой')]),
    );
    expect(card?.widget_data.potential_rub).toBe(8000);
  });

  it('builds profit card from analytics.business.profit', () => {
    const card = buildChatReportCard(
      [
        {
          name: 'analytics.business.profit',
          result: {
            period: { label_ru: 'август' },
            confirmed_revenue: { total: { amount_kopecks: 10_000_000 } },
            expenses: {
              totals: [{ currency: 'RUB', amount_kopecks: 6_500_000 }],
              by_category: [
                {
                  category: 'payroll',
                  label: 'Зарплата',
                  source: 'crm_payroll',
                  currency: 'RUB',
                  amount_kopecks: 6_000_000,
                },
                {
                  category: 'supplies',
                  label: 'Расходники',
                  source: 'owner_manual',
                  currency: 'RUB',
                  amount_kopecks: 500_000,
                },
              ],
            },
            completeness: { owner_confirmation_required: false },
            net_profit: {
              status: 'available',
              total: { amount_kopecks: 3_500_000 },
            },
          },
        },
      ],
      { personal: false, userText: 'какая прибыль за август' },
    );
    expect(card?.widget).toBe('business_report');
    expect(card?.widget_data).toMatchObject({
      title: 'Прибыль',
      revenue_rub: 100000,
      net_profit_rub: 35000,
      payroll_rub: 60000,
      additional_expenses_rub: 5000,
      total_expenses_rub: 65000,
      profit_status: 'available',
      rows: [
        expect.objectContaining({ label: 'Зарплата', value_rub: 60000 }),
        expect.objectContaining({ label: 'Расходники', value_rub: 5000 }),
      ],
    });
    expect(String(card?.widget_data.status_text)).toContain('подтверждены');
  });

  it('shows provisional profit when unrecorded additional expenses are zero', () => {
    const card = buildChatReportCard(
      [
        {
          name: 'analytics.business.profit',
          result: {
            period: { label_ru: 'август' },
            confirmed_revenue: { total: { amount_kopecks: 10_000_000 } },
            expenses: {
              totals: [{ currency: 'RUB', amount_kopecks: 6_000_000 }],
              by_category: [
                {
                  category: 'payroll',
                  label: 'Зарплата',
                  source: 'crm_payroll',
                  currency: 'RUB',
                  amount_kopecks: 6_000_000,
                },
              ],
            },
            completeness: {
              owner_confirmation_required: false,
              unrecorded_additional_expenses_assumed_zero: true,
            },
            net_profit: {
              status: 'available',
              total: { amount_kopecks: 4_000_000 },
              unavailable_reason: null,
            },
          },
        },
      ],
      { personal: false, userText: 'какая чистая прибыль' },
    );

    expect(card?.widget_data).toMatchObject({
      revenue_rub: 100000,
      net_profit_rub: 40000,
      payroll_rub: 60000,
      additional_expenses_rub: 0,
      insight: null,
    });
    expect(String(card?.widget_data.status_text)).toContain('учтены как 0 ₽');
    expect(String(card?.widget_data.status_text)).toContain('пересчитается');
  });

  it('builds the recalculated profit card after a no-expenses declaration', () => {
    const card = buildChatReportCard(
      [
        {
          name: 'expenses.period.complete',
          result: {
            period: { label_ru: 'август' },
            confirmed_revenue: { total: { amount_kopecks: 10_000_000 } },
            expenses: {
              totals: [{ currency: 'RUB', amount_kopecks: 6_000_000 }],
              by_category: [],
            },
            completeness: { owner_confirmation_required: false },
            net_profit: {
              status: 'available',
              total: { amount_kopecks: 4_000_000 },
            },
          },
        },
      ],
      { personal: false, userText: 'дополнительных расходов нет' },
    );

    expect(card?.widget_data).toMatchObject({
      title: 'Прибыль',
      revenue_rub: 100000,
      net_profit_rub: 40000,
      profit_status: 'available',
    });
  });

  it('builds an expense breakdown card', () => {
    const card = buildChatReportCard(
      [
        {
          name: 'expenses.read',
          result: {
            resolved_period: { label_ru: 'август' },
            totals: [{ currency: 'RUB', amount_kopecks: 3_500_000 }],
            by_category: [
              {
                category: 'supplies',
                label: 'Расходники',
                currency: 'RUB',
                amount_kopecks: 3_000_000,
                expense_count: 2,
              },
              {
                category: 'utilities',
                label: 'Коммунальные услуги',
                currency: 'RUB',
                amount_kopecks: 500_000,
                expense_count: 1,
              },
            ],
          },
        },
      ],
      { personal: false, userText: 'на что больше всего тратим' },
    );

    expect(card?.widget).toBe('business_report');
    expect(card?.widget_data).toMatchObject({
      title: 'Расходы',
      period_label: 'август',
      primary_rub: 35000,
      primary_label: 'Всего расходов',
      secondary_value: 2,
      secondary_label: 'Статей',
      rows: [
        expect.objectContaining({ label: 'Расходники', value_rub: 30000 }),
        expect.objectContaining({
          label: 'Коммунальные услуги',
          value_rub: 5000,
        }),
      ],
    });
  });

  it('returns null without analytics evidence', () => {
    expect(
      buildChatReportCard([{ name: 'booking.search', result: { slots: [] } }], {
        personal: false,
        userText: 'есть окна?',
      }),
    ).toBeNull();
  });
});

describe('🔴 Cycle 04 P0 — карточка не выдаёт нижнюю границу за итог', () => {
  const toolResult = (status: 'complete' | 'incomplete') => ({
    verified: true,
    current: {
      data_source: 'crm',
      completeness: {
        appointments: { status, reason: 'source_read_truncated' },
      },
      finance: { revenue: {} },
      staff_summary: [],
    },
    metrics: {
      appointments_total: 1,
      appointments_cancelled: 0,
      unique_clients: 1,
      booked_value_amount_kopecks: 250_000,
    },
    limitations: status === 'incomplete' ? [{ key: 'incomplete_read' }] : [],
  });

  const build = (status: 'complete' | 'incomplete') =>
    buildChatReportCard(
      [{ name: 'analytics.business.query', result: toolResult(status) }],
      { personal: false, userText: 'сколько отмен' },
    );

  it('🔴 усечённое чтение видно в карточке, а не только в тексте ответа', () => {
    const card = build('incomplete');

    expect(card?.widget_data.source_complete).toBe(false);
    expect(card?.widget_data.status_text).toMatch(/не целиком/);
  });

  it('полное чтение карточку не засоряет', () => {
    const card = build('complete');

    expect(card?.widget_data.source_complete).toBe(true);
    expect(card?.widget_data.status_text).toBeNull();
  });
});

describe('🔴 Cycle 04 P2.1 — стоимость записанного названа своим именем', () => {
  const toolResult = (over: {
    revenue?: number | null;
    booked?: number | null;
  }) => ({
    verified: true,
    current: {
      data_source: 'crm',
      completeness: { appointments: { status: 'complete', reason: null } },
      finance: { revenue: {} },
      staff_summary: [],
    },
    metrics: {
      appointments_total: 10,
      unique_clients: 8,
      revenue_amount_kopecks: over.revenue ?? null,
      booked_value_amount_kopecks: over.booked ?? null,
      booked_value_basis: over.booked == null ? 'unavailable' : 'booked_prices',
      revenue_basis:
        over.revenue == null ? 'unavailable' : 'provider_transactions',
    },
    limitations: [],
  });

  const card = (over: { revenue?: number | null; booked?: number | null }) =>
    buildChatReportCard(
      [{ name: 'analytics.business.query', result: toolResult(over) }],
      { personal: false, userText: 'сколько выручки' },
    );

  it('🔴 подпись говорит «стоимость записанного», а не «выручка»', () => {
    const built = card({ revenue: 6_010_500_0, booked: 6_125_000_0 });

    expect(built?.widget_data.booked_value_caption).toBe(
      'Стоимость записанного',
    );
    expect(built?.widget_data.booked_value_basis).toBe('booked_prices');
    // Ни одно из запрещённых слов рядом с этой величиной.
    const caption = String(built?.widget_data.booked_value_caption);
    expect(caption).not.toMatch(/выручк|касс|получен|заработа|подтверждённ/i);
  });

  it('🔴 два факта показаны раздельно и не подменяют друг друга', () => {
    const built = card({ revenue: 60_105_000, booked: 61_250_000 });

    expect(built?.widget_data.revenue_rub).toBe(601_050);
    expect(built?.widget_data.booked_value_rub).toBe(612_500);
    expect(built?.widget_data.revenue_basis).toBe('provider_transactions');
  });

  it('кассы нет — записанное остаётся под своим именем', () => {
    const built = card({ revenue: null, booked: 61_250_000 });

    expect(built?.widget_data.booked_value_rub).toBe(612_500);
    expect(built?.widget_data.booked_value_caption).toBe(
      'Стоимость записанного',
    );
  });
});
