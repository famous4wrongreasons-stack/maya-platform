import {
  buildPhoneLoginEmail,
  maskPhone,
  normalizeRussianPhone,
  phoneDigits,
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
});
