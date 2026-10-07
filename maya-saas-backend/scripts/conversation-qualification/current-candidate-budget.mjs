/** Finite OFFLINE qualification gate. No credentials, default transport, live
 * mode, old permit, old ledger reuse or resume. A future broker admission is
 * separate work; this module does not authorize a paid request. */
import fs, { openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const CANDIDATE_LIMITS = Object.freeze({
  model: 'deepseek-v4-pro',
  dialogs: 24,
  turns: 64,
  attempts: 96,
  inputTokens: 8_000_000,
  outputTokens: 196_608,
  outputPerAttempt: 2048,
  spendNanoUsd: 12_000_000_000,
  durationMs: 3_600_000,
  timeoutMs: 30_000,
  intervalMs: 6000,
  requestBytes: 98_304,
  responseBytes: 1_048_576,
  inputNanoUsdPerToken: 1320,
  outputNanoUsdPerToken: 3960,
  pricingStatus: 'HISTORICAL_2026_10_05_NOT_CURRENT_VERIFIED',
});
const endpoint = 'https://api.deepseek.com/chat/completions';
export function candidateReservation(url, init) {
  if (
    ![endpoint, 'https://api.deepseek.com/v1/chat/completions'].includes(
      String(url),
    )
  )
    throw new Error('candidate_endpoint_refused');
  if (init?.method !== 'POST' || typeof init.body !== 'string')
    throw new Error('candidate_request_shape');
  const bytes = Buffer.byteLength(init.body, 'utf8');
  if (bytes > CANDIDATE_LIMITS.requestBytes)
    throw new Error('candidate_body_limit');
  const body = JSON.parse(init.body);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) =>
        ![
          'model',
          'messages',
          'max_tokens',
          'temperature',
          'stream',
          'thinking',
          'response_format',
        ].includes(k),
    ) ||
    body.model !== CANDIDATE_LIMITS.model ||
    body.stream !== false ||
    body.thinking?.type !== 'disabled' ||
    Object.keys(body.thinking).length !== 1 ||
    !Number.isSafeInteger(body.max_tokens) ||
    body.max_tokens < 1 ||
    body.max_tokens > CANDIDATE_LIMITS.outputPerAttempt ||
    !Array.isArray(body.messages) ||
    !body.messages.length ||
    body.messages.length > 64 ||
    body.messages.some(
      (m) =>
        !m ||
        !['system', 'user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' ||
        Object.keys(m).some((k) => !['role', 'content'].includes(k)),
    ) ||
    (body.temperature !== undefined &&
      (typeof body.temperature !== 'number' ||
        !Number.isFinite(body.temperature) ||
        body.temperature < 0 ||
        body.temperature > 2)) ||
    (body.response_format !== undefined &&
      (body.response_format?.type !== 'json_object' ||
        Object.keys(body.response_format).length !== 1))
  )
    throw new Error('candidate_model_contract');
  // Conservative local reservation, not a tokenizer measurement or a validated
  // provider maximum. Full UTF-8 body + framing; never refund from usage claims.
  const input = bytes + 4096,
    output = body.max_tokens;
  return Object.freeze({
    bytes,
    input,
    output,
    nanoUsd:
      input * CANDIDATE_LIMITS.inputNanoUsdPerToken +
      output * CANDIDATE_LIMITS.outputNanoUsdPerToken,
  });
}

