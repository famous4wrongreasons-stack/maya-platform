// The carrier's proof harness.
//
// M5 has no ports wired yet — the chat's transport, session and widget ports arrive with the
// runtime boundary. What this renders is the PRESENTATION under fixed content, in two phone
// frames, so the owner can judge one thing: whether this is their chat. Nothing here reaches the
// network, and no state is owned.

import { ChatScreen, type ChatMessage } from './chat/ChatScreen.tsx';
import { tokens } from './identity/tokens.ts';

const CONVERSATION: readonly ChatMessage[] = [
  { role: 'bot', text: 'Доброе утро, Стас. Смена открыта, в зале четверо мастеров.' },
  { role: 'user', text: 'Что по сегодняшнему дню?' },
  {
    role: 'bot',
    text: 'Сегодня 14 записей. Первая в 10:00, последняя в 20:30.\n\nУ Ильи окно с 15:00 до 17:00 — два часа подряд, это самая дорогая дыра в расписании. Остальные загружены плотно.',
  },
  { role: 'user', text: 'Предложи что-нибудь на это окно' },
  {
    role: 'bot',
    text: 'Могу разослать напоминание тем, кто стригся у Ильи больше пяти недель назад — таких сейчас девять человек. Обычно на подобную рассылку откликаются двое-трое.\n\nПодготовить список?',
  },
];

function Frame({ dark, label }: { readonly dark: boolean; readonly label: string }) {
  return (
    <div style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          position: 'relative',
          width: 393,
          height: 852,
          overflow: 'hidden',
          borderRadius: 44,
          border: '1px solid rgba(128,128,128,0.45)',
        }}
      >
        <ChatScreen t={tokens(dark)} messages={CONVERSATION} draft="" thinking />
      </div>
      <p style={{ font: '12px/1 ui-monospace, monospace', color: '#888', letterSpacing: '0.08em' }}>
        {label}
      </p>
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: 'flex', gap: 48, justifyContent: 'center', padding: 32, flexWrap: 'wrap' }}>
      <Frame dark label="AURORA · DARK" />
      <Frame dark={false} label="AURORA · LIGHT" />
    </div>
  );
}
