// Builds in a fresh external directory. Ad-hoc signing creates no private key,
// installs no trust and does not open Keychain or launch the enrollment UI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { assertKeychainHelper } from './local-keychain-source.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
export function buildHelper(output, synthetic = false) {
  if (
    process.platform !== 'darwin' ||
    !path.isAbsolute(output) ||
    path.normalize(output) !== output ||
    fs.realpathSync(path.dirname(output)) !== path.dirname(output) ||
    fs.existsSync(output)
  )
    throw Error('helper_build_output_refused');
  const repo = path.resolve(here, '../..');
  if (output === repo || output.startsWith(repo + path.sep))
    throw Error('helper_build_outside_git_required');
  fs.mkdirSync(output, { mode: 0o700 });
  const app = path.join(output, 'MayaLocalCredentials.app'),
    contents = path.join(app, 'Contents'),
    bin = path.join(contents, 'MacOS');
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(contents, 'Info.plist'),
    '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>ru.mayaos.local.credentials</string><key>CFBundleExecutable</key><string>MayaLocalCredentials</string><key>CFBundleName</key><string>Maya Local Credentials</string><key>CFBundleVersion</key><string>1</string><key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/></dict></plist>',
    { mode: 0o600 },
  );
  const executable = path.join(bin, 'MayaLocalCredentials');
  const env = { PATH: '/usr/bin:/bin', HOME: process.env.HOME };
  execFileSync(
    '/usr/bin/xcrun',
    [
      'swiftc',
      ...(synthetic ? ['-D', 'MAYA_SYNTHETIC_STORAGE'] : []),
      path.join(here, 'local-credentials/MayaLocalCredentials.swift'),
      '-o',
      executable,
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 },
  );
  execFileSync(
    '/usr/bin/codesign',
    [
      '--force',
      '--sign',
      '-',
      '--identifier',
      'ru.mayaos.local.credentials',
      app,
    ],
    { env, stdio: 'ignore', timeout: 10000 },
  );
  fs.chmodSync(executable, 0o500);
  const display = spawnSync(
    '/usr/bin/codesign',
    ['--display', '--verbose=4', executable],
    { env, encoding: 'utf8', timeout: 10000 },
  );
  if (display.status !== 0 || display.signal)
    throw Error('helper_identity_refused');
  const cdhash = /^CDHash=([a-f0-9]{40})$/m.exec(display.stderr)?.[1];
  const source = {
    kind: 'macos-keychain',
    reference: executable,
    owner: process.getuid(),
    reader: process.getuid(),
    sha256: createHash('sha256')
      .update(fs.readFileSync(executable))
      .digest('hex'),
    cdhash,
    storageApprovalRef: 'PREPARED_NOT_AUTHORIZED',
  };
  assertKeychainHelper(source);
  const result = {
    qualification: 'BUILT_NOT_ENROLLED_NOT_AUTHORIZED',
    syntheticStorage: synthetic,
    source,
    sourceSha256: createHash('sha256')
      .update(
        fs.readFileSync(
          path.join(here, 'local-credentials/MayaLocalCredentials.swift'),
        ),
      )
      .digest('hex'),
    signing: 'AD_HOC_EXACT_CDHASH_NO_PRIVATE_KEY',
    keychainAccessPerformed: false,
  };
  fs.writeFileSync(
    path.join(output, 'helper.json'),
    JSON.stringify(result, null, 2) + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  return result;
}
if (
  process.argv[1] &&
  pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url
) {
  try {
    const { values } = parseArgs({
      options: { output: { type: 'string' }, synthetic: { type: 'boolean' } },
    });
    console.log(
      JSON.stringify(buildHelper(values.output, values.synthetic === true)),
    );
  } catch (error) {
    console.error(
      'Native helper build refused; no credential operation attempted',
    );
    process.exitCode = 1;
  }
}
