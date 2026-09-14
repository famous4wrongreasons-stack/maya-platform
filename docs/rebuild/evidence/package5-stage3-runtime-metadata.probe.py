"""Read only: allowlisted scheduler flags, artifact hashes, service metadata.

Never imports application code, connects to a database or invokes a job.
"""
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def command(args):
    p = subprocess.run(args, capture_output=True, text=True, timeout=20)
    return p.returncode, p.stdout


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


out = {
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'productionWrites': 0, 'databaseConnections': 0, 'jobTriggers': 0,
    'services': {}, 'flags': {}, 'pythonHashes': {}, 'compiledHashes': {},
    'processManagers': {}, 'otherStdinPythonProcesses': [],
}
release = Path('/opt/maya-saas/current').resolve()
out['release'] = str(release)
allowed = {
    'OWNER_REPORTS_SCHEDULER_ENABLED', 'OWNER_REPORTS_SCHEDULER_INTERVAL_MINUTES',
    'APPOINTMENT_REMINDERS_SCHEDULER_ENABLED', 'APPOINTMENT_REMINDERS_INTERVAL_MINUTES',
    'INGESTION_QUARANTINE_RETENTION_ENABLED', 'INGESTION_QUARANTINE_RETENTION_DAYS',
    'BILLING_SCHEDULER_ENABLED', 'BILLING_SCHEDULER_INTERVAL_MINUTES',
    'CRM_RECONCILIATION_SCHEDULER_ENABLED', 'OPPORTUNITY_LIFECYCLE_ENABLED',
    'OUTBOUND_MARKETING_SEND_ENABLED', 'OUTBOUND_MARKETING_WORKER_ENABLED',
    'YOOKASSA_RECURRING_ENABLED',
}
out['environmentFileFlags'] = {}
for name in ['.env.local', '.env']:
    p = release / name
    entry = {'exists': p.exists(), 'flags': {}}
    if p.exists():
        code, text = command(['sudo', '-n', 'cat', str(p)])
        entry['readExit'] = code
        for line in text.splitlines():
            m = re.match(r'^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$', line)
            if not m or m[1] not in allowed:
                continue
            value = m[2].split(' #', 1)[0].strip().strip('\"\'')
            safe = value.lower() in ['true', 'false', 'yes', 'no', 'on', 'off', ''] or value.isdigit()
            entry['flags'][m[1]] = value if safe else '<not an allowlisted boolean/number>'
    out['environmentFileFlags'][name] = entry
for unit in ['maya-saas', 'barbershop-bot', 'barbershop-pwa',
             'maya-organic-appointment-shadow-observer', 'maya-telegram-egress']:
    _, text = command(['systemctl', 'show', unit, '-p', 'MainPID', '-p', 'ActiveState',
                       '-p', 'SubState', '-p', 'UnitFileState', '-p', 'LoadState',
                       '-p', 'ActiveEnterTimestamp', '-p', 'StandardOutput'])
    out['services'][unit] = dict(x.split('=', 1) for x in text.splitlines() if '=' in x)
    if unit != 'maya-saas':
        continue
    pid = out['services'][unit].get('MainPID', '0')
    code, raw = command(['sudo', '-n', 'cat', '/proc/' + pid + '/environ'])
    env = dict(x.split('=', 1) for x in raw.split('\0') if '=' in x)
    for key in sorted(allowed):
        value = env.get(key)
        safe = value is None or value.strip().lower() in ['true', 'false', 'yes', 'no', 'on', 'off', ''] or value.strip().isdigit()
        out['flags'][key] = {'present': key in env, 'value': value if safe else '<not an allowlisted boolean/number>', 'readExit': code}
for p in sorted(Path('/home/botadmin/barbershop-bot').glob('*.py')):
    if p.name == 'config.py':
        continue
    out['pythonHashes'][p.name] = digest(p)
for p in sorted((release/'dist').rglob('*.js')):
    out['compiledHashes'][str(p.relative_to(release))] = digest(p)
for directory in ['/home/botadmin/.pm2', '/home/botadmin/.config/systemd/user',
                  '/etc/supervisor', '/etc/supervisor/conf.d']:
    p = Path(directory)
    out['processManagers'][directory] = {'exists': p.exists(), 'readable': os.access(p, os.R_OK)}
    if p.exists() and os.access(p, os.R_OK):
        out['processManagers'][directory]['files'] = [x.name for x in p.iterdir() if x.is_file()]
_, text = command(['ps', '-eo', 'pid,ppid,comm,args'])
for line in text.splitlines()[1:]:
    fields = line.split(None, 3)
    if len(fields) == 4 and fields[3] in ['python3 -', 'python -'] and int(fields[0]) != os.getpid():
        out['otherStdinPythonProcesses'].append({'pid': int(fields[0]), 'ppid': int(fields[1]), 'command': fields[2]})
print(json.dumps(out, indent=2))
