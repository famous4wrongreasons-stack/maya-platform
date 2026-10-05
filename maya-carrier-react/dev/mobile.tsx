// Offline presentation fixture. No session is granted and sending remains refused by the runtime.
import { createRoot } from 'react-dom/client';
import { ChatScreen } from '../src/chat/ChatScreen.tsx';
import { SignIn } from '../src/signin/SignIn.tsx';
import { useVisibleViewport } from '../src/App.tsx';
import { tokens } from '../src/identity/tokens.ts';
import type { ConversationView } from '../../maya-chat-shell/src/shell/ports.ts';
const view: ConversationView = { items: [], inFlight: false, dropped: 0, composer: { enabled: true, reason: null } };
function MobileFixture() {
  useVisibleViewport();
  const t = tokens(window.matchMedia('(prefers-color-scheme: dark)').matches);
  return location.hash === '#login' ? <SignIn t={t} /> : <ChatScreen t={t} view={view} />;
}
createRoot(document.getElementById('maya')!).render(<MobileFixture />);
