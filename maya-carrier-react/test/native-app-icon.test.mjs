import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { NATIVE_ICON, verifyNativeIcon } from '../tools/native-app-icon.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(repo, 'maya-ios-carrier/ios/App/App/Assets.xcassets/AppIcon.appiconset');
test('native Maya icon: approved opaque 1024px artwork', () => {
  assert.equal(verifyNativeIcon(source).alpha, false);
});

test('native icon is a blocking check in every canonical release entry', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-native-icon-entry-'));
  const alias = temp + '-alias';
  try {
    fs.symlinkSync(temp, alias, 'dir');
    const tools = path.join(temp, 'maya-carrier-react/tools');
    fs.mkdirSync(tools, { recursive: true });
    for (const name of ['release.mjs', 'native-app-icon.mjs', 'native-api-target.mjs', 'payload-files.mjs']) {
      fs.copyFileSync(path.join(repo, 'maya-carrier-react/tools', name), path.join(tools, name));
    }
    const ios = path.join(temp, 'maya-ios-carrier');
    const catalog = path.join(ios, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
    fs.mkdirSync(catalog, { recursive: true });
    fs.copyFileSync(path.join(repo, 'maya-ios-carrier/capacitor.config.json'), path.join(ios, 'capacitor.config.json'));
    const contents = JSON.parse(fs.readFileSync(path.join(source, 'Contents.json')));
    contents.images[0].filename = 'AppIcon-512@2x.png';
    fs.writeFileSync(path.join(catalog, 'Contents.json'), JSON.stringify(contents));
    for (const entry of [path.join(tools, 'release.mjs'), path.join(alias, 'maya-carrier-react/tools/release.mjs')]) {
      for (const mode of ['build', 'sync', 'verify', 'verify-native', 'verify-app']) {
        const args = [entry, mode];
        if (mode === 'verify-app') args.push(path.join(temp, 'App.app'));
        const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
        assert.notEqual(result.status, 0, mode);
        assert.match(result.stderr, /native app icon must select the approved Maya logo/, mode);
      }
    }
  } finally {
    fs.rmSync(alias, { force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
for (const [name, change] of [
  ['Capacitor placeholder selected', dir => {
    const file = path.join(dir, 'Contents.json'), c = JSON.parse(fs.readFileSync(file));
    c.images[0].filename = 'AppIcon-512@2x.png'; fs.writeFileSync(file, JSON.stringify(c));
  }],
  ['substituted image', dir => fs.writeFileSync(path.join(dir, NATIVE_ICON.filename), 'other icon')],
  ['missing icon', dir => fs.unlinkSync(path.join(dir, NATIVE_ICON.filename))],
  ['linked icon', dir => { fs.unlinkSync(path.join(dir, NATIVE_ICON.filename)); fs.symlinkSync(path.join(source, NATIVE_ICON.filename), path.join(dir, NATIVE_ICON.filename)); }],
  ['additional rendition', dir => {
    const file = path.join(dir, 'Contents.json'), c = JSON.parse(fs.readFileSync(file));
    c.images.push({...c.images[0], appearances:[{appearance:'luminosity',value:'dark'}]}); fs.writeFileSync(file, JSON.stringify(c));
  }],
]) test('native Maya icon refuses ' + name, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-native-icon-'));
  try {
    for (const file of ['Contents.json', NATIVE_ICON.filename]) fs.copyFileSync(path.join(source, file), path.join(temp, file));
    change(temp); assert.throws(() => verifyNativeIcon(temp));
  } finally { fs.rmSync(temp, {recursive:true, force:true}); }
});
