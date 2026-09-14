import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EncryptionService } from './encryption.service';

/**
 * Формат шифротекста продублирован и до сих пор не был закреплён нигде.
 *
 * 🔴 `encryption.service.ts` собирает `iv.authTag.encrypted` в base64url на
 * aes-256-gcm, и ровно ту же схему НЕЗАВИСИМО реализует `prisma/seed.ts`
 * собственной функцией, которой пишется `encryptedApiToken`. Любое изменение
 * формата в одном месте — длина iv, порядок частей, кодировка — не ломало ни
 * одного теста, но приводило к тому, что расшифровка учётки CRM падает уже в
 * рантайме у арендатора: салон теряет связь с YClients без единого красного
 * теста на выкате.
 */
describe('EncryptionService', () => {
  const build = (secret: string | undefined) =>
    new EncryptionService({
      get: jest.fn().mockReturnValue(secret),
    } as unknown as ConfigService);

  it('returns exactly what was encrypted', () => {
    const service = build('a-long-enough-encryption-secret-value');

    expect(service.decrypt(service.encrypt('yclients-token'))).toBe(
      'yclients-token',
    );
  });

  it('survives a round trip of non-ASCII text', () => {
    const service = build('a-long-enough-encryption-secret-value');
    const secret = 'Мужская Эстетика — токен №00485903149110011';

    expect(service.decrypt(service.encrypt(secret))).toBe(secret);
  });

  it('keeps the three-part base64url shape the seed also writes', () => {
    // Именно эту форму независимо собирает prisma/seed.ts.
    const service = build('a-long-enough-encryption-secret-value');
    const parts = service.encrypt('token').split('.');

    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    // iv длиной 12 байт → 16 символов base64url без выравнивания.
    expect(parts[0]).toHaveLength(16);
  });

  it('never produces the same ciphertext twice', () => {
    const service = build('a-long-enough-encryption-secret-value');

    expect(service.encrypt('token')).not.toBe(service.encrypt('token'));
  });

  it('refuses a payload whose auth tag was tampered with', () => {
    const service = build('a-long-enough-encryption-secret-value');
    const [iv, , encrypted] = service.encrypt('token').split('.');
    const forgedTag = Buffer.alloc(16, 7).toString('base64url');

    // Класс здесь сырой (ошибка из crypto), а не доменный: подделка
    // отбрасывается на аутентификации GCM, до возврата. Наружу это всё равно
    // уходит штатной пятисоткой без деталей, поэтому важен сам отказ.
    expect(() =>
      service.decrypt([iv, forgedTag, encrypted].join('.')),
    ).toThrow();
  });

  it('refuses a payload that is not three parts', () => {
    const service = build('a-long-enough-encryption-secret-value');

    expect(() => service.decrypt('not-encrypted')).toThrow(
      InternalServerErrorException,
    );
  });

  it('cannot be built without a configured key', () => {
    expect(() => build(undefined)).toThrow(InternalServerErrorException);
  });

  it('does not decrypt what another key encrypted', () => {
    const mine = build('a-long-enough-encryption-secret-value');
    const other = build('a-completely-different-encryption-secret');

    expect(() => other.decrypt(mine.encrypt('token'))).toThrow();
  });
});
