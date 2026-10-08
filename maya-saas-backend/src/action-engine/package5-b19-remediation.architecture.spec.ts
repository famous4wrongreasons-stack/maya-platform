import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(__dirname, '../../..');
const pwa = resolve(root, 'ai администратор');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

function createDispatch(source: string) {
  const file = ts.createSourceFile(
    'crm.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const owner = file.statements.find(
    (node): node is ts.ClassDeclaration =>
      ts.isClassDeclaration(node) && node.name?.text === 'CrmService',
  );
  const method = owner?.members.find(
    (node): node is ts.MethodDeclaration =>
      ts.isMethodDeclaration(node) &&
      node.name.getText(file) === 'createAppointmentActionPlan',
  );
  const returned = method?.body?.statements.find(
    ts.isReturnStatement,
  )?.expression;
  const property = (node: ts.Node | undefined, name: string) =>
    node && ts.isObjectLiteralExpression(node)
      ? node.properties.find(
          (entry): entry is ts.PropertyAssignment =>
            ts.isPropertyAssignment(entry) && entry.name.getText(file) === name,
        )?.initializer
      : undefined;
  const dispatch = property(property(returned, 'handlers'), 'dispatch');
  if (!dispatch || !ts.isArrowFunction(dispatch) || !ts.isBlock(dispatch.body))
    throw new Error('Missing canonical create dispatch');
  return { file, body: dispatch.body };
}

