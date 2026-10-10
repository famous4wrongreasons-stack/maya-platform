// The signed-out surface.
//
// Presentation uses the same Aurora tokens, Maya mark and pill controls as the chat.
// Session and business selection remain owned by the shared runtime.
//
// Two paths, both the runtime's: hand this browser to Telegram for a chosen business, or a one-time
// code by email. The email path needs an `<input>`, which the carrier's closed tag set did not have
// — see the `input-type` ratchet, which admits one only with a literal type of text, email or
// password: the same three the shell's own `DomFactory.createInput` door allows, and no more.
//
// EMAIL_LOGIN_ENABLED is untouched. Whether a code may be sent is the server's answer, and when it
// says no the runtime returns `email_login_unavailable` and that sentence is what appears here.
//
// Everything decided here is decided by the runtime:
//   * the finder refuses a term under two characters BEFORE any request — this screen passes the
//     text through and renders what comes back, it does not pre-validate;
//   * `startTelegram` navigates away on success, so no caller may assume it still runs;
//   * a provider callback becomes a session only inside `completeTelegram`, which refuses anything
//     that does not name the login this app started.

import { useCallback, useEffect, useState } from 'react';
import type {
  BusinessChoice,
  BusinessMatch,
  FirstRunFailure,
  SignedOutReason,
  SignInFailure,
} from '../../../maya-chat-shell/src/net/types.ts';
import type { SignInStep, TelegramLanding } from '../../../maya-chat-shell/src/shell/ports.ts';
import { StandardOnboarding, PasswordSignIn } from './StandardOnboarding.tsx';
import { onboarding, session } from '../runtime/compose.ts';
import {
  failureSentence,
  firstRunSentence,
  SIGN_IN_TITLE,
  signedOutSentence,
} from '../runtime/copy.ts';
import { Backdrop } from '../identity/Backdrop.tsx';
import { MayaMark } from '../identity/MayaMark.tsx';
import { MAYA_ACCENT, MAYA_ACCENT_ON, type Tokens } from '../identity/tokens.ts';

const READING = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';

type Matches = readonly BusinessMatch[];
type Choices = readonly BusinessChoice[];
type Failure = FirstRunFailure | null;
type EmailFailure = SignInFailure | null;
type EmailPhase = 'email' | 'code' | 'business';

