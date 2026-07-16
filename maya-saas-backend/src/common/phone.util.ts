import { BadRequestException } from '@nestjs/common';

export function normalizeRussianPhone(phone: string): string {
  let digits = String(phone || '').replace(/\D/g, '');

  if (digits.startsWith('8') && digits.length === 11) {
    digits = `7${digits.slice(1)}`;
  } else if (digits.length === 10) {
    digits = `7${digits}`;
  }

  if (digits.length !== 11 || !digits.startsWith('7')) {
    throw new BadRequestException(
      'Client phone must be a valid Russian number',
    );
  }

  return `+${digits}`;
}

export function phoneDigits(phone: string): string {
  return normalizeRussianPhone(phone).slice(1);
}

export function buildPhoneLoginEmail(
  tenantSlug: string,
  phone: string,
): string {
  return `phone-${phoneDigits(phone)}@${tenantSlug.toLowerCase()}.client.local`;
}

export function maskPhone(phone: string): string {
  const normalized = normalizeRussianPhone(phone);

  return `${normalized.slice(0, 2)}***${normalized.slice(-4)}`;
}
