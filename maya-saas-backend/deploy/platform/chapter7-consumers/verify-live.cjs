'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { verifyPwa } = require('./verify-pwa.cjs');
// One already-inventoried VPS static artifact. Never request private provider vhosts.
const ssh=path.resolve(__dirname, '../../vps/ssh-jump.sh');
const source=execFileSync('bash',[ssh,'botadmin@111.88.148.206','cat /var/www/maya-platform/app.html'],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:60000});
console.log(JSON.stringify({artifact:'/var/www/maya-platform/app.html',...verifyPwa(source),businessEffects:0}));
