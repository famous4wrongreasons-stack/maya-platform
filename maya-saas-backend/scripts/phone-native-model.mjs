// Restrictive transport only: ordinary AiCore still owns projection/planning.
import assert from 'node:assert/strict';
import {
  CandidateBudgetGate,
  candidateReservation,
  CORE_NATIVE_EXECUTION_PROFILE as profile,
  CORE_NATIVE_EXECUTION_LIMITS as limits,
} from './conversation-qualification/current-candidate-budget.mjs';
import { checkAbUsage } from './conversation-qualification/core-local-ab-checks.mjs';
const endpoint = 'https://api.deepseek.com/chat/completions';

export function assertNativeModelPayload(init, priceBounds) {
  const reservation = candidateReservation(
    endpoint,
    init,
    profile,
    priceBounds,
  );
  const body = JSON.parse(init.body);
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[1].role, 'user');
  const data = JSON.parse(body.messages[1].content);
  assert(['tool_planning', 'final_response'].includes(data.phase));
  assert(
    Array.isArray(data.tool_results) &&
      Array.isArray(data.remembered_notes) &&
      data.remembered_notes.length === 0,
  );
  assert(!data.pending_owner_review);
  // Canonical privacy projection is primary; refuse accidentally introduced raw
  // contacts and stable identities anywhere in model data, including semantic plan.
  const walk = (v, key = '') => {
    if (typeof v === 'string') {
      const text = v.replace(
        /\[(?:name|reference) removed\]@[a-f0-9]{32}_\d+/g,
        '[redacted]',
      );
      assert(
        !text.includes('@') &&
          !/(?:\+\d[\d ()-]{8,}\d|\b\d{10,15}\b)/.test(text),
        'native_model_raw_contact',
      );
      if (
        /^(?:clientId|userId|tenantId|phone|email|customer_id|client_id)$/i.test(
          key,
        )
      )
        assert(v === '' || /^\[/.test(v), 'native_model_raw_identity');
    } else if (
      typeof v === 'number' &&
      /^(?:clientId|userId|tenantId|phone|customer_id|client_id)$/i.test(key)
    )
      assert.fail('native_model_raw_identity');
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(data);
  return reservation;
}

export function nativeModelTransport({
  proof,
  ledgerPath,
  checkLocal,
  assertCurrent,
  dispatch,
  testClock,
  testWait,
}) {
  const a = proof.payload,
    priceBounds = {
      inputNanoUsdPerToken: a.pricing.inputNanoUsdPerToken,
      outputNanoUsdPerToken: a.pricing.outputNanoUsdPerToken,
    };
  let closed = false,
    busy = false;
  const current = async () => {
    assert(!closed);
    checkLocal();
    assert.equal(await assertCurrent(), true);
    checkLocal();
    assert(!closed);
  };
  const gate = new CandidateBudgetGate({
    ledgerPath,
    manifestSha256: proof.digest,
    candidateCommit: a.candidateSha,
    profile,
    priceBounds,
    mode: testClock ? 'OFFLINE_SYNTHETIC_ONLY' : 'ADMITTED_MODEL_ONLY',
    ...(testClock
      ? { now: testClock, wait: testWait }
      : {
          assertAdmission() {
            assert(!closed);
            checkLocal();
          },
        }),
    transport: async (url, init) => {
      await current();
      init.signal?.throwIfAborted();
      const reservation = assertNativeModelPayload(init, priceBounds);
      const response = await dispatch(url, init);
      assert(
        !response.redirected && (!response.url || response.url === endpoint),
      );
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body ?? []) {
        checkLocal();
        assert(!closed);
        size += chunk.length;
        assert(size <= limits.responseBytes);
        chunks.push(chunk);
      }
      await current();
      const text = Buffer.concat(chunks).toString('utf8'),
        parsed = JSON.parse(text);
      const accounting =
        parsed.choices?.[0]?.finish_reason === 'length'
          ? JSON.stringify({
              ...parsed,
              choices: parsed.choices.map((c, i) =>
                i === 0 ? { ...c, finish_reason: 'stop' } : c,
              ),
            })
          : text;
      checkAbUsage(response.status, accounting, reservation);
      return new Response(text, {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return {
    async fetch(raw, input) {
      assert(
        [endpoint, 'https://api.deepseek.com/v1/chat/completions'].includes(
          String(raw),
        ),
      );
      assert(!closed && !busy);
      busy = true;
      const init = Object.freeze({
        method: input?.method,
        body: input?.body,
        signal: input?.signal,
      });
      try {
        await current();
        const reservation = assertNativeModelPayload(init, priceBounds);
        assert(
          gate.stats.attempts < a.maxModelAttempts &&
            gate.stats.reservedNanoUsd + reservation.nanoUsd <=
              a.maxSpendNanoUsd,
        );
        gate.dialog();
        gate.turn();
        return await gate.fetch(endpoint, init);
      } catch (e) {
        closed = true;
        throw new Error('phone_native_model_refused', { cause: undefined });
      } finally {
        try {
          gate.endTurn();
        } catch {}
        busy = false;
      }
    },
    close() {
      closed = true;
      gate.close();
    },
    snapshot() {
      return { ...gate.stats, closed };
    },
  };
}
