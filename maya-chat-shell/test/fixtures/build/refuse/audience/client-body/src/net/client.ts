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

export const postChat = (signal: AbortSignal): Promise<Response> =>
  fetch(API_BASE + PATHS.chat, {
    method: 'POST',
    body: JSON.stringify({ surface: 'web', requestId: 'r-00000001', messages: [], audience: 'owner' }),
    signal,
  });
