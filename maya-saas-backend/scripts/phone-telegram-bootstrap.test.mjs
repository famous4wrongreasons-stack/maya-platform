import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { beforePhoneTelegramInit } from './phone-telegram-bootstrap.mjs';
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
class Fixture {}
Module({})(Fixture);

test('real Nest listen runs the installation once before accepting HTTP', async () => {
  const app = await NestFactory.create(Fixture, {
    logger: false,
    abortOnError: false,
  });
  let calls = 0;
  beforePhoneTelegramInit(app, async () => {
    calls++;
    assert.equal(app.getHttpServer().listening, false);
    app.use('/proof', (_req, res) => res.json({ installed: true }));
  });
  try {
    await app.listen(0, '127.0.0.1');
    assert.equal(calls, 1);
    const result = await fetch((await app.getUrl()) + '/proof');
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { installed: true });
    await app.init();
    assert.equal(calls, 1);
  } finally {
    await app.close();
  }
});

test('failed installation refuses listen and cannot be retried into access', async () => {
  const app = await NestFactory.create(Fixture, {
    logger: false,
    abortOnError: false,
  });
  let calls = 0;
  beforePhoneTelegramInit(app, async () => {
    calls++;
    throw Error('synthetic scope refusal');
  });
  try {
    await assert.rejects(app.listen(0, '127.0.0.1'), /synthetic scope refusal/);
    assert.equal(app.getHttpServer().listening, false);
    await assert.rejects(app.init(), /synthetic scope refusal/);
    assert.equal(calls, 1);
  } finally {
    await app.close();
  }
});
