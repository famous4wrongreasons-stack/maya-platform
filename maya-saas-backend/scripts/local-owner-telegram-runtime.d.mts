import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { OwnerTelegramScope } from './local-owner-telegram-policy.mjs';
import type { IncomingMessage, ServerResponse } from 'node:http';
export interface OwnerTelegramRuntime {
  fetch(raw: string | URL, init?: RequestInit): Promise<Response>;
  counters: { calls: number; refused: number; routes: Record<string, number> };
  runRequest(
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void;
  stop(): void;
}
export function installOwnerTelegram(options: {
  app: INestApplication;
  prisma: PrismaService;
  require: (id: string) => unknown;
  backend: string;
  launch: {
    plan: { scope: OwnerTelegramScope; origin: string; clientId: string; contract?: string };
    assertCurrent: () => void;
  };
  nativeFetch: (raw: string | URL, init?: RequestInit) => Promise<Response>;
  trace?: (event: {
    surface: 'provider';
    route: 'telegram_token' | 'telegram_jwks';
    method: 'GET' | 'POST';
    stage: 'entered' | 'completed' | 'refused';
    status: number | null;
    code: string | null;
  }) => void;
}): Promise<OwnerTelegramRuntime>;
