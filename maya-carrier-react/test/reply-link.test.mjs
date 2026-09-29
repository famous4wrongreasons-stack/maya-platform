// The carrier's sole href owner, pinned against the shell's original.
//
//   node --test test/reply-link.test.mjs
//
// `src/reply-link.tsx` re-types the scheme regexes because `src/dom/**` is outside the published
// runtime package and cannot be imported by shipped code. A security check that exists in two
// places can drift in one of them, so this test imports BOTH and requires them to agree, over a
// corpus built to make disagreement likely.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const M = await import(pathToFileURL(path.join(HERE, '.bundle.mjs')).href);

/** The shell's own hostile-input fixture (§2.7 step 16). */
const FIXTURE = path.resolve(
  HERE, '..', '..', 'maya-chat-shell', 'dev', 'fixtures', 'api', 'ai', 'chat.201.reply-links.json',
);

const CORPUS = [
  // admissible
  'https://example.test/booking',
  'tel:+70000000000',
  'mailto:hello@example.test',
  'https://example.test',
  'https://example.test:8443/x',
  'https://example.test/a?b=c#d',
  'https://пример.рф/путь',
  'tel:+7(000)000-00-00',
  // schemes that must never become a target
  'javascript:alert(1)',
  'data:text/html,<b>x</b>',
  'http://example.test',
  'file:///etc/passwd',
  'vbscript:msgbox(1)',
  'HTTPS://EXAMPLE.TEST',
  'https:/example.test',
  'https:example.test',
  // shape failures
  'https://',
  'https://-example.test',
  'https://example.test:99999/x',
  'mailto:@example.test',
  'mailto:a@',
  'tel:abc',
  'tel:+7',
  // boundary and punctuation
  'xhttps://example.test',
  'see(https://example.test)',
  '«https://example.test»',
  'Сайт: https://example.test.',
  'a https://example.test, b',
  'https://example.test/a"b',
  "https://example.test/a'b",
  'https://example.test/<script>',
  'https://example.test/a`b',
  // several in one string
  'a https://one.test b tel:+70000000000 c javascript:x d mailto:z@y.test',
  // nothing at all
  'обычный текст без ссылок',
  '',
];

test('the corpus is not vacuous — it contains both admitted and refused candidates', () => {
  const admitted = CORPUS.filter((s) => M.replySegments(s).some((x) => x.link));
  const refused = CORPUS.filter((s) => !M.replySegments(s).some((x) => x.link));
  assert.ok(admitted.length >= 9, `admitted ${admitted.length}`);
  assert.ok(refused.length >= 15, `refused ${refused.length}`);
});

test('isReplyHref agrees with the shell, candidate for candidate', () => {
  const diffs = CORPUS.filter((s) => M.isReplyHref(s) !== M.shellIsReplyHref(s));
  assert.deepEqual(diffs, []);
});

test('replySegments agrees with the shell, byte for byte', () => {
  for (const reply of CORPUS)
    assert.deepEqual(M.replySegments(reply), M.shellReplySegments(reply), JSON.stringify(reply));
});

test('the hostile-input fixture: three links, and the two dangerous schemes stay text', () => {
  const body = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).body;
  const reply = body.reply;
  assert.ok(reply.includes('javascript:') && reply.includes('data:'), 'the fixture is still hostile');
  const links = M.replySegments(reply).filter((s) => s.link).map((s) => s.text);
  assert.deepEqual(links, [
    'https://example.test/booking',
    'tel:+70000000000',
    'mailto:hello@example.test',
  ]);
  assert.deepEqual(M.replySegments(reply), M.shellReplySegments(reply));

  const markup = M.replyMarkup(reply);
  // The dangerous schemes must SURVIVE as visible text — dropping them would be the carrier
  // silently editing what MAYA said — while never reaching an attribute.
  assert.ok(markup.includes('javascript:alert(1)'), 'javascript: is still shown, as text');
  assert.ok(markup.includes('data:text/html'), 'data: is still shown, as text');
  for (const attr of markup.match(/\s\w[\w-]*="[^"]*"/g) ?? []) {
    assert.ok(!attr.includes('javascript:'), `javascript: reached an attribute: ${attr}`);
    assert.ok(!attr.includes('data:'), `data: reached an attribute: ${attr}`);
  }
  assert.ok(!/href="(?!https:|tel:|mailto:)/.test(markup), 'no href outside the three schemes');
  assert.equal((markup.match(/<a /g) ?? []).length, 3, 'exactly three anchors');
});

test('every anchor is rel=noopener noreferrer, and only https opens a new context', () => {
  const markup = M.replyMarkup('a https://one.test b tel:+70000000000 c mailto:z@y.test');
  for (const anchor of markup.match(/<a [^>]*>/g) ?? [])
    assert.ok(anchor.includes('rel="noopener noreferrer"'), anchor);
  const https = (markup.match(/<a [^>]*href="https:[^>]*>/g) ?? [])[0];
  assert.ok(https.includes('target="_blank"'), 'https opens in a new context');
  for (const anchor of markup.match(/<a [^>]*href="(?:tel|mailto):[^>]*>/g) ?? [])
    assert.ok(!anchor.includes('target='), `${anchor}: tel/mailto must not open a new context`);
});

test('a reply with no candidate produces no markup elements at all', () => {
  assert.equal(M.replyMarkup('обычный текст без ссылок'), 'обычный текст без ссылок');
});
