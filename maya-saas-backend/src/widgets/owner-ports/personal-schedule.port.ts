import type { AuthenticatedUser } from '../../common/authenticated-user.interface';
/** BS-1: server-resolved exact Client read; no caller-supplied identity or destination. */
export interface PersonalScheduleSource {
  /** Presentation filter only; current policy is still evaluated at every intent. */
  canManageAsClient?: boolean;
  appointmentId: string;
  start: string;
  end: string;
  serviceId: string | null;
  staffId: string;
  title: string;
  rescheduleStart: string | null;
  rescheduleEnd: string | null;
  revalidate(): Promise<void>;
}
export interface PersonalSchedulePort {
  resolve(
    actor: Readonly<AuthenticatedUser>,
    completed: unknown,
  ): Promise<PersonalScheduleSource | null>;
}
