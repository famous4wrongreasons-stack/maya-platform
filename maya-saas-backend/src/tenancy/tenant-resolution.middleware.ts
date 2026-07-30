import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

import { TenantContextService } from './tenant-context.service';
import { TenantResolverService } from './tenant-resolver.service';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header('x-request-id')?.trim();
    const requestId =
      incomingRequestId && SAFE_REQUEST_ID.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();

    response.setHeader('x-request-id', requestId);

    this.tenantContext.run(requestId, () => {
      void this.tenantResolver
        .resolvePublicRequest(request)
        .then((resolved) => {
          if (resolved) {
            this.tenantContext.setResolvedTenant({
              tenantId: resolved.tenantId,
              userId: null,
              membershipId: null,
              role: null,
              source: resolved.source,
            });
          }

          next();
        })
        .catch(next);
    });
  }
}
