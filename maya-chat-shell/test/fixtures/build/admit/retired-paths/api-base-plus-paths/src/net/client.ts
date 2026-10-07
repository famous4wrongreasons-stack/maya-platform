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
  personal0: '/services',
  personal1: '/staff',
  personal2: '/available-slots',
  personal3: '/personal-client/appointments/preview',
  personal4: '/personal-client/appointments/results',
  personal5: '/personal-client/appointments',

} as const;

export const postChat = (body: string, signal: AbortSignal): Promise<Response> =>
  fetch(API_BASE + PATHS.chat, { method: 'POST', body, signal, credentials: 'omit', cache: 'no-store' });
