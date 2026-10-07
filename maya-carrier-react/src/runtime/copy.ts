// The shell's sentences, re-typed.
//
// These live in maya-chat-shell/src/dom/timeline.ts, which is NOT in the published runtime package
// — `dom/` is the other carrier's view layer and the allowlist refuses it by design. So the strings
// are transcribed verbatim rather than imported, and this file is the one place a carrier sentence
// may be written.
//
// Why the runtime does not simply send text: ports.ts:191 — "Shell chrome, never model history
// (P-11). The DOM owns the sentence for each kind." A NoticeKind and a WidgetSentence are shell
// chrome; putting their words on the wire would make them look like something MAYA said.
//
// The exception is VoiceView.unavailable, whose `.label` IS minted by the runtime and must be
// rendered verbatim — not applicable here while voice is unbuilt.

import type {
  NoticeKind,
  TurnRetry,
  VoiceNotice,
  VoiceState,
  VoiceView,
  WidgetSentence,
} from '../../../maya-chat-shell/src/shell/ports.ts';
import type {
  ChatFailure,
  FirstRunFailure,
  SignedOutReason,
  SignInFailure,
} from '../../../maya-chat-shell/src/net/types.ts';

/** SH-06, exactly. dom/timeline.ts:49 */
export const APPROVAL_NOT_HERE = 'Действие ждёт подтверждения; подтвердить его здесь пока нельзя.';
export const COLD_START_HINT = 'Напишите MAYA, что нужно сделать, — ответ появится здесь.';
export const THINKING = 'MAYA думает…';
export const NEW_TURN_NOTE =
  'Текст остался в поле ввода — отправьте его ещё раз, это будет новый запрос.';

/** dom/timeline.ts:55-73 */
export const noticeSentence = (notice: NoticeKind): string => {
  switch (notice) {
    case 'approval_not_here':
      return APPROVAL_NOT_HERE;
    case 'subscription_required':
      return 'Разговор с MAYA недоступен для этого бизнеса: нужна активная подписка.';
    case 'feature_locked':
      return 'MAYA сейчас недоступна для этого бизнеса.';
    case 'tenant_required':
      return 'Для разговора с MAYA нужен вход в бизнес';
    case 'outdated_client':
      return 'Версия MAYA устарела — обновите страницу';
    case 'display_capped':
      return 'Ранние сообщения скрыты: на экране остаются последние 200.';
    case 'booking_outcomes_restored':
      return 'Сохранённые результаты недавних действий с записями:';
    case 'history_restored':
      return 'Предыдущая переписка восстановлена. Данные и доступность действий нужно проверить заново.';
    case 'history_truncated':
      return 'Показаны последние 50 сохранённых сообщений.';
    case 'history_interrupted':
      return 'Не все ответы сохранены. Если вы просили выполнить действие, уточните его результат.';
    case 'history_unavailable':
      return 'Не удалось загрузить переписку. Нажмите отправить, чтобы повторить загрузку. Сообщение пока останется в поле ввода.';
    case 'history_not_supported':
      return 'Этот сервер пока не поддерживает восстановление переписки. Здесь начнётся новый разговор.';
    case 'deeplink_refused':
      return 'Эту ссылку нельзя открыть здесь.';
    case 'deeplink_unavailable':
      return 'Карточку по этой ссылке пока нельзя показать.';
  }
};

/** What happened to a turn, before any retry wording. dom/timeline.ts:78-106 */
export const failureBase = (failure: ChatFailure): string => {
  switch (failure.reason) {
    case 'signed_out':
      return 'Сессия завершена';
    case 'subscription_required':
      return 'Сообщение не отправлено: MAYA недоступна для этого бизнеса';
    case 'feature_locked':
      return 'Сообщение не отправлено: MAYA сейчас недоступна для этого бизнеса';
    case 'tenant_required':
      return 'Сообщение не отправлено: нужен вход в бизнес';
    case 'forbidden':
      return 'Сообщение не отправлено: этот запрос сейчас недоступен';
    case 'rate_limited':
      return 'Слишком много запросов';
    case 'outdated_client':
      return 'Сообщение не отправлено';
    case 'model_failure':
      return 'MAYA не смогла безопасно ответить';
    case 'conflict':
      return 'MAYA не приняла этот запрос';
    case 'no_connection':
      return 'Нет связи';
    case 'aborted':
      return 'Отправка прервана';
    case 'server_error':
      return 'Сервер MAYA не ответил';
    case 'unexpected_response':
      return 'Ответ MAYA не получен';
  }
};

