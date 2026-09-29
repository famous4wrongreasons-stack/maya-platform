// K5 — the signed-out state of the root screen (SHELL-PLAN v2.1 §1.3, §1.4; R2 default, V2-6,
// V2-16; owner rulings SH-04 and A6; owner decision 2026-09-29 «OPTION B — TELEGRAM-FIRST»).
//
// The first run asks one question a person can answer — which business is yours — and then offers
// the one sign-in that works:
//
//   find       «Найдите свой бизнес» → name or city → the matches, each shown as its name and its
//              address → choose one
//   Telegram   «Продолжить с Telegram» hands this browser to the provider. The chosen business is
//              carried as an opaque handle the screen never shows and never asks anyone to type.
//   password   under «Другой способ входа», for the same chosen business: email and password only.
//
// Sign-in by email code is NOT offered. The capability is switched off on the server, and a control
// that always answers «недоступно» is a worse lie than no control at all; the failure taxonomy for
// it stays here, because the server may still name those states.
//
// Nothing asks for a business ADDRESS, a slug or any other internal handle: the finder supplies it.
// The address shown beside a match is the salon's street address, which is how a person tells two
// businesses of the same name apart.
//
// Every outcome is a named state (V2-16, K5/G12 "silent login failures 0"): a sentence, polite and
// never `role="alert"`, with focus moved to the field in error or to the path's first control, and
// the form keeping what was typed except the password. A rate limit counts down and holds its
// submitting control until the time is up.
//
// The session lives in memory only (A6): nothing here reads or writes a store, and a reload shows
// this state again.

import type {
  BusinessMatch,
  Cancel,
  FirstRunFailure,
  Scheduler,
  SessionPort,
  SignInFailure,
  SignInStep,
  SignedOutReason,
  TelegramLanding,
} from '../shell/ports.ts';
import type { DomFactory } from '../shell/dom-port.ts';

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

/** The two things that can be held by a countdown: finding a business, and signing in. */
type Path = 'find' | 'password';
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
      return 'Вход по коду сейчас недоступен — войдите через Telegram';
    case 'code_invalid':
      return 'Код не подошёл — проверьте и введите ещё раз';
    case 'code_expired':
      return 'Код устарел — запросите новый';
    case 'email_not_linked':
      return 'Этот email не связан с пользователем выбранного бизнеса';
    case 'credentials_invalid':
      // Never says which of the two was wrong — also for an account whose business does not accept
      // sign-in now (403, answered before the password is checked). The second clause keeps that
      // case truthful without confirming an account.
      return 'Неверный email или пароль — или вход сейчас недоступен';
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

