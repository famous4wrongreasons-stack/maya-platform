// Native packaging only. This does not select or modify the shared web payload.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const NATIVE_ICON = Object.freeze({
  filename: 'Maya-AppIcon-1024.png',
  sha256: '0ad282fd8d686d39d430f675efdb9fa5bde7b96e370519533ce9ba6711fe68b8',
  sourceSha256: '53d4b9fb9aa48915d89d88b5fc945568afa1aa7f532475c34333b8096bc41600',
});

export function verifyNativeIcon(catalog) {
  const read = name => {
    const file = path.join(catalog, name), stat = fs.lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), 'native icon must be a regular file');
    return fs.readFileSync(file);
  };
  const contents = JSON.parse(read('Contents.json'));
  assert.deepEqual(contents.images, [{
    filename: NATIVE_ICON.filename, idiom: 'universal', platform: 'ios', size: '1024x1024',
  }], 'native app icon must select the approved Maya logo');
  const png = read(NATIVE_ICON.filename);
  assert.equal(createHash('sha256').update(png).digest('hex'), NATIVE_ICON.sha256, 'native Maya icon bytes changed');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[24], 8);
  assert.equal(png[25], 2, 'native icon must be opaque RGB');
  return { filename: NATIVE_ICON.filename, sha256: NATIVE_ICON.sha256, width: 1024, height: 1024, alpha: false };
}
