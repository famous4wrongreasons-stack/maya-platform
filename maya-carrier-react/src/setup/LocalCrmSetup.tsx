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
  const [activationConfirmed, setActivationConfirmed] = useState(false);

  useEffect(() => {
    const input = tokenInput.current;
    return () => {
      if (input) input.value = '';
      localCrmSetup.close();
    };
  }, []);

  const connection = view.connection;
  const editable = view.canStage && !view.busy;
  const selectedBranch = view.branches.find((branch) => branch.id === branchId);
  const connectedBranch = view.branches.find((branch) => branch.id === connection?.branchId);
  const canStage = editable && hasToken && companyId.trim().length > 0 && !!selectedBranch && stageConfirmed;
  const canActivate = view.canActivate && !view.busy && activationConfirmed;
  const operation = view.operation;
  const resumingInstall = view.resuming && operation?.operation === 'install';
  const resumingActivation = view.resuming && operation?.operation === 'activate';
  const resubmitting = view.resuming && operation?.status === 'NOT_OBSERVED';
  const operationText = !operation ? null
    : operation.status === 'NOT_OBSERVED' ? 'Сервер пока не подтвердил приём запроса. Повторная отправка относится к той же операции и требует вашего согласия.'
    : operation.status === 'UNAVAILABLE' ? 'Подтверждение исходного запроса сейчас недоступно. Проверьте его состояние позже.'
    : operation.status === 'READY' ? 'Найдена незавершённая операция. Продолжение возможно только для исходного запроса.'
    : operation.receipt?.phase === 'import_confirmed' ? 'Локальный импорт подтверждён сервером. Это не проверка доступности записи.'
    : operation.receipt?.phase === 'activated' ? 'Активация исходного подключения подтверждена сервером. Импорт ещё требует подтверждения.'
    : operation.receipt?.phase === 'installed' ? 'Сохранение подключения по исходному запросу подтверждено сервером.'
    : 'Сервер подтвердил завершение исходного запроса.';

  const clearDraft = (): void => {
    if (tokenInput.current) tokenInput.current.value = '';
    setHasToken(false);
    setStageConfirmed(false);
    setActivationConfirmed(false);
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
  const activate = (): void => {
    if (!canActivate) return;
    clearDraft();
    void localCrmSetup.activate(true);
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
        <p>Настройка для бизнеса, в который вы вошли. Сначала проверьте текущее подключение и доступные филиалы. Если запрос уже был отправлен, кнопка также проверит результат именно этой операции.</p>
        <button type="button" disabled={view.busy} onClick={load} style={{ padding: '12px 16px', border: '1px solid', borderRadius: 12, color: t.ink, background: 'transparent', font: 'inherit', cursor: view.busy ? 'default' : 'pointer' }}>
          {view.phase === 'loading' ? 'Проверяем подключение и результат…' : 'Проверить подключение и результат'}
        </button>
        <p role="status" aria-live="polite">{view.notice || 'Данные пока не запрашивались.'}</p>
        {view.phase === 'uncertain' && !view.resuming ? <p>Результат пока не подтверждён. Проверьте состояние исходной операции; повторная отправка пока недоступна.</p> : null}
        {operationText ? <p>{operationText}</p> : null}
        {operation?.receipt && !operation.current.matchesCurrentVersion ? <p>Подключение изменилось. Это подтверждение относится к ранее показанной версии.</p> : null}
        {view.resuming ? <p>{resubmitting ? 'По вашему подтверждению запрос будет отправлен ещё раз в рамках той же операции. Автоматического повтора нет.' : 'Продолжается только тот же исходный запрос. Новый запрос не создаётся.'}</p> : null}
        {resumingInstall ? <p>{resubmitting ? 'Снова укажите компанию, филиал и пользовательский токен. Введённые ранее данные не восстанавливаются.' : 'Для продолжения повторите исходные компанию, филиал и токен. Сервер проверит совпадение с исходной операцией.'}</p> : null}
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
          <p>Токен сохраняется в зашифрованном виде в базе сервера MAYA, к которому подключена эта форма.</p>
          <p>Партнёрский токен настраивается отдельно на сервере. Эта форма его не запрашивает.</p>
          <label style={{ display: 'block', margin: '16px 0' }}>
            Пользовательский API-токен
            <input ref={tokenInput} type="password" autoComplete="off" spellCheck={false} disabled={!editable} aria-label="Пользовательский API-токен YCLIENTS"
              onChange={(event) => { setHasToken(event.target.value.length > 0); setStageConfirmed(false); setActivationConfirmed(false); }}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, padding: 12, border: '1px solid', borderRadius: 12, color: t.ink, background: 'transparent', font: 'inherit' }} />
          </label>
          <label style={{ display: 'block', margin: '16px 0' }}>
            ID компании YCLIENTS
            <input type="text" inputMode="numeric" autoComplete="off" value={companyId} disabled={!editable} aria-label="ID компании YCLIENTS"
              onChange={(event) => { setCompanyId(event.target.value); setStageConfirmed(false); setActivationConfirmed(false); }}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, padding: 12, border: '1px solid', borderRadius: 12, color: t.ink, background: 'transparent', font: 'inherit' }} />
          </label>
          <div role="group" aria-label="Филиал MAYA для подключения" style={{ margin: '16px 0' }}>
            <p>Филиал MAYA</p>
            {view.branches.map((branch) => (
              <button key={branch.id} type="button" aria-pressed={branchId === branch.id} disabled={!editable}
                onClick={() => { setBranchId(branch.id); setStageConfirmed(false); setActivationConfirmed(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', margin: '8px 0', padding: 12, border: '1px solid', borderRadius: 12, color: branchId === branch.id ? t.bg : t.ink, background: branchId === branch.id ? t.ink : 'transparent', font: 'inherit' }}>
                {branch.name}{branch.timezone ? ` · ${branch.timezone}` : ''}
              </button>
            ))}
            {view.phase === 'ready' && view.branches.length === 0 ? <p>Доступных филиалов нет. Сохранение подключения недоступно.</p> : null}
          </div>
          <button type="button" role="checkbox" aria-checked={stageConfirmed} disabled={!editable}
            onClick={() => setStageConfirmed(!stageConfirmed)}
            style={{ display: 'block', width: '100%', padding: 12, textAlign: 'left', border: '1px solid', borderRadius: 12, background: 'transparent', color: t.ink, font: 'inherit' }}>
            {stageConfirmed ? '✓ ' : '○ '}{resumingInstall ? resubmitting ? 'Разрешаю повторно отправить указанные компанию, филиал и токен в рамках той же операции подключения.' : 'Разрешаю продолжить исходное сохранение подключения с повторно введёнными компанией, филиалом и токеном.' : 'Разрешаю проверить токен в YCLIENTS и сохранить подключение с зашифрованным токеном на этом сервере.'} Активация и импорт требуют отдельного согласия.
          </button>
          <button type="button" disabled={!canStage} onClick={stage}
            style={{ marginTop: 12, padding: '12px 16px', border: 0, borderRadius: 12, background: t.accent, color: t.accentOn, font: 'inherit', opacity: canStage ? 1 : 0.5 }}>
            {view.phase === 'staging' ? 'Проверяем и сохраняем…' : resumingInstall ? resubmitting ? 'Повторить отправку подключения' : 'Продолжить исходное сохранение' : 'Проверить и сохранить подключение'}
          </button>
          {view.stagedCounts ? <p>При подготовке найдено: услуг — {view.stagedCounts.services ?? 'неизвестно'}, мастеров — {view.stagedCounts.staff ?? 'неизвестно'}. Это ещё не подтверждение импорта.</p> : null}
        </section>

        <section aria-label="Активация подключения" style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 18 }}>2. Активация и импорт</h3>
          <p>Проверьте компанию и филиал сохранённого подключения выше. Сервер проверит именно показанную версию перед импортом.</p>
          <button type="button" role="checkbox" aria-checked={activationConfirmed} disabled={!view.canActivate || view.busy}
            onClick={() => setActivationConfirmed(!activationConfirmed)}
            style={{ display: 'block', width: '100%', padding: 12, textAlign: 'left', border: '1px solid', borderRadius: 12, background: 'transparent', color: t.ink, font: 'inherit' }}>
            {activationConfirmed ? '✓ ' : '○ '}{resumingActivation ? resubmitting ? 'Разрешаю повторно отправить запрос активации показанной версии подключения в рамках той же операции.' : 'Разрешаю продолжить исходную операцию активации и импорта.' : 'Разрешаю активировать показанную версию подключения и импортировать данные компании YCLIENTS в этот бизнес.'}
          </button>
          <button type="button" disabled={!canActivate} onClick={activate}
            style={{ marginTop: 12, padding: '12px 16px', border: 0, borderRadius: 12, background: t.accent, color: t.accentOn, font: 'inherit', opacity: canActivate ? 1 : 0.5 }}>
            {view.phase === 'activating' ? 'Активация и импорт…' : resumingActivation ? resubmitting ? 'Повторить отправку активации' : 'Продолжить исходную активацию' : 'Активировать и импортировать'}
          </button>
        </section>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 28 }}>
          <button type="button" disabled={view.busy} onClick={close} style={{ padding: '10px 0', border: 0, background: 'transparent', color: t.ink, font: 'inherit', textDecoration: 'underline' }}>К разговору</button>
          <button type="button" onClick={() => { clearDraft(); localCrmSetup.close(); void session.signOut(); }} style={{ padding: '10px 0', border: 0, background: 'transparent', color: t.ink, font: 'inherit', textDecoration: 'underline' }}>Выйти</button>
        </div>
      </div>
    </main>
  );
}
