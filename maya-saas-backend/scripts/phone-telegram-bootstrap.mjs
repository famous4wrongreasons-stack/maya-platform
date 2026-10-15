import assert from 'node:assert/strict';

// Nest's application proxy ignores ordinary property assignment. Define the
// guard on its target and invoke the original prototype method with Nest's
// receiver; a cached proxy method would dispatch back into this guard.
export function beforePhoneTelegramInit(app, install) {
  const init = Object.getPrototypeOf(app).init;
  assert.equal(typeof init, 'function');
  assert.equal(typeof install, 'function');
  let installation;
  const guardedInit = async function (...args) {
    installation ??= Promise.resolve().then(install);
    await installation;
    return Reflect.apply(init, this, args);
  };
  Object.defineProperty(app, 'init', {
    value: guardedInit,
    configurable: true,
    writable: true,
  });
}
