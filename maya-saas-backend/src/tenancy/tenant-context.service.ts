import { ForbiddenException, Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export type TenantResolutionSource =
  'membership' | 'custom_domain' | 'subdomain' | 'route_slug' | 'platform';

export interface TenantRequestContext {
  requestId: string;
  tenantId: string | null;
  userId: string | null;
  membershipId: string | null;
  role: string | null;
  source: TenantResolutionSource | null;
}

type ResolvedTenantContext = Omit<TenantRequestContext, 'requestId'>;

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantRequestContext>();

  run<T>(requestId: string, callback: () => T): T {
    return this.storage.run(
      {
        requestId,
        tenantId: null,
        userId: null,
        membershipId: null,
        role: null,
        source: null,
      },
      callback,
    );
  }

  get(): TenantRequestContext | undefined {
    return this.storage.getStore();
  }

  setResolvedTenant(context: ResolvedTenantContext): void {
    const store = this.storage.getStore();

    if (!store) {
      throw new ForbiddenException('Tenant request context is not initialized');
    }

    Object.assign(store, context);
  }

  requireTenantId(): string {
    const tenantId = this.storage.getStore()?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }

    return tenantId;
  }

  assertTenantId(expectedTenantId: string): string {
    const tenantId = this.requireTenantId();

    if (tenantId !== expectedTenantId) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }

    return tenantId;
  }
}
