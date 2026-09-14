"""Read-only B36 source/launcher inventory. No app imports, DB or job calls."""
import ast
import datetime
import hashlib
import json
import re
import subprocess
from pathlib import Path

root = Path('/home/botadmin/barbershop-bot')
release = Path('/opt/maya-saas/current').resolve()
result = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'inspection': 'source hashes, AST, service and journal metadata only',
          'release': str(release), 'services': {}}
for unit in ('barbershop-bot', 'maya-saas'):
    state = {key: subprocess.check_output(
        ['systemctl', 'show', unit, '-p', key, '--value'], text=True).strip()
        for key in ('MainPID', 'ActiveState', 'ActiveEnterTimestamp')}
    logs = subprocess.check_output([
        'sudo', '-n', 'journalctl', '-u', unit, '--since',
        state['ActiveEnterTimestamp'], '--no-pager', '-o', 'json'], text=True)
    messages = [json.loads(line).get('MESSAGE', '') for line in logs.splitlines()
                if line.startswith('{')]
    messages = [message for message in messages if isinstance(message, str)]
    state['registeredJobsAtCurrentStart'] = sorted({match.group(1)
        for message in messages
        for match in [re.search(r'Added job "([A-Za-z0-9_ .:-]+)"', message)]
        if match})
    state['ownerReportsSchedulerStarted'] = any(
        'Owner reports scheduler started' in message for message in messages)
    state['ownerReportsSchedulerDisabled'] = any(
        'Owner reports scheduler is disabled' in message for message in messages)
    state['schedulerStarted'] = any('Scheduler started' in m for m in messages)
    if unit == 'maya-saas':
        raw_environment = subprocess.check_output([
            'sudo', '-n', 'cat', '/proc/' + state['MainPID'] + '/environ'])
        environment = dict(item.split(b'=', 1) for item in raw_environment.split(b'\0') if b'=' in item)
        value = environment.get(b'OWNER_REPORTS_SCHEDULER_ENABLED')
        state['ownerReportsEnabledInProcessEnvironment'] = (
            None if value is None else value.strip().lower() not in (b'false', b'0', b'off', b'no'))
        # Do not output environment contents or unrelated values.
    result['services'][unit] = state

selected = {
    'bot.py': {'post_init', '_daily_report_job', '_fmt_rub'},
    'webhook_server.py': {'_daily_report', 'install_staff_telegram_chat_mirror',
                          '_send_client_push'},
    'database.py': {'list_admins'},
    'maya_inbox_bridge.py': {'_source_event_id', 'publish_inbox_item'},
}
result['functions'] = {}
result['scheduledRegistrations'] = []
result['sourceHashes'] = {}
for path in sorted(root.glob('*.py')):
    if path.name.startswith('test_') or path.name == 'config.py':
        continue
    source = path.read_text()
    result['sourceHashes'][path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'add_job':
            callback = ast.unparse(node.args[0]) if node.args else None
            # Only code references, never arguments/configuration/recipient data.
            if callback and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.]*', callback):
                result['scheduledRegistrations'].append({
                    'file': path.name, 'line': node.lineno, 'callback': callback})
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in selected.get(path.name, set()):
            calls = sorted({ast.unparse(n.func) for n in ast.walk(node)
                            if isinstance(n, ast.Call)})
            result['functions'][path.name + ':' + node.name] = {
                'line': node.lineno,
                'sha256': hashlib.sha256(ast.get_source_segment(source, node).encode()).hexdigest(),
                'directSends': [c for c in calls if c.endswith(('send_message', '_send_client_push', '_send_master_push'))],
                'canonicalCalls': [c for c in calls if c.endswith(('publish_inbox_item', 'publish_owner_message'))],
            }

result['compiledHashes'] = {}
for directory in ('owner-reports', 'inbox', 'action-engine', 'communication-delivery', 'tenancy', 'auth', 'dashboard-preferences'):
    for path in sorted((release / 'dist/src' / directory).glob('*.js')):
        result['compiledHashes'][str(path.relative_to(release))] = hashlib.sha256(path.read_bytes()).hexdigest()
result.update(productionMessages=0, productionBusinessProviderMutations=0,
              databaseConnections=0, productionWrites=0)
print(json.dumps(result, indent=2))
