import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MayaCompanion, type CompanionState } from '../identity/MayaCompanion.tsx';

type DialogRef = HTMLDialogElement | null;
type ButtonRef = HTMLButtonElement | null;
type HeaderRef = HTMLElement | null;

/** Local chrome over existing destinations. It invents no route or business permission. */
export function CompanionHeader({ tenantName, privacyOpen, openPrivacy, openPhoto, openTasks, openFeed, openLibrary, photoEnabled, state, event, greet }: {
  readonly tenantName: string | null; readonly privacyOpen: boolean;
  readonly openPrivacy: () => void; readonly openPhoto: () => void;
  readonly openTasks: () => void; readonly openFeed: () => void; readonly openLibrary: () => void;
  readonly photoEnabled: boolean;
  readonly state: CompanionState; readonly event: number; readonly greet: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [moving, setMoving] = useState(true);
  const dialog = useRef<DialogRef>(null);
  const opener = useRef<ButtonRef>(null);
  const header = useRef<HeaderRef>(null);
  useLayoutEffect(() => {
    const element = header.current;
    if (element === null) return;
    const measure = (): void => document.documentElement.style.setProperty('--maya-chat-header-height', element.getBoundingClientRect().height + 'px');
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--maya-chat-header-height'); };
  }, []);
  useEffect(() => {
    if (menu) dialog.current?.showModal();
    else if (dialog.current?.open) {
      dialog.current.close();
      opener.current?.focus({ preventScroll: true });
    }
  }, [menu]);
  return <>
    <header ref={header} className="companion-header">
      <button ref={opener} type="button" className="companion-circle" aria-label="Открыть меню" aria-haspopup="dialog"
        onClick={() => setMenu(true)}><span className="companion-menu-icon" aria-hidden="true">☰</span></button>
      <button type="button" className="companion-identity" aria-label="Поздороваться с Maya" onClick={greet}>
        <MayaCompanion state={state} event={event} moving={moving} />
        <span className="companion-caption">Maya</span>
      </button>
      <button type="button" className="companion-circle" aria-label="Приватность и данные" title="Приватность и данные"
        aria-pressed={privacyOpen} onClick={openPrivacy}><span className="companion-privacy-icon" aria-hidden="true" /></button>
      <p className="companion-business">{tenantName ?? 'Разговор с Maya'}</p>
    </header>
    <dialog ref={dialog} className="companion-menu" aria-label="Меню Maya" aria-modal="true"
      onCancel={event => { event.preventDefault(); setMenu(false); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = dialog.current?.querySelectorAll('button');
        const first = controls?.[0], last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="companion-menu-heading"><span className="companion-logo" role="img" aria-label="Maya" />
        <button type="button" className="companion-circle" aria-label="Закрыть меню" onClick={() => setMenu(false)}>×</button></div>
      <h2>Maya</h2>
      <p className="companion-menu-business">{tenantName ?? 'Ваш разговор'}</p>
      <button type="button" className="companion-menu-row" onClick={() => { setMenu(false); openFeed(); }}>Лента <span aria-hidden="true">↗</span></button>
      <button type="button" className="companion-menu-row" onClick={() => { setMenu(false); openLibrary(); }}>Библиотека <span aria-hidden="true">↗</span></button>
      <button type="button" className="companion-menu-row" onClick={() => { setMenu(false); openTasks(); }}>Мои задачи <span aria-hidden="true">↗</span></button>
      <button type="button" className="companion-menu-row" onClick={() => { setMenu(false); openPrivacy(); }}>Приватность и данные <span aria-hidden="true">↗</span></button>
      <button type="button" className="companion-menu-row" disabled={!photoEnabled} onClick={() => { setMenu(false); openPhoto(); }}>Товар по фото накладной <span aria-hidden="true">+</span></button>
      <button type="button" className="companion-menu-row" aria-label="Движения Maya" aria-pressed={moving} onClick={() => setMoving(value => !value)}>
        Движения Maya <span>{moving ? 'Вкл.' : 'Выкл.'}</span>
      </button>
      <p className="companion-menu-note">Настройка движения действует в этом сеансе. Системное уменьшение движения имеет приоритет.</p>
    </dialog>
  </>;
}
