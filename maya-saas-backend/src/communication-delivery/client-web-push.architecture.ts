/** Permanent B24 production-source ratchet. Test fixtures are excluded by the
 * caller only when the filename ends in .spec.ts, never by directory content. */
export function scanClientWebPushSource(
  file: string,
  source: string,
): string[] {
  const failures: string[] = [];
  if (file.endsWith('.spec.ts')) return failures;
  const transport =
    file === 'communication-delivery/communication-web-push.transport.ts';
  const registry = file === 'crm/client-web-push.service.ts';
  if (
    !transport &&
    /(?:from\s*['"]web-push['"]|require\(['"]web-push['"]\)|\bwebPush\.sendNotification\s*\()/.test(
      source,
    )
  )
    failures.push('Direct Web Push outside canonical transport');
  if (
    !registry &&
    /\.clientWebPushEndpoint\s*\.\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(
      source,
    )
  )
    failures.push('Endpoint writer outside verified registry');
  if (
    registry &&
    /(?:sendNotification|\.send\(|\.client\.(?:create|upsert)|\.clientConsentFact\.(?:create|update))/.test(
      source,
    )
  )
    failures.push('Registration creates identity/consent/delivery');
  if (registry) {
    for (const marker of [
      'this.identity(tx, proof)',
      'this.channels.authenticate(',
      'clientChannelLink',
      'this.lock(',
      'CLIENT_WEB_PUSH_POLICY.maxActive',
      'this.encryption.encrypt(JSON.stringify(subscription))',
      'WEB_PUSH_ENDPOINT_UNAVAILABLE',
      'attempt.campaign.deliveryCapabilityKey',
      'PERMANENT_WEB_PUSH_OUTCOME_REQUIRED',
    ])
      if (!source.includes(marker))
        failures.push(`Registry protection missing: ${marker}`);
  }
  return failures;
}
