// K5 — the signed-out state of the root screen (SHELL-PLAN v2.1 §1.3, §1.4; R2 default, V2-6,
// V2-16; owner rulings SH-04 and A6).
//
// Sign-in is not a route, not a nav entry and not a hand-off to another login page: it is what the
// root screen shows while no session exists. Two paths share one email field:
//
//   code       email → «Получить код» → code → «Войти по коду» → (several businesses) choose one →
//              the re-verify echoes that business's opaque slug
//   password   a REQUIRED business address (sent as tenantSlug, V2-6) + email + password
//
// Every outcome is a named state (V2-16, K5/G12 "silent login failures 0"): a sentence, polite and
// never `role="alert"`, with focus moved to the field in error or to the path's first control, and
// the form keeping what was typed except the password and the code. A rate limit counts down and
// holds its submitting control until the time is up. A mistyped business address — which the server
// answers with a 404 — is the same «never says which» state as a wrong password.
//
// The session lives in memory only (A6): nothing here reads or writes a store, and a reload shows
// this state again.

import type {
  BusinessChoice,
  Cancel,
  DomFactory,
  Scheduler,
  SessionPort,
  SignedOutReason,
  SignInFailure,
  SignInStep,
} from '../shell/ports.ts';

export interface SignInMount {
  readonly factory: DomFactory;
  readonly container: HTMLElement;
  readonly session: SessionPort;
  readonly scheduler: Pick<Scheduler, 'now' | 'after'>;
}

export interface SignIn {
  /** The state's heading: focus lands here when a session has just ended. */
  readonly heading: HTMLElement;
  readonly cancel: Cancel;
}

type Path = 'code' | 'password';
type Phase = 'email' | 'code' | 'business';
type Field = Extract<SignInFailure, { readonly state: 'field_invalid' }>['field'];

// ── copy (§1.4 sign-in table) ──────────────────────────────────────────────────────────────────

export const SIGN_IN_TITLE = 'Вход в MAYA';

export const rateLimitSentence = (seconds: number): string => `Слишком много попыток — повторите через ${seconds} с`;

/** The named state of every failure but the countdown, the field states and the retryable ones. */
export const failureSentence = (failure: SignInFailure): string => {
  switch (failure.state) {
    case 'rate_limited':
      return rateLimitSentence(failure.retryAfterSec);
    case 'code_attempts_exhausted':
      return 'Слишком много попыток ввода кода — запросите новый код';
    case 'email_login_unavailable':
      return 'Вход по коду сейчас недоступен — войдите по паролю';
    case 'code_invalid':
      return 'Код не подошёл — проверьте и введите ещё раз';
    case 'code_expired':
      return 'Код устарел — запросите новый';
    case 'email_not_linked':
      return 'Этот email не связан с пользователем выбранного бизнеса';
    case 'credentials_invalid':
      // Never says which of the three was wrong — also for an address that names no business (404) and
      // for an account whose business does not accept sign-in now (403, answered before the password
      // is checked). The second clause keeps that last case truthful without confirming an account.
      return 'Неверный адрес бизнеса, email или пароль — или вход сейчас недоступен';
    case 'account_unavailable':
      return 'Вход для этой учётной записи сейчас недоступен';
    case 'field_invalid':
      return fieldSentence(failure.field);
    case 'no_connection':
      return 'Нет связи — повторить';
    case 'unexpected_response':
      return 'Вход не удался — повторить';
  }
};

/** The field sentence, the same before sending and after a server validation 400. */
export const fieldSentence = (field: Field): string => {
  switch (field) {
    case 'email':
      return 'Введите email полностью, например name@example.ru';
    case 'password':
      return 'Пароль — не короче 8 символов';
    case 'code':
      return 'Введите цифры из письма: от 4 до 8';
    case 'business':
      return 'Введите адрес бизнеса';
  }
};

/** Why the session ended, when it did. A fresh load has no reason and shows none. */
export const signedOutSentence = (reason: SignedOutReason | null): string | null => {
  switch (reason) {
    case null:
      return null;
    case 'signed_out':
      return 'Вы вышли из MAYA.';
    case 'session_expired':
      return 'Сессия истекла — войдите снова.';
    case 'refresh_token_reused':
      return 'Сессия завершена ради безопасности — войдите снова.';
    case 'refresh_token_invalid':
    case 'session_revoked':
      return 'Сессия завершена — войдите снова.';
  }
};

// ── the state ──────────────────────────────────────────────────────────────────────────────────

let serial = 0;

