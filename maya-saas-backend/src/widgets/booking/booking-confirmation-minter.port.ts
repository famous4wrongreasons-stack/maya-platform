import type { FactUsed } from '../../widget-contract/envelope';
import type { PrincipalView } from '../gate.types';

export type BookingConfirmationSubject = 'create' | 'reschedule' | 'cancel';

export interface BookingConfirmationPreview {
  readonly subject: BookingConfirmationSubject;
  readonly sourceCapabilityKey: string;
  readonly frozenArgumentHandles: Readonly<Record<string, string>>;
  readonly draftRef: string | null;
  readonly appointmentRef: string | null;
  readonly producingIntentTokenHash: string | null;
  readonly when: string;
  readonly whenPrevious: string | null;
  readonly serviceLabel: string;
  readonly staffLabel: string;
  readonly durationMinutes: number;
  readonly priceKopecks: number | null;
  readonly currency: string;
  readonly fact: FactUsed;
}

export interface BookingConfirmationMintInput {
  readonly tenantId: string;
  readonly predecessorWidgetId: string;
  readonly principal: PrincipalView;
  readonly deliveryChannel: string;
  readonly now: Date;
  readonly preview: BookingConfirmationPreview;
}

export interface BookingConfirmationMinterPort {
  mint(
    input: BookingConfirmationMintInput,
  ): Promise<Readonly<Record<string, unknown>>>;
}
