// K4 — the five PII fences.
//
// The exit criterion is unusual and deliberate: they must fire INDEPENDENTLY, 5/5. Not "PII is
// blocked" — five separate fences, each of which refuses on its own. The reason is that a single
// combined check has a single point of failure, and the thing being protected is the 152-ФЗ
// boundary that the whole product is built around: client personal data never reaches the LLM, and
// never reaches a surface that was not verified to carry it.
//
// Each fence below answers one question and returns one verdict. None calls another.

export type PiiFenceName =
  | 'client_preview'
  | 'llm_boundary'
  | 'artifact_contains_pii'
  | 'spoken_readback'
  | 'secure_surface_only';

export interface FenceVerdict {
  readonly fence: PiiFenceName;
  readonly allowed: boolean;
  readonly why: string;
}

const deny = (fence: PiiFenceName, why: string): FenceVerdict => ({
  fence,
  allowed: false,
  why,
});
const allow = (fence: PiiFenceName, why: string): FenceVerdict => ({
  fence,
  allowed: true,
  why,
});

/**
 * Keys whose presence marks a value as carrying personal data. Deliberately broad: a false positive
 * costs a masked field, a false negative costs a disclosure, and those are not symmetric.
 */
const PII_KEYS = [
  'phone',
  'phone_number',
  'email',
  'full_name',
  'last_name',
  'patronymic',
  'passport',
  'birth_date',
  'birthday',
  'address',
  'client_name',
  'notes',
] as const;

const walkForPii = (value: unknown, depth = 0): string[] => {
  if (depth > 12 || value === null || typeof value !== 'object') return [];
  if (Array.isArray(value))
    return value.flatMap((v) => walkForPii(v, depth + 1));
  const found: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (
      (PII_KEYS as readonly string[]).includes(k) &&
      v !== null &&
      v !== undefined
    )
      found.push(k);
    found.push(...walkForPii(v, depth + 1));
  }
  return found;
};

/** FENCE 1 — a client-preview body may not carry another person's data. */
export const clientPreviewFence = (
  body: unknown,
  isClientPreview: boolean,
): FenceVerdict => {
  if (!isClientPreview) return allow('client_preview', 'not a client preview');
  const hits = walkForPii(body);
  return hits.length === 0
    ? allow('client_preview', 'no personal data in the previewed body')
    : deny('client_preview', `client preview carries ${hits.join(', ')}`);
};

/**
 * FENCE 2 — the LLM boundary. The standing rule for this product: client personal data NEVER
 * reaches the model. This fence is the one that must never be relaxed for convenience, because the
 * cost of relaxing it is paid by someone who is not in the room.
 */
export const llmBoundaryFence = (payload: unknown): FenceVerdict => {
  const hits = walkForPii(payload);
  return hits.length === 0
    ? allow('llm_boundary', 'no personal data crosses to the model')
    : deny('llm_boundary', `refused: ${hits.join(', ')} would reach the model`);
};

/** FENCE 3 — an artifact must declare whether it contains PII BEFORE it can be fetched. */
export const artifactPiiFence = (artifact: {
  contains_pii?: boolean | null;
}): FenceVerdict =>
  artifact.contains_pii === null || artifact.contains_pii === undefined
    ? deny(
        'artifact_contains_pii',
        'contains_pii is undeclared; an artifact may not be fetched on an unstated claim',
      )
    : allow(
        'artifact_contains_pii',
        `declared contains_pii=${artifact.contains_pii}`,
      );

/**
 * FENCE 4 — spoken readback. A voice channel is overheard by whoever is in the room, so personal
 * data is not read aloud even when the same data would be legitimate on screen.
 */
export const spokenReadbackFence = (
  spokenText: string,
  channel: string,
): FenceVerdict => {
  if (channel !== 'realtime-voice' && channel !== 'telegram-bot')
    return allow('spoken_readback', 'not a spoken carrier');
  const looksLikePhone = /(\+?\d[\s\-()]?){7,}/.test(spokenText);
  const looksLikeEmail = /\S+@\S+\.\S+/.test(spokenText);
  return looksLikePhone || looksLikeEmail
    ? deny('spoken_readback', 'refused: a contact detail would be read aloud')
    : allow('spoken_readback', 'nothing contact-shaped in the spoken text');
};

/**
 * FENCE 5 — SECURE_SURFACE_ONLY. Some capabilities may be reached only from a surface verified to
 * carry them. Chat is not one: the exit criterion is `SECURE_SURFACE_ONLY emissions in chat = 0`.
 */
export const secureSurfaceFence = (args: {
  secureSurfaceOnly: boolean;
  deliveryChannel: string;
}): FenceVerdict => {
  if (!args.secureSurfaceOnly)
    return allow('secure_surface_only', 'not marked secure-surface-only');
  // Enumerated rather than negated: a new channel is refused until it is listed, instead of being
  // admitted because nobody remembered to exclude it.
  const SECURE = ['native-shell'];
  return SECURE.includes(args.deliveryChannel)
    ? allow(
        'secure_surface_only',
        `${args.deliveryChannel} is a verified secure surface`,
      )
    : deny(
        'secure_surface_only',
        `refused: ${args.deliveryChannel} is not a secure surface`,
      );
};

/** The five, in one list — so "are there five?" is a question the exit gate can answer. */
export const PII_FENCES = [
  'client_preview',
  'llm_boundary',
  'artifact_contains_pii',
  'spoken_readback',
  'secure_surface_only',
] as const satisfies readonly PiiFenceName[];
