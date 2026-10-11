import type { TelegramLinkView } from '../../../maya-chat-shell/src/net/types.ts';
import type { Tokens } from '../identity/tokens.ts';

/** Account linking is owned by the authenticated session and A23, never by this control. */
export function TelegramLinkPanel({ view, t, start, cancel }: {
  readonly view: TelegramLinkView;
  readonly t: Tokens;
  readonly start: () => void;
  readonly cancel: () => void;
}) {
  const busy = view.phase === 'starting' || view.phase === 'waiting' || view.phase === 'finishing';
  const message = view.phase === 'linked'
    ? 'Telegram подключён к вашему аккаунту. При следующем входе через Telegram Maya проверит вашу клиентскую карточку.'
    : view.phase === 'waiting' ? 'Подтвердите подключение в окне Telegram.'
    : view.phase === 'starting' ? 'Открываю Telegram…'
    : view.phase === 'finishing' ? 'Проверяю подключение…'
    : view.phase === 'failed'
      ? view.failure?.state === 'telegram_window_blocked' ? 'Разрешите всплывающее окно и попробуйте ещё раз.'
        : view.failure?.state === 'telegram_declined' ? 'Подключение отменено.'
        : view.failure?.state === 'business_unavailable' || view.failure?.state === 'account_unavailable' ? 'Подключение доступно из действующего бизнес-аккаунта. Проверьте, в какой аккаунт вы вошли.'
        : 'Подключение не подтверждено. Попробуйте заново; автоматического повтора не будет.'
      : 'Подключите Telegram к текущему бизнес-аккаунту, чтобы входить в него через Telegram.';
  return (
    <section aria-label="Вход через Telegram" style={{ color: t.ink, fontSize: 15, lineHeight: '23px', maxWidth: 620, marginBottom: 28 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 21, lineHeight: '28px' }}>Вход через Telegram</h2>
      <p role="status" aria-live="polite">{message}</p>
      {view.phase !== 'linked' ? <button type="button" disabled={busy} onClick={() => start()} style={{ padding: '12px 16px', border: '1px solid', borderRadius: 12, background: 'transparent', color: t.ink, font: 'inherit', cursor: busy ? 'default' : 'pointer' }}>Подключить Telegram к этому аккаунту</button> : null}
      {busy ? <button type="button" onClick={() => cancel()} style={{ padding: '12px 16px', border: 0, background: 'transparent', color: t.ink, font: 'inherit', cursor: 'pointer' }}>Отмена</button> : null}
    </section>
  );
}
