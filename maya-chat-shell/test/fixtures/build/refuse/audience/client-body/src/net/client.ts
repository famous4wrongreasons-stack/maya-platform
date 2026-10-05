import { API_BASE } from './endpoint.ts';

const PATHS = {
  businessSearch: '/mobile/pwa/search',
  telegramStart: '/auth/oauth/telegram/start',
  telegramComplete: '/auth/oauth/telegram/complete',
  emailStart: '/auth/email/start',
  emailVerify: '/auth/email/verify',
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  chat: '/ai/chat',
  conversation: '/ai/conversation',
  transcribe: '/ai/transcribe',
  widgetIntent: '/widgets/intent',
  widgetResolve: '/widgets/resolve',
} as const;

export const postChat = (signal: AbortSignal): Promise<Response> =>
  fetch(API_BASE + PATHS.chat, {
    method: 'POST',
    body: JSON.stringify({ surface: 'web', requestId: 'r-00000001', messages: [], audience: 'owner' }),
    signal,
  });
