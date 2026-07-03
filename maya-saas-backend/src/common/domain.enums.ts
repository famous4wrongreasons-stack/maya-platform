export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
  CANCELED = 'canceled',
}

export enum UserRole {
  PLATFORM_OWNER = 'platform_owner',
  TENANT_ADMIN = 'tenant_admin',
  BRANCH_MANAGER = 'branch_manager',
  STAFF = 'staff',
  CLIENT = 'client',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  INVITED = 'invited',
}

export enum CrmProvider {
  YCLIENTS = 'yclients',
  ALTEGIO = 'altegio',
  DIKIDI = 'dikidi',
  WHITELINES = 'whitelines',
  SALON_ONLINE = 'salon_online',
  MOCK = 'mock',
}

export enum CrmIntegrationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
}

export enum AppointmentStatus {
  CONFIRMED = 'confirmed',
  CANCELED = 'canceled',
}
