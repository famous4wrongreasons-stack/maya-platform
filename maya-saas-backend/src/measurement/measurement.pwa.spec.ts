import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import {
  createSourceFile,
  ScriptTarget,
  ScriptKind,
  isFunctionDeclaration,
} from 'typescript';
const backend = resolve(__dirname, '../..');
const source = readFileSync(
  resolve(backend, '../сайт и приложение/app.html'),
  'utf8',
);
// Release utility is intentionally dependency-free for candidate verification.
const { verifyPwa } = createRequire(__filename)(
  '../../deploy/platform/chapter7-consumers/verify-pwa.cjs',
) as {
  verifyPwa: (s: string) => { scriptsParsed: number };
};
function functions(names: string[]) {
  const bodies = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .join('\n');
  const ast = createSourceFile(
    'pwa.js',
    bodies,
    ScriptTarget.Latest,
    true,
    ScriptKind.JS,
  );
  return ast.statements
    .filter(
      (node) =>
        isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''),
    )
    .map((node) => node.getText(ast))
    .join('\n');
}
const helper = functions(['meMeasurementValue', 'meMeasurementNotice']);
const display = (metrics: unknown[], key = 'net_profit') =>
  runInNewContext(`${helper}; meMeasurementValue(input,key)`, {
    input: { contract: 'c7.measurement.read/1', metrics },
    key,
  }) as string;
describe('C7 P06 PWA display and permanent release guard', () => {
  it('parses all inline scripts and accepts only qualified money consumers', () => {
    expect(verifyPwa(source).scriptsParsed).toBeGreaterThan(0);
  });
  it.each([
    'moneyList(A.net)',
    'var firstKopecks',
    "statCard('Поступления YClients'",
  ])('release rejects restored legacy financial projection %s', (bad) => {
    expect(() => verifyPwa(source + '\n' + bad)).toThrow();
  });
  it('unknown is never zero, valid zero is still an observed zero', () => {
    expect(display([])).toBe('—');
    expect(
      display([
        {
          key: 'net_profit',
          value: null,
          currency: 'RUB',
          unit: 'money_minor',
          state: 'NOT_MEASURED',
        },
      ]),
    ).toBe('—');
    expect(
      display([
        {
          key: 'net_profit',
          value: '0',
          currency: 'RUB',
          unit: 'money_minor',
          state: 'COMPLETE',
        },
      ]),
    ).toBe('0 ₽');
    expect(
      display([
        {
          key: 'net_profit',
          value: '100',
          currency: null,
          unit: 'money_minor',
          state: 'COMPLETE',
        },
      ]),
    ).toBe('—');
    expect(
      display([
        {
          key: 'net_profit',
          value: '9007199254740992',
          currency: 'RUB',
          unit: 'money_minor',
          state: 'COMPLETE',
        },
      ]),
    ).toBe('—');
  });
  it('currencies remain separate and source does not fabricate a monetary ranking', () => {
    const text = display(
      ['USD', 'EUR'].map((currency) => ({
        key: 'net_profit',
        value: '100',
        currency,
        unit: 'money_minor',
        state: 'COMPLETE',
      })),
    );
    expect(text).toBe('1 USD · 1 EUR');
    expect(source).not.toContain('firstKopecks');
  });
  it('chat report formatting preserves operational counts and renders unknown net explicitly', () => {
    const body = functions(['ABusinessReportCard']);
    const tree: unknown = runInNewContext(
      `${helper}\n${body}; ABusinessReportCard({data:input})`,
      {
        React: {
          createElement: (
            name: unknown,
            props: unknown,
            ...children: unknown[]
          ) => ({ name, props, children }),
        },
        meReportPanelTheme: () => ({}),
        AChatReportShell: 'shell',
        input: {
          appointments: 3,
          unique_clients: 2,
          cancellations: 0,
          measurement: {
            contract: 'c7.measurement.read/1',
            metrics: [],
            completeness: 'NOT_MEASURED',
            asOf: '2026-01-01T00:00Z',
          },
        },
      },
    );
    expect(JSON.stringify(tree)).toContain('Записей: 3');
    expect(JSON.stringify(tree)).toContain('Отмен: 0');
    expect(JSON.stringify(tree)).toContain('«—» означает');
    expect(JSON.stringify(tree)).not.toContain('0 ₽');
  });
});
