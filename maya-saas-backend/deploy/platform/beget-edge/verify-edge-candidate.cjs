#!/usr/bin/env node
/** Inspect release inputs, never execute PHP or copy credentials to a fixture. */
const fs = require('node:fs');
const path = require('node:path');
const boundary = require('./client-initiator-boundary.cjs');

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
module.exports = {verify};
if (require.main === module) {
  try { console.log(JSON.stringify({status: 'PASS', ...verify(process.argv[2])})); }
  catch (_) { console.error('R01 candidate gate failed; source withheld'); process.exitCode = 1; }
}
