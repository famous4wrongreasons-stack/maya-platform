'use strict';
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args);
  const options = normalized[0];
  const host = options.host || 'localhost';
  if (options.path || !['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(host)) {
    const error = new Error('LOCAL_REGRESSION_EXTERNAL_NETWORK_REFUSED');
    error.code = 'LOCAL_REGRESSION_EXTERNAL_NETWORK_REFUSED';
    throw error;
  }
  return Reflect.apply(original, this, args);
};
