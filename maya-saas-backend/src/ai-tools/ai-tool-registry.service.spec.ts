import { BadRequestException, NotFoundException } from '@nestjs/common';

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
      service.validateArguments('analytics.business.read', {
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
      service.validateArguments('analytics.business.read', {
        period: 'custom',
        from: '2025-01-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
    expect(
      service.validateArguments('analytics.business.read', {
        period: 'month_to_date',
      }),
    ).toEqual({ period: 'month_to_date' });
    expect(() =>
      service.validateArguments('analytics.business.read', {
        period: 'month_to_date',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-15T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });

  it('keeps year comparison arguments server-controlled', () => {
    expect(
      service.validateArguments('analytics.business.compare_years', {}),
    ).toEqual({});
    expect(() =>
      service.validateArguments('analytics.business.compare_years', {
        from: '2026-01-01T00:00:00.000Z',
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
