import type { StaffScheduleReadScope } from './staff-schedule-read-scope';
import type { UserRole } from '../common/domain.enums';
import type { MayaFeatureKey } from '../common/feature-catalog';

export const AI_TOOL_SURFACES = ['native', 'web', 'telegram', 'voice'] as const;

export type AiToolSurface = (typeof AI_TOOL_SURFACES)[number];
export type AiToolRiskTier =
  'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted';
export type AiToolApprovalPolicy = 'none' | 'actor' | 'owner';

export interface AiToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  allowedRoles: readonly UserRole[];
  allowedSurfaces: readonly AiToolSurface[];
  requiredFeatures: readonly MayaFeatureKey[];
  riskTier: AiToolRiskTier;
  approvalPolicy: AiToolApprovalPolicy;
  idempotency: 'none' | 'required';
  timeoutMs: number;
  retryPolicy: 'none';
  fallbackPolicy: 'fail_closed' | 'last_verified_snapshot';
}

export interface AiToolPrincipal {
  tenantId: string;
  userId: string;
  role: UserRole;
  surface: AiToolSurface;
  /** Transient source witness for the finite schedule READ, never a grant. */
  staffScheduleReadSource?: StaffScheduleReadScope;
  /** Current authenticated membership scope; included only in read cache identity. */
  readAuthority?: {
    membershipId: string | null;
    membershipStatus: string | null;
    branchId: string | null;
    personalScopeHash?: string;
    sourceScopeHash?: string;
  };
}

export type ValidatedAiToolArguments = Record<string, unknown>;
