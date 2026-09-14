#!/usr/bin/env node
/** R02 bounded transforms over inventoried exact source copies. No deploy. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('../../../../node_modules/typescript');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const helper = fs.readFileSync(path.join(__dirname, 'canonical-staff-payload.php'), 'utf8').replace(/^<\?php\s*/, '');

function verifyPhpSource(source) {
  if (!source.includes(helper)) throw Error('Canonical opaque transport helper missing');
  const lines = source.split('\n');
  const target = /\$ch = curl_init\(\$TG_CONFIG\['bot_api_base'\] \. (?:'\/api\/(?:panel\/|god\/|chat)|\$god_map\[\$action\])/;
  let count = 0;
  for (const [index, line] of lines.entries()) {
    if (line.includes('$payload = maya_r02_staff_payload($payload, $input);')) {
      if (!target.test(lines[index + 1] || '')) throw Error('Credential forwarding outside internal staff target');
      count++;
    }
    if (target.test(line) && !lines[index - 1]?.includes('$payload = maya_r02_staff_payload($payload, $input);')) throw Error('Internal staff token transport omitted');
  }
  return count;
}

function php(source) {
  if (source.includes('function maya_r02_staff_payload')) throw Error('Already patched');
  let replacements = 0;
  source = source.replace(/(^[ \t]*)(\$ch = curl_init\(\$TG_CONFIG\['bot_api_base'\] \. ((?:'\/api\/(?:panel\/|god\/|chat)[^\n;]+)|\$god_map\[\$action\])\);)/gm, (all, indent, call) => {
    replacements++;
    return indent + '$payload = maya_r02_staff_payload($payload, $input);\n' + indent + call;
  });
  if (replacements < 35 || replacements > 50) throw Error('Inventoried staff proxy count changed: '+replacements);
  source = source.replace('<?php', '<?php\n'+helper);
  if (verifyPhpSource(source) !== replacements) throw Error('Incomplete canonical staff transport');
  return { source, replacements };
}

function pwa(source, canonical) {
  const replacements = {};
  for (const script of canonical.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const ast = ts.createSourceFile('canonical.js', script[1], ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function walk(node) {
      if (ts.isFunctionDeclaration(node) && ['authReq','authPayload'].includes(node.name?.text)) replacements[node.name.text] = node.getText(ast);
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  if (Object.keys(replacements).length !== 2) throw Error('Two canonical transport helpers required');
  const edits = [];
  for (const script of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const offset = script.index + script[0].indexOf('>') + 1;
    const ast = ts.createSourceFile('active.js', script[1], ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function walk(node) {
      if (ts.isFunctionDeclaration(node) && replacements[node.name?.text]) {
        const replacement = replacements[node.name.text];
        if (!replacement.includes('maya_token')) throw Error('Canonical token transport missing');
        edits.push({start: offset+node.getStart(ast), end: offset+node.end, replacement, name:node.name.text});
      }
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  if (edits.length !== 2) throw Error('Exact two inventoried PWA helpers required: '+edits.length);
  for (const edit of edits.sort((a,b)=>b.start-a.start)) source=source.slice(0,edit.start)+edit.replacement+source.slice(edit.end);
  return {source, replacements: edits.length};
}
module.exports = {php,pwa,sha,verifyPhpSource};
if (require.main === module) {
  const [kind,input,output,expected,canonical] = process.argv.slice(2);
  if (!['php','pwa'].includes(kind) || !/^[a-f0-9]{64}$/.test(expected||'')) throw Error('kind input output exactSha256 [canonicalPwa] required');
  const source=fs.readFileSync(input,'utf8');
  if (sha(source)!==expected || path.resolve(input)===path.resolve(output)) throw Error('Exact separate admitted source required');
  const result=kind==='php'?php(source):pwa(source,fs.readFileSync(canonical,'utf8'));
  fs.writeFileSync(output,result.source,{flag:'wx'});
  process.stdout.write(JSON.stringify({sourceSha256:expected,candidateSha256:sha(result.source),replacements:result.replacements})+'\n');
}
