import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';

import { SystemMetricsService } from './system-metrics.service';

@Injectable()
export class RequestMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: SystemMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle() as Observable<unknown>;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();
    let errorStatus: number | null = null;
    this.metrics.startRequest();

    return (next.handle() as Observable<unknown>).pipe(
      tap({
        error: (error: unknown) => {
          errorStatus =
            error instanceof HttpException ? error.getStatus() : 500;
        },
      }),
      finalize(() => {
        const durationMs =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        this.metrics.finishRequest({
          method: request.method,
          route: this.routeTemplate(request),
          statusCode: errorStatus ?? response.statusCode,
          durationMs,
        });
      }),
    );
  }

  private routeTemplate(request: Request): string {
    const route: unknown = request.route;
    const routePath =
      route !== null && typeof route === 'object'
        ? (route as Record<string, unknown>).path
        : null;
    if (typeof routePath !== 'string') {
      return 'unmatched';
    }
    const baseUrl = request.baseUrl || '';
    return `${baseUrl}${routePath}` || '/';
  }
}
