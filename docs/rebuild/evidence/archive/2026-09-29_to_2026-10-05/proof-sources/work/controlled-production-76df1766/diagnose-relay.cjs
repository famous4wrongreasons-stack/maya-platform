const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),repo=path.join(root,'work/maya-controlled-integration'),out=path.join(root,'outputs/controlled-production-76df1766');
const gate=require(path.join(repo,'maya-saas-backend/deploy/platform/beget-edge/relay-release.cjs'));
function ssh(script,input){const r=cp.spawnSync('ssh',['-i',path.join(os.homedir(),'.ssh/beget_deploy'),'-o','BatchMode=yes','-o','ConnectTimeout=20','[REDACTED EMAIL]','python3 -c '+"'"+script.replaceAll("'","'\\''")+"'"],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:8*1024*1024,timeout:90000});if(r.status!==0)throw Error('readonly transport failed');return JSON.parse(r.stdout);}
const observed=ssh(gate.inspectScript,gate.manifest),m=gate.manifest;
const expectedRoots=[...new Set(m.entries.map(e=>e.path.slice(0,e.path.indexOf('/public_html')+12)))].sort();
const expectedPhp=m.entries.filter(e=>e.role.endsWith('php')||e.role==='blocked_archive').map(e=>e.path);
const expectedConfig=m.entries.filter(e=>e.role==='hosting_config').map(e=>e.path);
const diff=(a,b)=>({unexpected:a.filter(x=>!b.includes(x)),missing:b.filter(x=>!a.includes(x))});
let assertion=null;try{gate.validateObserved(observed)}catch(e){assertion={code:e.code,location:e.stack.split('\n').find(s=>s.includes('relay-release.cjs:')),message:e.generatedMessage?'generated assertion omitted':e.message.split('\n')[0]};}
const mismatches=m.entries.flatMap(e=>{const r=observed.rows.find(r=>r.path===e.path);const ok=e.role==='archived_offroot'?r?.missing&&r.sha256===null:r?.sha256===e.sha256;return ok?[]:[{path:e.path,role:e.role,expected:e.sha256,actual:r?.sha256??null,missing:!!r?.missing,committedSource:e.committedSource??null}]});
const archive=ssh(gate.archiveScript,gate.archiveRequest());let archiveResult;try{archiveResult={status:'PASS',...gate.validateArchive(archive)}}catch(e){archiveResult={status:'FAIL',reason:archive.reason,message:e.generatedMessage?'generated assertion omitted':e.message.split('\n')[0]};}
const report={checkedAt:new Date().toISOString(),candidate:'76df1766a74212f2c8a06ab879386fc8e4468d73',readOnly:true,status:assertion?'FAIL':'PASS',assertion,rootDifference:diff(observed.roots,expectedRoots),phpDifference:diff(observed.found,expectedPhp),configDifference:diff(observed.configurationFound,expectedConfig),symlinks:observed.symlinks,scanErrors:observed.scanErrors,mismatches,archive:archiveResult,privateSourceSaved:false,productionMutations:0};
fs.writeFileSync(path.join(out,'RELAY-DIAGNOSIS.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