/** The first run's own outcomes: finding a business, and being handed to Telegram. */
export const firstRunSentence = (failure: FirstRunFailure): string => {
  switch (failure.state) {
    case 'term_too_short':
      return 'Введите хотя бы два символа';
    case 'rate_limited':
      return rateLimitSentence(failure.retryAfterSec);
    case 'telegram_unavailable':
      return 'Вход через Telegram сейчас недоступен';
    case 'business_unavailable':
      return 'Этот бизнес сейчас не принимает вход';
    case 'callback_unsolicited':
      // Says what to do without describing the attack, and without implying the person did wrong.
      return 'Этот вход начали не здесь — начните заново';
    case 'login_expired':
      return 'Вход устарел — начните заново';
    case 'telegram_declined':
      return 'Вход через Telegram отменён';
    case 'account_unavailable':
      return 'Вход для этой учётной записи сейчас недоступен';
    case 'phone_required':
      return 'Разрешите Telegram передать номер телефона и попробуйте снова';
    case 'registration_closed':
      return 'Этот бизнес сейчас не принимает новых пользователей';
    case 'no_connection':
      return 'Нет связи — повторить';
    case 'unexpected_response':
      return 'Не удалось — повторить';
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
      return 'Выберите бизнес ещё раз';
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
  const findLines = pathLines('find');
  const passwordLines = pathLines('password');
  const linesOf = (path: Path): PathLines => (path === 'find' ? findLines : passwordLines);

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

  // The ribbon: a CSS mark, so no <img> and no <svg> enters the closed tag set.
  const mark = factory.create('div');
  mark.classList.add('signin-mark');
  mark.setAttribute('aria-hidden', 'true');

  const heading = factory.create('h2');
  heading.id = id('title');
  heading.classList.add('signin-title');
  heading.tabIndex = -1;
  heading.textContent = SIGN_IN_TITLE;
  section.setAttribute('aria-labelledby', heading.id);

  const reasonLine = note('signin-reason');

  // ── find a business ──
  const findGroup = factory.create('div');
  findGroup.classList.add('signin-group', 'signin-group--find');
  findGroup.setAttribute('role', 'group');
  const findTitle = factory.create('h3');
  findTitle.id = id('find-title');
  findTitle.classList.add('signin-group-title');
  findTitle.textContent = 'Найдите свой бизнес';
  findGroup.setAttribute('aria-labelledby', findTitle.id);

  const term = field('term', 'Название или город', factory.createInput('text'), 'Например: Мужская Эстетика', 'find');
  term.input.autocomplete = 'off';
  term.input.spellcheck = false;
  const findButton = button('Найти', 'signin-button--submit');

  const matchList = factory.create('ul');
  matchList.classList.add('signin-matches');

  const chosenLine = note('signin-chosen');
  const telegram = button('Продолжить с Telegram', 'signin-button--telegram');
  const telegramStep = factory.create('div');
  telegramStep.classList.add('signin-step', 'signin-step--telegram');
  telegramStep.append(chosenLine, telegram);

  const missing = button('Моего бизнеса ещё нет', 'signin-button--quiet');
  const missingNote = note('signin-note', 'Новый бизнес подключают на сайте MAYA — mayaos.ru. После подключения он появится в поиске.');
  missingNote.hidden = true;

  findGroup.append(findTitle, findLines.status, findLines.countdown, term.wrap, findButton, matchList, telegramStep, missing, missingNote);

  // ── the other way in ──
  const otherToggle = button('Другой способ входа', 'signin-button--quiet');
  const passwordGroup = factory.create('div');
  passwordGroup.classList.add('signin-group', 'signin-group--password');
  passwordGroup.setAttribute('role', 'group');
  passwordGroup.hidden = true;
  const passwordTitle = factory.create('h3');
  passwordTitle.id = id('password-title');
  passwordTitle.classList.add('signin-group-title');
  passwordTitle.textContent = 'Вход по паролю';
  passwordGroup.setAttribute('aria-labelledby', passwordTitle.id);
  const needBusiness = note('signin-note', 'Сначала найдите свой бизнес выше.');
  const email = field('email', 'Email', factory.createInput('email'), null, 'password');
  email.input.autocomplete = 'email';
  email.input.inputMode = 'email';
  email.input.spellcheck = false;
  email.input.autocapitalize = 'off';
  const password = field('password', 'Пароль', factory.createInput('password'), null, 'password');
  password.input.autocomplete = 'current-password';
  const signInWithPassword = button('Войти по паролю', 'signin-button--submit');
  passwordGroup.append(passwordTitle, passwordLines.status, passwordLines.countdown, needBusiness, email.wrap, password.wrap, signInWithPassword);

  section.append(mark, heading, reasonLine, findGroup, otherToggle, passwordGroup);
  mount.container.append(section);

  // ── state ──
  let busy = false;
  let disposed = false;
  let matches: readonly BusinessMatch[] = [];
  let matchButtons: HTMLButtonElement[] = [];
  let chosen: BusinessMatch | null = null;
  let otherOpen = false;
  /** A running countdown per path; while it runs, that path sends nothing. */
  let findLock: Cancel | null = null;
  let passwordLock: Cancel | null = null;
  const lockOf = (path: Path): Cancel | null => (path === 'find' ? findLock : passwordLock);
  const setLock = (path: Path, cancel: Cancel | null): void => {
    if (path === 'find') findLock = cancel;
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
    telegramStep.hidden = chosen === null;
    chosenLine.textContent = chosen === null ? '' : `Вы выбрали: ${chosen.name}`;
    passwordGroup.hidden = !otherOpen;
    otherToggle.setAttribute('aria-expanded', otherOpen ? 'true' : 'false');
    needBusiness.hidden = chosen !== null;
    email.wrap.hidden = chosen === null;
    password.wrap.hidden = chosen === null;
    signInWithPassword.hidden = chosen === null;
    const findHeld = busy || locked('find');
    for (const b of [findButton, telegram, ...matchButtons]) setDisabled(b, findHeld);
    setDisabled(signInWithPassword, busy || locked('password'));
    if (busy) section.setAttribute('aria-busy', 'true');
    else section.removeAttribute('aria-busy');
  };

  const setStatus = (path: Path, ...parts: (string | HTMLElement)[]): void => {
    linesOf(path).status.replaceChildren(...parts);
  };

  /** A new attempt supersedes every earlier state, except a countdown still running. */
  const clearStates = (): void => {
    for (const f of [term, email, password]) {
      f.input.removeAttribute('aria-invalid');
      f.error.hidden = true;
      f.error.textContent = '';
    }
    for (const path of ['find', 'password'] as const) if (!locked(path)) setStatus(path);
  };

  /** Only two of the four named fields are on this screen; the rest settle as a status sentence. */
  const partsOf = (name: Field): FieldParts | null => {
    switch (name) {
      case 'email':
        return email;
      case 'password':
        return password;
      case 'code':
      case 'business':
        return null;
    }
  };

  const retryButton = (again: () => void): HTMLButtonElement => {
    const b = button('повторить', 'signin-retry');
    b.setAttribute('aria-label', 'Повторить');
    b.addEventListener('click', again);
    return b;
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

  const drawMatches = (): void => {
    matchButtons = matches.map((match) => {
      const b = button('', 'signin-match');
      const name = factory.create('span');
      name.classList.add('signin-match-name');
      name.textContent = match.name;
      b.replaceChildren(name);
      if (match.address !== null) {
        const where = factory.create('span');
        where.classList.add('signin-match-address');
        where.textContent = match.address;
        b.append(where);
      }
      b.addEventListener('click', () => {
        chosen = match;
        clearStates();
        setStatus('find', 'Бизнес выбран.');
        paint();
        telegram.focus();
      });
      return b;
    });
    matchList.replaceChildren(
      ...matchButtons.map((b) => {
        const li = factory.create('li');
        li.append(b);
        return li;
      }),
    );
  };

  /** Settle a first-run failure into its named state; returns where focus goes. */
  const failFirstRun = (failure: FirstRunFailure, again: () => void): HTMLElement => {
    switch (failure.state) {
      case 'rate_limited':
        startCountdown('find', failure.retryAfterSec);
        return term.input;
      case 'term_too_short':
        term.input.setAttribute('aria-invalid', 'true');
        term.error.textContent = firstRunSentence(failure);
        term.error.hidden = false;
        return term.input;
      case 'business_unavailable':
        chosen = null;
        setStatus('find', firstRunSentence(failure));
        return term.input;
      case 'telegram_unavailable':
        setStatus('find', firstRunSentence(failure));
        return otherToggle;
      case 'account_unavailable':
      case 'phone_required':
      case 'registration_closed':
      case 'callback_unsolicited':
      case 'login_expired':
      case 'telegram_declined':
        // The login has to start again. Focus goes where starting it again begins: the hand-off if
        // the business is still chosen, the search if it is not.
        setStatus('find', firstRunSentence(failure));
        return chosen === null ? term.input : telegram;
      case 'no_connection':
      case 'unexpected_response': {
        const retry = retryButton(again);
        setStatus('find', `${firstRunSentence(failure).replace(' — повторить', '')} — `, retry);
        return retry;
      }
    }
  };

  /** Settle a sign-in failure into its named state; returns where focus goes. */
  const failSignIn = (failure: SignInFailure, again: () => void): HTMLElement => {
    const kept = failure.state === 'field_invalid' && failure.field === 'email';
    if (!kept) password.input.value = '';
    switch (failure.state) {
      case 'rate_limited':
        startCountdown('password', failure.retryAfterSec);
        return email.input;
      case 'field_invalid': {
        const parts = partsOf(failure.field);
        if (parts === null) {
          setStatus('password', failureSentence(failure));
          return term.input;
        }
        parts.input.setAttribute('aria-invalid', 'true');
        parts.error.textContent = fieldSentence(failure.field);
        parts.error.hidden = false;
        return parts.input;
      }
      case 'no_connection':
      case 'unexpected_response': {
        const retry = retryButton(again);
        setStatus('password', failure.state === 'no_connection' ? 'Нет связи — ' : 'Вход не удался — ', retry);
        return retry;
      }
      default:
        setStatus('password', failureSentence(failure));
        return email.input;
    }
  };

  /** One attempt: busy while it runs, then a named state. Nothing is sent while held or busy. */
  async function act(path: Path, run: () => Promise<void>, pendingText: string): Promise<void> {
    if (busy || disposed || locked(path)) return;
    clearStates();
    busy = true;
    setStatus(path, pendingText);
    paint();
    try {
      await run();
    } catch {
      setStatus(path, 'Нет связи — повторить');
    }
    busy = false;
    if (disposed) return;
    paint();
  }

  const find = (): void =>
    void act(
      'find',
      async () => {
        const again = (): void => find();
        const step = await session.findBusinesses(term.input.value);
        setStatus('find');
        let focus: HTMLElement | null = null;
        if (step.step === 'matches') {
          matches = step.businesses;
          chosen = null;
          drawMatches();
          if (matches.length === 0) {
            setStatus('find', 'Ничего не нашлось — попробуйте другое название или город.');
            focus = term.input;
          } else {
            setStatus('find', matches.length === 1 ? 'Нашли один бизнес.' : `Нашли ${matches.length}. Выберите свой.`);
            focus = matchButtons.at(0) ?? term.input;
          }
        } else {
          focus = failFirstRun(step.failure, again);
        }
        paint();
        focus?.focus();
      },
      'Ищем…',
    );

  const handOff = (): void =>
    void act(
      'find',
      async () => {
        const again = (): void => handOff();
        const business = chosen;
        if (business === null) return;
        const step = await session.startTelegram(business.slug);
        if (step.step === 'handed_off') {
          // The document is already navigating away; the sentence is what a slow network shows.
          setStatus('find', 'Открываем Telegram…');
          return;
        }
        setStatus('find');
        const focus = failFirstRun(step.failure, again);
        paint();
        focus.focus();
      },
      'Готовим вход…',
    );

  const passwordSignIn = (): void =>
    void act(
      'password',
      async () => {
        const again = (): void => passwordSignIn();
        const business = chosen;
        if (business === null) {
          setStatus('password', 'Сначала найдите свой бизнес.');
          term.input.focus();
          return;
        }
        const step: SignInStep = await session.signInPassword(business.slug, email.input.value, password.input.value);
        setStatus('password');
        let focus: HTMLElement | null = null;
        if (step.step === 'signed_in') setStatus('password', 'Вход выполнен.');
        else if (step.step === 'failed') focus = failSignIn(step.failure, again);
        paint();
        focus?.focus();
      },
      'Входим…',
    );

  const onEnter = (input: HTMLInputElement, run: () => void): void => {
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      run();
    });
  };
  onEnter(term.input, find);
  onEnter(email.input, passwordSignIn);
  onEnter(password.input, passwordSignIn);
  findButton.addEventListener('click', find);
  telegram.addEventListener('click', handOff);
  signInWithPassword.addEventListener('click', passwordSignIn);
  missing.addEventListener('click', () => {
    missingNote.hidden = !missingNote.hidden;
    missing.setAttribute('aria-expanded', missingNote.hidden ? 'false' : 'true');
  });
  missing.setAttribute('aria-expanded', 'false');
  otherToggle.addEventListener('click', () => {
    otherOpen = !otherOpen;
    paint();
    if (otherOpen) (chosen === null ? term.input : email.input).focus();
  });

  /**
   * A callback has come back from the provider. The screen shows it because the alternative is a
   * login that fails in silence: the person left for Telegram, came back, and must be told either
   * that they are in or exactly what to do next. On the web this may already be running when the
   * screen mounts — the callback is in the page's own URL at boot — so the current state is read
   * once here rather than waited for.
   */
  const showLanding = (view: TelegramLanding): void => {
    if (disposed) return;
    if (view.state === 'running') {
      busy = true;
      setStatus('find', 'Завершаем вход…');
      paint();
      return;
    }
    busy = false;
    if (view.state === 'failed') {
      const focus = failFirstRun(view.failure, () => undefined);
      paint();
      focus.focus();
      return;
    }
    paint();
  };
  const offLanding = session.onLanding(showLanding);
  showLanding(session.landing());

  paint();

  return {
    heading,
    cancel: () => {
      disposed = true;
      offLanding();
      for (const path of ['find', 'password'] as const) {
        lockOf(path)?.();
        setLock(path, null);
      }
      section.remove();
    },
  };
}
