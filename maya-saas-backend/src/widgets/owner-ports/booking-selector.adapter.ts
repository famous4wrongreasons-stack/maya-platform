import { Injectable } from '@nestjs/common';

import { AiToolRuntimeService } from '../../ai-tools/ai-tool-runtime.service';
import { AvailabilityCalendarService } from '../../crm/availability-calendar.service';
import { openWidgetNounHandle } from '../emission/seal.service';
import type { BookingSelectorOwnerPort } from '../routing/effect-router.ports';
import { isBookingNounIdentity } from '../booking/booking-noun-identity';

const fact = (
  capability: string,
  scope: string,
  at: Date,
  returnedCount: number,
) => ({
  capability,
  status: 'measured' as const,
  as_of: at.toISOString(),
  evidence_refs: [],
  completeness: {
    status: 'PARTIAL' as const,
    requestedScopeHash: scope,
    returnedCount,
    totalCount: null,
    hasMore: true,
    cursorRef: null,
    truncated: false,
    reasonCodes: ['NOT_COLLECTED'],
  },
});

@Injectable()
export class BookingSelectorAdapter implements BookingSelectorOwnerPort {
  constructor(
    private readonly runtime: AiToolRuntimeService,
    private readonly availability: AvailabilityCalendarService,
  ) {}

  async advance(input: Parameters<BookingSelectorOwnerPort['advance']>[0]) {
    const opened = new Map<string, string>();
    for (const [noun, handle] of Object.entries(input.handles)) {
      const value = openWidgetNounHandle(handle as never);
      if (
        !value ||
        value.tenantId !== input.routing.tenantId ||
        (noun !== 'service' && noun !== 'staff') ||
        !isBookingNounIdentity(value, noun)
      )
        return null;
      opened.set(noun, value.ownerRef);
    }
    if (input.actor.tenantId !== input.routing.tenantId) return null;
    if (
      input.step === 'staff' &&
      (!opened.get('service') || !opened.get('staff'))
    )
      return null;
    const day =
      input.step === 'staff'
        ? await this.availability.nextAvailabilityDay(
            input.routing.tenantId,
            opened.get('staff')!,
            input.routing.now,
          )
        : null;
    const name: 'catalog.staff.read' | 'booking.availability.read' =
      input.step === 'service'
        ? 'catalog.staff.read'
        : 'booking.availability.read';
    const args =
      input.step === 'service'
        ? {}
        : {
            date: day!.date,
            service_ids: [opened.get('service')],
            staff_id: opened.get('staff'),
            ...(day!.branchId ? { branch_id: day!.branchId } : {}),
          };
    if (
      input.step === 'staff' &&
      (!opened.get('service') || !opened.get('staff'))
    )
      return null;
    const execution = await this.runtime.execute(
      input.actor,
      name,
      { arguments: args, surface: 'web' },
      { suppressWidgetTrigger: true },
    );
    if (
      !isRecord(execution) ||
      execution.status !== 'completed' ||
      !Object.prototype.hasOwnProperty.call(execution, 'result')
    )
      return null;
    const source = execution.result;
    // The runtime returns a list, not evidence that the list is exhaustive.
    // Unrecognised payloads must not masquerade as a measured empty list.
    const rows = isRecord(source)
      ? input.step === 'service'
        ? source.staff
        : source.slots
      : null;
    if (!Array.isArray(rows)) return null;
    const returned = rows.length;
    return {
      nextKind:
        input.step === 'service'
          ? ('STAFF_SELECTOR' as const)
          : ('TIME_SLOT_SELECTOR' as const),
      capabilityKey: name,
      source: day
        ? {
            ...(source as Record<string, unknown>),
            timezone: day.timezone,
            local_date: day.date,
          }
        : source,
      fact: fact(
        name,
        input.routing.record.requestedScopeHash,
        input.routing.now,
        returned,
      ),
      inheritedHandles: Object.freeze({ ...input.handles }),
    };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
