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

type Endpoint = keyof typeof PATHS;

const post = (endpoint: Endpoint, body: string, signal: AbortSignal): Promise<Response> =>
  fetch(API_BASE + PATHS[endpoint], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
    credentials: 'omit',
    cache: 'no-store',
  });

export const chat = (body: string, signal: AbortSignal): Promise<Response> => post('chat', body, signal);
export const login = (body: string, signal: AbortSignal): Promise<Response> => post('login', body, signal);
