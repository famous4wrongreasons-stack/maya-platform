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
    });
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
      profit_status: 'available',
    });
  });

  it('builds a read-only client return card from trusted server evidence', () => {
    const card = buildChatReportCard(
      [
        {
          name: 'clients.return_candidates.read',
          result: {
            total_count: 1,
            shown_count: 1,
            requires_confirmation: true,
            communication_started: false,
            filter: {
              type: 'inactive_period',
              threshold_days: 90,
              lookback_days: 365,
            },
            candidates: [
              {
                display_name: 'Иван Петров',
                phone_masked: '••• •••-4567',
                reason_code: 'inactive_period',
                reason: 'Не был(а) 131 дн. (порог 90 дн.)',
                last_completed_visit: '2026-04-01T10:00:00.000Z',
                last_event_at: '2026-04-01T10:00:00.000Z',
                average_cycle_days: 31,
                days_overdue: 41,
              },
            ],
          },
        },
      ],
      { personal: false, userText: 'Кто не был больше трёх месяцев?' },
    );

    expect(card).toEqual({
      widget: 'client_return_candidates',
      widget_data: {
        title: 'Клиенты для возврата',
        total_count: 1,
        shown_count: 1,
        requires_confirmation: true,
        communication_started: false,
        filter: {
          type: 'inactive_period',
          threshold_days: 90,
          lookback_days: 365,
        },
        candidates: [
          {
            display_name: 'Иван Петров',
            phone_masked: '••• •••-4567',
            reason_code: 'inactive_period',
            reason: 'Не был(а) 131 дн. (порог 90 дн.)',
            last_completed_visit: '2026-04-01T10:00:00.000Z',
            last_event_at: '2026-04-01T10:00:00.000Z',
            average_cycle_days: 31,
            days_overdue: 41,
          },
        ],
      },
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
