/** Presentation only. The exact source instant remains in structured evidence. */
export function sourceInstantText(value: string, timezone = 'UTC'): string {
  const date = new Date(value);
  const hasLocalSeconds = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    second: 'numeric',
  })
    .formatToParts(date)
    .some((part) => part.type === 'second' && Number(part.value) !== 0);
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(hasLocalSeconds || date.getUTCMilliseconds()
      ? { second: '2-digit' as const }
      : {}),
    ...(date.getUTCMilliseconds()
      ? { fractionalSecondDigits: 3 as const }
      : {}),
    // Distinguish the two occurrences of a local time during a DST fold.
    ...(timezone !== 'UTC' ? { timeZoneName: 'shortOffset' as const } : {}),
    hourCycle: 'h23',
  }).format(date);
}
