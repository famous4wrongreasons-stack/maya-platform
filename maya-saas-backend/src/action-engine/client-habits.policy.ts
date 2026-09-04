import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';

/** Owner-approved B7 limits. Changing a bound requires a new policy version. */
export const CLIENT_HABITS_POLICY = Object.freeze({
  version: 1,
  maxEntries: 12,
  maxEntryCodePoints: 200,
  maxPlaintextBytes: 8192,
  maxPersistedBytes: 10963,
});

export class ClientHabitsLimitError extends UnprocessableEntityException {
  constructor(limit: string, maximum: number) {
    super({
      code: 'CLIENT_PREFERENCES_LIMIT_EXCEEDED',
      message:
        'Client preference limit exceeded; existing preferences unchanged',
      limit,
      maximum,
    });
  }
}

export function normalizeClientHabit(value: unknown): string {
  if (typeof value !== 'string')
    throw new BadRequestException('Explicit Client preference text required');
  const text = value
    .trim()
    .replace(/^[•\- ]+|[•\- ]+$/g, '')
    .trim();
  if (!text) throw new BadRequestException('Empty Client preference');
  if ([...text].length > CLIENT_HABITS_POLICY.maxEntryCodePoints)
    throw new ClientHabitsLimitError('entryCodePoints', 200);
  return text;
}

/** Strict canonical JSON; limits apply to the complete serialized UTF-8 value. */
export function serializeClientHabits(preferences: readonly string[]): string {
  if (preferences.length > CLIENT_HABITS_POLICY.maxEntries)
    throw new ClientHabitsLimitError('entries', 12);
  const seen = new Set<string>();
  for (const text of preferences) {
    if (normalizeClientHabit(text) !== text || seen.has(text.toLowerCase()))
      throw new BadRequestException('Noncanonical Client preference state');
    seen.add(text.toLowerCase());
  }
  const plaintext = JSON.stringify({ version: 1, preferences });
  if (
    Buffer.byteLength(plaintext, 'utf8') >
    CLIENT_HABITS_POLICY.maxPlaintextBytes
  )
    throw new ClientHabitsLimitError('plaintextBytes', 8192);
  return plaintext;
}

export function validateClientHabitsCiphertext(ciphertext: string) {
  if (
    Buffer.byteLength(ciphertext, 'utf8') >
    CLIENT_HABITS_POLICY.maxPersistedBytes
  )
    throw new ClientHabitsLimitError('persistedBytes', 10963);
  if (
    !/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/.test(ciphertext)
  )
    throw new BadRequestException('Invalid encrypted Client preference format');
}

export function parseClientHabits(plaintext: string): string[] {
  if (
    Buffer.byteLength(plaintext, 'utf8') >
    CLIENT_HABITS_POLICY.maxPlaintextBytes
  )
    throw new ClientHabitsLimitError('plaintextBytes', 8192);
  let state: unknown;
  try {
    state = JSON.parse(plaintext);
  } catch {
    throw new BadRequestException('Invalid Client preference JSON');
  }
  if (!state || typeof state !== 'object' || Array.isArray(state))
    throw new BadRequestException('Invalid Client preference envelope');
  const value = state as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !== 'preferences,version' ||
    value.version !== CLIENT_HABITS_POLICY.version ||
    !Array.isArray(value.preferences) ||
    !value.preferences.length ||
    value.preferences.some((entry) => typeof entry !== 'string')
  )
    throw new BadRequestException('Unsupported Client preference envelope');
  const preferences = value.preferences as string[];
  if (serializeClientHabits(preferences) !== plaintext)
    throw new BadRequestException('Noncanonical Client preference JSON');
  return [...preferences];
}