/**
 * Why a widget carries a neutral sentence instead of a state change (D9). dom/host.ts:526-538.
 *
 * `activation_unavailable` and `activation_forbidden` share ONE sentence on purpose. Splitting them
 * would tell the person which of the two happened — that is, whether the action exists and is
 * merely unavailable, or exists and is closed TO THEM. That distinction is authorization state, and
 * presentation saying it out loud is a disclosure the runtime deliberately does not make.
 */
export const widgetSentence = (sentence: WidgetSentence): string => {
  switch (sentence) {
    case 'activation_unavailable':
    case 'activation_forbidden':
      return 'Это действие сейчас недоступно';
    case 'no_connection':
      return 'Нет связи — действие не выполнено';
    case 'route_refused':
      return 'Этот переход здесь недоступен';
    case 'expired_not_resolved':
      return 'Карточка устарела — показана сводка';
    case 'goods_receipt_confirmed':
      return 'Приход товара подтверждён в YCLIENTS.';
    case 'goods_receipt_rejected':
      return 'Приход отклонён. Изменений в складе нет.';
    case 'goods_receipt_unconfirmed':
      return 'Результат прихода не подтверждён. Повторная отправка остановлена; проверьте документ в YCLIENTS.';
    case 'service_price_confirmed':
      return 'Цена подтверждена в YCLIENTS';
    case 'booking_stale':
      return 'Данные изменились с момента показа. Откройте актуальную версию.';
    case 'booking_date_required':
      return 'На какую дату проверить время у выбранного мастера?';
    case 'booking_confirmation_required':
      return 'Сначала нужно подтвердить запись.';
    case 'booking_facts_unavailable':
      return 'Эти данные пока не собраны.';
    case 'booking_unconfirmed':
    case 'service_price_unconfirmed':
      return 'Результат пока не подтверждён. Не отправляйте повторно';
    case 'service_price_rejected':
      return 'Изменение отклонено';
  }
};

/** Why the composer will not send (§1.4). The runtime decides this; the carrier only words it. */
export const composerReason = (
  reason: 'subscription_required' | 'tenant_required' | 'signed_out',
): string => {
  switch (reason) {
    case 'subscription_required':
      return 'Отправка недоступна: разговор с MAYA не подключён для этого бизнеса';
    case 'tenant_required':
      return 'Для разговора с MAYA нужен вход в бизнес';
    case 'signed_out':
      return 'Войдите, чтобы написать MAYA';
  }
};

/** dom/composer.ts:25 — the runtime decides `too_long` on the NFC-trimmed length. */
export const COMPOSER_LIMIT = 2_000;

/**
 * Why a submit was refused before anything left the device. dom/composer.ts:158-166.
 *
 * `in_flight` and `composer_disabled` have no sentence in the shell either: the first is answered by
 * the send control already reading as unavailable, the second by `composerReason`. Saying something
 * extra would be the carrier inventing a second explanation for a state the runtime already words.
 */
export const refusalSentence = (
  refusal: 'empty' | 'too_long' | 'in_flight' | 'composer_disabled',
): string | null => {
  switch (refusal) {
    case 'empty':
      return 'Напишите сообщение';
    case 'too_long':
      return `Сообщение длиннее ${COMPOSER_LIMIT} символов — сократите его`;
    case 'in_flight':
    case 'composer_disabled':
      return null;
  }
};

