import { projectEmailVerify } from './project.ts';
import type { OnboardingFailure, OnboardingField, OnboardingInput, Outcome, TrialActivationProjection, TrialSignupProjection } from './types.ts';

const own = (value: unknown, key: string): unknown => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const property = Object.getOwnPropertyDescriptor(value, key);
  return property && 'value' in property ? property.value : undefined;
};
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const date = (value: unknown): value is string => text(value, 64) && Number.isFinite(Date.parse(value));
const days = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 365;
const token = (value: unknown): value is string => text(value, 256) && value.length >= 32 && /^[A-Za-z0-9_-]+$/.test(value);

export function onboardingInput(value: unknown): Outcome<OnboardingInput, OnboardingFailure> {
  const invalid = (field: OnboardingField): Outcome<OnboardingInput, OnboardingFailure> => ({ ok: false, failure: { reason: 'invalid', field } });
  const read = (key: OnboardingField, max: number): string | null => {
    const held = own(value, key);
    return text(held, max) ? held.trim() : null;
  };
  const name = read('name', 200), slug = read('slug', 100), ownerEmail = read('ownerEmail', 254);
  const branchName = read('branchName', 200), branchTimezone = read('branchTimezone', 100);
  const password = own(value, 'password');
  if (!name) return invalid('name');
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return invalid('slug');
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return invalid('ownerEmail');
  // Signup trims passwords, login does not: refuse a choice that would silently change.
  if (!text(password, 1024) || password.length < 8 || password !== password.trim()) return invalid('password');
  if (!branchName) return invalid('branchName');
  if (!branchTimezone) return invalid('branchTimezone');
  try { new Intl.DateTimeFormat('ru', { timeZone: branchTimezone }); }
  catch { return invalid('branchTimezone'); }
  return { ok: true, value: { name, slug, ownerEmail: ownerEmail.toLowerCase(), password, branchName, branchTimezone } };
}

export function projectTrialActivation(value: unknown): TrialActivationProjection | null {
  const id = own(value, 'activation_id'), activationToken = own(value, 'activation_token');
  const expiresAt = own(value, 'expires_at'), trialDays = own(value, 'trial_days');
  if (!text(id, 128) || !token(activationToken) || !date(expiresAt) || !days(trialDays) ||
    own(value, 'status') !== 'pending' || own(value, 'source') !== 'web' ||
    own(value, 'trial_starts_when') !== 'registration_completed' || own(value, 'counted_as_connected_business') !== false) return null;
  return { id, token: activationToken, expiresAt, days: trialDays };
}

export function trialSignupBody(input: OnboardingInput, activationToken: string): { readonly trialActivationToken: string; readonly name: string; readonly slug: string; readonly ownerEmail: string; readonly password: string; readonly branchName: string; readonly branchTimezone: string; readonly calendarSource: 'external' } | null {
  const parsed = onboardingInput(input);
  if (!parsed.ok || !token(activationToken)) return null;
  const fields = parsed.value;
  return { trialActivationToken: activationToken, name: fields.name, slug: fields.slug,
    ownerEmail: fields.ownerEmail, password: fields.password, branchName: fields.branchName,
    branchTimezone: fields.branchTimezone, calendarSource: 'external' };
}

export function projectTrialSignup(value: unknown, input: OnboardingInput, activation: TrialActivationProjection): TrialSignupProjection | null {
  const receipt = own(value, 'trial_activation'), tenant = own(value, 'tenant'), user = own(value, 'user');
  const trial = own(value, 'trial'), trialDays = own(trial, 'days'), trialEndsAt = own(trial, 'ends_at');
  if (own(receipt, 'activation_id') !== activation.id || own(receipt, 'status') !== 'completed' ||
    own(receipt, 'counted_as_connected_business') !== true || own(tenant, 'slug') !== input.slug ||
    own(user, 'email') !== input.ownerEmail || own(value, 'calendar_source') !== 'external' ||
    own(tenant, 'calendar_source') !== 'external' || !text(own(tenant, 'id'), 128) ||
    own(user, 'tenant_id') !== own(tenant, 'id') || !text(own(user, 'id'), 128) ||
    !text(own(user, 'branch_id'), 128) || own(user, 'status') !== 'active' || own(user, 'role') !== 'tenant_owner' ||
    own(value, 'booking_mode') !== 'preview' || own(value, 'next_step') !== 'connect_crm' ||
    !days(trialDays) || trialDays !== activation.days || !date(trialEndsAt)) return null;
  const login = projectEmailVerify(value);
  if (login?.next_step !== 'signed_in' || !login.display.tenantName) return null;
  return { grant: login.grant, display: login.display, trialDays, trialEndsAt };
}
