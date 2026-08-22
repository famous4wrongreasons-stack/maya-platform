import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

import { ActionCapabilityRegistry } from './action-engine.registry';

const SOURCE_ROOT = join(process.cwd(), 'src');
const PROVIDER_WRITE_METHODS = new Set([
  'createAppointment',
  'rescheduleAppointment',
  'cancelAppointment',
]);
const CANONICAL_PROVIDER_OWNER = 'crm/crm.service.ts';
const FORBIDDEN_ACTION_ENGINE_IMPORTS = [
  '/crm/',
  '/campaign',
  '/messaging',
  '/billing',
  '/loyalty',
  '/notifications/',
];
const LEGACY_BRIDGE_FILES = [
  join(SOURCE_ROOT, 'crm/legacy-appointment-bridge.controller.ts'),
  join(SOURCE_ROOT, 'crm/legacy-appointment-bridge.service.ts'),
  join(SOURCE_ROOT, 'crm/dto/legacy-appointment-bridge.dto.ts'),
];

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) {
      return [];
    }
    return [path];
  });
}

function relativeSourcePath(path: string): string {
  return relative(SOURCE_ROOT, path).replaceAll('\\', '/');
}

describe('appointment action execution boundary', () => {
  it('keeps provider appointment writes behind CrmService only', () => {
    const directProviderCalls: string[] = [];

    for (const path of productionFiles(SOURCE_ROOT)) {
      const sourceText = readFileSync(path, 'utf8');
      const source = ts.createSourceFile(
        path,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          PROVIDER_WRITE_METHODS.has(node.expression.name.text) &&
          node.expression.expression.getText(source) === 'adapter'
        ) {
          const line =
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1;
          directProviderCalls.push(`${relativeSourcePath(path)}:${line}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(directProviderCalls.length).toBe(3);
    expect(
      directProviderCalls.every((call) =>
        call.startsWith(`${CANONICAL_PROVIDER_OWNER}:`),
      ),
    ).toBe(true);
  });

  it('keeps the generic Action Engine free of side-effect owners', () => {
    const violations: string[] = [];
    const actionEngineRoot = join(SOURCE_ROOT, 'action-engine');

    for (const path of productionFiles(actionEngineRoot)) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      source.forEachChild((node) => {
        if (
          !ts.isImportDeclaration(node) ||
          !ts.isStringLiteral(node.moduleSpecifier)
        ) {
          return;
        }
        const imported = node.moduleSpecifier.text.toLowerCase();
        if (
          FORBIDDEN_ACTION_ENGINE_IMPORTS.some((part) =>
            imported.includes(part),
          )
        ) {
          violations.push(`${relativeSourcePath(path)} -> ${imported}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('defers attendance until finding 4.43 has a safe write contract', () => {
    const capabilities = new ActionCapabilityRegistry().list();

    expect(
      capabilities.some(
        (capability) =>
          capability.actionClass.includes('attendance') ||
          capability.capability.includes('attendance'),
      ),
    ).toBe(false);
  });

  it('keeps the legacy bridge as an initiator of CrmService only', () => {
    const servicePath = join(
      SOURCE_ROOT,
      'crm/legacy-appointment-bridge.service.ts',
    );
    const source = ts.createSourceFile(
      servicePath,
      readFileSync(servicePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const imports: string[] = [];
    source.forEachChild((node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        imports.push(node.moduleSpecifier.text);
      }
    });

    expect(imports).toContain('./crm.service');
    expect(
      imports.filter((value) =>
        /(adapter|yclients|executor|campaign|messaging|billing)/i.test(value),
      ),
    ).toEqual([]);
  });

  it('does not expand the bridge into the deferred attendance mutation', () => {
    for (const path of LEGACY_BRIDGE_FILES) {
      expect(readFileSync(path, 'utf8').toLowerCase()).not.toContain(
        'attendance',
      );
    }
  });
});
