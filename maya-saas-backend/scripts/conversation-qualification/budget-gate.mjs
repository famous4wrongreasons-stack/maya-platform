import { openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';

export const PILOT_LIMITS = Object.freeze({
  model: 'deepseek-v4-pro',
  maxDialogs: 50,
  maxTurns: 200,
  maxRequests: 600,
  maxSpendNanoUsd: 20_000_000_000,
  maxOutputTokens: 2048,
  inputNanoUsdPerToken: 1320,
  outputNanoUsdPerToken: 3960,
  durationMs: 2 * 60 * 60 * 1000,
  requestTimeoutMs: 30_000,
  intervalMs: 6000,
  pricingSource: 'https://api-docs.deepseek.com/quick_start/pricing/',
  pricingVerifiedOn: '2026-10-05',
});

/** Pilot-only transport boundary. No credentials are read, copied or written here.
 * The ledger is exclusive and fsynced BEFORE dispatch. Every attempt, including retries,
 * reserves the complete pessimistic price; failures/missing usage never refund it.
 * Existing ledgers fail closed: restart cannot silently reset an approved budget.
 */
export class PilotBudgetGate {
  constructor({
    ledgerPath,
    approved = false,
    transport,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }) {
    if (typeof transport !== 'function') throw new Error('transport_required');
    this.transport = transport;
    this.approved = approved;
    this.now = now;
    this.sleep = sleep;
    this.startedAt = now();
    this.lastDispatch = null;
    this.busy = false;
    this.requests = 0;
    this.reservedNanoUsd = 0;
    this.dialogs = 0;
    this.turns = 0;
    this.activeTurn = false;
    this.fd = openSync(ledgerPath, 'wx', 0o600);
    const directory = openSync(dirname(ledgerPath), 'r');
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
    this.append({
      event: 'opened',
      startedAt: this.startedAt,
      limits: PILOT_LIMITS,
      approved,
    });
  }
  append(value) {
    writeSync(this.fd, `${JSON.stringify(value)}\n`);
    fsyncSync(this.fd);
  }
  dialog() {
    if (this.fd === null) throw new Error('gate_closed');
    if (this.activeTurn || this.busy) throw new Error('turn_still_active');
    if (this.dialogs >= PILOT_LIMITS.maxDialogs)
      throw new Error('dialog_limit');
    this.dialogs += 1;
    this.append({ event: 'dialog', number: this.dialogs });
  }
  turn() {
    if (this.fd === null) throw new Error('gate_closed');
    if (!this.dialogs || this.activeTurn || this.busy)
      throw new Error('turn_scope_invalid');
    if (this.turns >= PILOT_LIMITS.maxTurns) throw new Error('turn_limit');
    this.turns += 1;
    this.append({ event: 'turn', number: this.turns });
    this.activeTurn = true;
  }
  endTurn() {
    if (this.busy) throw new Error('request_still_active');
    this.activeTurn = false;
  }
  async fetch(url, init) {
    if (!this.approved) throw new Error('owner_approval_required');
    if (this.busy) throw new Error('concurrency_limit');
    if (this.fd === null) throw new Error('gate_closed');
    if (!this.activeTurn) throw new Error('turn_scope_required');
    if (
      ![
        'https://api.deepseek.com/chat/completions',
        'https://api.deepseek.com/v1/chat/completions',
      ].includes(String(url))
    )
      throw new Error('provider_endpoint_refused');
    if (init?.method !== 'POST' || typeof init.body !== 'string')
      throw new Error('request_shape_refused');
    const body = JSON.parse(init.body);
    if (
      body.model !== PILOT_LIMITS.model ||
      body.stream !== false ||
      body.thinking?.type !== 'disabled' ||
      !Number.isInteger(body.max_tokens) ||
      body.max_tokens < 1 ||
      body.max_tokens > PILOT_LIMITS.maxOutputTokens ||
      !Array.isArray(body.messages) ||
      body.messages.length > 64 ||
      body.messages.some((m) => typeof m.content !== 'string')
    )
      throw new Error('model_contract_refused');
    // UTF-8 bytes exceed ordinary byte-token counts; extra 4096 covers framing/special tokens.
    // Use peak cache-miss price regardless of time or cache, with no refunds from usage estimates.
    const requestBytes = Buffer.byteLength(init.body, 'utf8');
    const reserve =
      (requestBytes + 4096) * PILOT_LIMITS.inputNanoUsdPerToken +
      body.max_tokens * PILOT_LIMITS.outputNanoUsdPerToken;
    this.busy = true;
    try {
      if (this.lastDispatch !== null)
        await this.sleep(
          Math.max(
            0,
            PILOT_LIMITS.intervalMs - (this.now() - this.lastDispatch),
          ),
        );
      const remainingMs =
        PILOT_LIMITS.durationMs - (this.now() - this.startedAt);
      if (remainingMs <= 0) throw new Error('wall_time_limit');
      if (this.requests >= PILOT_LIMITS.maxRequests)
        throw new Error('request_limit');
      if (this.reservedNanoUsd + reserve > PILOT_LIMITS.maxSpendNanoUsd)
        throw new Error('spend_limit');
      this.requests += 1;
      this.reservedNanoUsd += reserve;
      this.lastDispatch = this.now();
      this.append({
        event: 'reserved',
        request: this.requests,
        requestBytes,
        reservedNanoUsd: reserve,
        totalReservedNanoUsd: this.reservedNanoUsd,
        at: this.lastDispatch,
      });
      const timeout = AbortSignal.timeout(
        Math.max(1, Math.min(PILOT_LIMITS.requestTimeoutMs, remainingMs)),
      );
      const response = await this.transport(url, {
        ...init,
        redirect: 'error',
        signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      });
      this.append({
        event: 'response',
        request: this.requests,
        status: response.status,
      });
      return response;
    } catch (error) {
      // Never serialize provider errors: some clients embed credentials/request text in them.
      this.append({ event: 'stopped_or_failed', request: this.requests });
      throw error;
    } finally {
      this.busy = false;
    }
  }
  close() {
    if (this.fd !== null) {
      closeSync(this.fd);
      this.fd = null;
    }
  }
}
