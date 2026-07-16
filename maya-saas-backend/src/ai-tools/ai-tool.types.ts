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
  fallbackPolicy: 'fail_closed';
}

export interface AiToolPrincipal {
  tenantId: string;
  userId: string;
  role: UserRole;
  surface: AiToolSurface;
}

export type ValidatedAiToolArguments = Record<string, unknown>;
