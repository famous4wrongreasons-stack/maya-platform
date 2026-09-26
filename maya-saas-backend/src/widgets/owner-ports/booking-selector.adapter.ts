import { Injectable } from '@nestjs/common';

import { AiToolRuntimeService } from '../../ai-tools/ai-tool-runtime.service';
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
    status: 'COMPLETE' as const,
    requestedScopeHash: scope,
    returnedCount,
    totalCount: returnedCount,
    hasMore: false,
    cursorRef: null,
    truncated: false,
    reasonCodes: [],
  },
});

@Injectable()
export class BookingSelectorAdapter implements BookingSelectorOwnerPort {
  constructor(private readonly runtime: AiToolRuntimeService) {}

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
    const name: 'catalog.staff.read' | 'booking.availability.read' =
      input.step === 'service'
        ? 'catalog.staff.read'
        : 'booking.availability.read';
    const args =
      input.step === 'service'
        ? {}
        : {
            date: new Date(
              input.routing.now.getTime() + 86_400_000,
            ).toISOString(),
            service_ids: [opened.get('service')],
            staff_id: opened.get('staff'),
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
    const returned = isRecord(source)
      ? input.step === 'service' && Array.isArray(source.staff)
        ? source.staff.length
        : input.step === 'staff' && Array.isArray(source.slots)
          ? source.slots.length
          : 0
      : 0;
    return {
      nextKind:
        input.step === 'service'
          ? ('STAFF_SELECTOR' as const)
          : ('TIME_SLOT_SELECTOR' as const),
      capabilityKey: name,
      source,
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
