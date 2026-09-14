import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  private static readonly startedAt = new Date().toISOString();

  constructor(private readonly prisma: PrismaService) {}

  getHealth() {
    return {
      status: 'ok',
      service: 'maya-saas-backend',
      // Какой релиз реально работает и с какого момента. Без этого понять,
      // доехал ли выкат, мог только тот, у кого есть доступ к серверу.
      release: this.resolveRelease(),
      started_at: AppService.startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Имя релиза берём из пути, по которому запущено приложение:
   * /opt/maya-saas/releases/<имя>/dist/... — отдельной переменной заводить не
   * нужно, каталог и есть источник истины.
   */
  private resolveRelease(): string {
    const fromEnv = String(process.env.MAYA_RELEASE || '').trim();

    if (fromEnv) {
      return fromEnv;
    }

    const match = /releases\/([^/]+)\//.exec(__dirname.replace(/\\/g, '/'));

    return match?.[1] ?? 'unknown';
  }

  async getReadiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ready',
        service: 'maya-saas-backend',
        checks: { database: 'ready' },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        service: 'maya-saas-backend',
        checks: { database: 'unavailable' },
        timestamp: new Date().toISOString(),
      });
    }
  }
}
