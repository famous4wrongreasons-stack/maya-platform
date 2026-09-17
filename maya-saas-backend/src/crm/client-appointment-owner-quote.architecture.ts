import ts from 'typescript';

/** U-OWN·V11 permanent fence for the read-only extractions inside the three
 * booking owners.
 *
 * Two properties are pinned, and nothing else:
 *
 * 1. **Read only.** `quoteForAccount`, `quoteOwnedReschedule` and
 *    `readOwnedCancelTarget` (and the private create-side extraction they share
 *    with the actuating path) execute no Action Engine action and write no row.
 * 2. **One sequence.** The actuating entry point calls the extraction instead of
 *    repeating it, so a quote can never drift from what the owner would do.
 *
 * FR-16 (C11:1800) is the third: these owners gain no C9 or Action Engine
 * registry field, and no canonical column. The registry and schema halves of
 * that clause are pinned in the spec beside this file; the source half is here.
 */

export const OWNER_QUOTE_SOURCES = {
  create: 'appointments/client-appointment-create.service.ts',
  reschedule: 'crm/client-appointment-reschedule.service.ts',
  cancel: 'crm/client-appointment-cancel.service.ts',
} as const;

/** Names this unit introduced. FR-16: none of them may become a persisted
 * column or a registry member. */
export const OWNER_QUOTE_MEMBERS: readonly string[] = [
  'quoteForAccount',
  'quoteVerifiedLink',
  'quoteOwnedReschedule',
  'readOwnedCancelTarget',
  'canonicalStatus',
  'alreadyCancelled',
  'storedStatus',
];

/** A durable write or an Action Engine execution. `createHash().update()` is
 * neither, so the model receiver is required. */
const WRITE_CALL =
  /(?:prisma|tx)\.[A-Za-z_$][\w$]*\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|executeCanonicalClientCreateWithReceipt\(|executeInternalAppointment(?:Cancel|Reschedule)WithReceipt\(|execute(?:Cancel|Reschedule)AppointmentWithReceipt\(|executeOwned(?:Cancel|Reschedule)\(|executeWithReceipt\(/;

/** Registry surfaces FR-16 keeps these owners out of. `@prisma/client` types are
 * not a registry and stay allowed. */
const REGISTRY_REFERENCE =
  /RegisteredActionCapabilityV1|ActionCapabilityRegistry|registerCapability\(|defineCapability\(|c9Registry|C9_READ_REGISTRY/;

type Expectation = {
  /** the read-only extraction */
  extraction: string;
  /** methods that must reach the extraction rather than repeat it */
  callers: readonly string[];
  /** members the extraction must return */
  returns: readonly string[];
};

const EXPECTED: Record<string, Expectation> = {
  [OWNER_QUOTE_SOURCES.create]: {
    extraction: 'quoteVerifiedLink',
    callers: ['quoteForAccount', 'forVerifiedLink'],
    returns: ['bookingIdentity', 'services', 'previous'],
  },
  [OWNER_QUOTE_SOURCES.reschedule]: {
    extraction: 'quoteOwnedReschedule',
    callers: ['forAccount'],
    returns: ['target', 'prepared'],
  },
  [OWNER_QUOTE_SOURCES.cancel]: {
    extraction: 'readOwnedCancelTarget',
    // B-18: the adapter maps `already_cancelled` from the canonical status.
    callers: ['forAccount'],
    returns: ['target', 'canonicalStatus', 'alreadyCancelled'],
  },
};

export function scanClientAppointmentOwnerQuote(
  file: string,
  source: string,
): string[] {
  if (file.endsWith('.spec.ts') || file.endsWith('.architecture.ts')) return [];
  const normalized = file.replaceAll('\\', '/');
  const expected = Object.entries(EXPECTED).find(([path]) =>
    normalized.endsWith(path),
  )?.[1];
  if (!expected) return [];

  const failures: string[] = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const bodies = new Map<string, string>();
  const returned = new Map<string, Set<string>>();
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.body) {
      const name = node.name.getText(ast);
      bodies.set(name, node.body.getText(ast));
      const members = new Set<string>();
      const walk = (child: ts.Node) => {
        if (
          ts.isReturnStatement(child) &&
          child.expression &&
          ts.isObjectLiteralExpression(child.expression)
        )
          for (const property of child.expression.properties) {
            const member = property.name?.getText(ast);
            if (member) members.add(member);
          }
        ts.forEachChild(child, walk);
      };
      walk(node.body);
      returned.set(name, members);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);

  const extraction = bodies.get(expected.extraction);
  if (extraction === undefined) {
    failures.push(`missing read-only extraction: ${expected.extraction}`);
  } else {
    if (WRITE_CALL.test(extraction))
      failures.push(`${expected.extraction}: write or execution from a read`);
    const members = returned.get(expected.extraction) ?? new Set<string>();
    for (const member of expected.returns)
      if (!members.has(member))
        failures.push(`${expected.extraction}: missing ${member} in the quote`);
  }

  for (const caller of expected.callers) {
    const body = bodies.get(caller);
    if (body === undefined) {
      failures.push(`missing caller: ${caller}`);
      continue;
    }
    if (!body.includes(`this.${expected.extraction}(`))
      failures.push(
        `${caller}: must reach ${expected.extraction} instead of repeating it`,
      );
  }

  if (REGISTRY_REFERENCE.test(source))
    failures.push('FR-16: owner reaches a C9 or Action Engine registry');

  return failures;
}
