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
  historyErasure: '/privacy/conversations',
  transcribe: '/ai/transcribe',
  widgetIntent: '/widgets/intent',
  widgetResolve: '/widgets/resolve',
  personal0: '/services',
  personal1: '/staff',
  personal2: '/available-slots',
  personal3: '/personal-client/appointments/preview',
  personal4: '/personal-client/appointments/results',
  personal5: '/personal-client/appointments',
  personalBranches: '/branches',
  goodsPhotoPreview: '/ai/goods/photo-preview',
  goodsPhotoSearch: '/ai/goods/search',
  goodsPhotoItem: '/ai/goods/item-read',
  goodsPhotoReview: '/ai/goods/receipt-review',

} as const;

export const postChat = (body: string, signal: AbortSignal): Promise<Response> =>
  fetch(API_BASE + PATHS.chat, { method: 'POST', body, signal, credentials: 'omit', cache: 'no-store' });
