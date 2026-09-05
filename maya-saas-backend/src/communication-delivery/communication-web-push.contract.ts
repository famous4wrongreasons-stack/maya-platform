import { ActionContractError } from '../action-engine/action-engine.errors';

/** Existing single-Client communication authority; device fan-out is transport. */
export function normalizeClientWebPushDelivery(value: Record<string, unknown>) {
  const allowed = [
    'channel',
    'messageType',
    'clientId',
    'endpointIds',
    'sourceEventId',
    'title',
    'bodyText',
    'expiresAt',
  ];
  if (
    Object.keys(value).sort().join(',') !== allowed.sort().join(',') ||
    value.channel !== 'web_push' ||
    !['appointment_reminder', 'wanted_slot_available'].includes(
      String(value.messageType),
    )
  )
    throw new ActionContractError('Invalid Client Web Push communication');
  for (const name of ['clientId', 'sourceEventId'])
    if (
      typeof value[name] !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,240}$/.test(value[name])
    )
      throw new ActionContractError(
        'Canonical Client/communication identity required',
      );
  if (
    typeof value.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(value.expiresAt))
  )
    throw new ActionContractError('Canonical communication expiry required');
  if (
    !Array.isArray(value.endpointIds) ||
    value.endpointIds.length < 1 ||
    value.endpointIds.length > 5 ||
    new Set(value.endpointIds).size !== value.endpointIds.length ||
    value.endpointIds.some(
      (id: unknown) =>
        typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id),
    )
  )
    throw new ActionContractError(
      'One Client may have at most five delivery endpoints',
    );
  for (const [name, max] of [
    ['title', 160],
    ['bodyText', 2000],
  ] as const)
    if (
      typeof value[name] !== 'string' ||
      !value[name] ||
      value[name].length > max
    )
      throw new ActionContractError('Invalid bounded Web Push message');
  return { ...value, endpointIds: [...(value.endpointIds as string[])] };
}
