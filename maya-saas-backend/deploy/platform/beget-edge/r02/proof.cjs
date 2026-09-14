/** Extract the exact R02 pure helper and assert every admitted candidate target.
 * Does not execute PHP/app/config; output fixture is safe for a restricted PHP VM.
 */
const fs=require('node:fs'),path=require('node:path');
const {sha}=require('./canonical-staff-overlay.cjs');
const [candidate,output]=process.argv.slice(2);
const repo=path.resolve(__dirname,'../../../../..');
const manifest=JSON.parse(fs.readFileSync(path.join(repo,'docs/rebuild/evidence/package5-wave-ra-r02-edge-overlay-manifest.json'),'utf8'));
const helper=fs.readFileSync(path.join(__dirname,'canonical-staff-payload.php'),'utf8').replace(/^<\?php\s*/,'');
const rows=[];
for(const row of manifest.overlays.filter(x=>x.kind==='php')){
 const source=fs.readFileSync(path.join(candidate,row.target),'utf8');
 if(sha(source)!==row.candidateSha256||!source.includes(helper))throw Error('Unpinned candidate');
 const lines=source.split('\n');let count=0;
 for(let i=0;i<lines.length;i++) if(lines[i].includes('$payload = maya_r02_staff_payload($payload, $input);')){
   const next=lines[i+1];
   if(!/\$ch = curl_init\(\$TG_CONFIG\['bot_api_base'\] \. (?:'\/api\/(?:panel\/|god\/|chat)|\$god_map\[\$action\])/.test(next))throw Error('Credential forwarded beyond approved internal staff targets');
   count++;
 }
 if(count!==row.r02Replacements)throw Error('Target count mismatch');
 rows.push({target:row.target,sha256:row.candidateSha256,helperSha256:sha(helper),internalForwardTargets:count,providerForwardTargets:0});
}
const test=`
$checks=0;
function check($condition,$label){global $checks;if(!$condition)throw new RuntimeException($label);$checks++;}
function invoke($input,$server,$body=['existing'=>'retained']){$_SERVER=$server;return json_decode(maya_r02_staff_payload(json_encode($body),$input),true);}
foreach ([[],['auth_data'=>['id'=>100]],['session_token'=>'legacy'],['phone'=>'raw']] as $input){
 $result=invoke($input,[]);check($result===['existing'=>'retained'],'no synthetic credential from raw identity');
}
foreach (['HTTP_AUTHORIZATION','REDIRECT_HTTP_AUTHORIZATION'] as $name){
 $result=invoke([],[$name=>'Bearer canonical-jwt']);
 check($result['maya_token']==='canonical-jwt','canonical Authorization preserved');check($result['existing']==='retained','business payload preserved');
}
$result=invoke(['maya_token'=>'canonical-jwt'],[]);check($result['maya_token']==='canonical-jwt','body token preserved');
$result=invoke(['maya_token'=>'canonical-jwt'],['HTTP_AUTHORIZATION'=>'Bearer canonical-jwt']);check($result['maya_token']==='canonical-jwt','same proof accepted once');
foreach ([['maya_token'=>'different'],['maya_token'=>['invalid']]] as $input){
 try{invoke($input,['HTTP_AUTHORIZATION'=>'Bearer canonical-jwt']);throw new RuntimeException('invalid token accepted');}
 catch(InvalidArgumentException $e){check(true,'ambiguous credential rejected before proxy');}
}
foreach ([str_repeat('x',4097),"a\\r\\nb"] as $token){
 try{invoke(['maya_token'=>$token],[]);throw new RuntimeException('invalid token accepted');}
 catch(InvalidArgumentException $e){check(true,'malformed transport rejected');}
}
check(invoke([],['HTTP_AUTHORIZATION'=>'Basic legacy'])===['existing'=>'retained'],'legacy Authorization grants nothing');
echo json_encode(['verdict'=>'PASS','checks'=>$checks,'providerCalls'=>0,'networkCalls'=>0,'databaseConnections'=>0,'filesWritten'=>0,'appImports'=>0])."\\n";
`;
fs.writeFileSync(output,'<?php\n'+helper+'\n'+test);
process.stdout.write(JSON.stringify({fixtureSha256:sha(fs.readFileSync(output)),expectedChecks:15,candidates:rows},null,2)+'\n');