/** Whole seconds left before a same-request retry is allowed; 0 when allowed now. */
export const secondsLeft = (retry: TurnRetry, now: number): number =>
  retry.retry === 'same_request' && retry.notBefore !== null && retry.notBefore > now
    ? Math.ceil((retry.notBefore - now) / 1000)
    : 0;

// ── the first run, from dom/signin.ts ──────────────────────────────────────────────────────────

/** dom/signin.ts:60 */
export const SIGN_IN_TITLE = 'Вход в MAYA';

/** dom/signin.ts:62 */
export const rateLimitSentence = (seconds: number): string =>
  `Слишком много попыток — повторите через ${seconds} с`;

/** The first run's own outcomes: finding a business, and being handed to Telegram. dom/signin.ts:95 */
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

/** dom/signin.ts:116 */
export const fieldSentence = (field: 'email' | 'password' | 'code' | 'business'): string => {
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

/** dom/signin.ts:65-92 */
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

/** Why the session ended, when it did. A fresh load has no reason and shows none. dom/signin.ts:130 */
export const signedOutSentence = (reason: SignedOutReason | null): string | null => {
  switch (reason) {
    case null:
      return null;
    case 'signed_out':
      return 'Вы вышли из MAYA.';
    case 'session_expired':
      return 'Сессия истекла — войдите снова.';
    case 'refresh_token_reused':
      // Distinct on purpose: a reused refresh token is a security event, and the sentence says so
      // without describing the attack. Flattening it into the generic line loses that.
      return 'Сессия завершена ради безопасности — войдите снова.';
    case 'refresh_token_invalid':
    case 'session_revoked':
      return 'Сессия завершена — войдите снова.';
  }
};

// ── voice, from dom/voice-control.ts ───────────────────────────────────────────────────────────

/** dom/voice-control.ts:64-77 */
export const voiceNoticeSentence = (notice: VoiceNotice): string => {
  switch (notice) {
    case 'not_recognized':
      return 'Не расслышала — повторите или напишите сообщение';
    case 'audio_rejected':
      return 'Запись не принята — попробуйте ещё раз или напишите сообщение';
    case 'too_short':
      return 'Запись слишком короткая — ничего не отправлено';
    case 'no_connection':
      return 'Нет связи — запись не распознана, повторите или напишите сообщение';
    case 'locked_for_step':
      return 'Здесь лучше написать текстом — голос для этого шага выключен';
  }
};

/**
 * The one polite announcement for a view. dom/voice-control.ts:79-97.
 *
 * 🔴 `unavailable` is the exception to re-typing: its sentence is a Cell whose `.label` the RUNTIME
 * mints, and it is rendered verbatim. A carrier-authored substitute would be the presentation
 * explaining a state it does not own.
 */
export const voiceStatusSentence = (view: VoiceView): string => {
  switch (view.state) {
    case 'idle':
      return view.notice === null ? '' : voiceNoticeSentence(view.notice);
    case 'arming':
      return 'Жду разрешения на микрофон';
    case 'listening':
      return 'Слушаю — ничего не отправляется';
    case 'held':
      return 'Прошло 20 секунд — запись остановлена и не отправлена';
    case 'recording':
      return 'Отправляю запись на распознавание';
    case 'transcribing':
      return 'Распознаю…';
    case 'unavailable':
      return view.unavailable === null ? '' : view.unavailable.label;
  }
};

/** What the mic control does next, in words. Idle and unavailable have no in-progress indicator. */
export const voiceActionLabel = (state: VoiceState): string => {
  switch (state) {
    case 'idle':
      return 'Сказать голосом';
    case 'arming':
      return 'Жду микрофон';
    case 'listening':
      return 'Отправить запись';
    case 'held':
      return 'Отправить запись';
    case 'recording':
      return 'Отправляю запись';
    case 'transcribing':
      return 'Распознаю';
    case 'unavailable':
      return 'Голосовой ввод недоступен';
  }
};

/** m:ss. dom/voice-control.ts:100-104. */
export const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  return `${Math.floor(total / 60)}:${seconds < 10 ? '0' : ''}${seconds}`;
};
