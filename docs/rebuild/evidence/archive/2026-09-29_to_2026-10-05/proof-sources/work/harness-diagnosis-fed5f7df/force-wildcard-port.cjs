// Diagnostic fault injection: select a known occupied IPv4 port for wildcard listen(0).
// Explicit loopback listeners are never altered. No route/guard/product source changes.
const net = require('node:net');
const original = net.Server.prototype.listen;
net.Server.prototype.listen = function(...args) {
  if (args[0] === 0 && args.length === 1) args[0] = Number(process.env.NODE_MAYA_SHADOW_PORT);
  return original.apply(this,args);
};
