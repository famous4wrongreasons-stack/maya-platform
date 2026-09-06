import ts from 'typescript';

const owner = 'package5-wave4/package5-wave4.service.ts';
const reads = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

function property(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  )
    return node.argumentExpression.text;
  return undefined;
}

/** Source ratchet, including delegate escape/alias and nested relation writes. */
export function scanReviewAuthority(path: string, source: string): string[] {
  if (
    path.endsWith('.spec.ts') ||
    path === 'business-content/review-authority.architecture.ts'
  )
    return [];
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const findings: string[] = [];
  function visit(node: ts.Node, className = '', method = '') {
    if (ts.isClassDeclaration(node)) className = node.name?.text ?? '';
    if (ts.isMethodDeclaration(node)) method = node.name.getText(file);
    const acceptedOwner =
      path === owner &&
      className === 'Package5Wave4ReviewFactService' &&
      method === 'accept';
    if (property(node) === 'businessReview') {
      const operation = property(node.parent);
      if (
        !operation ||
        (!reads.has(operation) && !(acceptedOwner && operation === 'create'))
      )
        findings.push(
          `Review delegate/write outside immutable AC4 acceptance: ${node.getText(file)}`,
        );
    }
    if (
      ts.isPropertyAssignment(node) &&
      ['businessReviews', 'BusinessReview', 'businessReview'].includes(
        node.name.getText(file).replace(/['"]/g, ''),
      )
    )
      findings.push('Nested review write or delegate alias is forbidden');
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
      const value = ts.isTemplateExpression(node)
        ? node.getText(file)
        : node.text;
      if (
        /\bBusinessReview\b/i.test(value) &&
        /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|DROP|REPLACE)\b/i.test(
          value,
        )
      )
        findings.push('Raw review SQL bypass is forbidden');
    }
    ts.forEachChild(node, (child) => visit(child, className, method));
  }
  visit(file);
  return findings;
}
