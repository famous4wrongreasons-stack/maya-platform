import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { SystemMetricsService } from './system-metrics.service';

describe('AppController', () => {
  let appController: AppController;
  const queryRaw = jest.fn().mockResolvedValue([{ value: 1 }]);

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        SystemMetricsService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: queryRaw },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return a healthy payload', () => {
      const health = appController.getHealth();
      expect(health.status).toBe('ok');
      expect(health.service).toBe('maya-saas-backend');
    });
  });

  describe('getReadiness', () => {
    it('checks the database rather than returning static readiness', async () => {
      await expect(appController.getReadiness()).resolves.toMatchObject({
        status: 'ready',
        checks: { database: 'ready' },
      });
      expect(queryRaw).toHaveBeenCalled();
    });

    it('fails readiness when the database is unavailable', async () => {
      queryRaw.mockRejectedValueOnce(new Error('connection unavailable'));

      await expect(appController.getReadiness()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
