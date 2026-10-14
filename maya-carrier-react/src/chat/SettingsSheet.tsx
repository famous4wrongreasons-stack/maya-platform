import { useEffect, useRef } from 'react';

type DialogRef = HTMLDialogElement | null;

/** Session display and local motion only. Notification authority is not a presentation preference. */
export function SettingsSheet({ open, close, returnFocus, userName, tenantName, moving, toggleMoving }: {
  readonly open: boolean; readonly close: () => void; readonly returnFocus: () => void;
  readonly userName: string | null; readonly tenantName: string | null;
  readonly moving: boolean; readonly toggleMoving: () => void;
}) {
  const dialog = useRef<DialogRef>(null);
  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet) return;
    if (open && !sheet.open) {
      sheet.showModal();
      sheet.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    } else if (!open && sheet.open) {
      sheet.close();
      returnFocus();
    }
  }, [open]);
  const name = userName?.trim() || 'Ваш аккаунт';
  return <dialog ref={dialog} className="companion-settings-sheet" aria-modal="true" aria-labelledby="maya-settings-title"
    onCancel={e => { e.preventDefault(); e.stopPropagation(); close(); }}
    onKeyDown={e => {
      if (e.key === 'Escape') e.stopPropagation();
      if (e.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const index = controls.indexOf(document.activeElement as HTMLButtonElement);
      if ((e.shiftKey && index <= 0) || (!e.shiftKey && (index < 0 || index === controls.length - 1))) {
        e.preventDefault(); (e.shiftKey ? controls.at(-1) : controls.at(0))?.focus();
      }
    }}>
    <div className="companion-report-handle" aria-hidden="true"><span /></div>
    <header className="companion-settings-heading">
      <div><h2 id="maya-settings-title" tabIndex={-1}>Настройки</h2><p>Ваше рабочее пространство</p></div>
      <button type="button" className="companion-circle" aria-label="Закрыть настройки" onClick={close}>×</button>
    </header>
    <div className="companion-settings-profile">
      <span aria-hidden="true">{Array.from(name)[0]}</span>
      <div><span className="companion-settings-label">{name}</span><p>{tenantName ?? 'Аккаунт Maya'}</p></div>
    </div>
    <div className="companion-settings-row">
      <span className="companion-settings-symbol companion-settings-bell" aria-hidden="true" />
      <div><span className="companion-settings-label">Уведомления</span><p>Управление уведомлениями пока недоступно здесь.</p></div>
    </div>
    <button type="button" className="companion-settings-row" role="switch" aria-label="Движения Maya в этом сеансе"
      aria-checked={moving} aria-describedby="maya-settings-motion-note" onClick={toggleMoving}>
      <span className="companion-settings-symbol" aria-hidden="true">✧</span>
      <span>Движения Maya</span>
      <span className="companion-settings-toggle" aria-hidden="true"><span /></span>
    </button>
    <div className="companion-settings-row">
      <span className="companion-settings-symbol companion-settings-shield" aria-hidden="true" />
      <div><span className="companion-settings-label">Вы управляете действиями</span><p>Запись, перенос и отмена требуют отдельного подтверждения.</p></div>
    </div>
    <div className="companion-settings-row">
      <span className="companion-settings-symbol companion-settings-store" aria-hidden="true" />
      <div><span className="companion-settings-label">{tenantName ?? 'Maya'}</span><p>{tenantName === null ? 'Ваш аккаунт' : 'Ваше рабочее пространство'}</p></div>
    </div>
    <p className="companion-settings-note" id="maya-settings-motion-note">Настройка движения действует в этом сеансе. Системное уменьшение движения имеет приоритет.</p>
  </dialog>;
}
