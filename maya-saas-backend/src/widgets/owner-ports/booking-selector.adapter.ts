import {
  BookingCatalogSourceChangedError,
  isBookingSourceUnavailable,
} from '../../ai-tools/booking-catalog-binding';
import { Injectable } from '@nestjs/common';

import { AiToolRuntimeService } from '../../ai-tools/ai-tool-runtime.service';
import { AvailabilityCalendarService } from '../../crm/availability-calendar.service';
import { openWidgetNounHandle } from '../emission/seal.service';
import type { BookingSelectorOwnerPort } from '../routing/effect-router.ports';
import {
  isBookingNounIdentity,
  decodeBookingCatalogOwnerRef,
  sameBookingScope,
  type BookingSlotScope,
} from '../booking/booking-noun-identity';

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

  /** Presentation source qualification only; CRM retains tenant and calendar authority. */
  async readCalendarSource(
    tenantId: string,
  ): Promise<'internal' | 'external' | null> {
    return this.availability.getCalendarSource(tenantId);
  }

  async advance(input: Parameters<BookingSelectorOwnerPort['advance']>[0]) {
    try {
      return await this.advanceCurrent(input);
    } catch (error) {
      if (isBookingSourceUnavailable(error)) return null;
      throw error;
    }
  }

  private async advanceCurrent(
    input: Parameters<BookingSelectorOwnerPort['advance']>[0],
  ) {
    const opened = new Map<string, string>();
    let scope: BookingSlotScope | null | undefined;
    for (const [noun, handle] of Object.entries(input.handles)) {
      const value = openWidgetNounHandle(handle as never);
      if (
        !value ||
        value.tenantId !== input.routing.tenantId ||
        (noun !== 'service' && noun !== 'staff') ||
        !isBookingNounIdentity(value, noun)
      )
        return null;
      const decoded = decodeBookingCatalogOwnerRef(value.ownerRef);
      if (
        !decoded ||
        (scope !== undefined && !sameBookingScope(scope, decoded.scope))
      )
        return null;
      scope = decoded.scope;
      opened.set(noun, decoded.id);
    }
    if (
      input.actor.tenantId !== input.routing.tenantId ||
      !opened.get('service') ||
      (input.step === 'staff' && !opened.get('staff'))
    )
      return null;
    const pinned = scope ?? null;
    const revalidate = async () => {
      if (pinned) {
        if (
          (await this.availability.readBranchAvailabilityRevision(
            input.routing.tenantId,
            pinned.branchId,
          )) !== pinned.sourceRevision
        )
          throw new BookingCatalogSourceChangedError(
            'booking_catalog_source_changed',
          );
      } else if (
        await this.availability.resolveConfiguredBookingBranch(
          input.routing.tenantId,
        )
      ) {
        throw new BookingCatalogSourceChangedError(
          'booking_catalog_scope_required',
        );
      }
    };
    await revalidate();
    // Closed selection is preference, never permission to guess a day or create a booking.
    if (input.step === 'staff')
      return {
        nextKind: null,
        capabilityKey: 'catalog.staff.read' as const,
        source: null,
        fact: fact(
          'catalog.staff.read',
          input.routing.record.requestedScopeHash,
          input.routing.now,
          0,
        ),
        inheritedHandles: Object.freeze({ ...input.handles }),
        selectionScope: pinned,
      };
    const name = 'catalog.staff.read' as const;
    const args = {};
    const execution = await this.runtime.execute(
      input.actor,
      name,
      { arguments: args, surface: 'web' },
      {
        suppressWidgetTrigger: true,
        bookingSelector: {
          tenantId: input.routing.tenantId,
          scope: pinned,
          revalidate,
        },
      },
    );
    await revalidate();
    if (
      !isRecord(execution) ||
      execution.status !== 'completed' ||
      !Object.prototype.hasOwnProperty.call(execution, 'result')
    )
      return null;
    const source = execution.result;
    // The runtime returns a list, not evidence that the list is exhaustive.
    // Unrecognised payloads must not masquerade as a measured empty list.
    const rows = isRecord(source) ? source.staff : null;
    if (!Array.isArray(rows)) return null;
    const returned = rows.length;
    return {
      nextKind: 'STAFF_SELECTOR' as const,
      capabilityKey: name,
      source,
      selectionScope: pinned,
      fact: fact(
        name,
        input.routing.record.requestedScopeHash,
        input.routing.now,
        returned,
      ),
      inheritedHandles: Object.freeze({ ...input.handles }),
      revalidateSource: revalidate,
    };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
