import { runServicePriceBrowserHarness } from '../widgets-diagnostics/support/service-price-browser-harness';

// Explicit --testRegex only: excluded from the ordinary *.live-spec.ts suite.
// A green runner result means the local harness closed, never that browser proof passed.
jest.setTimeout(32 * 60_000);
it('serves the owned service-price browser session until STOP', async () => {
  await runServicePriceBrowserHarness();
});
