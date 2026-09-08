const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const repo = path.resolve(__dirname, '../../..'), ts = require(path.join(repo, 'maya-saas-backend/node_modules/typescript'));
const baseSha256 = 'bf97feeaff8645c7bb0586de25d7e9a4fe6f5d4c86b1170cf1361735e4b063ed';
function transform(source) {
  if (crypto.createHash('sha256').update(source).digest('hex') !== baseSha256) throw Error('R09 known community chunk base differs');
  const changes = [], ast = ts.createSourceFile('chunk.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), counts = {};
  const bodies = {
    N: "return MayaPublicCommunity.status(t);",
    I: "return (await MayaPublicCommunity.command('view',t,{},{})).data;",
    A: "return MayaPublicCommunity.command('like',t,{liked:e},{});",
    C: "var name=arguments.length>2?arguments[2]:'',options=arguments.length>3?arguments[3]:{};return MayaPublicCommunity.command('comment',t,{text:e,display_name:name,consent:options.consent},options);",
    O: "return {status:410,data:{ok:false,error:'canonical_moderation_required',message:'Откройте модерацию в MAYA.',url:'https://malesthetic.pro/app/?community_moderation=1'}};",
  };
  function walk(node) {
    if (ts.isFunctionDeclaration(node) && node.name && bodies[node.name.text]) {
      const name = node.name.text;
      // Exported community functions have exact recorded names and source calls.
      if (!node.getText(ast).includes('site_event_')) return;
      counts[name] = (counts[name] || 0) + 1;
      changes.push({ start: node.body.getStart(ast), end: node.body.end, text: '{' + bodies[name] + '}' });
      if (name === 'N') changes.push({ start: node.getStart(ast), end: node.getStart(ast), text: fs.readFileSync(path.join(repo, 'maya-saas-backend/deploy/platform/beget-edge/rc/r09-public-community.js'), 'utf8') });
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  for (const name of Object.keys(bodies)) if (counts[name] !== 1) throw Error('R09 exact community function missing: ' + name);
  for (const edit of changes.sort((a,b) => b.start-a.start)) source = source.slice(0,edit.start) + edit.text + source.slice(edit.end);
  new Function(source); return source;
}
module.exports = { transform, baseSha256 };
if (require.main === module) {
  const [input, output] = process.argv.slice(2); fs.writeFileSync(output, transform(fs.readFileSync(input, 'utf8')));
  console.log(JSON.stringify({ package:'R09', source: input, baseSha256, changedFunctions:5, productionEffects:0 }));
}
