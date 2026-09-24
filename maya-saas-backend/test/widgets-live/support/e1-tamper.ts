import type { FixtureContext } from './bootstrap';
import type { IntentRecordRow } from '../../../src/widgets/gate.types';
import { recomputeFloor } from '../../../src/widgets/gates/gate5';

export async function tamperEmissionBodyHash(
  ctx: FixtureContext,
  tenantId: string,
  widgetId: string,
): Promise<void> {
  await ctx.prisma.widgetEmission.update({
    where: { widgetId_tenantId: { tenantId, widgetId } },
    data: { bodyHash: 'f'.repeat(64) },
  });
}

export async function tamperVerificationFloor(
  ctx: FixtureContext,
  tenantId: string,
  intentTokenHash: string,
): Promise<void> {
  const row = await ctx.prisma.widgetIntentRecord.findFirstOrThrow({
    where: { tenantId, intentTokenHash },
    select: { verificationFloor: true },
  });
  const replacement =
    row.verificationFloor === 'SESSION_VERIFIED'
      ? 'ANONYMOUS'
      : 'SESSION_VERIFIED';
  await ctx.prisma.widgetIntentRecord.update({
    where: { intentTokenHash_tenantId: { tenantId, intentTokenHash } },
    data: { verificationFloor: replacement },
  });
}

/**
 * E1-G6's semantic tamper. The derived floor is updated with the subject so
 * Gate 5 observes a coherent TOOL-shaped row and applies its unreachable
 * STEP_UP floor. The N6-FLOOR mutation neutraliser then proves independently
 * that Gate 6 still owns and enforces the TOOL refusal.
 */
export async function tamperCapabilitySpaceToTool(
  ctx: FixtureContext,
  tenantId: string,
  intentTokenHash: string,
): Promise<void> {
  const where = { intentTokenHash_tenantId: { tenantId, intentTokenHash } };
  const updated = await ctx.prisma.widgetIntentRecord.update({
    where,
    data: { capabilitySpace: 'TOOL' },
  });
  await ctx.prisma.widgetIntentRecord.update({
    where,
    data: {
      verificationFloor: recomputeFloor(updated as unknown as IntentRecordRow),
    },
  });
}
