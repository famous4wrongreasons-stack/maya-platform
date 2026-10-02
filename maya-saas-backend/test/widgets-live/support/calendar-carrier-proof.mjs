import { createHash } from 'node:crypto';
import { canonicalJson, bodyHashTerms, bodyHash } from '../../../../maya-chat-shell/src/integrity/h7.ts';
import assert from 'node:assert/strict';
import { resultOf, markupOf, verify } from '../../../../maya-carrier-react/test/.bundle.mjs';
let raw = ''; for await (const chunk of process.stdin) raw += chunk;
const { envelope, now, formatted, canonical } = JSON.parse(raw);
assert.equal(canonicalJson(bodyHashTerms(envelope)), canonical, 'canonical JSON bytes match backend');
const result = resultOf(envelope, now);
assert.equal(result.integrity, undefined); // no envelope authority leaked through rendering
assert.notEqual(result.mode, 'frozen_prose', JSON.stringify({ native: createHash('sha256').update(canonicalJson(bodyHashTerms(envelope))).digest('hex'), actual: bodyHash(envelope), expected: envelope.integrity.body_hash, verdict: verify(envelope, now), kind: envelope.kind, lifecycle: envelope.lifecycle, render: envelope.render, now }));
const html = markupOf({ id: 'calendar-proof', result, display: 'live', pending: null, sentence: null });
assert.ok(html.includes(formatted), 'carrier must render the server-authored local time verbatim');
assert.ok(result.readingOrder.length > 0, 'canonical controls remain present');
process.stdout.write(JSON.stringify({ carrier: 'PASS', formatted, controls: result.readingOrder.length }));
