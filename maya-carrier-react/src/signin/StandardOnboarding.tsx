import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { OnboardingFailure, OnboardingPort, OnboardingView, SignInFailure } from '../../../maya-chat-shell/src/net/types.ts';
import type { SignInOutcome } from '../../../maya-chat-shell/src/net/session.ts';
import { failureSentence } from '../runtime/copy.ts';
import { MAYA_ACCENT, MAYA_ACCENT_ON, type Tokens } from '../identity/tokens.ts';

const labels = { name: 'Название бизнеса', slug: 'Адрес бизнеса для входа', ownerEmail: 'Email владельца', password: 'Пароль', branchName: 'Название филиала', branchTimezone: 'Часовой пояс филиала' };
export function onboardingSentence(failure: OnboardingFailure | null): string | null {
  if (!failure) return null;
  if (failure.reason === 'invalid') return failure.field === 'password' ? 'Пароль: не менее 8 символов, без пробелов в начале и конце.' : `Проверьте поле «${labels[failure.field]}».`;
  if (failure.reason === 'uncertain') return 'Создание бизнеса не подтверждено: ответ мог потеряться после сохранения. Не создавайте бизнес повторно. Попробуйте войти с выбранными адресом бизнеса, email и паролем.';
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
  const password = useRef<HTMLInputElement>(null);
  useEffect(() => { const input = password.current; return () => { if (input) input.value = ''; port.cancel(); }; }, [port]);
  const locked = view.busy || view.phase === 'uncertain' || view.phase === 'completed';
  const submit = (): void => {
    if (locked || !confirmed) return;
    const secret = password.current?.value ?? '';
    if (password.current) password.current.value = '';
    setConfirmed(false);
    void port.submit({ ...fields, password: secret }, true);
  };
  const leave = (): void => { if (password.current) password.current.value = ''; port.cancel(); back(fields.slug, fields.ownerEmail); };
  return <main style={{ position: 'absolute', inset: 0, overflowY: 'auto', boxSizing: 'border-box', padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)', background: t.bg, color: t.ink, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }}><div style={{ width: '100%', maxWidth: 400, margin: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
    <h2 style={{ margin: 0 }}>Создать бизнес</h2>
    <p>Будет создан бизнес MAYA, первый филиал и учётная запись владельца. CRM подключается отдельно.</p>
    {(['name', 'slug', 'branchName', 'branchTimezone'] as const).map(key => <label key={key}>{labels[key]}
      <input type="text" aria-label={labels[key]} value={fields[key]} disabled={locked} autoComplete="off" placeholder={key === 'slug' ? 'salon-name' : key === 'branchTimezone' ? 'Europe/Moscow' : undefined} onChange={event => setFields(old => ({ ...old, [key]: event.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} />
    </label>)}
    <label>Email владельца<input type="email" aria-label="Email владельца" value={fields.ownerEmail} disabled={locked} autoComplete="email" onChange={event => setFields(old => ({ ...old, ownerEmail: event.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} /></label>
    <label>Пароль<input type="password" aria-label="Пароль нового владельца" ref={password} disabled={locked} autoComplete="new-password" style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} /></label>
    <p>Пароль — не менее 8 символов, без пробелов по краям. Сохраните выбранный адрес бизнеса: он нужен для входа вместе с email и паролем.</p>
    {view.phase === 'uncertain' ? null : <>
      <button type="button" role="checkbox" aria-checked={confirmed} disabled={locked} style={{ minHeight: 48, padding: '12px 18px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} onClick={() => setConfirmed(value => !value)}>Создать этот бизнес и учётную запись на сервере MAYA</button>
      <button type="button" disabled={locked || !confirmed} style={{  minHeight: 48, padding: '12px 18px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: MAYA_ACCENT, color: MAYA_ACCENT_ON, fontSize: 16 }} onClick={submit}>Создать бизнес</button>
    </>}
    <OnboardingStatus view={view} />
    <button type="button" style={{ minHeight: 48, padding: '12px 18px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} onClick={leave}>{view.busy ? 'Отменить и вернуться ко входу' : 'Перейти ко входу по паролю'}</button>
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
    <label>Адрес бизнеса<input type="text" aria-label="Адрес бизнеса" value={slug} disabled={busy} autoComplete="off" onChange={event => setSlug(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} /></label>
    <label>Email<input type="email" aria-label="Email" value={email} disabled={busy} autoComplete="username" onChange={event => setEmail(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} /></label>
    <label>Пароль<input type="password" aria-label="Пароль" ref={password} disabled={busy} autoComplete="current-password" style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} /></label>
    <button type="button" disabled={busy} style={{  minHeight: 48, padding: '12px 18px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: MAYA_ACCENT, color: MAYA_ACCENT_ON, fontSize: 16 }} onClick={submit}>{busy ? 'Входим…' : 'Войти'}</button>
    <p role="status">{failure ? failureSentence(failure) : null}</p>
    <button type="button" disabled={busy} style={{ minHeight: 48, padding: '12px 18px', borderRadius: 24, border: '1px solid ' + (t.dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontSize: 16 }} onClick={() => back()}>Другие способы входа</button>
  </div></main>;
}
