export enum TenantStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
  CANCELLED = 'cancelled',
}

export enum UserRole {
  PLATFORM_OWNER = 'platform_owner',
  PLATFORM_ADMIN = 'platform_admin',
  TENANT_OWNER = 'tenant_owner',
  BUSINESS_OWNER = 'business_owner',
  ADMINISTRATOR = 'administrator',
  MANAGER = 'manager',
  PROVIDER = 'provider',
  EMPLOYEE = 'employee',
  ACCOUNTANT = 'accountant',
  CUSTOMER = 'customer',
  INTEGRATION_SERVICE = 'integration_service',
  // Compatibility roles used by the current Maya clients.
  TENANT_ADMIN = 'tenant_admin',
  BRANCH_MANAGER = 'branch_manager',
  STAFF = 'staff',
  CLIENT = 'client',
}

export enum MembershipStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  INVITED = 'invited',
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
