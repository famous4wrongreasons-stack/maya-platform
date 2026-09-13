import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p: string) =>
  readFileSync(resolve(__dirname, '../..', p), 'utf8');
describe('C8 Wave2 population, prospective clock and no fallback ratchets', () => {
  it('publication and current reads revalidate query populations and every ranking dependency', () => {
    const store = read('src/valuation/c8.store.ts');
    expect(store).toContain('c8PopulationCurrent(tx');
    expect(store).toContain('this.refsCurrent(dependency');
    expect(store).toContain('c8_source_population_changed');
    const population = read('src/valuation/c8.population.ts');
    expect(population).toContain('mergedIntoClientId: null');
    expect(population).toContain('c8_complete_bounded_cohort_required');
  });
  it('all captures use existing C7 owner; closed features do not accept caller values', () => {
    const capture = read('src/valuation/c8.capture.ts');
    expect(capture).toContain('owner.reportSnapshot(input, identity)');
    expect(capture).toContain("state === 'COMPLETE'");
    expect(capture).not.toMatch(/\.(?:create|upsert|update|delete)\(/);
    const producer = read('src/valuation/c8.producer.ts');
    expect(producer).toContain('c8_current_server_cutoff_required');
    expect(producer).toContain('c8_existing_future_appointment_required');
    expect(producer).toContain('qualified_model_unavailable');
  });
  it('one existing bounded scheduler, no new live-training or communication owner', () => {
    const worker = read('src/valuation/c8.worker.ts');
    expect(worker).not.toMatch(
      /setInterval|setTimeout|sendMessage|sendPush|fetch\(/,
    );
    expect(worker).toContain('if (!configured)');
    expect(worker).toContain('if (existing) continue');
    const scheduler = read(
      'src/operational-alerts/operational-alerts.scheduler.ts',
    );
    expect(scheduler.match(/setInterval\(/g)).toHaveLength(1);
    expect(scheduler).toContain('this.valuation.tickTenant');
  });
  it('rank manifest is reconstructed from frozen refs and unchanged whole cohort', () => {
    const source = read('src/valuation/c8.ranking.ts');
    expect(source).toContain('c8_rank_population_changed');
    expect(source).toContain("'predictive_comparator_unavailable'");
    expect(source).not.toMatch(/phone|email|sendMessage|campaign/i);
  });
  it('immutable query evidence carries no contact data or direct provider writes', () => {
    const population = read('src/valuation/c8.population.ts');
    expect(population).not.toMatch(/phone|email|providerPayload|notes|chat_id/);
    expect(population).toContain('c8PopulationQuery');
  });
});
