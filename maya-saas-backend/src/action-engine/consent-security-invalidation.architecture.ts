import ts from 'typescript';
const owner = 'package5-wave3/consent-security-invalidation.service.ts';
const consumers = new Set([
  'communication-delivery/communication-bulk-policy.service.ts',
  'communication-delivery/communication-web-push.service.ts',
  'appointment-notifications/appointment-reminder-orchestrator.service.ts',
  'crm/client-wanted-slot.service.ts',
  'crm/client-channel-runtime.service.ts',
  'crm/client-profile-read.service.ts',
  'package5-wave3/package5-wave3.service.ts',
]);
export function scanConsentSecurityBoundary(
  file: string,
  source: string,
): string[] {
  if (/\.(spec|architecture)\.ts$/.test(file)) return [];
  const findings: string[] = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const access = node.expression;
      if (
        ts.isPropertyAccessExpression(access.expression) &&
        access.expression.name.text === 'clientConsentInvalidation' &&
        /^(create|update|upsert|delete)/.test(access.name.text)
      ) {
        if (file !== owner || access.name.text !== 'create')
          findings.push(
            'Security invalidation writer outside exact append-only A18 executor',
          );
      }
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      if (
        /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?ClientConsentInvalidation\b/i.test(
          node.getText(ast),
        )
      )
        findings.push('Raw SQL security invalidation writer');
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (
    consumers.has(file) &&
    !/\b(?:await|return) effectiveClientConsents?\(/.test(source)
  )
    findings.push(
      'Effective consent consumer ignores canonical invalidation resolver',
    );
  if (file === owner) {
    for (const marker of [
      'this.ingress.createExecution(',
      'this.serializable(',
      'this.approval.verify(',
      'this.authority(tx, actor)',
      'lockClientConsent(',
      '.revokeInTransaction(',
      'this.snapshot(tx, c, m.authority)',
      'evidenceSetHash: input.evidenceSetHash',
    ])
      if (!source.includes(marker))
        findings.push(
          'A18 security admission/authority/atomicity guard missing: ' + marker,
        );
    if (
      /recordChannelConsent\(|sourceType:\s*['"]client_command|clientConsentFact\.(create|update|delete|upsert)/.test(
        source,
      )
    )
      findings.push(
        'Security invalidation impersonates Client revoke or rewrites history',
      );
  }
  if (file === 'crm/client-effective-consent.ts') {
    for (const marker of [
      'tenantId, clientId, kind',
      'const head = facts[0]',
      '!head.invalidation',
      "decision === 'grant'",
      'invalidation: { select: { id: true } }',
    ])
      if (!source.includes(marker))
        findings.push('Effective head/tenant/Client rule missing: ' + marker);
    if (/invalidation:\s*(?:null|\{\s*is:\s*null)/.test(source))
      findings.push('Filtering invalidated heads resurrects historical grants');
  }
  return findings;
}
