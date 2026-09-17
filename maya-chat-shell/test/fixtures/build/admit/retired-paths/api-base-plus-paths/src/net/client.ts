import { API_BASE } from './endpoint.ts';

const PATHS = {
  emailStart: '/auth/email/start',
  emailVerify: '/auth/email/verify',
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  chat: '/ai/chat',
  transcribe: '/ai/transcribe',
} as const;

export const postChat = (body: string, signal: AbortSignal): Promise<Response> =>
  fetch(API_BASE + PATHS.chat, { method: 'POST', body, signal, credentials: 'omit', cache: 'no-store' });
