// The app root: the one branch.
//
// `entry/main.ts` ends by handing five ports to `mountApp`, whose single top-level decision is
// `SessionView.signedIn`. That is the seam React replaces, and this is the whole of it. The branch
// is a real unmount: the signed-in tree is torn down on sign-out and rebuilt on sign-in, because
// the runtime clears the timeline, aborts the flight and resets the shell on that transition, and a
// component that survived it would be holding a copy of something that no longer exists.

import { useEffect, useSyncExternalStore } from 'react';
import { ChatScreen } from './chat/ChatScreen.tsx';
import { SignIn } from './signin/SignIn.tsx';
import { conversation, landFragment, session } from './runtime/compose.ts';
import { usePortView } from './runtime/useView.ts';
import { tokens } from './identity/tokens.ts';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function useDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const fire = (): void => onChange();
      darkQuery.addEventListener('change', fire);
      return () => darkQuery.removeEventListener('change', fire);
    },
    () => darkQuery.matches,
  );
}

/**
 * The visual viewport inset, published as one custom property — exactly what entry/main.ts:210 does
 * with it. This is presentation, not runtime: no factory receives it.
 */
function useKeyboardInset(): void {
  useEffect(() => {
    const visual = window.visualViewport;
    if (visual === null) return;
    const measure = (): void => {
      const inset = Math.max(0, Math.round(window.innerHeight - visual.height - visual.offsetTop));
      document.documentElement.style.setProperty('--maya-keyboard-inset', `${inset}px`);
    };
    visual.addEventListener('resize', measure);
    visual.addEventListener('scroll', measure);
    measure();
    return () => {
      visual.removeEventListener('resize', measure);
      visual.removeEventListener('scroll', measure);
    };
  }, []);
}

/**
 * A deep link appends a NOTICE to the timeline, so it must land only once the presentation is
 * subscribed — entry/main.ts calls it after the mount, not during composition. An effect is the
 * React equivalent; the module-scope guard is because StrictMode invokes effects twice and a
 * fragment is single-use.
 */
let landed = false;
function useLandedFragment(): void {
  useEffect(() => {
    if (landed) return;
    landed = true;
    landFragment();
  }, []);
}

export function App() {
  const dark = useDark();
  const sessionView = usePortView(session);
  const chat = usePortView(conversation);
  useKeyboardInset();
  useLandedFragment();

  const t = tokens(dark);
  if (!sessionView.signedIn) return <SignIn t={t} reason={sessionView.reason} />;
  return <ChatScreen t={t} view={chat} />;
}
