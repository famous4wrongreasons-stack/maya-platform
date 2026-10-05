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

type Endpoint = keyof typeof PATHS;

const request = (endpoint: Endpoint, search: string | null, signal: AbortSignal): Promise<Response> =>
  fetch(API_BASE + PATHS[endpoint] + (search === null ? '' : `?q=${encodeURIComponent(search)}`), {
    method: search === null ? 'POST' : 'GET',
    signal,
    credentials: 'omit',
    cache: 'no-store',
  });

export const chat = (signal: AbortSignal): Promise<Response> => request('chat', null, signal);
export const find = (term: string, signal: AbortSignal): Promise<Response> => request('businessSearch', term, signal);
