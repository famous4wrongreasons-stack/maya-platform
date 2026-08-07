import { BadRequestException, NotFoundException } from '@nestjs/common';

import { UserRole } from '../common/domain.enums';
import { staffScheduleRevision } from '../crm/staff-schedule.utils';
import { AiToolRegistryService } from './ai-tool-registry.service';

describe('AiToolRegistryService', () => {
  const service = new AiToolRegistryService();

  it('fails closed for unknown tools and unknown arguments', () => {
    expect(() => service.get('database.query')).toThrow(NotFoundException);
    expect(() =>
      service.validateArguments('catalog.services.read', { tenant_id: 'x' }),
    ).toThrow(BadRequestException);
  });

  it('normalizes bounded analytics ranges', () => {
    expect(
      service.validateArguments('analytics.business.profit', {
        period: 'custom',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
        branch_id: 'branch_12345678',
      }),
    ).toEqual({
      period: 'custom',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-15T00:00:00.000Z',
      branch_id: 'branch_12345678',
    });
    expect(() =>
      service.validateArguments('analytics.business.profit', {
        period: 'custom',
        from: '2025-01-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
    expect(
      service.validateArguments('analytics.business.profit', {
        period: 'month_to_date',
      }),
    ).toEqual({ period: 'month_to_date' });
    expect(() =>
      service.validateArguments('analytics.business.profit', {
        period: 'month_to_date',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });

  it('validates universal business and employee analytics comparisons', () => {
    expect(
      service.validateArguments('analytics.business.query', {
        period: 'year_to_date',
        comparison: 'previous_year_same_period',
      }),
    ).toEqual({
      period: 'year_to_date',
      comparison: 'previous_year_same_period',
    });
    expect(
      service.validateArguments('analytics.employee.query', {
        period: 'month_to_date',
        comparison: 'previous_period',
      }),
    ).toEqual({
      period: 'month_to_date',
      comparison: 'previous_period',
    });
    expect(() =>
      service.validateArguments('analytics.business.query', {
        period: 'month_to_date',
        comparison: 'invented_period',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects PII and invalid amounts in loyalty reasons', () => {
    expect(() =>
      service.validateArguments('loyalty.internal.adjust', {
        target_user_id: 'customer_12345678',
        delta: 100,
        reason: 'Позвонить +7 918 000-00-00',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateArguments('loyalty.internal.adjust', {
        target_user_id: 'customer_12345678',
        delta: 0,
        reason: 'Корректировка',
      }),
    ).toThrow(BadRequestException);
  });

  it('takes an expense amount in rubles and refuses anything that is not money', () => {
    expect(
      service.validateArguments('expenses.create', {
        category: 'rent',
        amount_rubles: 60_000,
        occurred_on: '2026-08-07',
        note: 'Аренда за август',
      }),
    ).toEqual({
      category: 'rent',
      amount_rubles: 60_000,
      occurred_on: '2026-08-07',
      note: 'Аренда за август',
    });
    // Дата необязательна: «сегодня» разрешает сервер в часовом поясе салона.
    expect(
      service.validateArguments('expenses.create', {
        category: 'supplies',
        amount_rubles: 1_234.56,
      }),
    ).toEqual({ category: 'supplies', amount_rubles: 1_234.56 });
    expect(() =>
      service.validateArguments('expenses.create', {
        category: 'rent',
        amount_rubles: 0,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateArguments('expenses.create', {
        category: 'rent',
        amount_rubles: '60000',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateArguments('expenses.create', {
        category: 'rent',
        amount_rubles: 60_000,
        amount_kopecks: 6_000_000,
      }),
    ).toThrow(BadRequestException);
  });

  it('refuses an invented expense category and payroll by hand', () => {
    expect(() =>
      service.validateArguments('expenses.create', {
        category: 'arenda-avgust',
        amount_rubles: 60_000,
      }),
    ).toThrow(BadRequestException);

    let payrollDetail = '';
    try {
      service.validateArguments('expenses.create', {
        category: 'payroll',
        amount_rubles: 60_000,
      });
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        error: { code: string; detail: string };
      };
      payrollDetail = response.error.detail;
      expect(response.error.code).toBe('ai_tool_arguments_invalid');
    }
    expect(payrollDetail).toContain('payroll');
    expect(payrollDetail).toContain('twice');
  });

  it('re-validates stored expense arguments to the same payload', () => {
    // Аргументы подтверждения проходят валидатор второй раз при исполнении:
    // если бы валидатор что-то дописывал, хеш карточки перестал бы сходиться.
    const once = service.validateArguments('expenses.create', {
      category: 'marketing',
      amount_rubles: 15_000,
      note: '  таргет  ',
    });
    expect(service.validateArguments('expenses.create', once)).toEqual(once);
  });

  it('requires a human confirmation for a money-writing expense tool', () => {
    const definition = service.get('expenses.create');
    expect(definition.riskTier).toBe('high_write');
    expect(definition.approvalPolicy).toBe('owner');
    expect(definition.idempotency).toBe('required');
    expect(definition.requiredFeatures).toEqual(['expenses.core']);
    expect(definition.allowedRoles).toEqual([
      UserRole.TENANT_OWNER,
      UserRole.BUSINESS_OWNER,
      UserRole.TENANT_ADMIN,
      UserRole.ADMINISTRATOR,
      UserRole.ACCOUNTANT,
    ]);
    const properties = definition.inputSchema.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(properties.category.enum).toContain('rent');
    expect(properties.category.enum).not.toContain('payroll');
  });

  it('shows the human rubles and the server kopecks on the expense card', () => {
    expect(
      service.buildApprovalPreview('expenses.create', {
        category: 'rent',
        amount_rubles: 60_000,
        occurred_on: '2026-08-05',
        note: 'Аренда за август',
      }),
    ).toEqual({
      // Русского словаря для этого инструмента у отдельно деплоящегося фронта
      // нет, поэтому подтверждаемое действие читается целиком из summary.
      summary: 'Записать расход: Аренда — 60 000 ₽ за 05.08.2026.',
      payload: {
        sum: '60 000 ₽',
        date: '05.08.2026',
        type: 'Аренда',
        action: 'create_expense',
        comment: 'Аренда за август',
        category: 'rent',
        currency: 'RUB',
        amount_rubles: 60_000,
        category_kind: 'fixed',
        amount_kopecks: 6_000_000,
      },
    });
  });

  it('puts the amount, the date and the category first even after a jsonb round trip', () => {
    const { payload } = service.buildApprovalPreview('expenses.create', {
      category: 'rent',
      amount_rubles: 60_000,
      occurred_on: '2026-08-05',
      note: 'Аренда за август',
    });
    // Точный код карточки из app.html.
    const visible = (preview: Record<string, unknown>) =>
      Object.keys(preview)
        .filter((key) => key !== 'action')
        .slice(0, 6);
    // 🔴 Хранится превью в jsonb, а он сортирует ключи по длине и байтам, а не
    // по порядку вставки. Поэтому проверяем ОБА порядка: как отдали и как
    // вернёт Postgres. В обоих сумма, дата и статья обязаны быть первыми.
    const afterJsonb = Object.fromEntries(
      Object.entries(payload).sort(
        ([left], [right]) =>
          left.length - right.length || (left < right ? -1 : 1),
      ),
    );
    expect(visible(payload)).toEqual(visible(afterJsonb));
    expect(visible(payload).slice(0, 3)).toEqual(['sum', 'date', 'type']);
  });

  it('builds an immutable, explicit approval preview', () => {
    expect(
      service.buildApprovalPreview('appointments.own.cancel', {
        appointment_id: 'appointment_12345678',
      }),
    ).toEqual({
      summary: 'Cancel the selected appointment.',
      payload: {
        action: 'cancel_appointment',
        appointment_id: 'appointment_12345678',
      },
    });
  });

  it('normalizes booking arguments while accepting provider-native IDs', () => {
    expect(
      service.validateArguments('appointments.own.create', {
        staff_id: '7',
        service_ids: ['15', 'svc-beard'],
        start: '2026-07-20T10:00:00+03:00',
        branch_id: '1',
      }),
    ).toEqual({
      staff_id: '7',
      service_ids: ['15', 'svc-beard'],
      start: '2026-07-20T07:00:00.000Z',
      branch_id: '1',
    });
    expect(() =>
      service.validateArguments('appointments.own.create', {
        staff_id: '7',
        service_ids: ['15', '15'],
        start: '2026-07-20T10:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });

  it('keeps a booking availability day stable across timezone offsets', () => {
    expect(
      service.validateArguments('booking.availability.read', {
        date: '2026-07-31T00:00:00+03:00',
      }),
    ).toEqual({
      date: '2026-07-31T00:00:00.000Z',
    });
  });

  it('creates a PII-free booking approval payload', () => {
    expect(
      service.buildApprovalPreview('appointments.own.create', {
        staff_id: 'staff-1',
        service_ids: ['service-1'],
        start: '2026-07-20T10:00:00.000Z',
      }),
    ).toEqual({
      summary: 'Create the selected appointment.',
      payload: {
        action: 'create_appointment',
        staff_id: 'staff-1',
        service_ids: ['service-1'],
        start: '2026-07-20T10:00:00.000Z',
        branch_id: null,
      },
    });
  });

  it('validates an immutable staff schedule preview', () => {
    const currentSlots = [{ from: '10:00', to: '20:00' }];
    const currentRevision = staffScheduleRevision(
      '1461615',
      '2026-08-06',
      currentSlots,
    );
    const args = service.validateArguments('staff.schedule.update', {
      staff_id: '1461615',
      date: '2026-08-06',
      operation: 'set_break',
      current_revision: currentRevision,
      current_slots: currentSlots,
      slots: [
        { from: '10:00', to: '14:00' },
        { from: '15:00', to: '20:00' },
      ],
    });

    expect(args).toEqual({
      staff_id: '1461615',
      date: '2026-08-06',
      operation: 'set_break',
      current_revision: currentRevision,
      current_slots: currentSlots,
      slots: [
        { from: '10:00', to: '14:00' },
        { from: '15:00', to: '20:00' },
      ],
    });
    expect(service.buildApprovalPreview('staff.schedule.update', args)).toEqual(
      {
        summary:
          'Change one staff workday. Existing appointments will be preserved.',
        payload: {
          action: 'update_staff_schedule',
          date: '2026-08-06',
          operation: 'set_break',
          current_slots: currentSlots,
          proposed_slots: [
            { from: '10:00', to: '14:00' },
            { from: '15:00', to: '20:00' },
          ],
          existing_appointments_preserved: true,
        },
      },
    );
  });

  it('rejects a schedule preview whose revision does not match', () => {
    expect(() =>
      service.validateArguments('staff.schedule.update', {
        staff_id: '1461615',
        date: '2026-08-06',
        operation: 'close_day',
        current_revision: '0'.repeat(64),
        current_slots: [{ from: '10:00', to: '20:00' }],
        slots: [],
      }),
    ).toThrow(BadRequestException);
  });
});
