// Finite local artwork owner. No caller path/URL or prototype executable is admitted.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ARTWORK = Object.freeze([
  Object.freeze({ file: 'maya-logo.png', variable: '--maya-logo-image', sha256: '53d4b9fb9aa48915d89d88b5fc945568afa1aa7f532475c34333b8096bc41600' }),
  Object.freeze({ file: 'maya-rig.png', variable: '--maya-companion-atlas', sha256: '26f12592f2fb6a6f38b13ffeda50ac818995995dad56cf013b9ae093b48d7e60' }),
]);
export function artworkUrls(root = ROOT) {
  return ARTWORK.map(asset => {
    const file = path.join(root, 'brand/companion-v1', asset.file);
    assert.ok(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), 'artwork must be a local regular file');
    const bytes = fs.readFileSync(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, 'selected artwork bytes changed: ' + asset.file);
    return 'url("data:image/png;base64,' + bytes.toString('base64') + '")';
  });
}
// Embedded in the already-certified stylesheet delivery path: no additional request, server
// route, CSP exception, image element, or remote URL is introduced. Both targets get equal bytes.
export function designStyles(css, root = ROOT) {
  const urls = artworkUrls(root);
  return css + '\n:root {\n' + ARTWORK.map((a, i) => a.variable + ': ' + urls[i] + ';').join('\n') + '\n}\n';
}
