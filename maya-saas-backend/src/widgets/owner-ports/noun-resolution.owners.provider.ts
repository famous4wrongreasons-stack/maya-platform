import {
  GOODS_RECEIPT_CAPABILITY,
  GOODS_RECEIPT_TOOL,
} from '../../crm/goods-receipt.contract';
import {
  GOODS_RECEIPT_APPROVAL_OWNER,
  GOODS_RECEIPT_APPROVAL_NOUN_OWNER,
  type GoodsReceiptApprovalOwnerPort,
} from '../inventory/goods-receipt-approval.port';
import { ScheduleApprovalAdapter } from './schedule-approval.adapter';
import { SCHEDULE_AE } from '../emission/schedule-intent-template';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Inject,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { SERVICE_PRICE_CAPABILITY } from '../../crm/yclients-service-price.contract';
import {
  SERVICE_PRICE_APPROVAL_OWNER,
  SERVICE_PRICE_APPROVAL_NOUN_OWNER,
  type ServicePriceApprovalOwnerPort,
} from '../pricing/service-price-approval.port';
import { openWidgetNounHandle } from '../emission/seal.service';
import type {
  NounActor,
  NounResolverInput,
} from '../noun-resolution/noun-resolution';
import type {
  NounReadPort,
  NounReadResult,
} from '../noun-resolution/noun-resolution.ports';
import { BookingCreateNounAdapter } from './noun-booking-create.adapter';
import { BookingCancelNounAdapter } from './noun-booking-cancel.adapter';
import { BookingRescheduleNounAdapter } from './noun-booking-reschedule.adapter';
import { ClientAppointmentReadNounAdapter } from './noun-client-appointment-read.adapter';
import {
  decodeBookingSlotSelectionRef,
  decodeBookingCatalogOwnerRef,
  sameBookingScope,
  type BookingSlotScope,
  isBookingNounIdentity,
} from '../booking/booking-noun-identity';

@Injectable()
export class NounResolutionOwnersProvider implements NounReadPort {
  constructor(
    private readonly create: BookingCreateNounAdapter,
    private readonly cancel: BookingCancelNounAdapter,
    private readonly reschedule: BookingRescheduleNounAdapter,
    private readonly readOwner: ClientAppointmentReadNounAdapter,
    @Optional()
    @Inject(SERVICE_PRICE_APPROVAL_OWNER)
    private readonly price?: ServicePriceApprovalOwnerPort,
    @Optional() private readonly schedule?: ScheduleApprovalAdapter,
    @Optional()
    @Inject(GOODS_RECEIPT_APPROVAL_OWNER)
    private readonly goods?: GoodsReceiptApprovalOwnerPort,
  ) {}

