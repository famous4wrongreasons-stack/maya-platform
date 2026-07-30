import { SetMetadata } from '@nestjs/common';

export interface TenantScopeOptions {
  paramKey?: string;
  requireTenant?: boolean;
}

export const TENANT_SCOPE_KEY = 'tenantScope';
export const TenantScoped = (options: TenantScopeOptions = {}) =>
  SetMetadata(TENANT_SCOPE_KEY, {
    requireTenant: options.requireTenant ?? true,
    paramKey: options.paramKey,
  });
