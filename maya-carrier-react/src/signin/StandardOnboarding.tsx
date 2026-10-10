import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { OnboardingFailure, OnboardingField, OnboardingPort, OnboardingView, SignInFailure } from '../../../maya-chat-shell/src/net/types.ts';
import type { SignInOutcome } from '../../../maya-chat-shell/src/net/session.ts';
import { onboardingInput } from '../../../maya-chat-shell/src/net/onboarding.ts';
import { failureSentence } from '../runtime/copy.ts';
import { MAYA_ACCENT, MAYA_ACCENT_ON, type Tokens } from '../identity/tokens.ts';
import { timezoneChoices, deviceTimezoneChoice } from './onboardingTimezones.ts';
import { suggestBusinessSlug } from './onboardingSlug.ts';

const labels = { name: 'Название бизнеса', slug: 'Короткое имя бизнеса для входа', ownerEmail: 'Email владельца', password: 'Пароль', branchName: 'Название филиала', branchTimezone: 'Город или часовой пояс филиала' };
const slugTakenCopy = 'Это короткое имя уже занято. Выберите другое. Бизнес не создан; остальные данные сохранены в форме.';
const invalidCopy: Readonly<Record<OnboardingField, string>> = {
  name: 'Укажите название бизнеса — до 200 символов.',
  slug: 'Используйте строчные латинские буквы, цифры и одиночные дефисы между словами, до 100 символов.',
  ownerEmail: 'Укажите email в формате name@example.ru.',
  password: 'Пароль: не менее 8 и не более 1024 символов, без пробелов в начале и конце.',
  branchName: 'Укажите название первого филиала — до 200 символов.',
  branchTimezone: 'Выберите город или часовой пояс, где находится филиал.',
};
export function onboardingSentence(failure: OnboardingFailure | null): string | null {
  if (!failure) return null;
  if (failure.reason === 'invalid') return invalidCopy[failure.field];
  if (failure.reason === 'slug_taken') return slugTakenCopy;
  if (failure.reason === 'uncertain') return 'Создание бизнеса не подтверждено: ответ мог потеряться после сохранения. Не создавайте бизнес повторно. Попробуйте войти с выбранными коротким именем бизнеса, email и паролем.';
  if (failure.reason === 'closed') return 'Самостоятельная регистрация на этом сервере недоступна.';
  if (failure.reason === 'expired') return 'Срок подготовки регистрации истёк. Заполненные данные ещё не отправлены.';
  if (failure.reason === 'rate_limited') return `Подождите ${failure.retryAfterSec} сек. перед новой попыткой.`;
  return 'Не удалось подготовить регистрацию. Бизнес ещё не отправлен на создание.';
}