export function SignIn({
  t,
  reason = null,
}: {
  readonly t: Tokens;
  readonly reason?: SignedOutReason | null;
}) {
  const dark = t.dark;
  const [term, setTerm] = useState('');
  const [emailMode, setEmailMode] = useState(false);
  const [extraMode, setExtraMode] = useState<'signup' | 'password' | null>(null);
  const [recovery, setRecovery] = useState({ slug: '', email: '' });
  const [matches, setMatches] = useState<Matches>([]);
  const [failure, setFailure] = useState<Failure>(null);
  const [busy, setBusy] = useState(false);
  const [landing, setLanding] = useState<TelegramLanding>(() => session.landing());

  // The landing is a second, independent state machine: it is a state of being signed OUT, so it
  // is watched here rather than in the app root.
  useEffect(() => session.onLanding(setLanding), []);

  const find = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    void session
      .findBusinesses(term)
      .then((step) => {
        if (step.step === 'matches') setMatches(step.businesses);
        else {
          setMatches([]);
          setFailure(step.failure);
        }
      })
      .finally(() => setBusy(false));
  }, [busy, term]);

  const hand = useCallback((slug: string) => {
    setBusy(true);
    setFailure(null);
    void session
      .startTelegram(slug)
      // On `handed_off` the page is already navigating away; nothing may assume it still runs.
      .then((step) => {
        if (step.step === 'failed') {
          setFailure(step.failure);
          setBusy(false);
        }
      });
  }, []);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<EmailPhase>('email');
  const [choices, setChoices] = useState<Choices>([]);
  const [emailFailure, setEmailFailure] = useState<EmailFailure>(null);

  // Every branch below is the runtime's own answer, rendered. Nothing is pre-validated here: the
  // finder refuses a short term and `verifyEmail` refuses a bad code, each before any request, and
  // a screen that guessed first would eventually guess differently from the server.
  const settle = useCallback((step: SignInStep) => {
    if (step.step === 'code_sent') {
      setPhase('code');
      setEmailFailure(null);
      return;
    }
    if (step.step === 'select_business') {
      setChoices(step.businesses);
      setPhase('business');
      setEmailFailure(null);
      return;
    }
    if (step.step === 'failed') setEmailFailure(step.failure);
    // `signed_in` needs nothing: the session emits and the app root swaps the tree.
  }, []);

  const startEmail = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setEmailFailure(null);
    void session
      .startEmail(email)
      .then(settle)
      .finally(() => setBusy(false));
  }, [busy, email, settle]);

  const verify = useCallback(
    (slug: string | null) => {
      if (busy) return;
      setBusy(true);
      setEmailFailure(null);
      void session
        .verifyEmail(email, code, slug)
        .then(settle)
        .finally(() => setBusy(false));
    },
    [busy, code, email, settle],
  );

  const sentence =
    landing.state === 'failed'
      ? firstRunSentence(landing.failure)
      : failure !== null
        ? firstRunSentence(failure)
        : emailFailure !== null
          ? failureSentence(emailFailure)
          : signedOutSentence(reason);

  if (extraMode === 'signup') return <StandardOnboarding port={onboarding} t={t} back={(slug, address) => { setRecovery({ slug, email: address }); setExtraMode('password'); }} />;
  if (extraMode === 'password') return <PasswordSignIn t={t} initialSlug={recovery.slug} initialEmail={recovery.email} signIn={session.signInPassword} back={() => setExtraMode(null)} />;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: t.bg }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Backdrop t={t} />
      </div>

      <main
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)',
          boxSizing: 'border-box',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <div style={{ width: '100%', maxWidth: 400, margin: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: t.ink }}>
          <MayaMark size={40} />
          <h2
            style={{
              margin: 0,
              fontFamily: READING,
              fontWeight: 500,
              fontSize: 28,
              letterSpacing: '-0.01em',
              color: t.ink,
            }}
          >
            {SIGN_IN_TITLE}
          </h2>
        </div>

        <p style={{ margin: '0 0 10px', fontFamily: READING, fontSize: 16, lineHeight: '24px', color: t.ink, opacity: 0.62 }}>
          {emailMode ? 'Получите код для входа на вашу почту.' : 'Найдите свой салон и продолжите через Telegram.'}
        </p>

        {landing.state === 'running' ? (
          <p style={{ margin: 0, fontFamily: READING, fontSize: 16, lineHeight: '22px', color: t.ink }}>
            Заканчиваем вход…
          </p>
        ) : (
          <>
            {!emailMode ? <>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontFamily: READING,
                fontSize: 13,
                lineHeight: '18px',
                color: dark ? 'rgba(244,240,235,0.62)' : 'rgba(11,11,12,0.62)',
              }}
            >
              Название салона
              {/* A <textarea>, because `input` is outside the closed tag set. Disclosed above. */}
              <textarea
                rows={1}
                value={term}
                aria-label="Название салона"
                autoComplete="off"
                enterKeyHint="search"
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                  if (event.key !== 'Enter' || event.shiftKey) return;
                  event.preventDefault();
                  find();
                }}
                style={{
                  width: '100%',
                  height: 52,
                  boxSizing: 'border-box',
                  padding: '13px 15px',
                  margin: 0,
                  resize: 'none',
                  overflow: 'hidden',
                  borderRadius: 24,
                  border: '1px solid ' + (dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'),
                  background: dark ? 'rgba(18,18,20,0.9)' : 'rgba(252,249,244,0.9)',
                  fontFamily: READING,
                  fontSize: 16,
                  lineHeight: '20px',
                  color: t.ink,
                  outline: 'none',
                }}
              />
            </label>

            <button
              type="button"
              aria-disabled={busy}
              onClick={() => find()}
              style={{
                height: 52,
                borderRadius: 24,
                border: '0',
                background: MAYA_ACCENT,
                color: MAYA_ACCENT_ON,
                fontFamily: READING,
                fontSize: 16,
                fontWeight: 500,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.55 : 1,
              }}
            >
              Найти салон
            </button>

            {matches.length > 0 ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {matches.map((match) => (
                  <li key={match.slug}>
                    <button
                      type="button"
                      aria-disabled={busy}
                      onClick={() => hand(match.slug)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '13px 15px',
                        borderRadius: 24,
                        border: '1px solid ' + (dark ? 'rgba(244,240,235,0.18)' : 'rgba(24,22,15,0.14)'),
                        background: 'transparent',
                        color: t.ink,
                        fontFamily: READING,
                        fontSize: 16,
                        lineHeight: '20px',
                        cursor: busy ? 'default' : 'pointer',
                      }}
                    >
                      {match.name}
                      <span style={{ display: 'block', fontSize: 13, color: MAYA_ACCENT, marginTop: 4 }}>Продолжить через Telegram →</span>
                      {match.address === null ? null : (
                        <span
                          style={{
                            display: 'block',
                            marginTop: 3,
                            fontSize: 12,
                            lineHeight: '16px',
                            color: dark ? 'rgba(244,240,235,0.52)' : 'rgba(11,11,12,0.52)',
                          }}
                        >
                          {match.address}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            </> : null}
            <button type="button" aria-disabled={busy} onClick={() => { if (!busy) setEmailMode(!emailMode); }}
              style={{ minHeight: 48, borderRadius: 26, border: '1px solid ' + (dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'), background: 'transparent', color: t.ink, fontFamily: READING, fontSize: 16, cursor: 'pointer' }}>
              {emailMode ? 'Найти салон вместо этого' : 'Войти по email'}
            </button>

            {emailMode ? <>
            {phase === 'business' ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {choices.map((choice) => (
                  <li key={choice.slug}>
                    <button
                      type="button"
                      aria-disabled={busy}
                      onClick={() => verify(choice.slug)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '13px 15px',
                        borderRadius: 24,
                        border: '1px solid ' + (dark ? 'rgba(244,240,235,0.18)' : 'rgba(24,22,15,0.14)'),
                        background: 'transparent',
                        color: t.ink,
                        fontFamily: READING,
                        fontSize: 16,
                        lineHeight: '20px',
                        cursor: busy ? 'default' : 'pointer',
                      }}
                    >
                      {choice.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : phase === 'code' ? (
              <>
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    fontFamily: READING,
                    fontSize: 13,
                    lineHeight: '18px',
                    color: dark ? 'rgba(244,240,235,0.62)' : 'rgba(11,11,12,0.62)',
                  }}
                >
                  Код из письма
                  <input
                    type="text"
                    value={code}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    enterKeyHint="go"
                    aria-label="Код из письма"
                    onChange={(event) => setCode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      verify(null);
                    }}
                    style={{
                  width: '100%',
                  height: 52,
                  boxSizing: 'border-box',
                  padding: '13px 15px',
                  margin: 0,
                  borderRadius: 24,
                  border: '1px solid ' + (dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'),
                  background: dark ? 'rgba(18,18,20,0.9)' : 'rgba(252,249,244,0.9)',
                  fontFamily: READING,
                  fontSize: 16,
                  lineHeight: '20px',
                  color: t.ink,
                  outline: 'none',
                    }}
                  />
                </label>
                <button
                  type="button"
                  aria-disabled={busy}
                  onClick={() => verify(null)}
                  style={{
                    height: 52,
                    borderRadius: 24,
                    border: '0',
                    background: MAYA_ACCENT,
                    color: MAYA_ACCENT_ON,
                    fontFamily: READING,
                    fontSize: 16,
                    fontWeight: 500,
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy ? 0.55 : 1,
                  }}
                >
                  Войти
                </button>
              </>
            ) : (
              <>
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    fontFamily: READING,
                    fontSize: 13,
                    lineHeight: '18px',
                    color: dark ? 'rgba(244,240,235,0.62)' : 'rgba(11,11,12,0.62)',
                  }}
                >
                  Вход по коду на email
                  <input
                    type="email"
                    value={email}
                    autoComplete="email"
                    enterKeyHint="go"
                    aria-label="Email"
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      startEmail();
                    }}
                    style={{
                  width: '100%',
                  height: 52,
                  boxSizing: 'border-box',
                  padding: '13px 15px',
                  margin: 0,
                  borderRadius: 24,
                  border: '1px solid ' + (dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'),
                  background: dark ? 'rgba(18,18,20,0.9)' : 'rgba(252,249,244,0.9)',
                  fontFamily: READING,
                  fontSize: 16,
                  lineHeight: '20px',
                  color: t.ink,
                  outline: 'none',
                    }}
                  />
                </label>
                <button
                  type="button"
                  aria-disabled={busy}
                  onClick={() => startEmail()}
                  style={{
                    height: 52,
                    borderRadius: 24,
                    border: '1px solid ' + (dark ? 'rgba(244,240,235,0.22)' : 'rgba(24,22,15,0.16)'),
                    background: 'transparent',
                    color: t.ink,
                    fontFamily: READING,
                    fontSize: 16,
                    fontWeight: 500,
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy ? 0.55 : 1,
                  }}
                >
                  Получить код
                </button>
              </>
            )}
            </> : null}
          </>
        )}

        <button type="button" disabled={busy || landing.state === 'running'} onClick={() => setExtraMode('password')} style={{ minHeight: 48, borderRadius: 24, background: 'transparent', color: t.ink, fontSize: 16 }}>Войти по паролю</button>
        <button type="button" disabled={busy || landing.state === 'running'} onClick={() => setExtraMode('signup')} style={{ minHeight: 48, borderRadius: 24, background: 'transparent', color: t.ink, fontSize: 16 }}>Создать бизнес</button>
        {sentence === null ? null : (
          <p
            role="status"
            style={{
              margin: 0,
              fontFamily: READING,
              fontSize: 13,
              lineHeight: '19px',
              color: dark ? 'rgba(244,240,235,0.68)' : 'rgba(11,11,12,0.68)',
            }}
          >
            {sentence}
          </p>
        )}
        </div>
      </main>
    </div>
  );
}
