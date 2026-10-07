import type { AuthenticatedUser } from '../../common/authenticated-user.interface';
import type { SubmitIntentDto } from '../dto/submit-intent.dto';

/** Post-gateway history sink. No gate imports this port or reads wire metadata
 * from it; the existing store owns the accepted closed selection audit. */
export const BOOKING_SELECTION_AUDIT = 'BOOKING_SELECTION_AUDIT';
export interface BookingSelectionAuditPort {
  recordAcceptedBookingSelection(
    dto: SubmitIntentDto,
    actor: AuthenticatedUser,
  ): Promise<void>;
}
