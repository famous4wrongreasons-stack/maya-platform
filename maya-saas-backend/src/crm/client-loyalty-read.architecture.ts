import ts from 'typescript';

export function scanClientLoyaltyRead(file: string, source: string): string[] {
  if (file.endsWith('.spec.ts') || file.endsWith('.architecture.ts')) return [];
  const errors: string[] = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const dedicated = file === 'crm/client-loyalty-read.service.ts';
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.body) {
      const name = node.name.getText(ast),
        body = node.body.getText(ast);
      const isRead =
        dedicated ||
        /^(getForUser|getStateForUser|getStateForClient|listTransactions|listTransactionsForClient|readOwnLoyalty|readClientDossier|listCustomers|getCustomer|cabinetProjection|loyaltyProjection)$/.test(
          name,
        ) ||
        (/read|get|list|projection/i.test(name) && /loyalty/i.test(body));
      const p4Evidence =
        file === 'crm/crm.service.ts' &&
        [
          'getClientLoyaltyEvidenceReadOnly',
          'getClientLoyaltyEvidenceByExternalIdReadOnly',
        ].includes(name);
      if (isRead) {
        if (
          !p4Evidence &&
          /getExternalAccount|getLegacyMayaAccount|authIdentity\.|getClientLoyalty\(|getClientLoyaltyEvidenceReadOnly\(|get_or_create_client|findClientByPhone|resolveByPhone|\.loyaltyAccounts\b|loyaltyAccounts\s*:/.test(
            body,
          )
        )
          errors.push(`${name}: legacy loyalty identity/value authority`);
        const walk = (child: ts.Node) => {
          if (ts.isCallExpression(child)) {
            const call = child.expression.getText(ast);
            if (
              /\.(?:loyaltyAccount|loyaltyTransaction|client|crmClientLink)\.(create|update|upsert|delete)(Many)?$/.test(
                call,
              )
            )
              errors.push(`${name}: read business mutation`);
            if (/\.loyaltyAccount\.find(?:Unique|First|Many)$/.test(call)) {
              const args = child.arguments[0]?.getText(ast) ?? '';
              if (!/tenantId_clientId/.test(args))
                errors.push(`${name}: non-Client account identity`);
              if (
                !dedicated &&
                !(
                  file === 'crm/client-channel-runtime.service.ts' &&
                  name === 'cabinetProjection' &&
                  /clientChannelLink\.findMany/.test(body) &&
                  /links.length !== 1/.test(body) &&
                  /unresolvedClientIdentityHold/.test(body)
                )
              )
                errors.push(
                  `${name}: private value without verified Client boundary`,
                );
            }
          }
          ts.forEachChild(child, walk);
        };
        walk(node.body);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (dedicated) {
    for (const required of [
      'SET TRANSACTION READ ONLY',
      'this.channels.authenticate(proof, tx)',
      'clientChannelSubjectHash(',
      'links.length !== 1',
      'revokedAt: null',
      'subjectHashVersion !== 1',
      'verificationVersion !== 1',
      'mergedIntoClientId',
      'unresolvedClientIdentityHold.findFirst',
      'tenantId_clientId',
      'loyalty_account_not_established',
      'RepeatableRead',
    ]) {
      if (!source.includes(required))
        errors.push(`Missing read guard: ${required}`);
    }
  }
  return errors;
}
