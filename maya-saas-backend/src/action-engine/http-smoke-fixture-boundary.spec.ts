import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  resolve(__dirname, '../../scripts/http-smoke-fixtures.ts'),
  'utf8',
);
const ast = ts.createSourceFile(
  'fixture.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
);
const guard = ast.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === 'requireHttpProofDatabase',
)!;
const code = ts.transpileModule(guard.getText(ast).replace(/^export /, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://proof@127.0.0.1:55620/maya_gates_smoke_fixture',
};
function run(env: Record<string, string>) {
  return runInNewContext(code + '\nrequireHttpProofDatabase()', {
    assert,
    URL,
    process: { env },
  }) as string;
}

describe('HTTP synthetic pre-state has no production writer authority', () => {
  it('admits owned loopback smoke databases and the actual GitHub service fixture', () => {
    expect(run(base)).toBe(base.DATABASE_URL);
    const ci = {
      ...base,
      DATABASE_URL: 'postgresql://maya_ci:maya_ci@127.0.0.1:5432/maya_ci',
      CI: 'true',
      GITHUB_ACTIONS: 'true',
    };
    expect(run(ci)).toBe(ci.DATABASE_URL);
  });

  it.each([
    { NODE_ENV: 'production' },
    {
      DATABASE_URL:
        'postgresql://proof@production.example/maya_gates_smoke_fixture',
    },
    { DATABASE_URL: 'postgresql://proof@127.0.0.1:55620/production' },
    { DATABASE_URL: 'postgresql://proof@127.0.0.1:55620/maya_ci' },
    { DATABASE_URL: 'postgresql://proof@127.0.0.1:55620/maya_ci', CI: 'true' },
    { DATABASE_URL: 'https://127.0.0.1/maya_gates_smoke_fixture' },
    { HTTP_SMOKE_EXTERNAL_SERVER: 'true' },
    { HTTP_SMOKE_BASE_URL: 'https://production.example/api' },
    { HTTP_SMOKE_BASE_URL: 'http://127.0.0.1:3101/not-api' },
    { HTTP_SMOKE_BASE_URL: 'http://user:pass@127.0.0.1:3101/api' },
    { HTTP_SMOKE_BASE_URL: 'http://127.0.0.1:3101/api?target=production' },
  ])(
    'rejects unsafe fixture context %j before opening a connection',
    (override) => {
      expect(() =>
        run({ ...base, ...override } as Record<string, string>),
      ).toThrow();
    },
  );

  it('constructs its only Prisma client with the guard result, never an ambient URL', () => {
    const clients: ts.NewExpression[] = [];
    function visit(node: ts.Node) {
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(ast) === 'PrismaClient'
      )
        clients.push(node);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    expect(clients).toHaveLength(1);
    expect(clients[0].getText(ast)).toMatch(
      /connectionString:\s*requireHttpProofDatabase\(\)/,
    );
  });
});
