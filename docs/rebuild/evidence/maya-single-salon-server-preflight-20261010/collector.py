import datetime,json,os,pathlib,re,subprocess
NOW=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
ENV={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C','LC_ALL':'C','GIT_OPTIONAL_LOCKS':'0','PYTHONDONTWRITEBYTECODE':'1'}
def run(args,seconds=4,input=None):
 try:
  p=subprocess.run(args,input=input,capture_output=True,text=True,timeout=seconds,env=ENV)
  return p.returncode,p.stdout[:32768],p.stderr[:4096]
 except subprocess.TimeoutExpired:return -124,'','timeout'
 except OSError:return -127,'','unavailable'
def error_kind(text):
 if 'password' in text.lower() or 'sudo' in text.lower():return 'existing_noninteractive_permission_unavailable'
 if 'Permission denied' in text:return 'permission_denied'
 if 'does not exist' in text:return 'database_role_or_relation_missing'
 if 'No such file' in text or 'could not connect' in text:return 'local_socket_or_tool_unavailable'
 if 'timeout' in text.lower():return 'timeout'
 return 'command_failed_no_raw_error_exposed'
out={'contract':'maya.single-salon-server-metadata/1','observedAt':NOW(),'collectorStarted':True,'readOnly':True,'services':{},'providerCalls':0,'modelCalls':0,'applicationEntryInvoked':False,'credentialValuesRead':False}
props=('Id','LoadState','ActiveState','SubState','MainPID','User','Group','WorkingDirectory','ActiveEnterTimestamp','FragmentPath','PrivateNetwork','NoNewPrivileges')
for name in ('maya-saas.service','barbershop-bot.service','maya-booking-proof-broker.service','maya-booking-proof-db.service'):
 code,body,err=run(['systemctl','show',name,'--no-pager',*['--property='+p for p in props]],3)
 values={}
 for line in body.splitlines():
  k,sep,v=line.partition('=')
  if sep and k in props:values[k]=v
 out['services'][name]={'exitCode':code,'properties':values}
 if code:out['services'][name]['error']=error_kind(err)
release=pathlib.Path('/opt/maya-saas/current')
try:
 resolved=release.resolve(strict=True)
 out['release']={'reference':str(release),'resolved':str(resolved)}
 if str(resolved).startswith('/opt/maya-saas/releases/'):
  code,body,err=run(['git','-C',str(resolved),'rev-parse','--verify','HEAD'],3)
  out['release']['gitSha']=body.strip() if code==0 and re.fullmatch('[0-9a-f]{40}',body.strip()) else None
  if out['release']['gitSha'] is None:out['release']['versionStatus']='git_revision_not_observed'
 else:out['release']['versionStatus']='outside_known_release_root_no_file_read'
except OSError:out['release']={'reference':str(release),'status':'not_readable'}
SQL='BEGIN TRANSACTION READ ONLY;\nSET LOCAL statement_timeout = \'3s\';\nSELECT CURRENT_TIMESTAMP AS observed_at,\n       t.id AS tenant_id, t.status AS tenant_status,\n       t."calendarSource" AS calendar_source,\n       t."defaultTimezone" AS tenant_timezone,\n       i.id AS integration_id, i.provider, i.status AS integration_status,\n       i."updatedAt" AS integration_updated_at,\n       i."verifiedAt" AS integration_verified_at,\n       i."lastCheckedAt" AS integration_last_checked_at,\n       i."settingsJson"->>\'companyId\' AS configured_company_id,\n       i."settingsJson"->\'branchBinding\'->>\'contract\' AS binding_contract,\n       i."settingsJson"->\'branchBinding\'->>\'companyId\' AS binding_company_id,\n       i."settingsJson"->\'branchBinding\'->>\'branchId\' AS binding_branch_id,\n       b.id AS owned_bound_branch_id, b."tenantId" AS branch_tenant_id,\n       b.timezone AS branch_timezone, b."updatedAt" AS branch_updated_at\nFROM "Tenant" t\nLEFT JOIN "CrmIntegration" i ON i."tenantId" = t.id\nLEFT JOIN "Branch" b\n  ON b.id = i."settingsJson"->\'branchBinding\'->>\'branchId\'\n AND b."tenantId" = t.id\nWHERE t.id = \'cmsuavtar0003bjyrfngxsne6\';\nROLLBACK;'
# Explicit passwordless Unix peer path only. Never read env/config/pass/service files.
args=['sudo','-n','-u','postgres','env','-i','PATH=/usr/sbin:/usr/bin:/sbin:/bin','LANG=C','LC_ALL=C','PGPASSFILE=/dev/null','PGSERVICEFILE=/dev/null','PGCONNECT_TIMEOUT=3','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=3000 -c lock_timeout=1000 -c application_name=maya_single_salon_metadata','psql','-X','-w','--host=/var/run/postgresql','--username=postgres','--dbname=maya_saas','--no-align','--field-separator=|','--pset=null=__NULL__','--pset=footer=off','--quiet','--set=ON_ERROR_STOP=1']
code,body,err=run(args,8,SQL)
expected=['observed_at', 'tenant_id', 'tenant_status', 'calendar_source', 'tenant_timezone', 'integration_id', 'provider', 'integration_status', 'integration_updated_at', 'integration_verified_at', 'integration_last_checked_at', 'configured_company_id', 'binding_contract', 'binding_company_id', 'binding_branch_id', 'owned_bound_branch_id', 'branch_tenant_id', 'branch_timezone', 'branch_updated_at']
parsed=[];lines=body.splitlines()
if code==0 and lines and lines[0].split('|')==expected and len(lines)<=2:
 for line in lines[1:]:
  parts=line.split('|')
  if len(parts)!=len(expected):break
  parsed.append(dict(zip(expected,[None if v=='__NULL__' else v for v in parts])))
 out['mapping']={'status':'observed' if parsed else 'no_matching_tenant','rows':parsed,'access':'existing_sudo_noninteractive_postgres_unix_peer','database':'maya_saas','transaction':'READ ONLY / ROLLBACK','exitCode':code}
else:
 out['mapping']={'status':'unavailable','exitCode':code,'error':error_kind(err) if code else 'unexpected_projection_shape','rawOutputRetained':False}
out['finishedAt']=NOW()
print(json.dumps(out,indent=2))
