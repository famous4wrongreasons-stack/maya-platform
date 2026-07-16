import { UserRole } from './domain.enums';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string | null;
  role: UserRole;
  email: string;
  branchId: string | null;
}
