'use strict';
const {execFileSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const {verifyPwa}=require('./verify-pwa.cjs');
const ssh=path.resolve(__dirname,'../../vps/ssh-jump.sh');
const run=(command,input)=>execFileSync('bash',[ssh,'botadmin@111.88.148.206',command],{input,encoding:'utf8',maxBuffer:8*1024*1024,timeout:90000});
const pwa=run('cat /var/www/maya-platform/app.html');
// Run the exact committed read-only AST verifier against finite active Python paths. No module imports.
const python=run('python3 - /home/botadmin/barbershop-bot',fs.readFileSync(path.join(__dirname,'verify-python.py'),'utf8'));
const parsed=JSON.parse(python.split('\n').find(x=>x.startsWith('{')));
if(parsed.status!=='PASS')throw new Error('C8 Python retirement verification failed');
console.log(JSON.stringify({status:'PASS',pwa:verifyPwa(pwa),python:parsed,businessEffects:0}));