  async read(
    input: NounResolverInput,
    actor: NounActor,
  ): Promise<NounReadResult> {
    if (actor.tenantId === null || actor.tenantId !== input.tenantId)
      return { kind: 'policy_deferred' };
    if (
      input.capability?.key === GOODS_RECEIPT_CAPABILITY ||
      input.capability?.key === GOODS_RECEIPT_TOOL
    )
      return this.goods
        ? this.goods.readNoun(input, actor)
        : { kind: 'policy_deferred' };
    if (
      input.capability?.key === SERVICE_PRICE_CAPABILITY ||
      input.capability?.key === 'catalog.service.price.update'
    )
      return this.price
        ? this.price.readNoun(input, actor)
        : { kind: 'policy_deferred' };
    // A class-detail NAVIGATE has no capability member (F69); its one sealed
    // canonical approval noun still owes a fresh owner read through F15's seven fields.
    const detailApproval =
      input.capability === null && input.frozenNouns.size === 1
        ? input.frozenNouns.get('approval')
        : undefined;
    if (
      detailApproval &&
      openWidgetNounHandle(detailApproval)?.ownerKind ===
        GOODS_RECEIPT_APPROVAL_NOUN_OWNER
    )
      return this.goods
        ? this.goods.readNoun(input, actor)
        : { kind: 'policy_deferred' };
    if (
      detailApproval &&
      openWidgetNounHandle(detailApproval)?.ownerKind ===
        SERVICE_PRICE_APPROVAL_NOUN_OWNER
    )
      return this.price
        ? this.price.readNoun(input, actor)
        : { kind: 'policy_deferred' };
    const values = new Map<string, string>();
    const bookingScopes: (BookingSlotScope | null)[] = [];
    for (const [noun, handle] of input.frozenNouns) {
      const opened = openWidgetNounHandle(handle);
      if (
        opened === null ||
        opened.tenantId !== input.tenantId ||
        opened.noun !== noun
      )
        return { kind: 'gone', reason: 'not_found' };
      const bookingSlot =
        noun === 'slot' && isBookingNounIdentity(opened, 'slot');
      const slot = bookingSlot
        ? decodeBookingSlotSelectionRef(opened.ownerRef)
        : null;
      const bookingCatalog =
        (noun === 'service' || noun === 'staff') &&
        isBookingNounIdentity(opened, noun);
      const catalog = bookingCatalog
        ? decodeBookingCatalogOwnerRef(opened.ownerRef)
        : null;
      const ownerValue = bookingSlot
        ? (slot?.start ?? null)
        : bookingCatalog
          ? (catalog?.id ?? null)
          : opened.ownerRef;
      if (bookingSlot || bookingCatalog)
        bookingScopes.push(
          bookingSlot ? (slot?.scope ?? null) : (catalog?.scope ?? null),
        );
      if (ownerValue === null) return { kind: 'gone', reason: 'not_found' };
      if (slot?.scope) {
        if (
          !['appointments.own.create', 'crm.appointment.create.v1'].includes(
            input.capability?.key ?? '',
          ) ||
          input.frozenNouns.has('branch') ||
          input.frozenNouns.has('branch_source_revision')
        )
          return { kind: 'gone', reason: 'not_found' };
        values.set('branch', slot.scope.branchId);
        values.set('branch_source_revision', slot.scope.sourceRevision);
      }
      if (
        input.capability?.key === SCHEDULE_AE &&
        opened.ownerKind !== 'schedule_approval'
      )
        return { kind: 'gone', reason: 'not_found' };
      values.set(noun, ownerValue);
    }
    if (
      bookingScopes.some((scope) => !sameBookingScope(scope, bookingScopes[0]))
    )
      return { kind: 'gone', reason: 'not_found' };
    try {
      const key = input.capability?.key ?? '';
      if (key === SCHEDULE_AE) {
        const id = values.get('approval'),
          hash = values.get('payload');
        return id &&
          hash &&
          values.size === 2 &&
          this.schedule &&
          (await this.schedule.read(input.tenantId, actor.userId, id, hash))
          ? { kind: 'resolved', values }
          : { kind: 'gone', reason: 'not_found' };
      }
      // A TIME_SLOT_SELECTOR record freezes the server-minted service/staff handles at mint and
      // receives the selected slot only after Gate 8 validates it against the closed domain. Gate
      // 11 therefore cannot quote the complete proposal from its retained seven-field view. The
      // exact selector edge is re-read atomically by BookingPreviewAdapter at Gate 13 with all
      // three opened handles; this lane is deferred to that existing canonical owner, never passed
      // as a successful quote and never generalized to another capability or noun set.
      if (
        key === 'appointments.own.create' &&
        values.size === 2 &&
        values.has('service') &&
        values.has('staff') &&
        !values.has('slot')
      )
        return { kind: 'policy_deferred' };
      if (
        key === 'appointments.own.create' ||
        key === 'crm.appointment.create.v1'
      ) {
        if ((await this.create.quote(actor, values)) === null)
          return { kind: 'gone', reason: 'slot_taken' };
      } else if (
        key === 'appointments.own.reschedule' ||
        key === 'crm.appointment.reschedule.v1'
      ) {
        if ((await this.reschedule.quote(actor, values)) === null)
          return { kind: 'gone', reason: 'slot_taken' };
      } else if (
        key === 'appointments.own.cancel' ||
        key === 'crm.appointment.cancel.v1'
      ) {
        const appointment = values.get('appointment');
        if (!appointment) return { kind: 'gone', reason: 'not_found' };
        const answer = await this.cancel.read(actor, appointment);
        if (answer === null) return { kind: 'gone', reason: 'not_found' };
        if (answer.alreadyCancelled)
          return { kind: 'gone', reason: 'already_cancelled' };
      } else if (key === 'appointments.own.list') {
        const appointment = values.get('appointment');
        if (
          !appointment ||
          !(await this.readOwner.contains(actor, appointment))
        )
          return { kind: 'gone', reason: 'not_found' };
      } else return { kind: 'policy_deferred' };
      return { kind: 'resolved', values };
    } catch (error) {
      // A withdrawn canonical source is an unresolved noun, not a provider
      // transport outage or evidence that the time was taken.
      if (error instanceof HttpException) {
        const body = error.getResponse();
        const detail =
          typeof body === 'object' && body !== null && 'error' in body
            ? body.error
            : null;
        const code =
          typeof detail === 'object' && detail !== null && 'code' in detail
            ? detail.code
            : null;
        if (
          code === 'booking_branch_source_unavailable' ||
          code === 'booking_branch_source_stale' ||
          code === 'booking_appointment_source_unproven' ||
          (values.has('branch') && code === 'booking_preview_stale')
        )
          return { kind: 'gone', reason: 'not_found' };
      }
      if (error instanceof ForbiddenException)
        return { kind: 'policy_deferred' };
      if (error instanceof NotFoundException)
        return { kind: 'gone', reason: 'not_found' };
      if (error instanceof ConflictException)
        return { kind: 'gone', reason: 'slot_taken' };
      if (error instanceof BadRequestException)
        return { kind: 'gone', reason: 'slot_taken' };
      throw error;
    }
  }
}