export function mountSignIn(mount: SignInMount): SignIn {
  const { factory, session, scheduler } = mount;
  serial += 1;
  const id = (name: string): string => `maya-signin-${name}-${serial}`;

  const button = (text: string, className: string): HTMLButtonElement => {
    const b = factory.create('button');
    b.type = 'button';
    b.classList.add('signin-button', className);
    b.textContent = text;
    return b;
  };
  const note = (className: string, text = ''): HTMLParagraphElement => {
    const p = factory.create('p');
    p.classList.add(className);
    p.textContent = text;
    return p;
  };

  interface FieldParts {
    readonly wrap: HTMLElement;
    readonly input: HTMLInputElement;
    readonly error: HTMLParagraphElement;
  }
  /** Each path's named state lives in its own group, next to where focus lands. */
  interface PathLines {
    readonly status: HTMLParagraphElement;
    readonly countdown: HTMLParagraphElement;
  }
  const pathLines = (name: Path): PathLines => {
    const status = note('signin-status');
    status.id = id(`${name}-status`);
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    // The countdown ticks outside the live region, so it is not re-announced every second.
    const countdown = note('signin-countdown');
    countdown.id = id(`${name}-countdown`);
    return { status, countdown };
  };
  const codeLines = pathLines('code');
  const passwordLines = pathLines('password');
  const linesOf = (path: Path): PathLines => (path === 'code' ? codeLines : passwordLines);

  const field = (name: string, labelText: string, input: HTMLInputElement, hintText: string | null, path: Path): FieldParts => {
    const wrap = factory.create('div');
    wrap.classList.add('signin-field');
    input.id = id(name);
    input.classList.add('signin-input');
    const label = factory.create('label');
    label.htmlFor = input.id;
    label.classList.add('signin-label');
    label.textContent = labelText;
    const error = note('signin-error');
    error.id = id(`${name}-error`);
    error.hidden = true;
    const described = [error.id, linesOf(path).status.id, linesOf(path).countdown.id];
    wrap.append(label, input);
    if (hintText !== null) {
      const hint = note('signin-hint', hintText);
      hint.id = id(`${name}-hint`);
      described.unshift(hint.id);
      wrap.append(hint);
    }
    wrap.append(error);
    input.setAttribute('aria-describedby', described.join(' '));
    return { wrap, input, error };
  };

  // ── skeleton ──
  const section = factory.create('section');
  section.classList.add('signin');
  const heading = factory.create('h2');
  heading.id = id('title');
  heading.classList.add('signin-title');
  heading.tabIndex = -1;
  heading.textContent = SIGN_IN_TITLE;
  section.setAttribute('aria-labelledby', heading.id);

  const reasonLine = note('signin-reason');

  const email = field('email', 'Email', factory.createInput('email'), null, 'code');
  email.input.autocomplete = 'email';
  email.input.inputMode = 'email';
  email.input.spellcheck = false;
  email.input.autocapitalize = 'off';

  // code path
  const codeGroup = factory.create('div');
  codeGroup.classList.add('signin-group', 'signin-group--code');
  codeGroup.setAttribute('role', 'group');
  const codeTitle = factory.create('h3');
  codeTitle.id = id('code-title');
  codeTitle.classList.add('signin-group-title');
  codeTitle.textContent = 'Вход по коду из письма';
  codeGroup.setAttribute('aria-labelledby', codeTitle.id);

  const emailStep = factory.create('div');
  emailStep.classList.add('signin-step');
  const getCode = button('Получить код', 'signin-button--primary');
  emailStep.append(note('signin-note', 'Пришлём одноразовый код на этот email.'), getCode);

  const codeStep = factory.create('div');
  codeStep.classList.add('signin-step');
  const sentTo = note('signin-note');
  const code = field('code', 'Код из письма', factory.createInput('text'), null, 'code');
  code.input.inputMode = 'numeric';
  code.input.autocomplete = 'one-time-code';
  const verify = button('Войти по коду', 'signin-button--primary');
  const resend = button('Запросить новый код', 'signin-button--secondary');
  const codeActions = factory.create('div');
  codeActions.classList.add('signin-actions');
  codeActions.append(verify, resend);
  codeStep.append(sentTo, code.wrap, codeActions);

  const businessStep = factory.create('div');
  businessStep.classList.add('signin-step');
  const businessList = factory.create('ul');
  businessList.classList.add('signin-businesses');
  const resendFromBusiness = button('Запросить новый код', 'signin-button--secondary');
  businessStep.append(note('signin-note', 'Этот email связан с несколькими бизнесами — выберите, в какой войти.'), businessList, resendFromBusiness);

  codeGroup.append(codeTitle, codeLines.status, codeLines.countdown, emailStep, codeStep, businessStep);

  // password path
  const passwordGroup = factory.create('div');
  passwordGroup.classList.add('signin-group', 'signin-group--password');
  passwordGroup.setAttribute('role', 'group');
  const passwordTitle = factory.create('h3');
  passwordTitle.id = id('password-title');
  passwordTitle.classList.add('signin-group-title');
  passwordTitle.textContent = 'Вход по паролю';
  passwordGroup.setAttribute('aria-labelledby', passwordTitle.id);
  const business = field('business', 'Адрес бизнеса', factory.createInput('text'), 'Короткое имя бизнеса в MAYA — его сообщает администратор', 'password');
  business.input.autocomplete = 'off';
  business.input.spellcheck = false;
  business.input.autocapitalize = 'off';
  const password = field('password', 'Пароль', factory.createInput('password'), null, 'password');
  password.input.autocomplete = 'current-password';
  const signInWithPassword = button('Войти по паролю', 'signin-button--primary');
  passwordGroup.append(passwordTitle, passwordLines.status, passwordLines.countdown, business.wrap, password.wrap, signInWithPassword);

  section.append(heading, reasonLine, email.wrap, codeGroup, passwordGroup);
  mount.container.append(section);

  // ── state ──
  let phase: Phase = 'email';
  let busy = false;
  let disposed = false;
  let heldCode = '';
  let businesses: readonly BusinessChoice[] = [];
  let businessButtons: HTMLButtonElement[] = [];
  /** A running countdown per path; while it runs, that path sends nothing. */
  let codeLock: Cancel | null = null;
  let passwordLock: Cancel | null = null;
  const lockOf = (path: Path): Cancel | null => (path === 'code' ? codeLock : passwordLock);
  const setLock = (path: Path, cancel: Cancel | null): void => {
    if (path === 'code') codeLock = cancel;
    else passwordLock = cancel;
  };

  const reason = session.view();
  const reasonText = reason.signedIn ? null : signedOutSentence(reason.reason);
  reasonLine.hidden = reasonText === null;
  reasonLine.textContent = reasonText ?? '';

  const setDisabled = (el: HTMLElement, disabled: boolean): void => {
    if (disabled) el.setAttribute('aria-disabled', 'true');
    else el.removeAttribute('aria-disabled');
  };
  const locked = (path: Path): boolean => lockOf(path) !== null;

  const paint = (): void => {
    emailStep.hidden = phase !== 'email';
    codeStep.hidden = phase !== 'code';
    businessStep.hidden = phase !== 'business';
    const codeHeld = busy || locked('code');
    for (const b of [getCode, verify, resend, resendFromBusiness, ...businessButtons]) setDisabled(b, codeHeld);
    setDisabled(signInWithPassword, busy || locked('password'));
    if (busy) section.setAttribute('aria-busy', 'true');
    else section.removeAttribute('aria-busy');
  };

  const setStatus = (path: Path, ...parts: (string | HTMLElement)[]): void => {
    linesOf(path).status.replaceChildren(...parts);
  };

  /** A new attempt supersedes every earlier state, except a countdown still running. */
  const clearStates = (): void => {
    for (const f of [email, code, business, password]) {
      f.input.removeAttribute('aria-invalid');
      f.error.hidden = true;
      f.error.textContent = '';
    }
    for (const path of ['code', 'password'] as const) if (!locked(path)) setStatus(path);
  };

  const partsOf = (name: Field): FieldParts => {
    switch (name) {
      case 'email':
        return email;
      case 'password':
        return password;
      case 'code':
        return code;
      case 'business':
        return business;
    }
  };

  const drawBusinesses = (): void => {
    businessButtons = businesses.map((choice) => {
      const b = button(choice.name, 'signin-business');
      const slug = choice.slug;
      b.addEventListener('click', () => act('code', () => session.verifyEmail(email.input.value, heldCode, slug), 'Входим…'));
      return b;
    });
    businessList.replaceChildren(
      ...businessButtons.map((b) => {
        const li = factory.create('li');
        li.append(b);
        return li;
      }),
    );
  };

  const startCountdown = (path: Path, seconds: number): void => {
    lockOf(path)?.();
    const { countdown } = linesOf(path);
    const until = scheduler.now() + Math.max(1, seconds) * 1000;
    const tick = (first: boolean): void => {
      const left = Math.ceil((until - scheduler.now()) / 1000);
      if (left <= 0) {
        setLock(path, null);
        countdown.textContent = '';
        setStatus(path, 'Можно попробовать снова.');
        paint();
        return;
      }
      // The first sentence is announced once; the ticks after it update the countdown line only.
      if (first) setStatus(path, rateLimitSentence(left));
      else {
        setStatus(path);
        countdown.textContent = rateLimitSentence(left);
      }
      const wait = Math.max(1, until - scheduler.now() - (left - 1) * 1000);
      setLock(path, scheduler.after(Math.min(1000, wait), () => tick(false)));
      paint();
    };
    tick(true);
  };

  const retryButton = (again: () => void): HTMLButtonElement => {
    const b = button('повторить', 'signin-retry');
    b.setAttribute('aria-label', 'Повторить вход');
    b.addEventListener('click', again);
    return b;
  };

  /** Settle a failure into its named state; returns where focus goes. */
  const fail = (failure: SignInFailure, path: Path, again: () => void): HTMLElement => {
    const passwordKept = failure.state === 'field_invalid' && (failure.field === 'business' || failure.field === 'email');
    if (path === 'password' && !passwordKept) password.input.value = '';
    const firstOf = path === 'code' ? email.input : business.input;
    switch (failure.state) {
      case 'rate_limited':
        startCountdown(path, failure.retryAfterSec);
        return firstOf;
      case 'code_attempts_exhausted':
      case 'code_expired':
        code.input.value = '';
        phase = 'code';
        setStatus(path, failureSentence(failure));
        return resend;
      case 'code_invalid':
        code.input.value = '';
        phase = 'code';
        setStatus(path, failureSentence(failure));
        return code.input;
      case 'email_login_unavailable':
        // The remedy is the password path: the sentence stands where focus goes.
        phase = 'email';
        setStatus('password', failureSentence(failure));
        return business.input;
      case 'email_not_linked':
        code.input.value = '';
        phase = 'email';
        setStatus(path, failureSentence(failure));
        return email.input;
      case 'credentials_invalid':
        setStatus(path, failureSentence(failure));
        return business.input;
      case 'account_unavailable':
        setStatus(path, failureSentence(failure));
        return firstOf;
      case 'field_invalid': {
        const parts = partsOf(failure.field);
        if (failure.field === 'code') {
          code.input.value = '';
          phase = 'code';
        }
        parts.input.setAttribute('aria-invalid', 'true');
        parts.error.textContent = fieldSentence(failure.field);
        parts.error.hidden = false;
        return parts.input;
      }
      case 'no_connection': {
        const retry = retryButton(again);
        setStatus(path, 'Нет связи — ', retry);
        return retry;
      }
      case 'unexpected_response': {
        const retry = retryButton(again);
        setStatus(path, 'Вход не удался — ', retry);
        return retry;
      }
    }
  };

  /** One attempt: busy while it runs, then a named state. Nothing is sent while held or busy. */
  async function act(path: Path, run: () => Promise<SignInStep>, pendingText: string): Promise<void> {
    if (busy || disposed || locked(path)) return;
    const again = (): void => void act(path, run, pendingText);
    clearStates();
    busy = true;
    setStatus(path, pendingText);
    paint();
    let step: SignInStep;
    try {
      step = await run();
    } catch {
      step = { step: 'failed', failure: { state: 'no_connection' } };
    }
    busy = false;
    if (disposed) return;
    setStatus(path);
    let focus: HTMLElement | null = null;
    switch (step.step) {
      case 'code_sent':
        phase = 'code';
        code.input.value = '';
        sentTo.textContent = `Код отправлен на ${email.input.value.trim()}.`;
        setStatus(path, 'Код отправлен.');
        focus = code.input;
        break;
      case 'select_business':
        phase = 'business';
        heldCode = code.input.value.trim();
        businesses = step.businesses;
        drawBusinesses();
        setStatus(path, 'Выберите бизнес.');
        focus = businessButtons.at(0) ?? email.input;
        break;
      case 'signed_in':
        setStatus(path, 'Вход выполнен.');
        break;
      case 'failed':
        focus = fail(step.failure, path, again);
        break;
    }
    paint();
    focus?.focus();
  }

  const startCode = (): void => void act('code', () => session.startEmail(email.input.value), 'Отправляем код…');
  const verifyCode = (): void => void act('code', () => session.verifyEmail(email.input.value, code.input.value, null), 'Проверяем код…');
  const passwordSignIn = (): void =>
    void act('password', () => session.signInPassword(business.input.value, email.input.value, password.input.value), 'Входим…');

  const onEnter = (input: HTMLInputElement, run: () => void): void => {
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      run();
    });
  };
  onEnter(email.input, startCode);
  onEnter(code.input, verifyCode);
  onEnter(business.input, passwordSignIn);
  onEnter(password.input, passwordSignIn);
  getCode.addEventListener('click', startCode);
  resend.addEventListener('click', startCode);
  resendFromBusiness.addEventListener('click', startCode);
  verify.addEventListener('click', verifyCode);
  signInWithPassword.addEventListener('click', passwordSignIn);

  paint();

  return {
    heading,
    cancel: () => {
      disposed = true;
      for (const path of ['code', 'password'] as const) {
        lockOf(path)?.();
        setLock(path, null);
      }
      section.remove();
    },
  };
}
