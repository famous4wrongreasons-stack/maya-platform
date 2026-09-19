import fs from 'node:fs';
import path from 'node:path';

const read = (name: string): string =>
  fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('P-G15a — Gates 1 and 5 are pure ingress checks', () => {
  it('G15-6 neither gate can reach a projector, an owner port, a store client or durable metrics', () => {
    for (const file of ['gate1.ts', 'gate5.ts']) {
      const source = read(file);
      for (const forbidden of [
        'WidgetProjectorService',
        'PrismaService',
        'owner-ports',
        'writeFile',
        'appendFile',
        'fetch(',
      ])
        expect({
          file,
          forbidden,
          present: source.includes(forbidden),
        }).toEqual({ file, forbidden, present: false });
    }
  });

  it('G15-1 the seal is the first decision and G15-3 uses the constant-time comparator', () => {
    const source = read('gate1.ts');
    const verify = source.indexOf('verifier.verify(');
    const record = source.indexOf('const r = ctx.record;');
    expect(verify).toBeGreaterThanOrEqual(0);
    expect(record).toBeGreaterThan(verify);
    expect(source).toContain(
      '!digestEquals(sha256Hex(r.widgetId), sha256Hex(submittedWidgetId))',
    );
    expect(source).not.toMatch(
      /r\.widgetId\s*(?:===|!==|==|!=)\s*submittedWidgetId/,
    );
  });

  it('G15-4 the divergence counter is process-local and increments before superseding', () => {
    const source = read('gate5.ts');
    expect(source).toContain('widgetFloorDivergence.increment();');
    expect(source.indexOf('widgetFloorDivergence.increment();')).toBeLessThan(
      source.indexOf("return superseded(\n      'policy_floor_changed'"),
    );
  });
});
