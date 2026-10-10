/* eslint-disable @typescript-eslint/require-await -- synthetic transport only */
import {
  exchangeYclientsUserCredential,
  validYclientsLogin,
} from './yclients-user-auth';
const partner = 'SYNTHETIC_PARTNER_AUTH_123',
  token = 'SYNTHETIC_USER_AUTH_123';
const login = () => ({
  login: ' owner@example.invalid ',
  password: ' Synthetic Password 42 ',
});
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
describe('explicit YCLIENTS user credential exchange', () => {
  it('one official POST, partner-only header, exact password, no returned user PII', async () => {
    const send = jest.fn(async (url: unknown, init?: RequestInit) => {
      expect(url).toBe('https://api.yclients.com/api/v1/auth');
      expect(init).toMatchObject({
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${partner}` },
      });
      expect(init!.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(init!.body as string)).toEqual({
        login: 'owner@example.invalid',
        password: login().password,
      });
      return reply({
        success: true,
        data: { user_token: token, name: 'PRIVATE_PROVIDER_PERSON' },
      });
    });
    expect(await exchangeYclientsUserCredential(login(), partner, send)).toBe(
      token,
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 429, 500, 302])(
    'HTTP %s returns fixed error without retry or provider text',
    async (status) => {
      const send = jest.fn(async () =>
        reply({ error: 'PRIVATE_PROVIDER_PERSON' }, status),
      );
      try {
        await exchangeYclientsUserCredential(login(), partner, send);
        throw Error('expected refusal');
      } catch (error) {
        expect(String(error)).not.toContain('PRIVATE_PROVIDER_PERSON');
        expect(String(error)).toContain('YCLIENTS user authorization');
      }
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { success: false, error: 'PRIVATE_PROVIDER_PERSON' },
    {},
    { success: true, data: { user_token: partner } },
    { success: true, data: { user_token: 'bad,token' } },
    { success: true, data: {} },
  ])('malformed/rejected/partner-equal results refuse', async (body) => {
    await expect(
      exchangeYclientsUserCredential(login(), partner, async () => reply(body)),
    ).rejects.toThrow('YCLIENTS user authorization');
  });
  it('transport errors and oversized/invalid bodies are sanitized', async () => {
    await expect(
      exchangeYclientsUserCredential(login(), partner, async () => {
        throw Error('SECRET_ORIGIN');
      }),
    ).rejects.toThrow('YCLIENTS user authorization');
    for (const body of ['bad json', 'x'.repeat(65537)])
      await expect(
        exchangeYclientsUserCredential(
          login(),
          partner,
          async () => new Response(body),
        ),
      ).rejects.toThrow('YCLIENTS user authorization');
  });
  it('invalid credential material cannot dispatch', async () => {
    const send = jest.fn();
    for (const input of [
      null,
      {},
      { ...login(), extra: 'x' },
      { ...login(), login: '\n' },
      { ...login(), password: '' },
      { ...login(), password: 'x'.repeat(1025) },
    ]) {
      expect(validYclientsLogin(input)).toBe(false);
      await expect(
        exchangeYclientsUserCredential(input as never, partner, send),
      ).rejects.toThrow();
    }
    await expect(
      exchangeYclientsUserCredential(login(), 'bad,partner', send),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
