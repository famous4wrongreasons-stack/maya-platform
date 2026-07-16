import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const details = errors.flatMap((error) =>
          Object.values(error.constraints || {}).map((message) => ({
            field: error.property,
            message,
          })),
        );
        const first = details[0];
        const message = first?.message || 'Validation failed';

        return new BadRequestException({
          message,
          error: {
            code: 'validation',
            message,
            field: first?.field,
            details,
          },
        });
      },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Maya SaaS Backend')
    .setDescription('Multi-tenant white-label backend for Maya App')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  app.get(PrismaService).enableShutdownHooks(app);
  await app.listen(configService.get<number>('PORT') ?? 3000);
}
void bootstrap();
