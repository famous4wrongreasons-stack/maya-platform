import type { TelegramHandoff } from '../../../maya-chat-shell/src/net/session.ts';

// A carrier capability only. The runtime still owns pending state and single-use completion.
// Keep an exact WindowProxy, disown its opener BEFORE visiting Telegram, then read only the
// same-origin callback in that window. No message receiver, durable state or provider access to
// the initiating app. A browser which severs this reference (e.g. COOP) fails closed.
export function createTelegramPopup(view: Window, land: (fragment: string) => void) {
  return (cancelled: (reason: 'closed' | 'expired') => void): TelegramHandoff | null => {
    let popup: Window | null = null;
    try {
      popup = view.open('about:blank', '_blank', 'popup');
      if (popup === null) return null;
      popup.opener = null;
    } catch { popup?.close(); return null; }
    const held = popup;
    const origin = view.location.origin;
    let stopped = false;
    let navigated = false;
    let poll = 0;
    let deadline = 0;
    const close = (): void => {
      if (stopped) return;
      stopped = true;
      view.clearTimeout(poll);
      view.clearTimeout(deadline);
      view.removeEventListener('pagehide', abandoned);
      try { held.close(); } catch { /* Losing the window never authorizes completion. */ }
    };
    const abandoned = (): void => { close(); cancelled('closed'); };
    const read = (): void => {
      if (stopped) return;
      if (held.closed) { abandoned(); return; }
      // Reading a provider-origin location must throw. Do not log it or inspect provider pages.
      let received: string | null = null;
      try {
        if (navigated && held.location.origin === origin && held.location.pathname === '/oauth-callback.html' && held.location.search === '') {
          const fragment = held.location.hash;
          if (fragment.startsWith('#oauth=telegram&')) {
            held.history.replaceState(null, '', '/oauth-callback.html');
            received = fragment;
          }
        }
      } catch { /* Wait until the exact owned window has returned to our origin. */ }
      if (received !== null) { close(); land(received); return; }
      poll = view.setTimeout(read, 200);
    };
    view.addEventListener('pagehide', abandoned);
    // This is a resource bound, never an extension of the server's OAuth expiry.
    deadline = view.setTimeout(() => { close(); cancelled('expired'); }, 600_000);
    poll = view.setTimeout(read, 200);
    return {
      close,
      navigate(target) {
        if (stopped || held.closed || navigated) return false;
        try {
          const url = new URL(target);
          if (url.origin !== 'https://oauth.telegram.org' || url.pathname !== '/auth' || url.username || url.password || url.hash) return false;
          held.location.replace(url.href);
          navigated = true;
          return true;
        } catch { return false; }
      },
    };
  };
}
