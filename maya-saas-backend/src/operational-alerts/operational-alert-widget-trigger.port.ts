export const OPERATIONAL_ALERT_WIDGET_TRIGGER =
  'OPERATIONAL_ALERT_WIDGET_TRIGGER';

/** Optional presentation hook. OperationalAlertRun remains the business/source owner. */
export interface OperationalAlertWidgetTriggerPort {
  afterShiftAdmitted(
    input: Readonly<{
      tenantId: string;
      runId: string;
      occurrenceRef: string;
      occurredAt: string;
      admittedAt: string;
      expiresAt: string;
      recipient: Readonly<{
        userId: string;
        role: string;
        title: string;
        bodyText: string;
      }>;
      source: Readonly<{
        localDate: string;
        timezone: string;
        scheduledStartAt: string;
        scheduleEvidenceHash: string;
      }>;
    }>,
  ): Promise<unknown>;
}
