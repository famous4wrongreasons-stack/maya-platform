// URL host fixtures only; no browser, credentials, transport or storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCrmPendingLocation } from '../src/runtime/crmPending.ts';

const id = '12345678-abcd-4def-8abc-123456789abc';
const anotherId = '23456789-abcd-4def-8abc-123456789abc';
const locator = { operation: 'install', requestId: id };
const base = 'http://127.0.0.1:8788/?local_crm_setup=1&keep=read%20only#inert';
function host(initial = base, replacement) {
  let href = initial;
  const writes = [];
  const port = createCrmPendingLocation({ href: () => href, replace(relative) {
    writes.push(relative);
    if (replacement) replacement(relative);
    else href = new URL(relative, href).href;
  } });
  return { port, writes, href: () => href, changed: value => { href = value; } };
}

test('read is passive and empty URL carries no operation', () => {
  const f = host(); assert.equal(f.port.read(), null); assert.deepEqual(f.writes, []); assert.equal(f.href(), base);
});

test('save stores only the operation locator and retains route, opt-in and inert fragment', () => {
  const f = host('http://127.0.0.1:8788/local/?local_crm_setup=1&keep=read%20only#inert');
  assert.equal(f.port.save({ ...locator, apiToken: 'PRIVATE', companyId: 'PRIVATE', tenantId: 'PRIVATE', consent: true }), true);
  assert.deepEqual(f.port.read(), locator); assert.equal(f.writes.length, 1);
  const url = new URL(f.href());
  assert.equal(url.pathname, '/local/'); assert.equal(url.hash, '#inert');
  assert.equal(url.searchParams.get('local_crm_setup'), '1'); assert.equal(url.searchParams.get('keep'), 'read only');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['crm_operation', 'crm_request', 'keep', 'local_crm_setup']);
  assert.equal(f.writes[0].startsWith('/local/?'), true);
  assert.equal(f.writes[0].includes('PRIVATE'), false); assert.equal(f.writes[0].includes('http:'), false);
});

test('new location adapter reconstructs the same locator without rewriting or treating it as authority', () => {
  const first = host(); assert.equal(first.port.save(locator), true);
  const restarted = host(first.href()); assert.deepEqual(restarted.port.read(), locator);
  assert.deepEqual(restarted.writes, []); assert.equal(restarted.port.save({ operation: 'activate', requestId: anotherId }), false);
  assert.deepEqual(restarted.port.read(), locator);
});

test('partial, duplicate, unknown and malformed locators fail closed', () => {
  for (const query of [
    'crm_operation=install', `crm_request=${id}`, `crm_operation=delete&crm_request=${id}`,
    'crm_operation=install&crm_request=', 'crm_operation=install&crm_request=not-a-uuid',
    `crm_operation=install&crm_request=${id.toUpperCase()}`,
    `crm_operation=install&crm_operation=install&crm_request=${id}`,
    `crm_operation=install&crm_request=${id}&crm_request=${id}`,
    `crm_operation=install&crm_request=${id}&crm_%72equest=${anotherId}`,
    `crm_operation=install&crm_request=${id.replace('-4def-', '-1def-')}`,
  ]) {
    const f = host(`http://127.0.0.1:8788/?${query}`);
    assert.equal(f.port.read(), 'invalid', query); assert.equal(f.port.save(locator), false);
    assert.equal(f.port.clear(locator), false); assert.deepEqual(f.writes, []);
  }
});

test('invalid new locators cannot mutate the URL', () => {
  for (const value of [{ operation: 'delete', requestId: id }, { operation: 'install', requestId: 'bad\r\nkey' }, { operation: 'activate', requestId: '' }]) {
    const f = host(); assert.equal(f.port.save(value), false); assert.equal(f.href(), base); assert.deepEqual(f.writes, []);
  }
});

test('existing pending locator cannot be overwritten even by an identical save', () => {
  const f = host(); assert.equal(f.port.save(locator), true);
  for (const next of [locator, { ...locator, requestId: anotherId }, { ...locator, operation: 'activate' }]) assert.equal(f.port.save(next), false);
  assert.equal(f.writes.length, 1); assert.deepEqual(f.port.read(), locator);
});

test('clear requires the exact operation and key, preserving unrelated URL state', () => {
  const f = host(); assert.equal(f.port.save(locator), true);
  for (const other of [{ ...locator, requestId: anotherId }, { ...locator, operation: 'activate' }]) assert.equal(f.port.clear(other), false);
  assert.equal(f.writes.length, 1); assert.deepEqual(f.port.read(), locator);
  assert.equal(f.port.clear(locator), true); assert.equal(f.port.read(), null);
  const url = new URL(f.href()); assert.equal(url.searchParams.get('keep'), 'read only'); assert.equal(url.searchParams.get('local_crm_setup'), '1'); assert.equal(url.hash, '#inert');
  assert.equal(f.port.clear(locator), false);
});

test('save and clear verify the observed URL instead of assuming replace succeeded', () => {
  const ignoredSave = host(base, () => {}); assert.equal(ignoredSave.port.save(locator), false); assert.equal(ignoredSave.port.read(), null);
  const valid = host(); valid.port.save(locator);
  const ignoredClear = host(valid.href(), () => {}); assert.equal(ignoredClear.port.clear(locator), false); assert.deepEqual(ignoredClear.port.read(), locator);
});

test('a rejected URL replacement is surfaced to the port and does not fabricate saved state', () => {
  const f = host(base, () => { throw new Error('synthetic history rejection'); });
  assert.throws(() => f.port.save(locator), /synthetic history rejection/);
  assert.equal(f.port.read(), null);
});

test('foreign URL changes before clear are preserved and cannot acknowledge another operation', () => {
  const f = host(); f.port.save(locator);
  f.changed(`http://127.0.0.1:8788/?local_crm_setup=1&crm_operation=activate&crm_request=${anotherId}`);
  assert.equal(f.port.clear(locator), false);
  assert.deepEqual(f.port.read(), { operation: 'activate', requestId: anotherId }); assert.equal(f.writes.length, 1);
});
