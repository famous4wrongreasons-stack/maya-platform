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

/** UIKit owns native geometry; only browsers need a VisualViewport correction. */
export function useVisibleViewport(): void {
  useEffect(() => {
    if (window.location.protocol === 'capacitor:') return;
    const visual = window.visualViewport;
    const measure = (): void => {
      const height = Math.min(window.innerHeight, visual?.height ?? window.innerHeight);
      const top = visual?.offsetTop ?? 0;
      document.documentElement.style.setProperty('--maya-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--maya-viewport-top', `${top}px`);
    };
    window.addEventListener('resize', measure);
    visual?.addEventListener('resize', measure);
    visual?.addEventListener('scroll', measure);
    measure();
    return () => {
      window.removeEventListener('resize', measure);
      visual?.removeEventListener('resize', measure);
      visual?.removeEventListener('scroll', measure);
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
  useVisibleViewport();
  useLandedFragment();

  const t = tokens(dark);
  if (!sessionView.signedIn) return <SignIn t={t} reason={sessionView.reason} />;
  return <ChatScreen t={t} view={chat} />;
}
