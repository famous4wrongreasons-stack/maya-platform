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
  transcribe: '/ai/transcribe',
  widgetIntent: '/widgets/intent',
  widgetResolve: '/widgets/resolve',
} as const;

type Endpoint = keyof typeof PATHS;

export const find = (term: string, signal: AbortSignal): Promise<Response> =>
  fetch(API_BASE + PATHS.businessSearch + `?q=${term}`, { method: 'GET', signal });
