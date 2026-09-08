"""One hash-pinned consent overlay, using the existing scoped publisher."""
import argparse
import importlib.util
import json
from pathlib import Path

STAGE = Path('/tmp/maya-native-consent-security-pwa-0867ecea')
TARGET = '/home/m/mocine3388/mayaos.ru/public_html/app/index.html'
BEFORE = 'd0652e4c2ec05b0cc954860b3539b513da2ae930f7f0309002d7434e98557a47'
AFTER = '0b9f5a9a9be01a4c9b02051c93a296b2acb8da918f677a4e16a06d65cb483617'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['check', 'publish', 'verify'])
    parser.add_argument('manifest_sha256')
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('scoped_publisher', STAGE / 'package5-wave-rb-publish.py')
    publisher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(publisher)
    assert publisher.sha(STAGE / 'pwa-manifest.json') == args.manifest_sha256
    manifest = json.loads((STAGE / 'pwa-manifest.json').read_text())
    assert manifest['incident'] == 'native-consent-compat-e9d3d3a2'
    items = manifest['files']
    assert items == [dict(file='index.html', destination=TARGET, artifact='mayaos-consent-candidate.html', before=BEFORE, after=AFTER)]
    assert publisher.sha(STAGE / items[0]['artifact']) == AFTER
    assert publisher.sha(TARGET) == (AFTER if args.phase == 'verify' else BEFORE)
    changed = publisher.replace_items(STAGE, items) if args.phase == 'publish' else 0
    print(json.dumps(dict(status='PASS', phase=args.phase, aliasesChanged=changed,
                         changedAlias='mayaos/app/index.html', phpWrites=0,
                         messages=0, businessMutations=0)))

if __name__ == '__main__':
    main()
