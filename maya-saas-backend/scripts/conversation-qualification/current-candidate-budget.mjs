/** Finite qualification budget. No credentials, default transport, permit
 * issuance, old ledger reuse or resume. Admitted transport requires an external
 * server-owned fresh permit validator; the budget itself grants no authority. */
import fs, { openSync, fsyncSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
export const CORE_DIAGNOSTIC_PROFILE = 'core-diagnostic-20261008/1';
export const CORE_DIAGNOSTIC_LIMITS = Object.freeze({
  ...CANDIDATE_LIMITS,
  dialogs: 3,
  turns: 5,
  attempts: 12,
  inputTokens: 1_228_800,
  outputTokens: 24_576,
  spendNanoUsd: 2_000_000_000,
  durationMs: 600_000,
  concurrency: 1,
  pricingStatus: 'CURRENT_PRICE_EVIDENCE_REQUIRED_FOR_ADMISSION',
});
export const CORE_DIAGNOSTIC_LIMITS_SHA256 = createHash('sha256')
  .update(JSON.stringify(CORE_DIAGNOSTIC_LIMITS))
  .digest('hex');
export const CORE_FOLLOWUP_PROFILE = 'core-followup-20261009/1';
export const CORE_FOLLOWUP_LIMITS = Object.freeze({
  ...CORE_DIAGNOSTIC_LIMITS,
  dialogs: 6,
  turns: 13,
  attempts: 24,
  inputTokens: 2_457_600,
  outputTokens: 49_152,
  spendNanoUsd: 4_000_000_000,
  durationMs: 1_200_000,
});
export const CORE_FOLLOWUP_LIMITS_SHA256 = createHash('sha256')
  .update(JSON.stringify(CORE_FOLLOWUP_LIMITS))
  .digest('hex');
export const CORE_UNION_PROFILE = 'core-union-20261009/1';
export const CORE_UNION_LIMITS = Object.freeze({
  ...CORE_DIAGNOSTIC_LIMITS,
  dialogs: 9,
  turns: 18,
  attempts: 36,
  inputTokens: 3_686_400,
  outputTokens: 73_728,
  spendNanoUsd: 6_000_000_000,
  durationMs: 1_800_000,
});
export const CORE_UNION_LIMITS_SHA256 = createHash('sha256')
  .update(JSON.stringify(CORE_UNION_LIMITS))
  .digest('hex');
// Synthetic mechanical reservation only. This profile can never be admitted.
export const CORE_OFFLINE_PROFILE = 'core-offline-48-20261009/1';
export const CORE_OFFLINE_LIMITS = Object.freeze({
  ...CORE_DIAGNOSTIC_LIMITS,
  dialogs: 48,
  turns: 81,
  attempts: 324,
  inputTokens: 33_177_600,
  outputTokens: 663_552,
  spendNanoUsd: 0,
  inputNanoUsdPerToken: 0,
  outputNanoUsdPerToken: 0,
  // Scripted local responses have no provider rate limit. The same serial gate,
  // attempt/token ceilings and wall-clock stop remain in force.
  intervalMs: 0,
  durationMs: 1_800_000,
  pricingStatus: 'OFFLINE_SYNTHETIC_RESERVATION_ONLY_NO_LIVE_CAP',
});
export const CORE_OFFLINE_LIMITS_SHA256 = createHash('sha256')
  .update(JSON.stringify(CORE_OFFLINE_LIMITS))
  .digest('hex');
function profileLimits(profile) {
  if (profile === undefined) return CANDIDATE_LIMITS;
  if (profile === CORE_DIAGNOSTIC_PROFILE) return CORE_DIAGNOSTIC_LIMITS;
  if (profile === CORE_FOLLOWUP_PROFILE) return CORE_FOLLOWUP_LIMITS;
  if (profile === CORE_UNION_PROFILE) return CORE_UNION_LIMITS;
  if (profile === CORE_OFFLINE_PROFILE) return CORE_OFFLINE_LIMITS;
  throw new Error('candidate_profile_refused');
}
const endpoint = 'https://api.deepseek.com/chat/completions';
export function candidateReservation(url, init, profile) {
  const limits = profileLimits(profile);
  if (
    ![endpoint, 'https://api.deepseek.com/v1/chat/completions'].includes(
      String(url),
    )
  )
    throw new Error('candidate_endpoint_refused');
  if (init?.method !== 'POST' || typeof init.body !== 'string')
    throw new Error('candidate_request_shape');
  const bytes = Buffer.byteLength(init.body, 'utf8');
  if (bytes > limits.requestBytes) throw new Error('candidate_body_limit');
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
    body.model !== limits.model ||
    body.stream !== false ||
    body.thinking?.type !== 'disabled' ||
    Object.keys(body.thinking).length !== 1 ||
    !Number.isSafeInteger(body.max_tokens) ||
    body.max_tokens < 1 ||
    body.max_tokens > limits.outputPerAttempt ||
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
      input * limits.inputNanoUsdPerToken +
      output * limits.outputNanoUsdPerToken,
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
  #profile;
  #limits;
  #admission;
  #binding;
  constructor({
    ledgerPath,
    manifestSha256,
    candidateCommit,
    mode,
    profile,
    transport,
    assertAdmission,
    now,
    // Real timers may wake one clock tick early. The margin is waiting only;
    // the absolute six-second admission check below remains authoritative.
    wait,
  }) {
    if (
      !['OFFLINE_SYNTHETIC_ONLY', 'ADMITTED_MODEL_ONLY'].includes(mode) ||
      typeof transport !== 'function'
    )
      throw new Error('candidate_offline_transport_required');
    if (profile === CORE_OFFLINE_PROFILE && mode !== 'OFFLINE_SYNTHETIC_ONLY')
      throw new Error('candidate_profile_offline_only');
    this.#profile = profile;
    this.#limits = profileLimits(profile);
    if (
      typeof manifestSha256 !== 'string' ||
      typeof candidateCommit !== 'string' ||
      !/^[a-f0-9]{64}$/.test(manifestSha256) ||
      !/^[a-f0-9]{40}$/.test(candidateCommit)
    )
      throw new Error('candidate_binding_required');
    if (mode === 'ADMITTED_MODEL_ONLY') {
      if (
        ![
          CORE_DIAGNOSTIC_PROFILE,
          CORE_FOLLOWUP_PROFILE,
          CORE_UNION_PROFILE,
        ].includes(profile) ||
        typeof assertAdmission !== 'function' ||
        now !== undefined ||
        wait !== undefined
      )
        throw new Error('candidate_admitted_transport_required');
      this.#binding = Object.freeze({
        candidateCommit,
        manifestSha256,
        profile,
        limitsSha256: createHash('sha256')
          .update(JSON.stringify(this.#limits))
          .digest('hex'),
      });
      this.#admission = assertAdmission;
      this.#checkAdmission();
    } else if (assertAdmission !== undefined) {
      throw new Error('candidate_admission_mode_refused');
    }
    this.#transport = transport;
    this.#now = now ?? Date.now;
    this.#wait =
      wait ?? ((ms, signal) => delay(ms + 25, undefined, { signal }));
    this.#started = this.#now();
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
        ...(profile === undefined
          ? {}
          : {
              profile,
              limitsSha256: createHash('sha256')
                .update(JSON.stringify(this.#limits))
                .digest('hex'),
            }),
        limits: this.#limits,
        startedAt: this.#started,
        paidAuthorized: mode === 'ADMITTED_MODEL_ONLY',
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
  #checkAdmission() {
    if (!this.#admission) return;
    try {
      const result = this.#admission(this.#binding);
      if (result !== undefined) {
        if (result && typeof result.then === 'function')
          void Promise.resolve(result).catch(() => {});
        throw new Error('candidate_admission_not_synchronous');
      }
    } catch {
      // A validator may encounter sensitive paths or provider metadata. Neither
      // its exception nor a returned permit is exposed or written to the ledger.
      this.#halted = true;
      throw new Error('candidate_admission_refused');
    }
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
    if (time - this.#started >= this.#limits.durationMs)
      throw new Error('candidate_wall_time_limit');
    return time;
  }
  dialog() {
    this.#check();
    if (this.#busy || this.#activeTurn)
      throw new Error('candidate_turn_active');
    if (this.#dialogs >= this.#limits.dialogs)
      throw new Error('candidate_dialog_limit');
    this.#append({ event: 'dialog', number: this.#dialogs + 1 });
    this.#dialogs++;
  }
  turn() {
    this.#check();
    if (!this.#dialogs || this.#busy || this.#activeTurn)
      throw new Error('candidate_turn_scope');
    if (this.#turns >= this.#limits.turns)
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
    const reservation = candidateReservation(destination, init, this.#profile);
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
            this.#limits.intervalMs - (this.#check() - this.#lastDispatch),
          ),
          init.signal,
        );
      init.signal?.throwIfAborted();
      this.#checkAdmission();
      const at = this.#check();
      if (
        this.#lastDispatch !== null &&
        at - this.#lastDispatch < this.#limits.intervalMs
      )
        throw new Error('candidate_spacing_not_elapsed');
      if (this.#attempts >= this.#limits.attempts)
        throw new Error('candidate_attempt_limit');
      if (this.#input + reservation.input > this.#limits.inputTokens)
        throw new Error('candidate_input_token_limit');
      if (this.#output + reservation.output > this.#limits.outputTokens)
        throw new Error('candidate_output_token_limit');
      if (this.#spend + reservation.nanoUsd > this.#limits.spendNanoUsd)
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
            this.#limits.timeoutMs,
            this.#limits.durationMs - (at - this.#started),
          ),
        );
        if (init.signal?.aborted) onAbort();
      });
      const perform = async () => {
        controller.signal.throwIfAborted();
        this.#checkAdmission();
        this.#check();
        // Strip caller headers entirely; any credential remains solely within
        // the separately admitted broker's injected transport, never this gate.
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
            if (bytes > this.#limits.responseBytes)
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
