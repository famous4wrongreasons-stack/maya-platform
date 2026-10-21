import type { OwnConsentsView } from '../../../maya-chat-shell/src/shell/own-consents.ts';
import type { Tokens } from '../identity/tokens.ts';

export function OwnConsentsPanel({ view, refresh, t }: { readonly view: OwnConsentsView; readonly refresh: () => void; readonly t: Tokens }) {
  return <section aria-label="Мои согласия" style={{ color: t.ink, fontSize: 15, lineHeight: '23px', maxWidth: 620, marginBottom: 24 }}>
    <h2 style={{ margin: '0 0 12px', fontSize: 21 }}>Мои согласия</h2>
    <p>Сведения относятся к вашему подтверждённому профилю клиента.</p>
    <div role="status" aria-live="polite">
      {view.phase === 'loading' ? <p>Загружаю согласия…</p> : null}
      {view.notice ? <p>{view.notice}</p> : null}
      {view.phase === 'ready' ? <div>{view.consents.map(row => <div key={row.kind} style={{ marginBottom: 12 }}>
        <p style={{ margin: 0 }}>{row.kind === 'privacy' ? 'Обработка персональных данных' : 'Маркетинговые сообщения'}</p>
        <p style={{ margin: '4px 0 0' }}>{row.state === 'GRANTED' ? 'Согласие действует' : row.state === 'NEVER_ASKED' ? 'Решение не зарегистрировано' : row.invalidated ? 'Согласие не действует: основание подтверждения отозвано' : 'Согласие не действует'}{row.recordedAt ? ` · Записано ${new Date(row.recordedAt).toLocaleString('ru-RU')}` : ''}</p>
      </div>)}</div> : null}
    </div>
    <button type="button" disabled={view.phase === 'loading' || view.retryAt !== null} onClick={() => refresh()} style={{ padding: '12px 16px', border: '1px solid', borderRadius: 12, background: 'transparent', color: t.ink, font: 'inherit' }}>Обновить согласия</button>
    <p>Выгрузка реестра пока недоступна: для неё требуется дополнительное подтверждение личности, которое ещё не подключено.</p>
  </section>;
}
