import { BadRequestException } from '@nestjs/common';
export const PUBLIC_BOOKING_OPAQUE_REF_MAX = 4096;
export function publicBookingPhoto(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.href.length <= 2048
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export interface PublicBookingSite {
  siteKey: string;
  tenantId: string;
  branchId: string;
  origins: string[];
  consentVersion: string;
  consentUrl: string;
}
export interface PublicBookingSession {
  id: string;
  tenantId: string;
  siteKey: string;
  configHash: string;
  secretHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}
export interface PublicBookingSnapshot {
  staffId: string;
  serviceIds: string[];
  localDate: string;
  start: string;
  end: string;
  timezone: string;
  staffName: string;
  serviceNames: string[];
  totalMinor: number;
  currency: string;
  durationMinutes: number;
  calendarTarget: unknown;
  consentVersion: string;
  consentUrl: string;
}
export interface PublicBookingQuote {
  id: string;
  tenantId: string;
  sessionId: string;
  snapshotJson: PublicBookingSnapshot;
  expiresAt: Date;
}
export interface PublicBookingAttempt {
  id: string;
  tenantId: string;
  sessionId: string;
  quoteId: string;
  nonce: string;
  requestHash: string;
  intentHash: string;
  normalizedInputHash: string;
  targetRef: string;
  preDispatchFailure: boolean;
  createdAt: Date;
}
export function publicObject(
  value: unknown,
  keys: string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new BadRequestException('public_booking_invalid_input');
  return value as Record<string, unknown>;
}
export function publicText(value: unknown, max = 200): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    throw new BadRequestException('public_booking_invalid_input');
  return value.trim();
}