export class CandidateBudgetGate {
  #fd;
  #transport;
  #now;
  #wait;
  #started;
  #lastCheck;
  #lastDispatch = null;
  #busy = false;
  #activeTurn = false;
  #halted = false;
  #ioFailed = false;
  #dialogs = 0;
  #turns = 0;
  #attempts = 0;
  #input = 0;
  #output = 0;
  #spend = 0;
  constructor({
    ledgerPath,
    manifestSha256,
    candidateCommit,
    mode,
    transport,
    now = Date.now,
    wait = (ms, signal) => delay(ms, undefined, { signal }),
  }) {
    if (mode !== 'OFFLINE_SYNTHETIC_ONLY' || typeof transport !== 'function')
      throw new Error('candidate_offline_transport_required');
    if (
      !/^[a-f0-9]{64}$/.test(manifestSha256) ||
      !/^[a-f0-9]{40}$/.test(candidateCommit)
    )
      throw new Error('candidate_binding_required');
    this.#transport = transport;
    this.#now = now;
    this.#wait = wait;
    this.#started = now();
    this.#lastCheck = this.#started;
    if (!Number.isSafeInteger(this.#started) || this.#started < 0)
      throw new Error('candidate_clock_invalid');
    // Exclusive creation is also the restart fence; even a cleanly closed ledger
    // cannot reset its counters by being reopened. No old ledger is read/changed.
    this.#fd = openSync(ledgerPath, 'wx', 0o600);
    try {
      this.#append({
        event: 'opened',
        mode,
        manifestSha256,
        candidateCommit,
        limits: CANDIDATE_LIMITS,
        startedAt: this.#started,
        paidAuthorized: false,
      });
      const fd = openSync(dirname(ledgerPath), 'r');
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    } catch (error) {
      closeSync(this.#fd);
      this.#fd = null;
      throw error;
    }
  }
  get stats() {
    return Object.freeze({
      dialogs: this.#dialogs,
      turns: this.#turns,
      attempts: this.#attempts,
      inputTokens: this.#input,
      outputTokens: this.#output,
      reservedNanoUsd: this.#spend,
      halted: this.#halted,
    });
  }
  #append(row) {
    try {
      const bytes = Buffer.from(JSON.stringify(row) + '\n');
      let offset = 0;
      while (offset < bytes.length) {
        const written = fs.writeSync(
          this.#fd,
          bytes,
          offset,
          bytes.length - offset,
        );
        if (
          !Number.isSafeInteger(written) ||
          written <= 0 ||
          written > bytes.length - offset
        )
          throw new Error('candidate_ledger_incomplete_write');
        offset += written;
      }
      fsyncSync(this.#fd);
    } catch (error) {
      this.#halted = true;
      this.#ioFailed = true;
      throw error;
    }
  }
  #check() {
    if (this.#fd === null) throw new Error('candidate_gate_closed');
    if (this.#halted) throw new Error('candidate_gate_halted');
    const time = this.#now();
    if (!Number.isSafeInteger(time) || time < this.#lastCheck) {
      this.#halted = true;
      throw new Error('candidate_clock_invalid');
    }
    this.#lastCheck = time;
    if (time - this.#started >= CANDIDATE_LIMITS.durationMs)
      throw new Error('candidate_wall_time_limit');
    return time;
  }
  dialog() {
    this.#check();
    if (this.#busy || this.#activeTurn)
      throw new Error('candidate_turn_active');
    if (this.#dialogs >= CANDIDATE_LIMITS.dialogs)
      throw new Error('candidate_dialog_limit');
    this.#append({ event: 'dialog', number: this.#dialogs + 1 });
    this.#dialogs++;
  }
  turn() {
    this.#check();
    if (!this.#dialogs || this.#busy || this.#activeTurn)
      throw new Error('candidate_turn_scope');
    if (this.#turns >= CANDIDATE_LIMITS.turns)
      throw new Error('candidate_turn_limit');
    this.#append({ event: 'turn', number: this.#turns + 1 });
    this.#turns++;
    this.#activeTurn = true;
  }
  endTurn() {
    if (this.#busy) throw new Error('candidate_attempt_active');
    this.#activeTurn = false;
  }
  async fetch(url, request) {
    // The caller may mutate RequestInit/URL during spacing. Bind validation,
    // reservation and dispatch to the same immutable endpoint/body snapshot.
    const destination = String(url);
    const init = Object.freeze({
      method: request?.method,
      body: request?.body,
      signal: request?.signal,
    });
    this.#check();
    if (this.#busy) throw new Error('candidate_concurrency_limit');
    if (!this.#activeTurn) throw new Error('candidate_turn_scope');
    const reservation = candidateReservation(destination, init);
    init.signal?.throwIfAborted();
    this.#busy = true;
    let timer,
      onAbort,
      activeReader,
      reserved = false;
    const controller = new AbortController();
    try {
      if (this.#lastDispatch !== null)
        await this.#wait(
          Math.max(
            0,
            CANDIDATE_LIMITS.intervalMs - (this.#check() - this.#lastDispatch),
          ),
          init.signal,
        );
      init.signal?.throwIfAborted();
      const at = this.#check();
      if (
        this.#lastDispatch !== null &&
        at - this.#lastDispatch < CANDIDATE_LIMITS.intervalMs
      )
        throw new Error('candidate_spacing_not_elapsed');
      if (this.#attempts >= CANDIDATE_LIMITS.attempts)
        throw new Error('candidate_attempt_limit');
      if (this.#input + reservation.input > CANDIDATE_LIMITS.inputTokens)
        throw new Error('candidate_input_token_limit');
      if (this.#output + reservation.output > CANDIDATE_LIMITS.outputTokens)
        throw new Error('candidate_output_token_limit');
      if (this.#spend + reservation.nanoUsd > CANDIDATE_LIMITS.spendNanoUsd)
        throw new Error('candidate_spend_limit');
      this.#append({
        event: 'reserved',
        attempt: this.#attempts + 1,
        at,
        ...reservation,
        totalInput: this.#input + reservation.input,
        totalOutput: this.#output + reservation.output,
        totalNanoUsd: this.#spend + reservation.nanoUsd,
      });
      this.#attempts++;
      this.#input += reservation.input;
      this.#output += reservation.output;
      this.#spend += reservation.nanoUsd;
      this.#lastDispatch = at;
      reserved = true;
      const abort = new Promise((_, reject) => {
        onAbort = () => {
          controller.abort();
          void activeReader?.cancel().catch(() => {});
          reject(new Error('candidate_attempt_cancelled'));
        };
        init.signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(
          onAbort,
          Math.min(
            CANDIDATE_LIMITS.timeoutMs,
            CANDIDATE_LIMITS.durationMs - (at - this.#started),
          ),
        );
        if (init.signal?.aborted) onAbort();
      });
      const perform = async () => {
        controller.signal.throwIfAborted();
        // Strip caller headers entirely: this offline gate has no credential use.
        const response = await this.#transport(destination, {
          method: 'POST',
          body: init.body,
          redirect: 'error',
          signal: controller.signal,
        });
        if (
          !(response instanceof Response) ||
          response.status < 200 ||
          response.status > 599
        )
          throw new Error('candidate_response_shape');
        const chunks = [];
        let bytes = 0;
        const reader = response.body?.getReader();
        activeReader = reader;
        try {
          while (reader) {
            controller.signal.throwIfAborted();
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > CANDIDATE_LIMITS.responseBytes)
              throw new Error('candidate_response_limit');
            chunks.push(chunk.value);
          }
        } finally {
          if (reader) {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
            activeReader = undefined;
          }
        }
        controller.signal.throwIfAborted();
        return new Response(chunks.length ? Buffer.concat(chunks) : null, {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        });
      };
      const response = await Promise.race([perform(), abort]);
      this.#check();
      this.#append({
        event: 'response',
        attempt: this.#attempts,
        status: response.status,
      });
      return response;
    } catch (error) {
      if (reserved) {
        // Never permit another attempt while a timed-out/aborted injected
        // transport could still be running. No raw error/body/header in ledger.
        this.#halted = true;
        controller.abort();
        this.#append({
          event: 'halted_after_attempt',
          attempt: this.#attempts,
        });
        throw new Error('candidate_attempt_unresolved');
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (onAbort) init.signal?.removeEventListener('abort', onAbort);
      this.#busy = false;
    }
  }
  close() {
    if (this.#busy) throw new Error('candidate_attempt_active');
    if (this.#fd !== null) {
      try {
        if (!this.#ioFailed) this.#append({ event: 'closed', ...this.stats });
      } finally {
        closeSync(this.#fd);
        this.#fd = null;
      }
    }
  }
}
