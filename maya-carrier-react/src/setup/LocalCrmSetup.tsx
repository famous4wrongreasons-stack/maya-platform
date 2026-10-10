import { useEffect, useRef, useState } from 'react';
import { localCrmSetup, session } from '../runtime/compose.ts';
import { usePortView } from '../runtime/useView.ts';
import type { Tokens } from '../identity/tokens.ts';

/** A local opt-in surface. The port owns authorization, requests and connection state. */
export function LocalCrmSetup({ t, onClose }: { readonly t: Tokens; readonly onClose: () => void }) {
  const view = usePortView(localCrmSetup);
  const tokenInput = useRef<HTMLInputElement | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [stageConfirmed, setStageConfirmed] = useState(false);

  useEffect(() => {
    const input = tokenInput.current;
    return () => {
      if (input) input.value = '';
      localCrmSetup.close();
    };
  }, []);

  const connection = view.connection;
  const ready = view.phase === 'ready' && !view.busy;
  const editable = ready && (!connection || connection.provider === 'yclients');
  const selectedBranch = view.branches.find((branch) => branch.id === branchId);
  const connectedBranch = view.branches.find((branch) => branch.id === connection?.branchId);
  const canStage = editable && hasToken && companyId.trim().length > 0 && !!selectedBranch && stageConfirmed;

  const clearDraft = (): void => {
    if (tokenInput.current) tokenInput.current.value = '';
    setHasToken(false);
    setStageConfirmed(false);
  };
  const load = (): void => {
    if (view.busy) return;
    clearDraft();
    void localCrmSetup.load();
  };
  const stage = (): void => {
    if (!canStage || !tokenInput.current) return;
    const apiToken = tokenInput.current.value;
    clearDraft();
    // The secret is handed directly to the port and is never retained in React state.
    void localCrmSetup.stage({ apiToken, companyId, branchId }, true);
  };
  const close = (): void => {
    clearDraft();
    localCrmSetup.close();
    onClose();
  };

  return (
    <main style={{ position: 'absolute', inset: 0, overflowY: 'auto', boxSizing: 'border-box', background: t.bg, color: t.ink, padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)', fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 16, lineHeight: 1.5 }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <h2 style={{ fontSize: 24, lineHeight: 1.3, margin: '0 0 12px' }}>Локальное подключение YCLIENTS</h2>
        <p>Локальная форма в разработке. Сохранение подключения ещё не означает, что интеграция готова к работе.</p>
        <p>Настройка для бизнеса, в который вы вошли. Сначала проверьте текущее подключение и доступные филиалы.</p>
        <button type="button" disabled={view.busy} onClick={load} style={{ padding: '12px 16px', border: '1px solid', borderRadius: 12, color: t.ink, background: 'transparent', font: 'inherit', cursor: view.busy ? 'default' : 'pointer' }}>
          {view.phase === 'loading' ? 'Проверяем подключение…' : 'Проверить локальное подключение'}
        </button>
        <p role="status" aria-live="polite">{view.notice || 'Данные пока не запрашивались.'}</p>
        {view.phase === 'uncertain' ? <p>Результат сохранения пока не подтверждён. Можно проверить статус, но повторное сохранение в этой форме заблокировано.</p> : null}
        {connection ? (
          <section aria-label="Текущее подключение">
            <h3 style={{ fontSize: 18 }}>Текущее подключение</h3>
            <p>{connection.provider !== 'yclients' ? 'Настроен другой CRM-провайдер. Изменение здесь недоступно.'
              : connection.status === 'pending_activation' ? 'Подключение сохранено и ожидает активации.'
              : connection.status === 'active' ? 'Подключение активно.'
              : 'Текущий статус не поддерживает активацию в этой форме.'}</p>
            {connection.companyId ? <p>ID компании YCLIENTS: {connection.companyId}</p> : null}
            <p>Филиал MAYA: {connectedBranch ? `${connectedBranch.name}${connectedBranch.timezone ? ` · ${connectedBranch.timezone}` : ''}` : 'Привязка к доступному филиалу не подтверждена.'}</p>
          </section>
        ) : null}

        <section aria-label="Проверка и сохранение подключения" style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 18 }}>1. Проверить и сохранить подключение</h3>
          <p>Введите пользовательский API-токен YCLIENTS. Он очистится из формы при отправке или закрытии настройки.</p>
          <p>Партнёрский токен настраивается отдельно на сервере. Эта форма его не запрашивает.</p>
          <label style={{ display: 'block', margin: '16px 0' }}>
            Пользовательский API-токен
            <input ref={tokenInput} type="password" autoComplete="off" spellCheck={false} disabled={!editable} aria-label="Пользовательский API-токен YCLIENTS"
              onChange={(event) => { setHasToken(event.target.value.length > 0); setStageConfirmed(false); }}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, padding: 12, border: '1px solid', borderRadius: 12, color: t.ink, background: 'transparent', font: 'inherit' }} />
          </label>
          <label style={{ display: 'block', margin: '16px 0' }}>
            ID компании YCLIENTS
            <input type="text" inputMode="numeric" autoComplete="off" value={companyId} disabled={!editable} aria-label="ID компании YCLIENTS"
              onChange={(event) => { setCompanyId(event.target.value); setStageConfirmed(false); }}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, padding: 12, border: '1px solid', borderRadius: 12, color: t.ink, background: 'transparent', font: 'inherit' }} />
          </label>
          <div role="group" aria-label="Филиал MAYA для подключения" style={{ margin: '16px 0' }}>
            <p>Филиал MAYA</p>
            {view.branches.map((branch) => (
              <button key={branch.id} type="button" aria-pressed={branchId === branch.id} disabled={!editable}
                onClick={() => { setBranchId(branch.id); setStageConfirmed(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', margin: '8px 0', padding: 12, border: '1px solid', borderRadius: 12, color: branchId === branch.id ? t.bg : t.ink, background: branchId === branch.id ? t.ink : 'transparent', font: 'inherit' }}>
                {branch.name}{branch.timezone ? ` · ${branch.timezone}` : ''}
              </button>
            ))}
            {ready && view.branches.length === 0 ? <p>Доступных филиалов нет. Сохранение подключения недоступно.</p> : null}
          </div>
          <button type="button" role="checkbox" aria-checked={stageConfirmed} disabled={!editable}
            onClick={() => setStageConfirmed(!stageConfirmed)}
            style={{ display: 'block', width: '100%', padding: 12, textAlign: 'left', border: '1px solid', borderRadius: 12, background: 'transparent', color: t.ink, font: 'inherit' }}>
            {stageConfirmed ? '✓ ' : '○ '}Разрешаю проверить токен в YCLIENTS и сохранить подключение на сервере с токеном в зашифрованном виде. Активация и импорт здесь не выполняются.
          </button>
          <button type="button" disabled={!canStage} onClick={stage}
            style={{ marginTop: 12, padding: '12px 16px', border: 0, borderRadius: 12, background: t.accent, color: t.accentOn, font: 'inherit', opacity: canStage ? 1 : 0.5 }}>
            {view.phase === 'staging' ? 'Проверяем и сохраняем…' : 'Проверить и сохранить подключение'}
          </button>
          {view.stagedCounts ? <p>При подготовке найдено: услуг — {view.stagedCounts.services ?? 'неизвестно'}, мастеров — {view.stagedCounts.staff ?? 'неизвестно'}. Это ещё не подтверждение импорта.</p> : null}
        </section>

        <section aria-label="Активация подключения" style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 18 }}>2. Активация и импорт</h3>
          <p>Активация в этой локальной форме пока недоступна: сервер должен подтвердить именно показанную версию подключения перед импортом.</p>
        </section>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 28 }}>
          <button type="button" disabled={view.busy} onClick={close} style={{ padding: '10px 0', border: 0, background: 'transparent', color: t.ink, font: 'inherit', textDecoration: 'underline' }}>К разговору</button>
          <button type="button" onClick={() => { clearDraft(); localCrmSetup.close(); void session.signOut(); }} style={{ padding: '10px 0', border: 0, background: 'transparent', color: t.ink, font: 'inherit', textDecoration: 'underline' }}>Выйти</button>
        </div>
      </div>
    </main>
  );
}
