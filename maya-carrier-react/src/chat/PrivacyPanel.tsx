import type { PrivacyView } from '../../../maya-chat-shell/src/shell/ports.ts';
import type { Tokens } from '../identity/tokens.ts';

const failureText = (failure: PrivacyView['failure']): string => {
  switch (failure) {
    case 'forbidden': return 'Нет доступа к удалению этого разговора.';
    case 'conflict': return 'Запрос удаления не может быть выполнен для этого разговора.';
    case 'invalid_request': return 'Запрос удаления не принят.';
    case 'signed_out': return 'Сессия завершена.';
    case 'unavailable':
    case null: return 'Сервис удаления сейчас недоступен.';
  }
};

/** The privacy owner supplies every state; these controls carry no target or request identity. */
export function PrivacyPanel({
  view,
  t,
  requestConfirmation,
  cancelConfirmation,
  confirmErasure,
  retry,
  signOut,
  close,
}: {
  readonly view: PrivacyView;
  readonly t: Tokens;
  readonly requestConfirmation: () => void;
  readonly cancelConfirmation: () => void;
  readonly confirmErasure: () => void;
  readonly retry: () => void;
  readonly signOut: () => void;
  readonly close: () => void;
}) {
  return (
    <section aria-label="Приватность и данные" style={{ color: t.ink, fontSize: 15, lineHeight: '23px', maxWidth: 620 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 21, lineHeight: '28px' }}>Приватность и данные</h2>
      <p>Удаляется содержимое текущего разговора: сообщения, карточки и черновики. Другие разговоры не затрагиваются.</p>
      <p>Обязательный журнал аудита и деловые записи, включая бронирования и платежи, сохраняются.</p>
      <p role="status" aria-live="polite">
        {view.phase === 'confirming' ? 'Удалить текущий разговор? Это действие нельзя отменить.'
          : view.phase === 'erasing' ? 'Удаление текущего разговора…'
          : view.phase === 'uncertain' ? 'Удаление пока не подтверждено. Повторите тот же запрос вручную.'
          : view.phase === 'refused' ? `Удаление не подтверждено. ${failureText(view.failure)}`
          : view.phase === 'completed' ? 'Текущий разговор удалён.'
          : !view.available ? 'Удаление сейчас недоступно.' : ''}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '18px 0' }}>
        {view.phase === 'idle' ? (
          <button type="button" disabled={!view.available} onClick={() => requestConfirmation()} style={{ padding: '12px 16px', border: '1px solid', borderRadius: 12, background: 'transparent', color: t.ink, font: 'inherit', cursor: view.available ? 'pointer' : 'default' }}>Удалить текущий разговор</button>
        ) : null}
        {view.phase === 'confirming' ? (
          <>
            <button type="button" disabled={!view.available} onClick={() => confirmErasure()} style={{ padding: '12px 16px', border: 0, borderRadius: 12, background: t.ink, color: t.bg, font: 'inherit', cursor: view.available ? 'pointer' : 'default' }}>Подтвердить удаление</button>
            <button type="button" onClick={() => cancelConfirmation()} style={{ padding: '12px 16px', border: '1px solid', borderRadius: 12, background: 'transparent', color: t.ink, font: 'inherit', cursor: 'pointer' }}>Отмена</button>
          </>
        ) : null}
        {view.phase === 'uncertain' ? (
          <button type="button" onClick={() => retry()} style={{ padding: '12px 16px', border: '1px solid', borderRadius: 12, background: 'transparent', color: t.ink, font: 'inherit', cursor: 'pointer' }}>Повторить запрос</button>
        ) : null}
        {view.phase === 'refused' ? (
          <button type="button" onClick={() => signOut()} style={{ padding: '12px 16px', border: '1px solid', borderRadius: 12, background: 'transparent', color: t.ink, font: 'inherit', cursor: 'pointer' }}>Выйти</button>
        ) : null}
      </div>
      <button type="button" onClick={() => close()} style={{ padding: '10px 0', border: 0, background: 'transparent', color: t.ink, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Назад к разговору</button>
    </section>
  );
}
