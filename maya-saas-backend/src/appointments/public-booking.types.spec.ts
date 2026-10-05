import {
  PUBLIC_BOOKING_OPAQUE_REF_MAX,
  publicBookingPhoto,
} from './public-booking.types';
describe('guest port transport bounds', () => {
  it('uses separate opaque ref and nullable HTTPS photo contracts', () => {
    expect(PUBLIC_BOOKING_OPAQUE_REF_MAX).toBe(4096);
    expect(publicBookingPhoto(null)).toBeNull();
    expect(publicBookingPhoto('')).toBeNull();
    expect(publicBookingPhoto('https://images.test/master.jpg')).toBe(
      'https://images.test/master.jpg',
    );
    expect(publicBookingPhoto(' HTTPS://images.test/a ')).toBe(
      'https://images.test/a',
    );
    for (const value of [
      'http://images.test/a',
      'javascript:alert(1)',
      'https://user:pass@images.test/a',
      'https://images.test/' + 'a'.repeat(2048),
      'https://images.test/' + 'я'.repeat(400),
    ])
      expect(publicBookingPhoto(value)).toBeNull();
  });
});