export function OnboardingStatus({ view }: { readonly view: OnboardingView }) {
  return <p role="status" style={{ margin: 0, lineHeight: '22px' }}>{view.phase === 'creating' ? 'Создаём бизнес…' : onboardingSentence(view.failure)}</p>;
}
export function OnboardingComplete({ view, t, finish }: { readonly view: OnboardingView; readonly t: Tokens; readonly finish: () => void }) {
  if (view.phase !== 'completed') return null;
  return <main style={{ position: 'absolute', inset: 0, overflowY: 'auto', boxSizing: 'border-box', padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)', background: t.bg, color: t.ink, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }}><div style={{ width: '100%', maxWidth: 400, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
    <h2 style={{ margin: 0 }}>Бизнес создан</h2>
    <p role="status">{view.display?.tenantName}. Пробный период: {view.trialDays} дней.</p>
    <p>CRM ещё нужно подключить. Доступ к функциям и действиям определяет сервер.</p>
    <button type="button" style={{ minHeight: 48, padding: '12px 18px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} onClick={() => finish()}>Продолжить</button>
  </div></main>;
}

export function StandardOnboarding({ port, t, back }: { readonly port: OnboardingPort; readonly t: Tokens; readonly back: (slug: string, email: string) => void }) {
  const view = useSyncExternalStore(port.subscribe, port.view, port.view);
  const [fields, setFields] = useState({ name: '', slug: '', ownerEmail: '', branchName: '', branchTimezone: '' });
  const [confirmed, setConfirmed] = useState(false);
  const [localFailure, setLocalFailure] = useState<OnboardingFailure | null>(null);
  const [dismissedFailure, setDismissedFailure] = useState<OnboardingFailure | null>(null);
  const manuallyNamed = useRef(false), submitting = useRef(false), mounted = useRef(true);
  const submissionEpoch = useRef(0), forgetSubmissionSecret = useRef<(() => void) | null>(null);
  const form = useRef<HTMLDivElement>(null), instance = useId();
  const password = useRef<HTMLInputElement>(null);
  const zones = useMemo(() => timezoneChoices(), []);
  const deviceZone = useMemo(() => deviceTimezoneChoice(zones), [zones]);
  const failure = localFailure ?? (view.failure === dismissedFailure ? null : view.failure);
  const uncertain = view.phase === 'uncertain' || failure?.reason === 'uncertain';
  const locked = view.busy || uncertain || view.phase === 'completed';
  const errorFor = (field: OnboardingField): string | null => failure?.reason === 'invalid' && failure.field === field ? invalidCopy[field] : failure?.reason === 'slug_taken' && field === 'slug' ? slugTakenCopy : null;
  const errorId = (field: OnboardingField): string => instance + '-' + field + '-error';
  const focusField = (field: OnboardingField): void => { const input = form.current?.querySelector('[name="' + field + '"]'); if (input instanceof HTMLElement) input.focus(); };
  const edited = (field: OnboardingField): void => {
    if (localFailure?.reason === 'invalid' && localFailure.field === field) setLocalFailure(null);
    if (view.failure?.reason === 'invalid' && view.failure.field === field) setDismissedFailure(view.failure);
    if (view.failure?.reason === 'slug_taken' && field === 'slug') setDismissedFailure(view.failure);
  };
  const update = (field: keyof typeof fields, value: string): void => {
    if (field === 'slug') manuallyNamed.current = true;
    setFields(old => ({ ...old, [field]: value, ...(field === 'name' && !manuallyNamed.current ? { slug: suggestBusinessSlug(value) } : {}) }));
    edited(field);
  };
  useEffect(() => { mounted.current = true; const input = password.current; return () => { mounted.current = false; submissionEpoch.current++; forgetSubmissionSecret.current?.(); forgetSubmissionSecret.current = null; if (input) input.value = ''; port.cancel(); }; }, [port]);
  useEffect(() => { if (!view.busy && failure?.reason === 'slug_taken') focusField('slug'); }, [view.busy, failure]);
  const submit = (): void => {
    if (locked || submitting.current || !confirmed) return;
    const parsed = onboardingInput({ ...fields, password: password.current?.value ?? '' });
    if (!parsed.ok) { setLocalFailure(parsed.failure); if (parsed.failure.reason === 'invalid') focusField(parsed.failure.field); return; }
    // Clear the DOM during dispatch. Restore only for an exact pre-commit refusal
    // in this same active submission; never publish a secret through state/view/storage.
    const epoch = ++submissionEpoch.current;
    let secretForSafeRefusal = parsed.value.password;
    const forget = (): void => { secretForSafeRefusal = ''; };
    forgetSubmissionSecret.current = forget;
    if (password.current) password.current.value = '';
    submitting.current = true; setLocalFailure(null); setDismissedFailure(null); setConfirmed(false);
    void port.submit(parsed.value, true).then(() => {
      if (!mounted.current || submissionEpoch.current !== epoch) return;
      const outcome = port.view();
      if (outcome.phase === 'failed' && outcome.failure?.reason === 'slug_taken') { if (password.current) password.current.value = secretForSafeRefusal; setConfirmed(false); }
      if (outcome.phase === 'completed' || outcome.phase === 'uncertain') { if (password.current) password.current.value = ''; setConfirmed(false); }
      if (outcome.failure?.reason === 'invalid') focusField(outcome.failure.field);
    }).catch(() => {
      // An unexpected rejection cannot authorize another creation attempt.
      if (!mounted.current || submissionEpoch.current !== epoch) return;
      if (password.current) password.current.value = '';
      setConfirmed(false); setLocalFailure({ reason: 'uncertain' });
    }).finally(() => { forget(); if (forgetSubmissionSecret.current === forget) forgetSubmissionSecret.current = null; if (submissionEpoch.current === epoch) submitting.current = false; });
  };
  const leave = (): void => { submissionEpoch.current++; forgetSubmissionSecret.current?.(); forgetSubmissionSecret.current = null; if (password.current) password.current.value = ''; port.cancel(); back(fields.slug, fields.ownerEmail); };
  const disabledReason = view.busy ? 'Создаём бизнес. Дождитесь ответа — повторно отправлять форму не нужно.' : view.phase === 'completed' ? 'Бизнес уже создан.' : !confirmed ? 'Чтобы включить кнопку «Создать бизнес», отметьте подтверждение выше.' : 'Проверьте данные и нажмите «Создать бизнес».';
  return <main style={{ position: 'absolute', inset: 0, overflowY: 'auto', boxSizing: 'border-box', padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)', background: t.bg, color: t.ink, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }}><div ref={form} role="form" aria-label="Создание бизнеса" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.target instanceof HTMLInputElement && event.target.type !== 'checkbox') { event.preventDefault(); submit(); } }} style={{ width: '100%', maxWidth: 440, minWidth: 0, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
    <h2 style={{ margin: 0 }}>Создать бизнес</h2>
    <p style={{ margin: 0, lineHeight: '22px' }}>Укажите данные бизнеса, первого филиала и владельца. CRM подключается отдельно.</p>
    {(['name', 'slug', 'branchName'] as const).map(key => <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{labels[key]}
      <input name={key} type="text" aria-label={labels[key]} aria-invalid={!!errorFor(key)} aria-describedby={errorId(key) + (key === 'slug' ? ' ' + instance + '-slug-help' : '')} required maxLength={key === 'slug' ? 100 : 200} pattern={key === 'slug' ? '[a-z0-9]+(-[a-z0-9]+)*' : undefined} value={fields[key]} disabled={locked} autoComplete="off" placeholder={key === 'slug' ? 'salon-name' : key === 'branchName' ? 'Например, Центральный' : undefined} onChange={event => update(key, event.target.value)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} />
      {key === 'slug' ? <span id={instance + '-slug-help'} style={{ fontSize: 14, lineHeight: '20px' }}>Предлагаем по названию; можно изменить. Латинские буквы, цифры и дефисы, например salon-name. Это имя для входа, не адрес улицы. Доступность проверит сервер.</span> : null}
      <span id={errorId(key)} style={{ fontSize: 14, lineHeight: '20px' }}>{errorFor(key)}</span>
    </label>)}
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{labels.branchTimezone}
      <select name="branchTimezone" aria-label={labels.branchTimezone} aria-invalid={!!errorFor('branchTimezone')} aria-describedby={instance + '-timezone-help ' + errorId('branchTimezone')} required value={fields.branchTimezone} disabled={locked} onChange={event => update('branchTimezone', event.target.value)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: t.bg, color: t.ink, fontSize: 16 }}>
        <option value="">Выберите город или часовой пояс</option>
        {zones.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
      </select>
      <span id={instance + '-timezone-help'} style={{ fontSize: 14, lineHeight: '20px' }}>Выберите место, где находится филиал. UTC-смещение показано на сегодня; сезонные изменения учитываются автоматически.</span>
      <span id={errorId('branchTimezone')} style={{ fontSize: 14, lineHeight: '20px' }}>{errorFor('branchTimezone')}</span>
    </label>
    {deviceZone && !uncertain ? <button type="button" disabled={locked} onClick={() => update('branchTimezone', deviceZone.value)} style={{ minHeight: 44, padding: '10px 14px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 14, lineHeight: '20px' }}>Если филиал в часовом поясе устройства: выбрать {deviceZone.label}</button> : null}
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>Email владельца<input name="ownerEmail" type="email" aria-label="Email владельца" aria-invalid={!!errorFor('ownerEmail')} aria-describedby={errorId('ownerEmail')} required maxLength={254} value={fields.ownerEmail} disabled={locked} autoComplete="email" onChange={event => update('ownerEmail', event.target.value)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} /><span id={errorId('ownerEmail')} style={{ fontSize: 14, lineHeight: '20px' }}>{errorFor('ownerEmail')}</span></label>
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>Пароль<input name="password" type="password" aria-label="Пароль нового владельца" aria-invalid={!!errorFor('password')} aria-describedby={instance + '-password-help ' + errorId('password')} required minLength={8} maxLength={1024} ref={password} disabled={locked} autoComplete="new-password" onChange={() => edited('password')} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} /><span id={instance + '-password-help'} style={{ fontSize: 14, lineHeight: '20px' }}>Не менее 8 символов, без пробелов по краям. Для входа понадобятся короткое имя бизнеса, email и этот пароль.</span><span id={errorId('password')} style={{ fontSize: 14, lineHeight: '20px' }}>{errorFor('password')}</span></label>
    {uncertain ? null : <>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minHeight: 44, lineHeight: '22px' }}><input name="confirmed" type="checkbox" checked={confirmed} disabled={locked} aria-describedby={instance + '-submit-help'} onChange={event => setConfirmed(event.target.checked)} style={{ width: 22, height: 22, flexShrink: 0, margin: 0, accentColor: MAYA_ACCENT }} />Создать этот бизнес и учётную запись на сервере MAYA</label>
      <button type="button" onClick={submit} disabled={locked || !confirmed} aria-describedby={instance + '-submit-help'} style={{ minHeight: 48, padding: '12px 18px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: MAYA_ACCENT, color: MAYA_ACCENT_ON, fontSize: 16 }}>{view.busy ? 'Создаём бизнес…' : 'Создать бизнес'}</button>
      <p id={instance + '-submit-help'} style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>{disabledReason}</p>
    </>}
    <OnboardingStatus view={{ ...view, ...(uncertain ? { phase: 'uncertain', busy: false } : {}), failure }} />
    <button type="button" style={{ minHeight: 48, padding: '12px 18px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} onClick={leave}>{view.busy && !uncertain ? 'Отменить и вернуться ко входу' : 'Перейти ко входу по паролю'}</button>
  </div></main>;
}

export function PasswordSignIn({ t, initialSlug = '', initialEmail = '', signIn, back }: {
  readonly t: Tokens; readonly initialSlug?: string; readonly initialEmail?: string;
  readonly signIn: (slug: string, email: string, password: string) => Promise<SignInOutcome>; readonly back: () => void;
}) {
  const [slug, setSlug] = useState(initialSlug), [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<SignInFailure | null>(null);
  const password = useRef<HTMLInputElement>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; const input = password.current; return () => { mounted.current = false; if (input) input.value = ''; }; }, []);
  const submit = (): void => {
    if (busy) return;
    const secret = password.current?.value ?? ''; if (password.current) password.current.value = '';
    setBusy(true); setFailure(null);
    void signIn(slug, email, secret).then(result => { if (mounted.current && result.step === 'failed') setFailure(result.failure); }).finally(() => { if (mounted.current) setBusy(false); });
  };
  return <main style={{ position: 'absolute', inset: 0, overflowY: 'auto', boxSizing: 'border-box', padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)', background: t.bg, color: t.ink, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }}><div style={{ width: '100%', maxWidth: 400, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
    <h2 style={{ margin: 0 }}>Вход по паролю</h2>
    <label>Короткое имя бизнеса для входа<input type="text" aria-label="Короткое имя бизнеса для входа" value={slug} disabled={busy} autoComplete="off" onChange={event => setSlug(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} /></label>
    <label>Email<input type="email" aria-label="Email" value={email} disabled={busy} autoComplete="username" onChange={event => setEmail(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} /></label>
    <label>Пароль<input type="password" aria-label="Пароль" ref={password} disabled={busy} autoComplete="current-password" style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} /></label>
    <button type="button" disabled={busy} style={{  minHeight: 48, padding: '12px 18px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: MAYA_ACCENT, color: MAYA_ACCENT_ON, fontSize: 16 }} onClick={submit}>{busy ? 'Входим…' : 'Войти'}</button>
    <p role="status">{failure ? failureSentence(failure) : null}</p>
    <button type="button" disabled={busy} style={{ minHeight: 48, padding: '12px 18px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} onClick={() => back()}>Другие способы входа</button>
  </div></main>;
}
