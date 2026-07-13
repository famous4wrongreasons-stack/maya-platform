import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController logo upload', () => {
  let app: INestApplication<App>;
  const uploadTenantLogo = jest.fn().mockResolvedValue({
    logo_url: '/api/public/uploads/tenant-logos/test.png',
  });

  beforeEach(async () => {
    uploadTenantLogo.mockClear();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: { uploadTenantLogo },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['file', 'logo'])(
    'accepts a logo in the multipart field "%s"',
    async (fieldName) => {
      await request(app.getHttpServer())
        .post('/api/admin/tenants/tenant-1/logo')
        .attach(fieldName, Buffer.from('test-logo'), {
          filename: 'logo.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(uploadTenantLogo).toHaveBeenCalledTimes(1);
      expect(uploadTenantLogo).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          originalname: 'logo.png',
          mimetype: 'image/png',
        }),
        undefined,
      );
    },
  );
});
