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

export const chat = (signal: AbortSignal): Promise<Response> => fetch(API_BASE + PATHS.chat, { method: 'POST', signal });
export const login = (signal: AbortSignal): Promise<Response> => fetch(API_BASE + PATHS.login, { method: 'POST', signal });
