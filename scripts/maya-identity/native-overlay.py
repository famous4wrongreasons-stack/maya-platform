"""Apply only approved shared identity/consent blocks to an isolated native copy.
Never run against the user's dirty native checkout. Fail on unknown anchors.
"""
from pathlib import Path
import argparse,re,shutil,json
parser=argparse.ArgumentParser();parser.add_argument('native');args=parser.parse_args()
root=Path(__file__).resolve().parents[2];native=Path(args.native).resolve()
if native==Path('/Users/stanislavmosin/Desktop/maya-ios'):raise SystemExit('Isolated native copy required')
web=root/'сайт и приложение';canonical=(web/'app.html').read_text();target=native/'www/index.html'
# Mirror the certified PWA; native bootstrap and Capacitor plugins remain native-owned.
target.write_text(canonical)
for row in json.loads((root/'docs/product/maya-identity/generated-assets.json').read_text())['artifacts']:
 p=root/row['path'];rel=p.relative_to(web);dest=native/'www'/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
shutil.copyfile(web/'assets/maya-identity.js',native/'www/assets/maya-identity.js')
shutil.copyfile(web/'maya-motion-reference.png',native/'www/maya-motion-reference.png')
for name in ['capacitor.config.json','www/manifest.json']:
 p=native/name;data=json.loads(p.read_text())
 if name.startswith('www'):
  data.update(background_color='#ffffff',theme_color='#ffffff')
  for icon in data.get('icons',[]):icon['src']=icon['src'].split('?')[0]+'?v=maya-ribbon-v1'
 else:data['plugins']['SplashScreen']['backgroundColor']='#FFFFFF'
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Shared identity and canonical keyed consent copied to isolated native source; original checkout unchanged.')
