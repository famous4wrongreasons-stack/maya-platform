'use strict';
const net = require('node:net');
const original = net.Socket.prototype.connect;
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const tmp = fs.realpathSync(os.tmpdir());
function ownedTestSocket(file) {
  if (typeof file !== 'string') return false;
  const relative = path.relative(tmp, file);
  if (!/^c9sock-[A-Za-z0-9]+\/channel\/b\.sock$/.test(relative)) return false;
  const stat = fs.lstatSync(file);
  return fs.realpathSync(path.dirname(file)) === path.dirname(file) && stat.isSocket() && stat.uid === process.getuid();
}
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args);
  const options = normalized[0];
  const host = options.host || 'localhost';
  if (options.path ? !ownedTestSocket(options.path) : !['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(host)) {
    const error = new Error('LOCAL_REGRESSION_EXTERNAL_NETWORK_REFUSED');
    error.code = 'LOCAL_REGRESSION_EXTERNAL_NETWORK_REFUSED';
    throw error;
  }
  return Reflect.apply(original, this, args);
};
