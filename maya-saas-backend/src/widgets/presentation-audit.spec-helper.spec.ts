// Shared BUILD-only census of the exact post-gateway audit sink. Never shipped at runtime.
import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';

/** §4.4.1 requires the actual claimed profile in the submission audit. Admit
 * only the literal metadata projection in the DI-bound post-gateway sink, not
 * the module/file, a conditional, a query or any gate-facing call. */
export const withoutBookingAuditProfileProjection = (
  source: string,
): string => {
  const tree = ts.createSourceFile(
    'widgets.module.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const spans: { start: number; end: number }[] = [];
  const text = (node: ts.Node): string =>
    node.getText(tree).replace(/\s+/g, '');
  const property = (object: ts.ObjectLiteralExpression, name: string) =>
    object.properties.find(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) && text(p.name) === name,
    );
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      text(node) === 'dto.profile_id'
    ) {
      const field = node.parent;
      const object = field.parent;
      const call = object.parent;
      let callback: ts.PropertyAssignment | undefined;
      let factory: ts.PropertyAssignment | undefined;
      for (
        let parent: ts.Node | undefined = call;
        parent;
        parent = parent.parent
      ) {
        if (
          ts.isPropertyAssignment(parent) &&
          text(parent.name) === 'recordAcceptedBookingSelection'
        )
          callback = parent;
        if (
          ts.isPropertyAssignment(parent) &&
          text(parent.name) === 'useFactory'
        )
          factory = parent;
      }
      const provider = factory?.parent;
      const expected = [
        'tenantId',
        'widgetId',
        'intentTokenHash',
        'clientNonce',
        'profileId',
        'clientEmittedAt',
        'inputsClosed',
      ].sort();
      if (
        ts.isPropertyAssignment(field) &&
        field.initializer === node &&
        text(field.name) === 'profileId' &&
        ts.isObjectLiteralExpression(object) &&
        object.properties.every(ts.isPropertyAssignment) &&
        object.properties
          .map((p) => text(p.name!))
          .sort()
          .join('|') === expected.join('|') &&
        ts.isCallExpression(call) &&
        call.arguments.length === 1 &&
        call.arguments[0] === object &&
        text(call.expression) === 'stores.recordAcceptedBookingSelection' &&
        callback &&
        ts.isArrowFunction(callback.initializer) &&
        callback.initializer.parameters.map((p) => text(p.name)).join('|') ===
          'dto|actor' &&
        factory &&
        ts.isArrowFunction(factory.initializer) &&
        factory.initializer.parameters.length === 1 &&
        text(factory.initializer.parameters[0]) ===
          'stores:WidgetStoresService' &&
        provider &&
        ts.isObjectLiteralExpression(provider) &&
        property(provider, 'provide')?.initializer.getText(tree) ===
          'BOOKING_SELECTION_AUDIT' &&
        text(property(provider, 'inject')?.initializer ?? tree) ===
          '[WidgetStoresService]'
      ) {
        spans.push({ start: node.getStart(tree), end: node.end });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const span of spans.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, span.start) + 'undefined' + source.slice(span.end);
  }
  return source;
};

describe('post-gateway booking audit source boundary', () => {
  it('admits the exact metadata projection while retaining an added authority predicate', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'widgets.module.ts'),
      'utf8',
    );
    expect(withoutBookingAuditProfileProjection(source)).not.toMatch(
      /dto\.profile_id/,
    );
    expect(
      withoutBookingAuditProfileProjection(
        source.replace('if (!actor.tenantId)', 'if (dto.profile_id)'),
      ),
    ).toMatch(/dto\.profile_id/);
  });
});
