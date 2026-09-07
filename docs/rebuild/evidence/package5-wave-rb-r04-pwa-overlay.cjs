// Bounded PWA transform. Caller validates exact active-source hash before use.
const fs = require('fs');
const path = require('path');
function transform(source, canonicalRoot) {
  const ts = require(path.join(canonicalRoot, 'maya-saas-backend/node_modules/typescript'));
  const canonical = fs.readFileSync(path.join(canonicalRoot, 'сайт и приложение/app.html'), 'utf8');
  const names = ['runAutonomyTick','runSupervisionTick','runExecutionLoopTick','runOwnerAction','evaluateOwnerAction','controlTaskId','updateControlTask','assignControlTask','createControlFromSignal','loadStaffTasks','updateStaffTask'];
  function functions(html) {
    const result = new Map();
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      const text = match[1], base = match.index + match[0].indexOf('>') + 1;
      const sf = ts.createSourceFile('app.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      function walk(node) {
        if(ts.isFunctionDeclaration(node) && node.name && (names.includes(node.name.text) || node.name.text === 'meCanonicalWorkCommand' || node.name.text === 'meWidgetAf')) {
          if(result.has(node.name.text))throw Error('Ambiguous function '+node.name.text);
          result.set(node.name.text, {start:base+node.getStart(sf), end:base+node.end, text:text.slice(node.getStart(sf),node.end)});
        }
        ts.forEachChild(node, walk);
      }
      walk(sf);
    }
    return result;
  }
  const before=functions(source), after=functions(canonical), edits=[];
  const hasCanonicalAuthentication = /function\s+(canonicalMayaTok|meSaasCurrentBundle)\s*\(/.test(source);
  if (!hasCanonicalAuthentication) {
    // Historical aliases retain the accepted R-A fail-closed authentication.
    // Retire only controls that actually exist; never install credential readers.
    for (const name of names) {
      const from=before.get(name);
      if (!from) continue;
      const header=from.text.slice(0,from.text.indexOf('{')+1);
      const body=name==='loadStaffTasks' ? 'setStaffTasks([]);' : name==='controlTaskId' ? 'return null;' : "alert('Откройте актуальный рабочий кабинет MAYA для поручений.');";
      edits.push([from.start,from.end,header+' '+body+' }']);
    }
    for(const [a,b,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,a)+text+source.slice(b);
    return source;
  }
  for (const name of names) {
    const from=before.get(name), to=after.get(name);
    if(!from || !to)throw Error('Missing owned function '+name);
    edits.push([from.start,from.end,to.text]);
  }
  if(before.has('meCanonicalWorkCommand'))throw Error('Already patched');
  const anchor=before.get('meWidgetAf');
  if(!anchor)throw Error('Missing canonical authenticated fetch');
  edits.push([anchor.start,anchor.start,after.get('meCanonicalWorkCommand').text+'\n\n']);
  for(const [a,b,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,a)+text+source.slice(b);
  const marker='      renderBriefCarousel(brief),';
  const added=canonical.slice(canonical.indexOf("      (cc.canonical_tasks || []).length ? Card("),canonical.indexOf(marker));
  if(!added || source.split(marker).length!==2)throw Error('Missing canonical task read render anchor');
  source=source.replace(marker,added+marker);
  for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if(match[1].trim() && !/type=['"]application\/ld\+json/.test(match[0].slice(0,match[0].indexOf('>')))) new Function(match[1]);
  }
  return source;
}
module.exports={transform};
