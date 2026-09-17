import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

import {
  OWNER_QUOTE_MEMBERS,
  OWNER_QUOTE_SOURCES,
  scanClientAppointmentOwnerQuote as scan,
} from './client-appointment-owner-quote.architecture';

const root = resolve(__dirname, '..');
const backend = resolve(root, '..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

/** The Action Engine registry contract as it stands. FR-16 (C11:1800): this
 * contract adds no field to it, so the list is a pin, not a snapshot. */
const REGISTERED_ACTION_CAPABILITY_V1 = [
  'capability',
  'capabilityVersion',
  'actionClass',
  'normalizedInputContract',
  'targetKind',
  'allowedSourceTypes',
  'identityVersion',
  'riskProfileVersion',
  'riskFacets',
  'policyKey',
  'policyVersion',
  'policyDecision',
  'autonomyLevel',
  'approvalRequirement',
  'approvalTtlMs',
  'retry',
  'reconciliation',
  'transportIdentityVersion',
  'executorKey',
  'executorVersion',
  'payloadRetentionMs',
  'auditRetentionMs',
  'normalizeInput',
];

describe('U-OWN read-only extractions inside the booking owners', () => {
  it('holds on the three owners', () => {
    for (const file of Object.values(OWNER_QUOTE_SOURCES))
      expect({ file, failures: scan(file, read(file)) }).toEqual({
        file,
        failures: [],
      });
  });

  it('ignores every other production source', () => {
    expect(
      scan(
        'crm/client-appointment-read.service.ts',
        read('crm/client-appointment-read.service.ts'),
      ),
    ).toEqual([]);
  });

  it('rejects an actuating entry that repeats the quote instead of calling it', () => {
    const file = OWNER_QUOTE_SOURCES.create;
    expect(
      scan(file, read(file).replaceAll('this.quoteVerifiedLink(', 'this.own(')),
    ).toEqual([
      'quoteForAccount: must reach quoteVerifiedLink instead of repeating it',
      'forVerifiedLink: must reach quoteVerifiedLink instead of repeating it',
    ]);
  });

  it.each([
    [
      OWNER_QUOTE_SOURCES.reschedule,
      'quoteOwnedReschedule',
      'const prepared = await this.prepareOwnedReschedule(target, dto);',
      'await this.prisma.appointment.update({});\n    const prepared = await this.prepareOwnedReschedule(target, dto);',
    ],
    [
      OWNER_QUOTE_SOURCES.cancel,
      'readOwnedCancelTarget',
      'const canonicalStatus = parseVisitOutcome(',
      'await this.crm.executeInternalAppointmentCancelWithReceipt();\n    const canonicalStatus = parseVisitOutcome(',
    ],
  ])(
    'rejects a write or an execution from the %s extraction',
    (file, extraction, from, to) => {
      expect(scan(file, read(file).replaceAll(from, to))).toContain(
        `${extraction}: write or execution from a read`,
      );
    },
  );

  it('rejects a cancel quote that drops the B-18 canonical status', () => {
    const file = OWNER_QUOTE_SOURCES.cancel;
    const source = read(file)
      .replaceAll('canonicalStatus,', 'stored: canonicalStatus,')
      .replaceAll('alreadyCancelled:', 'unused:');
    expect(scan(file, source)).toEqual([
      'readOwnedCancelTarget: missing canonicalStatus in the quote',
      'readOwnedCancelTarget: missing alreadyCancelled in the quote',
    ]);
  });

  it('rejects an owner that reaches a C9 or Action Engine registry (FR-16)', () => {
    const file = OWNER_QUOTE_SOURCES.reschedule;
    expect(
      scan(
        file,
        `${read(file)}\nexport type Widened = RegisteredActionCapabilityV1;\n`,
      ),
    ).toEqual(['FR-16: owner reaches a C9 or Action Engine registry']);
  });

  describe('FR-16 (C11:1800)', () => {
    it('adds no field to the Action Engine capability registry', () => {
      const file = 'action-engine/action-engine.contract.ts';
      const source = readFileSync(resolve(root, file), 'utf8');
      const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const members: string[] = [];
      const visit = (node: ts.Node) => {
        if (
          ts.isInterfaceDeclaration(node) &&
          node.name.text === 'RegisteredActionCapabilityV1'
        )
          for (const member of node.members) {
            const name = member.name?.getText(ast);
            if (name) members.push(name);
          }
        ts.forEachChild(node, visit);
      };
      visit(ast);
      expect(members).toEqual(REGISTERED_ACTION_CAPABILITY_V1);
    });

    it('adds no canonical column for the quote members', () => {
      const schema = readFileSync(
        resolve(backend, 'prisma/schema.prisma'),
        'utf8',
      );
      const declared = OWNER_QUOTE_MEMBERS.filter((member) =>
        new RegExp(`^\\s*${member}\\s+\\S`, 'm').test(schema),
      );
      expect(declared).toEqual([]);
    });
  });
});
