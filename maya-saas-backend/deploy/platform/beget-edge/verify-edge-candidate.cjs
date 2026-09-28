#!/usr/bin/env node
/** Inspect release inputs, never execute PHP or copy credentials to a fixture. */
const fs = require('node:fs');
const path = require('node:path');
const boundary = require('./client-initiator-boundary.cjs');
const {
  phpNamePattern,
  phpOpenerPattern,
  routingConfigNames,
} = require('./public-relay-inventory.cjs');

function verify(directory) {
  let php = 0, pwa = 0;
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw Error('Unreviewed symlink release input');
      if (entry.isDirectory()) { walk(file); continue; }
      if (/\.(?:php\d*|phtml?|phar)\..+$/i.test(entry.name)) throw Error('Historical PHP archives are not release candidates');
      const source = fs.readFileSync(file, 'utf8');
      if (/\.(?:php\d*|phtml?|phar)$/i.test(entry.name) || /<\?php(?:\s|$)|<\?=/i.test(source)) {
        boundary.assertNoDirectBooking(source);
        if (/\bcase\s+['"]create_record['"]\s*:/.test(source)) boundary.assertRetiredPhp(source);
        if (source.includes('FIXTURE_ONLY_NOT_A_CREDENTIAL')) throw Error('Sanitized fixture is not deployable');
        php++;
      }
      if (/\.html$/i.test(entry.name)) {
        const source = fs.readFileSync(file, 'utf8');
        if (path.relative(directory, file) === path.join('app', 'index.html') || /function\s+afLegacy\s*\(|R01 canonical Client entry/.test(source)) {
          boundary.assertRetiredPwa(source); pwa++;
        }
      }
    }
  }
  walk(directory);
  if (!php || !pwa) throw Error('Incomplete PWA/relay release input');
  return {php, pwa};
}

/** A+ tightening 2: a second, equally strict shape for a static shell/PWA release
 * input. verify() above is untouched — this is not a relaxation of its PHP+PWA
 * requirement, it is the missing gate for a release kind that carries no PHP at all.
 * The PHP predicate is the live scanner's own source, so the local candidate view
 * and the live account view cannot drift apart.
 */
const phpName = new RegExp(phpNamePattern, 'i');
const phpOpener = new RegExp(phpOpenerPattern, 'i');
const archiveName = /\.(?:php\d*|phtml?|phar)\..+$/i;
const manifestName = /(?:^|\/)manifest\.json$|\.webmanifest$/i;
const sameOrigin = value => !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('//');

function resolveReference(reference, manifestDir, publishPath) {
  const value = String(reference || '');
  if (!value) throw Error('Empty shell manifest reference');
  if (!sameOrigin(value)) throw Error('Off-candidate shell manifest reference');
  const target = value.split(/[?#]/)[0];
  if (target.startsWith('/')) {
    if (!publishPath) throw Error('Absolute shell manifest reference needs a declared publish path');
    if (!target.startsWith(publishPath)) throw Error('Shell manifest reference escapes the publish path');
    return path.posix.normalize(target.slice(publishPath.length)).replace(/^\.\//, '');
  }
  const base = manifestDir === '.' ? '' : manifestDir;
  const joined = path.posix.normalize(path.posix.join(base, target));
  if (joined === '..' || joined.startsWith('../')) throw Error('Shell manifest reference escapes the candidate');
  return joined;
}

function verifyShellCandidate(directory, options = {}) {
  const publishPath = options.publishPath || null;
  // A shell may never claim the legacy install id: that would update the owner's
  // existing installed PWA in place instead of installing a second, separate app.
  const reservedIds = options.reservedIds || ['/app/'];
  const files = [];
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw Error('Unreviewed symlink release input');
      if (entry.isDirectory()) { walk(file); continue; }
      if (!entry.isFile()) throw Error('Unreviewed release input entry');
      if (routingConfigNames.includes(entry.name)) throw Error('Routing/handler configuration is not a shell release input');
      if (archiveName.test(entry.name)) throw Error('Historical PHP archives are not release candidates');
      if (phpName.test(entry.name)) throw Error('A shell release input carries no PHP');
      const bytes = fs.readFileSync(file);
      if (!bytes.subarray(0, 8192).includes(0)) {
        let text = null;
        try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch (_) { text = null; }
        if (text !== null && phpOpener.test(text)) throw Error('A shell release input carries no PHP');
      }
      files.push(path.relative(directory, file).split(path.sep).join('/'));
    }
  }
  walk(directory);
  const manifests = files.filter(file => manifestName.test(file));
  if (manifests.length !== 1) throw Error('A shell release input needs exactly one web app manifest');
  const present = new Set(files);
  const manifestDir = path.posix.dirname(manifests[0]);
  const webmanifest = JSON.parse(fs.readFileSync(path.join(directory, manifests[0]), 'utf8'));
  const icons = Array.isArray(webmanifest.icons) ? webmanifest.icons : [];
  if (!icons.length) throw Error('A shell manifest must declare icons');
  for (const icon of icons) {
    const target = resolveReference(icon && icon.src, manifestDir, publishPath);
    if (!present.has(target)) throw Error('Shell manifest icon does not resolve inside the candidate');
  }
  for (const field of ['scope', 'start_url']) {
    if (typeof webmanifest[field] !== 'string' || !webmanifest[field]) throw Error('A shell manifest must declare ' + field);
    resolveReference(webmanifest[field], manifestDir, publishPath);
  }
  const id = String(webmanifest.id || '');
  if (!id) throw Error('A shell manifest must declare id');
  if (!sameOrigin(id)) throw Error('A shell manifest id must be same-origin');
  for (const reserved of reservedIds)
    if (id === reserved || id.startsWith(reserved)) throw Error('A shell manifest may not claim a reserved legacy install id');
  if (publishPath) {
    if (!id.startsWith(publishPath)) throw Error('A shell manifest id escapes the publish path');
  } else if (!id.startsWith('/')) resolveReference(id, manifestDir, null);
  return {files: files.length, php: 0, configFiles: 0, symlinks: 0, icons: icons.length,
    id, scope: webmanifest.scope, startUrl: webmanifest.start_url};
}

module.exports = {verify, verifyShellCandidate};
if (require.main === module) {
  const shell = process.argv[2] === '--shell';
  const directory = shell ? process.argv[3] : process.argv[2];
  try {
    console.log(JSON.stringify({status: 'PASS', mode: shell ? 'shell' : 'edge',
      ...(shell ? verifyShellCandidate(directory, {publishPath: process.argv[4]}) : verify(directory))}));
  }
  catch (_) { console.error('R01 candidate gate failed; source withheld'); process.exitCode = 1; }
}
