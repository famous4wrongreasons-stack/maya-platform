// Encrypted pg_dump evidence. No SQL writer and no plaintext production dump.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const {createRequire}=require('node:module'),{createHmac,createHash}=require('node:crypto');
const password=(key)=>createHmac('sha256',key).update('maya.a18.security-backup.v1').digest('hex');
async function backup(url, key, destination) {
  const db=new URL(url), temporary=destination+'.partial';
  const fd=fs.openSync(temporary,'wx',0o600);
  const pg=spawn('pg_dump',['--format=custom','--no-owner','--no-acl'],{env:{...process.env,PGHOST:db.hostname,PGPORT:db.port||'5432',PGUSER:decodeURIComponent(db.username),PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:decodeURIComponent(db.pathname.slice(1)),...(db.searchParams.get('sslmode')?{PGSSLMODE:db.searchParams.get('sslmode')}:{})},stdio:['ignore','pipe','ignore']});
  const cipher=spawn('openssl',['enc','-aes-256-cbc','-pbkdf2','-salt','-pass','env:MAYA_CONSENT_BACKUP_PASSWORD'],{env:{...process.env,MAYA_CONSENT_BACKUP_PASSWORD:password(key)},stdio:['pipe',fd,'ignore']});
  const completed=(child)=>new Promise((ok,bad)=>{child.once('error',bad);child.once('close',(code)=>code===0?ok():bad(new Error('Encrypted backup process failed')));});
  const jobs=[completed(pg),completed(cipher)];pg.stdout.pipe(cipher.stdin);cipher.stdin.on('error',()=>{});
  try {await Promise.all(jobs);fs.fsyncSync(fd);fs.closeSync(fd);assert(fs.statSync(temporary).size>100);fs.linkSync(temporary,destination);fs.unlinkSync(temporary);
    return {status:'PASS',encrypted:true,sha256:createHash('sha256').update(fs.readFileSync(destination)).digest('hex'),bytes:fs.statSync(destination).size,databaseWrites:0};
  } catch(error){pg.kill();cipher.kill();await Promise.allSettled(jobs);try{fs.closeSync(fd)}catch{}fs.rmSync(temporary,{force:true});throw error;}
}
module.exports={backup,password};
if(require.main===module)(async()=>{
 const root=fs.realpathSync(process.cwd());assert(root.startsWith('/opt/maya-saas/releases/'));
 const status=spawnSync('systemctl',['is-active','maya-saas'],{encoding:'utf8'});assert.equal(status.status,3);assert.equal(status.stdout.trim(),'inactive');
 const destination=process.argv[2];assert.equal(process.argv.length,3);assert(destination.startsWith('/opt/maya-saas/incident-evidence/'));
 const req=createRequire(path.resolve(root,'package.json'));const env=req('dotenv').parse(execFileSync('sudo',['-n','cat','/etc/maya-saas/live-widgets.env']));
 console.log(JSON.stringify(await backup(env.DATABASE_URL,env.CRM_ENCRYPTION_KEY,destination)));
})().catch(error=>{console.error(error.name);process.exitCode=1});
