import { UserRole } from './domain.enums';

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  role: UserRole;
  email: string;
  branchId: string | null;
  membershipId: string | null;
  membershipStatus: string | null;
}
