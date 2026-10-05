#!/usr/bin/env node
/** Sole release payload owner. This tool builds/verifies/copies locally; it never deploys. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertFiles, readTree } from './payload-files.mjs';
import { nativeApiTarget, parseDevelopmentApi, xcodeDevelopmentApi } from './native-api-target.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.dirname(ROOT);
const IOS = path.join(REPO, 'maya-ios-carrier');
export const WEB_DIR = '../maya-carrier-react/dist/capacitor';

export function checkNativeConfig(config) {
  assert.equal(config.webDir, WEB_DIR, 'native webDir must select the canonical React AChat payload');
  assert.equal(config.appId, 'ru.mayaos.app', 'native app identity changed');
  assert.equal(config.appName, 'MAYA', 'native app name changed');
  assert.equal(config.server, undefined, 'remote/alternate native server is forbidden');
}

function run(file, args, cwd = ROOT) {
  const result = spawnSync(process.execPath, [file, ...args], { cwd, stdio: 'inherit' });
  assert.equal(result.status, 0, 'release command failed: ' + path.basename(file));
}

export function verifyParity(web, cap, developmentApi) {
  const target = nativeApiTarget(developmentApi);
  const js = (files) => [...files.keys()].filter((n) => n.endsWith('.js'));
  assert.equal(js(web).length, 1); assert.equal(js(cap).length, 1);
  const webPath = js(web)[0], capPath = js(cap)[0];
  const w = web.get(webPath).toString(), c = cap.get(capPath).toString();
  const from = 'API_BASE = "/api"', to = `API_BASE = "${target.apiBase}"`;
  assert.equal(w.split(from).length, 2); assert.equal(c.split(to).length, 2);
  assert.equal(w.replace(from, to), c, 'PWA/Capacitor JS differs beyond the approved endpoint');
  const normalized = new Map(cap);
  normalized.delete(capPath); normalized.set(webPath, web.get(webPath));
  normalized.set('index.html', Buffer.from(cap.get('index.html').toString()
    .replace(capPath, webPath).replace(`connect-src ${target.connectSrc}`, "connect-src 'self'")));
  assertFiles(normalized, web);
}

export function verifyNativeFiles(actual, expected) {
  // Capacitor's Cordova compatibility placeholders are generated empty with zero Cordova plugins.
  // They are not an allowance for unchecked executable payloads.
  const clean = new Map(actual);
  for (const name of ['cordova.js', 'cordova_plugins.js']) {
    if (clean.has(name)) {
      assert.equal(clean.get(name).length, 0, 'nonempty native bridge placeholder refused');
      clean.delete(name);
    }
  }
  assertFiles(clean, expected);
}

export function main(mode, appDirectory, developmentApi) {
  const target = nativeApiTarget(developmentApi);
  const targetArgs = developmentApi === undefined ? [] : ['--development-api=' + developmentApi];
  assert.ok(['build', 'verify', 'sync', 'verify-native', 'verify-app'].includes(mode), 'expected build, verify, sync, verify-native or verify-app');
  assert.equal(Boolean(appDirectory), mode === 'verify-app', 'app directory is required only for verify-app');
  const config = JSON.parse(fs.readFileSync(path.join(IOS, 'capacitor.config.json'), 'utf8'));
  checkNativeConfig(config);
  if (mode === 'build' || mode === 'sync') {
    // Headless runtime compilation only: its DOM entry is never selected as the release payload.
    run('build.mjs', [], path.join(REPO, 'maya-chat-shell'));
    for (const name of ['web', 'capacitor']) run('build.mjs', ['--target=' + name, ...targetArgs]);
  }
  // Reconstruct from the fixed React entrypoint; don't trust a self-declared payload manifest.
  for (const name of ['web', 'capacitor']) run('build.mjs', ['--target=' + name, '--verify-output', ...targetArgs]);
  const web = readTree(path.join(ROOT, 'dist/web')), cap = readTree(path.join(ROOT, 'dist/capacitor'));
  verifyParity(web, cap, developmentApi);
  if (mode === 'sync')
    run(path.join(IOS, 'node_modules/@capacitor/cli/bin/capacitor'), ['sync', 'ios'], IOS);
  if (mode === 'sync' || mode === 'verify-native' || mode === 'verify-app') {
    const nativeDirectory = mode === 'verify-app' ? path.resolve(appDirectory) : path.join(IOS, 'ios/App/App');
    const generated = JSON.parse(fs.readFileSync(path.join(nativeDirectory, 'capacitor.config.json'), 'utf8'));
    checkNativeConfig(generated);
    // Capacitor adds packageClassList during sync. Compare all actual native settings too.
    const { packageClassList: _plugins, ...settings } = generated;
    assert.deepEqual(_plugins, ['AppPlugin', 'KeyboardPlugin', 'StatusBarPlugin'], 'native plugin set changed');
    assert.deepEqual(settings, config, 'generated native configuration differs');
    verifyNativeFiles(readTree(path.join(nativeDirectory, 'public')), cap);
  }
  console.log(JSON.stringify({ status: 'PASS', owner: 'React AChat', mode, files: cap.size,
    apiMode: target.mode, apiBase: target.apiBase,
    profileAuthority: 'server only', nativeVerified: ['sync', 'verify-native', 'verify-app'].includes(mode) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), mode = args.shift();
    const appDirectory = mode === 'verify-app' ? args.shift() : undefined;
    assert.ok(args.every((arg) => arg === '--xcode' || arg.startsWith('--development-api=')), 'unknown release argument');
    let developmentApi = parseDevelopmentApi(args);
    if (args.includes('--xcode')) {
      assert.equal(mode, 'verify-native', '--xcode is only valid for the native build verification phase');
      assert.equal(developmentApi, undefined, 'Xcode selects the API with its explicit build setting');
      developmentApi = xcodeDevelopmentApi(process.env.CONFIGURATION, process.env.MAYA_DEVELOPMENT_API);
    }
    main(mode, appDirectory, developmentApi);
  }
  catch (error) { console.error('RELEASE PACKAGING REFUSED: ' + error.message); process.exitCode = 1; }
}
