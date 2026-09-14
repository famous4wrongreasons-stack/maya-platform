import hashlib, json
from pathlib import Path

release = Path('/opt/maya-saas/current').resolve()
files = ['src/action-engine/action-engine.registry.js',
         'src/marketing/marketing.service.js', 'src/marketing/marketing.module.js',
         'src/app.module.js', 'src/communication-delivery/communication-delivery.service.js',
         'src/communication-delivery/communication-web-push.contract.js',
         'src/communication-delivery/communication-delivery.capabilities.js']
out = {'inspection': 'read-only current release and compiled artifacts; no runtime invocation',
       'release': str(release), 'compiledSha256': {}}
for file in files:
    data = (release / 'dist' / file).read_bytes()
    out['compiledSha256'][file] = hashlib.sha256(data).hexdigest()
out['productionMessages'] = 0
print(json.dumps(out, indent=2))
