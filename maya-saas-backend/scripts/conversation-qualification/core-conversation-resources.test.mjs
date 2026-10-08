// Pure CLI resource parsing: no child processes, services, network or paid calls.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coreConversationResources } from './core-conversation-resources.mjs';

test('omitted heap flags preserve the existing process-memory defaults', () => {
  assert.deepEqual(coreConversationResources(), {
    nodeHeapMb: 3072,
    brokerHeapMb: 256,
    nodeOptions: '--max-old-space-size=3072',
    brokerNodeOptions: '--max-old-space-size=256',
  });
});
test('both inclusive bounds produce only the exact bounded Node option', () => {
  for (const [node, broker] of [
    ['256', '32'],
    ['3072', '256'],
  ]) {
    const result = coreConversationResources({
      nodeHeapMb: node,
      brokerHeapMb: broker,
    });
    assert.equal(result.nodeHeapMb, Number(node));
    assert.equal(result.brokerHeapMb, Number(broker));
    assert.equal(result.nodeOptions, `--max-old-space-size=${node}`);
    assert.equal(result.brokerNodeOptions, `--max-old-space-size=${broker}`);
    assert.ok(Object.isFrozen(result));
  }
});
test('each flag is independently optional and does not mutate its declaration', () => {
  const input = { nodeHeapMb: '1024' };
  const result = coreConversationResources(input);
  assert.equal(result.nodeHeapMb, 1024);
  assert.equal(result.brokerHeapMb, 256);
  assert.deepEqual(input, { nodeHeapMb: '1024' });
  assert.equal(
    coreConversationResources({ brokerHeapMb: '64' }).nodeHeapMb,
    3072,
  );
  assert.equal(
    coreConversationResources({ brokerHeapMb: '64' }).brokerHeapMb,
    64,
  );
});
test('heap values outside either bound refuse rather than clamp or inherit', () => {
  for (const [key, values] of [
    ['nodeHeapMb', ['255', '3073']],
    ['brokerHeapMb', ['31', '257']],
  ]) {
    for (const value of values) {
      assert.throws(() => coreConversationResources({ [key]: value }), {
        message: 'core_runner_resource_invalid',
      });
    }
  }
});
test('nondecimal and option-injection inputs cannot become NODE_OPTIONS', () => {
  for (const key of ['nodeHeapMb', 'brokerHeapMb']) {
    for (const value of [
      '',
      '0',
      '-32',
      '+256',
      '0256',
      '256.0',
      '2.56e2',
      '0x100',
      ' 256',
      '256 ',
      '256\n',
      '256 --require=/private-canary',
      '256;exec',
      '${PRIVATE_CANARY}',
      '999999999999999999',
      256,
      null,
      false,
      {},
      [],
    ]) {
      assert.throws(() => coreConversationResources({ [key]: value }), {
        message: 'core_runner_resource_invalid',
      });
    }
  }
});
test('resource helper cannot accept model-budget or authority overrides', () => {
  for (const input of [
    null,
    [],
    '256',
    { attempts: 99 },
    { paidAuthorized: true },
  ]) {
    assert.throws(() => coreConversationResources(input), {
      message: 'core_runner_resource_invalid',
    });
  }
});
