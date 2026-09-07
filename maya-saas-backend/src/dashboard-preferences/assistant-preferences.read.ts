import type { Prisma } from '@prisma/client';
import {
  ASSISTANT_CAPABILITIES,
  DEFAULT_ASSISTANT_CAPABILITIES,
  type AssistantCapability,
} from './assistant-capabilities.constants';

export type AssistantConfig = {
  schema_version: 1;
  enabled_capabilities: AssistantCapability[];
};

/** Existing preference semantics shared by the dashboard and operational admission. */
export function normalizeAssistantCapabilities(
  value: unknown,
): AssistantCapability[] {
  if (!Array.isArray(value)) return [...DEFAULT_ASSISTANT_CAPABILITIES];
  const allowed = new Set<string>(ASSISTANT_CAPABILITIES);
  return value.filter(
    (capability, index, capabilities): capability is AssistantCapability =>
      typeof capability === 'string' &&
      allowed.has(capability) &&
      capabilities.indexOf(capability) === index,
  );
}
export function normalizeAssistantConfig(
  value: Prisma.JsonValue | undefined,
): AssistantConfig {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    schema_version: 1,
    enabled_capabilities:
      source.enabled_capabilities === undefined
        ? [...DEFAULT_ASSISTANT_CAPABILITIES]
        : normalizeAssistantCapabilities(source.enabled_capabilities),
  };
}
export async function filterAssistantCapability(
  db: Pick<Prisma.TransactionClient, 'dashboardPreference'>,
  tenantId: string,
  userIds: string[],
  capability: AssistantCapability,
): Promise<string[]> {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return [];
  const preferences = await db.dashboardPreference.findMany({
    where: { tenantId, userId: { in: uniqueUserIds }, section: 'assistant' },
    select: { userId: true, configJson: true },
  });
  const configs = new Map(
    preferences.map((preference) => [
      preference.userId,
      normalizeAssistantConfig(preference.configJson),
    ]),
  );
  return uniqueUserIds.filter((userId) =>
    (
      configs.get(userId) ?? normalizeAssistantConfig(undefined)
    ).enabled_capabilities.includes(capability),
  );
}
