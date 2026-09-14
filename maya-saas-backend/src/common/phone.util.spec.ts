import {
  buildPhoneLoginEmail,
  maskPhone,
  normalizePhoneE164,
  normalizeRussianPhone,
  phoneDigits,
  phoneMatchKey,
  phonesMatch,
} from './phone.util';

describe('phone util', () => {
  it('normalizes Russian phone formats into +7', () => {
    expect(normalizeRussianPhone('8 (999) 000-00-00')).toBe('+79990000000');
    expect(normalizeRussianPhone('+7 999 000 00 00')).toBe('+79990000000');
  });

  it('builds deterministic phone-first login emails', () => {
    expect(buildPhoneLoginEmail('demo-salon', '+7 999 000 00 00')).toBe(
      'phone-79990000000@demo-salon.client.local',
    );
  });

  it('extracts raw phone digits and masked phone strings', () => {
    expect(phoneDigits('+7 999 000 00 00')).toBe('79990000000');
    expect(maskPhone('+7 999 000 00 00')).toBe('+7***0000');
  });

  describe('normalizePhoneE164', () => {
    it('приводит российские записи к одному виду вместо исключения', () => {
      expect(normalizePhoneE164('8 (999) 000-00-00')).toBe('+79990000000');
      expect(normalizePhoneE164('+7 999 000 00 00')).toBe('+79990000000');
      expect(normalizePhoneE164('9990000000')).toBe('+79990000000');
      expect(normalizePhoneE164('7 999 000 00 00')).toBe('+79990000000');
    });

    it('не применяет российские эвристики к номеру с явным кодом страны', () => {
      // Раньше строгий нормализатор бросал 400, и подтверждённый провайдером
      // номер становился неотличим от «телефон не дали».
      expect(normalizePhoneE164('+380 44 000 00 00')).toBe('+380440000000');
      expect(normalizePhoneE164('+1 212 555 12 34')).toBe('+12125551234');
      expect(normalizePhoneE164('+7 701 000 00 00')).toBe('+77010000000');
    });

    it('возвращает null вместо исключения на мусоре', () => {
      expect(normalizePhoneE164(null)).toBeNull();
      expect(normalizePhoneE164(undefined)).toBeNull();
      expect(normalizePhoneE164('')).toBeNull();
      expect(normalizePhoneE164('не телефон')).toBeNull();
      expect(normalizePhoneE164('12345')).toBeNull();
      expect(normalizePhoneE164('1234567890123456789')).toBeNull();
    });
  });

  describe('phoneMatchKey / phonesMatch', () => {
    it('сводит расхождения форматов между CRM и провайдером к одному ключу', () => {
      // Ровно тот случай, из-за которого владелец не находился и получал
      // второй client-аккаунт: в YClients записано «8 (999) …», а Яндекс
      // вернул «+7999…».
      expect(phoneMatchKey('8 (999) 000-00-00')).toBe('9990000000');
      expect(phoneMatchKey('+7 999 000 00 00')).toBe('9990000000');
      expect(phoneMatchKey('9990000000')).toBe('9990000000');
      expect(phonesMatch('8 (999) 000-00-00', '+79990000000')).toBe(true);
    });

    it('склеивает один номер, записанный с разными кодами страны', () => {
      expect(phonesMatch('+7 999 000 00 00', '999 000 00 00')).toBe(true);
    });

    it('не склеивает разных людей', () => {
      expect(phonesMatch('+79990000000', '+79990000001')).toBe(false);
      expect(phonesMatch('+79990000000', null)).toBe(false);
      expect(phonesMatch(null, null)).toBe(false);
      expect(phonesMatch('мусор', 'мусор')).toBe(false);
    });
  });

  describe('normalizeRussianPhone остаётся строгим', () => {
    it('отклоняет не-российский номер', () => {
      expect(() => normalizeRussianPhone('+380 44 000 00 00')).toThrow();
      expect(() => normalizeRussianPhone('+1 212 555 12 34')).toThrow();
      expect(() => normalizeRussianPhone('')).toThrow();
    });
  });
});
