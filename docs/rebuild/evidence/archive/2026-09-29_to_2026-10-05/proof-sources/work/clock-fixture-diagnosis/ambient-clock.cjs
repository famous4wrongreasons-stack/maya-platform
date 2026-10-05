beforeEach(() => { jest.useFakeTimers({ now: new Date(process.env.PROOF_CLOCK_ISO) }); });
afterEach(() => { jest.useRealTimers(); });
