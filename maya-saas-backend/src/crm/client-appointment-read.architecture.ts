import ts from 'typescript';

/** Client appointment reads across HTTP, cabinet, AI and channel surfaces.
 * Test exclusions are filename-qualified; production helpers are scanned too.
 */
export function scanClientAppointmentRead(
  file: string,
  source: string,
): string[] {
  if (file.endsWith('.spec.ts') || file.endsWith('.architecture.ts')) return [];
  const failures: string[] = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const dedicated = file.endsWith('client-appointment-read.service.ts');
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.body) {
      const name = node.name.getText(ast);
      const clientRead =
        dedicated ||
        /^(?:listClientAppointments|listOwnAppointments|listMyAppointments|cabinetProjection|appointmentsProjection)$/.test(
          name,
        ) ||
        (/(?:^|\/)(?:client|customer)[-/]/i.test(file) &&
          /appointment/i.test(name) &&
          /read|list|get|projection/i.test(name));
      if (clientRead) {
        const body = node.body.getText(ast);
        if (
          /getClientAppointments|syncExternalClientAppointments|get_or_create_client|findClientByPhone|phoneMatch|resolveByPhone|(?:user|profile|client|session)\.phone\s*[,)]/.test(
            body,
          )
        )
          failures.push(
            `${name}: legacy/phone authority or GET synchronization`,
          );
        const walk = (child: ts.Node) => {
          if (ts.isCallExpression(child)) {
            const call = child.expression.getText(ast);
            if (
              /\.(?:create|update|upsert|delete)(?:Many)?$|createForClient|updateForClient|syncExternal|applyObservation|\.bootstrap$/.test(
                call,
              )
            )
              failures.push(`${name}: business write/sync from read`);
            if (/\.appointment\.find(?:Many|First|Unique)$/.test(call)) {
              const argument = child.arguments[0];
              const where =
                argument && ts.isObjectLiteralExpression(argument)
                  ? argument.properties.find(
                      (prop) => prop.name?.getText(ast) === 'where',
                    )
                  : undefined;
              const args = where?.getText(ast) ?? '';
              if (
                !/tenantId:/.test(args) ||
                !/mayaClientId:/.test(args) ||
                /\bclientId:/.test(args)
              )
                failures.push(
                  `${name}: missing exact Appointment tenant/Client predicate`,
                );
              if (!dedicated && !/clientChannelLink\.findMany/.test(body))
                failures.push(
                  `${name}: private appointment projection without verified link`,
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
      'this.channels.authenticate(channelProof, tx)',
      'principal?.userId !== userId',
      "user: { status: 'active' }",
      'clientChannelSubjectHash(',
      'links.length !== 1',
      'revokedAt: null',
      'links[0].subjectHashVersion !== 1',
      'links[0].verificationVersion !== 1',
      'mergedIntoClientId',
      'unresolvedClientIdentityHold.findFirst',
      'mayaClientId: client.id',
      'tenantId: channel.tenantId',
    ])
      if (!source.includes(required))
        failures.push(`Required read authority missing: ${required}`);
  }
  if (
    file === 'appointments/appointments.service.ts' &&
    !source.includes(
      'return this.clientAppointmentReader.forAccount(tenantId, userId)',
    )
  )
    failures.push(
      'Account/AI/cabinet reader must use verified Client boundary',
    );
  return failures;
}
