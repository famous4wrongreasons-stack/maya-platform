import {
  notificationOverrides,
  preferenceObject,
} from '../action-engine/client-preferences.contract';

export const REMINDER_POLICY_V1 = Object.freeze({
  version: 1,
  maxOccurrences: 4,
  toleranceMinutes: 20,
});
export function effectiveReminderSchedule(
  enabled: boolean,
  tenantLeads: unknown,
  preferences: unknown,
): number[] {
  if (!enabled) return [];
  if (
    !Array.isArray(tenantLeads) ||
    tenantLeads.length < 1 ||
    tenantLeads.length > REMINDER_POLICY_V1.maxOccurrences ||
    new Set(tenantLeads).size !== tenantLeads.length ||
    tenantLeads.some(
      (n: unknown) =>
        !Number.isInteger(n) || Number(n) < 30 || Number(n) > 10080,
    )
  )
    return [];
  try {
    const envelope = preferenceObject(preferences ?? {});
    const raw = preferenceObject(envelope.overrides ?? {});
    // Nullable persisted choice means inheritance; zero remains invalid.
    if (raw.reminder_hours === null) delete raw.reminder_hours;
    const p = notificationOverrides(raw);
    if (p.reminder === false) return [];
    return typeof p.reminder_hours === 'number'
      ? [p.reminder_hours * 60]
      : (tenantLeads as number[]).slice().sort((a, b) => b - a);
  } catch {
    return [];
  }
}
export function reminderChannelAllowed(
  preferences: unknown,
  timezone: string,
  now: Date,
): boolean {
  try {
    const envelope = preferenceObject(preferences ?? {});
    const raw = preferenceObject(envelope.overrides ?? {});
    if (raw.reminder_hours === null) delete raw.reminder_hours;
    const p = notificationOverrides(raw);
    if (p.reminder === false) return false;
    const from = p.quiet_from,
      to = p.quiet_to;
    if (typeof from !== 'number' || typeof to !== 'number' || from === to)
      return true;
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(now),
    );
    return !(from < to ? hour >= from && hour < to : hour >= from || hour < to);
  } catch {
    return false;
  }
}
