require('node:https').request=()=>{throw new Error('unexpected_network')}; require('node:net').Socket.prototype.connect=()=>{throw new Error('unexpected_network')};
