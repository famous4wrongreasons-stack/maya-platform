import { BadRequestException } from '@nestjs/common';

export interface YclientsLoginInput {
  login: string;
  password: string;
}
export const validYclientsLogin = (
  value: unknown,
): value is YclientsLoginInput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).length === 2 &&
    typeof v.login === 'string' &&
    v.login.trim().length > 0 &&
    v.login.length <= 254 &&
    !/[\r\n\0]/.test(v.login) &&
    typeof v.password === 'string' &&
    v.password.length > 0 &&
    v.password.length <= 1024 &&
    !/\0/.test(v.password)
  );
};
const tokenShape = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length >= 16 &&
  v.length <= 4096 &&
  /^[\x21-\x2b\x2d-\x7e]+$/.test(v);
const refused = (code: string) =>
  new BadRequestException({
    message: 'YCLIENTS user authorization could not be completed',
    error: { code, provider: 'yclients' },
  });

/** One explicit credential exchange. No retry, redirect, persistence, logging or caller URL. */
export async function exchangeYclientsUserCredential(
  input: YclientsLoginInput,
  partner: string,
  send: typeof fetch = globalThis.fetch,
): Promise<string> {
  if (!validYclientsLogin(input)) throw refused('crm_credentials_rejected');
  if (!tokenShape(partner)) throw refused('crm_platform_configuration_error');
  let response: Response;
  try {
    response = await send('https://api.yclients.com/api/v1/auth', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${partner}`,
        Accept: 'application/vnd.yclients.v2+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        login: input.login.trim(),
        password: input.password,
      }),
    });
  } catch {
    throw refused('crm_provider_unreachable');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw refused(
      [401, 403].includes(response.status)
        ? 'crm_credentials_rejected'
        : 'crm_provider_unreachable',
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw refused('crm_connection_failed');
  const chunks: Uint8Array[] = [];
  let size = 0;
  let payload: unknown;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error('bounded');
      }
      chunks.push(part.value);
    }
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw refused('crm_connection_failed');
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw refused('crm_connection_failed');
  const value = payload as {
    success?: unknown;
    data?: { user_token?: unknown };
  };
  if (value.success === false) throw refused('crm_credentials_rejected');
  if (
    value.success !== true ||
    !tokenShape(value.data?.user_token) ||
    value.data.user_token === partner
  )
    throw refused('crm_connection_failed');
  return value.data.user_token;
}
