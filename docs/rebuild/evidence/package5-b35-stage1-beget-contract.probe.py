import hashlib, json, re
from pathlib import Path

root = Path('/home/m/mocine3388')
out = {'inspection': 'read-only static deployed files; no business request', 'ui': {}}
for site in ['muzhskayaestetika.rf', 'mayaos.ru']:
    path = root / site / 'public_html/app/index.html'
    source = path.read_text()
    calls = re.findall(r"pfetch\(['\"]panel_broadcast['\"]\s*,\s*\{([^}]+)\}", source)
    fields = [re.findall(r'\b(\w+)\s*:', call) for call in calls]
    assert calls
    out['ui'][site] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'panelBroadcastRequestFields': fields,
                       'explicitIntentIdentityInRequests': any(set(x) - {'mode', 'text'} for x in fields)}
path = root / 'muzhskayaestetika.rf/public_html/app/api-proxy.php'
source = path.read_text()
start = source.index("case 'panel_broadcast'")
end = source.find('\n    case ', start + 10)
if end < 0:
    end = source.find('\ncase ', start + 10)
assert end > start
block = source[start:end]
# Print only source-level public contract lines, never values from configuration.
out['proxy'] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'caseSha256': hashlib.sha256(block.encode()).hexdigest(),
                'caseLine': source[:start].count('\n') + 1,
                'targetPaths': sorted(set(re.findall(r'/api/panel/[a-z_/]+', block))),
                'inputKeys': sorted(set(re.findall(r"\$(?:input|data|body)\[['\"]([a-zA-Z_]+)['\"]\]", block))),
                'mentionsAuthData': 'auth_data' in block,
                'mentionsInitData': 'init_data' in block,
                'mentionsLegacySession': 'session_token' in block,
                'mentionsCanonicalExecution': any(s in block for s in ['ActionExecution', 'bulk-campaign', 'campaignId'])}
out['productionMessages'] = 0
print(json.dumps(out, indent=2))