function createDispatchRechecksAuthority(source: string) {
  const { file, body } = createDispatch(source);
  const awaitedCall = (node: ts.Node | undefined, target: string) =>
    !!node &&
    ts.isAwaitExpression(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(file) === target;
  const directAwait = (node: ts.Statement, target: string) =>
    ts.isExpressionStatement(node) && awaitedCall(node.expression, target);
  const auth = body.statements.findIndex((node) =>
    directAwait(node, 'invocation.authorizationCheck'),
  );
  const sourceCheck = body.statements.findIndex((node) =>
    directAwait(node, 'assertSourceCurrent'),
  );
  const providerCalls = body.statements.flatMap((node, index) =>
    ts.isVariableStatement(node)
      ? node.declarationList.declarations
          .filter((declaration) =>
            awaitedCall(declaration.initializer, 'adapter.createAppointment'),
          )
          .map((declaration) => ({ index, value: declaration.initializer! }))
      : [],
  );
  if (providerCalls.length !== 1) return false;
  const provider = providerCalls[0];
  if (!(auth >= 0 && auth < sourceCheck && sourceCheck < provider.index))
    return false;
  const call = (provider.value as ts.AwaitExpression)
    .expression as ts.CallExpression;
  const input = call.arguments[0];
  if (
    !input ||
    !ts.isObjectLiteralExpression(input) ||
    !input.properties.some(
      (node) =>
        ts.isShorthandPropertyAssignment(node) &&
        node.name.text === 'assertSourceCurrent',
    )
  )
    return false;
  const sourceCallback = body.statements
    .filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find(
      (node) => node.name.getText(file) === 'assertSourceCurrent',
    )?.initializer;
  return (
    !!sourceCallback &&
    ts.isConditionalExpression(sourceCallback) &&
    sourceCallback.condition.getText(file) === 'verifiedCanonicalClient' &&
    ts.isArrowFunction(sourceCallback.whenTrue) &&
    ts.isBlock(sourceCallback.whenTrue.body) &&
    sourceCallback.whenTrue.body.statements.some((node) =>
      directAwait(node, 'invocation.authorizationCheck'),
    )
  );
}

function pythonFunction(source: string, name: string) {
  const match = new RegExp(`(?:^|\\n)([ \\t]*)(?:async )?def ${name}\\(`).exec(
    source,
  );
  if (!match || match.index === undefined)
    throw new Error(`Missing production function ${name}`);
  const start = match.index + (match[0].startsWith('\n') ? 1 : 0);
  const indent = match[1];
  const tail = source.slice(start + 1);
  const nextFunction = tail.search(new RegExp(`\\n${indent}(?:async )?def `));
  const classEnd = indent ? tail.search(/\n(?=\S)/) : -1;
  const ends = [nextFunction, classEnd].filter((value) => value >= 0);
  return source.slice(
    start,
    ends.length ? start + 1 + Math.min(...ends) : undefined,
  );
}

describe('Package 5 B19 chat booking ownership remediation', () => {
  it('routes chat booking through verified ClientChannelLink and the existing action', () => {
    const source = read('ai администратор/webhook_server.py');
    const finalize = pythonFunction(source, '_finalize_booking_for_chat');
    expect(finalize).toContain(
      'client_commands.command("chat-appointment-create"',
    );
    expect(finalize).toContain('command_context.proof');
    expect(finalize).toContain('state == "UNKNOWN"');
    expect(finalize).not.toMatch(
      /database\.|_yc\.|get_or_create_client|save_booking|lazy_backfill_for_client|apply_redemption_for_booking|get_notify_prefs_by_chat_id/,
    );
    for (const handler of ['chat_handler', 'chat_stream_handler']) {
      const body = pythonFunction(source, handler);
      expect(body).toContain('_client_command_context=request_context');
      expect(body).toContain('_client_command_context=_client_command_context');
      expect(body).toContain('_client_command_context, contact_request');
      expect(body).not.toMatch(
        /_finalize_booking_for_chat(?:\(|,\s*)chat_id|_yc\.create_booking|database\.save_booking|apply_redemption_for_booking/,
      );
    }
  });

  it('keeps caller identity fields out of the canonical create payload', () => {
    const runtime = read(
      'maya-saas-backend/src/crm/client-channel-runtime.service.ts',
    );
    const start = runtime.indexOf('async createClientAppointment(');
    const end = runtime.indexOf('async cancelClientAppointment(', start);
    const create = runtime.slice(start, end);
    expect(create).toContain('this.resolve(channelProof, tx)');
    expect(create).toContain('this.appointmentCreator.forVerifiedChannel(');
    expect(create).toContain("scope: 'appointments.client.create.v1'");
    expect(create).toContain('authorizationCheck: async () =>');
    expect(create).toContain('authority.linkId,');
    expect(create).not.toContain('executeCreateAppointmentWithReceipt(');
    const creator = read(
      'maya-saas-backend/src/appointments/client-appointment-create.service.ts',
    );
    expect(creator).toContain('executeCanonicalClientCreateWithReceipt(');
    expect(creator).toContain('clientPrincipal: { linkId: link.id }');
    expect(create).not.toMatch(
      /input\.(?:clientId|clientPhone|phone|tenantId|chat_id)/,
    );
  });

  it('rechecks verified authority immediately before create provider dispatch', () => {
    const crm = read('maya-saas-backend/src/crm/crm.service.ts');
    expect(createDispatchRechecksAuthority(crm)).toBe(true);
  });

  it('rejects a removed or late direct recheck even when nested and sibling rechecks remain', () => {
    const crm = read('maya-saas-backend/src/crm/crm.service.ts');
    const { file, body } = createDispatch(crm);
    const recheck = body.statements[0];
    expect(recheck.getText(file)).toBe(
      'await invocation.authorizationCheck?.();',
    );
    const without =
      crm.slice(0, recheck.getStart(file)) + crm.slice(recheck.getEnd());
    expect(createDispatchRechecksAuthority(without)).toBe(false);
    const withoutDispatch = createDispatch(without);
    const end = withoutDispatch.body.getEnd() - 1;
    const late =
      without.slice(0, end) + recheck.getText(file) + without.slice(end);
    expect(createDispatchRechecksAuthority(late)).toBe(false);
    const unforwarded =
      crm.slice(0, body.getStart(file)) +
      body.getText(file).replace(/\n\s+assertSourceCurrent,/, '') +
      crm.slice(body.getEnd());
    expect(createDispatchRechecksAuthority(unforwarded)).toBe(false);
  });

  it('ratchets all three reconstructed legacy mutation-capable sites', () => {
    const guard = resolve(pwa, 'package5_control_plane_runtime_guard.py');
    const result: unknown = JSON.parse(
      execFileSync('python3', [guard, '--root', pwa, '--json'], {
        encoding: 'utf8',
      }),
    );
    expect(result).toMatchObject({
      pass: true,
      b19ChatBookingLegacyWriteSites: 0,
      b19ChatBookingInventoryCoverage: '3/3',
      b19ChatStreamAuthorityParity: true,
      b19ChatStreamMutationOwnerParity: true,
    });
  });
});
