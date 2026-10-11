import { isSingleDaySemanticValue } from './semantic-slot-normalization';

// Display vocabulary only. Weekdays stay preferences; no calendar date,
// availability, appointment identity or mutation authority is derived here.
const RESCHEDULE_WEEKDAYS = new Map<string, string>([
  ['monday', 'понедельник'],
  ['tuesday', 'вторник'],
  ['wednesday', 'среда'],
  ['thursday', 'четверг'],
  ['friday', 'пятница'],
  ['saturday', 'суббота'],
  ['sunday', 'воскресенье'],
  ['понедельник', 'понедельник'],
  ['вторник', 'вторник'],
  ['среда', 'среда'],
  ['среду', 'среда'],
  ['четверг', 'четверг'],
  ['пятница', 'пятница'],
  ['пятницу', 'пятница'],
  ['суббота', 'суббота'],
  ['субботу', 'суббота'],
  ['воскресенье', 'воскресенье'],
]);

export function rescheduleDayPreference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const weekday = RESCHEDULE_WEEKDAYS.get(value);
  if (weekday) return weekday;
  if (!isSingleDaySemanticValue(value)) return null;
  if (value === 'today' || value === 'сегодня') return 'сегодня';
  if (value === 'tomorrow' || value === 'завтра') return 'завтра';
  // The semantic guard permits only an ISO day here. Reject normalization such
  // as 30 February; never parse arbitrary prose or resolve relative dates.
  const instant = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value
    ? value
    : null;
}
