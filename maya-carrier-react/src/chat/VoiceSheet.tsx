import { useEffect, useRef } from 'react';
import type { VoiceControlPort, VoiceView } from '../../../maya-chat-shell/src/shell/ports.ts';
import { formatElapsed, voiceActionLabel, voiceStatusSentence } from '../runtime/copy.ts';

type DialogRef = HTMLDialogElement | null;
type ElementRef = HTMLElement | null;

/** Voice presentation only. Capture, timing, cancellation and the sole turn writer stay in runtime. */
export function VoiceSheet({ open, view, enabled, port, close, focusFallback }: {
  readonly open: boolean; readonly view: VoiceView; readonly enabled: boolean;
  readonly port: Pick<VoiceControlPort, 'arm' | 'send'>;
  readonly close: () => void; readonly focusFallback: () => void;
}) {
  const dialog = useRef<DialogRef>(null), opener = useRef<ElementRef>(null);
  const fallback = useRef(focusFallback); fallback.current = focusFallback;
  const canAct = enabled && (view.state === 'idle' || view.state === 'listening' || view.state === 'held');
  const hasClip = view.state === 'listening' || view.state === 'held';
  useEffect(() => {
    const sheet = dialog.current;
    if (!sheet) return;
    if (open) {
      if (!sheet.open) {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        sheet.showModal();
        sheet.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      }
    } else if (sheet.open) {
      sheet.close();
      const target = opener.current; opener.current = null;
      if (target?.isConnected && !(target instanceof HTMLButtonElement && target.disabled)) target.focus({ preventScroll: true });
      else fallback.current();
    }
  }, [open]);

  return <dialog ref={dialog} className="companion-voice-sheet" aria-modal="true" aria-labelledby="maya-voice-title"
    onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') event.stopPropagation();
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const index = controls.indexOf(document.activeElement as HTMLButtonElement);
      if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === controls.length - 1))) {
        event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls.at(0))?.focus();
      }
    }}>
    <div className="companion-report-handle" aria-hidden="true"><span /></div>
    <header className="companion-voice-heading"><h2 id="maya-voice-title" tabIndex={-1}>Поговорить с Maya</h2>
      <button type="button" className="companion-circle" aria-label="Закрыть голосовой ввод" onClick={close}>×</button></header>
    <div className="companion-voice-body">
      <span className="companion-mic-icon companion-voice-symbol" aria-hidden="true" />
      <p className="companion-voice-status">{voiceStatusSentence(view)}</p>
      {hasClip ? <p className="companion-voice-time" aria-label={'Длительность записи ' + formatElapsed(view.elapsedMs)}>{formatElapsed(view.elapsedMs)}</p> : null}
      <p className="companion-voice-explanation">{hasClip ? 'Нажмите «Отправить запись», чтобы распознать речь и отправить её в этот разговор.'
        : view.state === 'arming' ? 'Разрешение запрашивает ваш браузер.'
        : view.state === 'recording' || view.state === 'transcribing' ? 'Можно отменить голосовой ввод, пока распознавание не завершилось.'
        : 'Можно продолжить разговор текстом.'}</p>
      {view.state !== 'unavailable' ? <button type="button" className="companion-voice-send" disabled={!canAct}
        onClick={event => {
          const native = event.nativeEvent;
          if (!canAct || native.isTrusted !== true) return;
          const proof = { isTrusted: true as const, type: 'click' as const, timeStamp: native.timeStamp };
          if (view.state === 'idle') port.arm(proof); else port.send(proof);
        }}>{voiceActionLabel(view.state)}</button> : null}
      <button type="button" className="companion-voice-cancel" onClick={close}>{view.state === 'unavailable' || view.state === 'idle' ? 'К разговору' : 'Отменить голосовой ввод'}</button>
    </div>
  </dialog>;
}
