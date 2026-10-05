/** The existing Python executors' response contract, not an HTTP-status heuristic. */
type Executor = 'privacy' | 'package2' | 'bulk';
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const REJECTIONS: Record<Executor, readonly string[]> = {
  privacy: ['invalid_request'],
  package2: ['invalid_request', 'invalid_parse_mode', 'invalid_buttons'],
  bulk: [
    'invalid_request',
    'invalid_bulk_transport',
    'invalid_parse_mode',
    'invalid_buttons',
    'B35_TELEGRAM_REJECTED',
  ],
};

export function telegramExecutorRejected(
  status: number,
  body: unknown,
  executor: Executor,
): boolean {
  return (
    status === 400 &&
    object(body) &&
    !('message_id' in body) &&
    typeof body.error === 'string' &&
    REJECTIONS[executor].includes(body.error)
  );
}

export function telegramMessageReference(body: unknown): string | null {
  if (!object(body) || 'error' in body) return null;
  const reference = body.message_id;
  const valid =
    (typeof reference === 'number' &&
      Number.isSafeInteger(reference) &&
      reference > 0) ||
    (typeof reference === 'string' &&
      /^[1-9][0-9]{0,15}$/.test(reference) &&
      Number.isSafeInteger(Number(reference)));
  return valid ? String(reference) : null;
}
