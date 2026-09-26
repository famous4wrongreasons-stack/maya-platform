import { API_BASE } from './endpoint.ts';

const PATHS = {
  emailStart: '/auth/email/start',
  emailVerify: '/auth/email/verify',
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  chat: '/ai/chat',
  transcribe: '/ai/transcribe',
  widgetIntent: '/widgets/intent',
  widgetResolve: '/widgets/resolve',
  widgetAdmin: '/widgets/admin',
} as const;

export const post = (key: keyof typeof PATHS, signal: AbortSignal): Promise<Response> =>
  fetch(API_BASE + PATHS[key], { method: 'POST', signal });
