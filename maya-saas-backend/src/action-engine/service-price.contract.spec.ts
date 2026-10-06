import { ActionContractError } from './action-engine.errors';
import { normalizeServicePriceInput } from './service-price.contract';

const input = {
  approval_id: 'approval-1',
  service_id: '201',
  company_id: '101',
  integration_revision: 'a'.repeat(64),
  current_revision: 'b'.repeat(64),
  current_price_rubles: '2000.01',
  price_rubles: 2500.25,
  service_name: 'Стрижка',
  currency: 'RUB',
};
describe('AE exact fixed-price input, independent of provider owners', () => {
  it('preserves exact hundredths without rounding', () => {
    expect(normalizeServicePriceInput(input)).toEqual({
      ...input,
      current_price_rubles: 2000.01,
    });
  });
  it.each([
    { price_rubles: 1.001 },
    { price_rubles: -1 },
    { price_rubles: NaN },
    { price_rubles: true },
    { price_rubles: 1_000_000_000.01 },
    { service_id: '01' },
    { company_id: '1 OR 1=1' },
    { currency: 'USD' },
    { extra: 'forbidden' },
    { current_revision: 'stale' },
  ])(
    'refuses invalid normalized input %p with the AE contract error',
    (invalid) => {
      expect(() =>
        normalizeServicePriceInput({ ...input, ...invalid }),
      ).toThrow(ActionContractError);
    },
  );
});
