import ts from 'typescript';
/** Permanent background scan; only exact test filenames are excluded. */
export function scanBackgroundCommunicationSource(
  file: string,
  source: string,
): string[] {
  if (file.endsWith('.spec.ts') || file.endsWith('.architecture.ts')) return [];
  const background =
    file.endsWith('.scheduler.ts') ||
    file.startsWith('appointment-notifications/');
  if (!background) return [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const failures: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const call = node.expression.getText(ast);
      if (
        /phoneMatchKey|clientRecipientsByPhone|get_or_create_client/.test(call)
      )
        failures.push('Phone/legacy identity in background communication');
      if (
        /(?:sendMessage|sendNotification|sendTelegram|publishForTenant)$/.test(
          call,
        )
      )
        failures.push(
          'Background direct delivery outside verified Communication Delivery',
        );
      if (
        /\.(?:client|clientChannelLink|inboxItem)\.(?:create|upsert|update|delete)(?:Many)?$/.test(
          call,
        )
      )
        failures.push('Background business writer');
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      /^(?:phone|client_phone|chat_id)$/.test(node.name.text)
    )
      failures.push('Background raw recipient authority');
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (
    file ===
    'appointment-notifications/appointment-reminder-orchestrator.service.ts'
  ) {
    for (const guard of [
      'appointment.mayaClientId',
      'mergedIntoClientId: null',
      'this.ingress.createExecution(',
      'this.existing(tenantId, occurrence)',
      'this.authority(tenantId, p.appointmentId, this.now())',
      'a.scheduleHash !== p.scheduleHash',
      'endpoint.identityRef !== value.recipientIdentityRef',
      'this.devices.resolveForDelivery(',
      'this.communication.deliverAppointmentReminder(dispatch)',
      'this.webPush.deliverReminder(dispatch, true)',
    ])
      if (!source.includes(guard))
        failures.push(`Required B25 boundary missing: ${guard}`);
    if (/appointment\.clientId|\.catch\([^]*?deliverReminder/.test(source))
      failures.push('Alternate recipient/fallback');
    const recipient = source.indexOf('if (!linkId && !endpointIds.length)');
    const payload = source.indexOf('const shared =');
    if (recipient < 0 || payload < recipient)
      failures.push('Private payload before recipient authority');
  }
  return failures;
}
