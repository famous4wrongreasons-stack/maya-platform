import ts from 'typescript';

// Exact internal owner methods, not presentation endpoints. These still undergo
// their existing action/delivery/retention ratchets and the full final inventory.
const INTERNAL_OWNERS: Record<string, string[]> = {
  'native-feedback/native-feedback-policy.service.ts': ['marketingAllowed'],
  'package5-wave3/consent-security-invalidation.service.ts': [
    'execute',
    'snapshot',
  ],
  'package5-wave3/package5-wave3.service.ts': [
    'resolveFacts',
    'updateClientProfile',
  ],
  'crm/client-habits.service.ts': ['apply'],
  'crm/client-preferences.service.ts': ['apply'],
  'appointment-notifications/appointment-reminder-orchestrator.service.ts': [
    'authority',
  ],
  'communication-delivery/communication-web-push.service.ts': ['allowed'],
  'communication-delivery/communication-bulk-policy.service.ts': ['current'],
  'crm/client-wanted-slot.service.ts': ['deliveryAllowed'],
  'marketing/marketing.service.ts': ['consentCandidates'],
};
const VERIFIED_CHANNEL_READS = [
  'status',
  'realtimeAuthority',
  'bookingPrefill',
  'cabinetProjection',
  'clientAppointmentCreateAuthority',
  'telegramDeliveryConsent',
];
export function scanClientProfileRead(file: string, source: string): string[] {
  if (file.endsWith('.spec.ts') || file.endsWith('.architecture.ts')) return [];
  const findings: string[] = [];
  let bulkPolicyBody = '';
  let feedbackPolicyBody = '';
  let feedbackClientBody = '';
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const dedicated = file === 'crm/client-profile-read.service.ts';
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.body) {
      const name = node.name.getText(ast),
        body = node.body.getText(ast);
      if (
        file === 'crm/client-channel-runtime.service.ts' &&
        name === 'resolve'
      ) {
        for (const marker of [
          'this.channels.authenticate(proof, tx)',
          'clientChannelLink.findMany',
          'links.length !== 1',
          'revokedAt: null',
          'verificationVersion !== 1',
          'subjectHashVersion !== 1',
        ]) {
          if (!body.replace(/\s+/g, '').includes(marker.replace(/\s+/g, '')))
            findings.push(`Unverified shared channel resolver: ${marker}`);
        }
      }
      if (
        file ===
          'communication-delivery/communication-bulk-policy.service.ts' &&
        name === 'current'
      )
        bulkPolicyBody = body;
      if (file === 'native-feedback/native-feedback-policy.service.ts') {
        if (name === 'marketingAllowed') feedbackPolicyBody = body;
        if (name === 'client') feedbackClientBody = body;
      }
      const internal = INTERNAL_OWNERS[file]?.includes(name);
      const related = /customerProfiles?\b|encryptedClientPreferences/.test(
        body,
      );
      const reader =
        dedicated ||
        /getOwnProfile|listCustomers|getCustomer|serializeCurrentUser|profileProjection/.test(
          name,
        ) ||
        (related && !internal);
      if (reader) {
        const walk = (child: ts.Node) => {
          if (ts.isCallExpression(child)) {
            const call = child.expression.getText(ast);
            if (
              /\.(customerProfile|client|clientChannelLink|clientConsentFact)\.(create|update|upsert|delete)(Many)?$/.test(
                call,
              )
            )
              findings.push(`${name}: profile read mutation`);
            if (
              /\.customerProfile\.find(Unique|First|Many)(OrThrow)?$/.test(call)
            ) {
              const args = child.arguments[0]?.getText(ast) ?? '';
              if (
                !/clientId/.test(args) ||
                !/tenantId/.test(args) ||
                /\buserId\b|\bOR\b|phone|chat_id/.test(args)
              )
                findings.push(`${name}: non-exact Client profile predicate`);
              const channel =
                file === 'crm/client-channel-runtime.service.ts' &&
                VERIFIED_CHANNEL_READS.includes(name) &&
                /clientChannelLink\.findMany|this\.resolve\(channelProof, tx\)/.test(
                  body,
                ) &&
                /links.length !== 1|verified.clientId/.test(body);
              const preference =
                [
                  'crm/client-habits.service.ts',
                  'crm/client-preferences.service.ts',
                ].includes(file) &&
                name === 'profile' &&
                /tenantId: identity.tenantId/.test(args) &&
                /clientId: identity.clientId/.test(args);
              const delivery =
                file === 'crm/client-preferences.service.ts' &&
                name === 'deliveryRead' &&
                /links.length !== 1/.test(body) &&
                /assertClientEligible/.test(body);
              if (!dedicated && !channel && !preference && !delivery)
                findings.push(
                  `${name}: private profile without verified reader`,
                );
            }
          }
          ts.forEachChild(child, walk);
        };
        walk(node.body);
        if (/customerProfiles\s*:|\.customerProfiles\b/.test(body))
          findings.push(`${name}: User profile relation projection`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const requireMarkers = (markers: string[], text = source) => {
    for (const marker of markers)
      if (
        !text
          .replace(/\s+/g, '')
          .replace(/,([})\]])/g, '$1')
          .includes(marker.replace(/\s+/g, '').replace(/,([})\]])/g, '$1'))
      )
        findings.push(`Missing profile guard: ${marker}`);
  };
  if (file === 'communication-delivery/communication-bulk-policy.service.ts') {
    requireMarkers(
      [
        'tenantId_clientId: { tenantId, clientId }',
        'select: { privacyConsentAt: true, marketingConsentAt: true, notificationPreferencesJson: true, }',
        'this.links.assertClientEligible(tx, tenantId, clientId)',
        'root.confirmedByUserId',
        'APPROVING_AUTHORITY_REVOKED',
        'effectiveClientConsent(tx, tenantId, clientId,',
        'lockClientConsent(tx, tenantId, clientId)',
        'CONSENT_NOT_GRANTED',
      ],
      bulkPolicyBody,
    );
    if (
      /encryptedNotes|encryptedClientPreferences|customerProfiles/.test(source)
    )
      findings.push(
        'Bulk dispatch policy cannot project private Client content',
      );
  }
  if (file === 'native-feedback/native-feedback-policy.service.ts') {
    requireMarkers(
      [
        'tenantId_clientId: { tenantId, clientId }',
        'select: { privacyConsentAt: true, marketingConsentAt: true, notificationPreferencesJson: true }',
        'lockClientConsent(tx, tenantId, clientId)',
        'this.client(tx, tenantId, clientId)',
        'effectiveClientConsents(tx, tenantId, clientId, now)',
        '!consent.privacy.effective || !consent.marketing.effective',
      ],
      feedbackPolicyBody,
    );
    requireMarkers(
      [
        'this.context.assertTenantId(tenantId)',
        'this.links.assertClientEligible(tx, tenantId, clientId)',
      ],
      feedbackClientBody,
    );
    if (
      /encryptedNotes|encryptedClientPreferences|customerProfiles/.test(source)
    )
      findings.push(
        'Feedback invitation policy cannot project private Client content',
      );
  }
  if (dedicated)
    requireMarkers([
      'SET TRANSACTION READ ONLY',
      'RepeatableRead',
      'this.channels.authenticate(proof, tx)',
      'this.context.get()?.userId !== userId',
      'clientChannelSubjectHash(',
      'links.length !== 1',
      'revokedAt: null',
      'subjectHashVersion !== 1',
      'verificationVersion !== 1',
      'mergedIntoClientId',
      'unresolvedClientIdentityHold.findFirst',
      'tenantId_clientId',
      'profile.clientId !== clientId',
      'profile.tenantId !== tenantId',
    ]);
  if (file === 'customers/customers.service.ts') {
    requireMarkers(['this.profileReader().forAccount(', '.forStaffAccount(']);
    if (/\.customerProfiles?\./.test(source))
      findings.push('CustomersService bypasses shared profile reader');
  }
  if (file === 'crm/maya-user-client-association-issuer.ts') {
    if (
      /\.(client|customerProfile)\.find|clientUserBinding|profileUserBinding/.test(
        source,
      )
    )
      findings.push(
        'Retired FK association issuer cannot supply Client authority',
      );
    requireMarkers([
      'Promise.reject(',
      "new ForbiddenException('Trusted verified Client resolution required')",
    ]);
  }
  if (file === 'customer-portal/customer-portal.service.ts') {
    requireMarkers([
      'this.customersService.getOwnProfile(scopedTenantId, userId)',
    ]);
    if (/\.customerProfiles?\./.test(source))
      findings.push('Portal bypasses shared profile reader');
  }
  if (file === 'users/users.service.ts') {
    requireMarkers(['this.profiles.forAccount(']);
    if (/\.customerProfiles?\./.test(source))
      findings.push('User metadata bypasses shared profile reader');
  }
  if (
    [
      'crm/client-habits.service.ts',
      'crm/client-preferences.service.ts',
    ].includes(file)
  )
    requireMarkers([
      'const identity = await this.identity(tx, proof)',
      'this.channels.authenticate(proof, tx)',
      'links.length !== 1',
      'revokedAt: null',
      'assertClientEligible(tx, channel.tenantId, link.clientId)',
      'tenantId: identity.tenantId',
      'clientId: identity.clientId',
    ]);
  return findings;
}
