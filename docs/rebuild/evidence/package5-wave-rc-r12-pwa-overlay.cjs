const fs=require('fs'),path=require('path');
function finalize(source){
 const start=source.indexOf('  var sourceList = React.useMemo(function () {'),end=source.indexOf('  var si = React.useState(0)',start);
 if(start<0||end<0)throw Error('R12 exact media helper required');
 if(source.slice(start,end).includes('action=team_chat_media'))source=source.slice(0,start)+"  var sourceList = React.useMemo(function () { return typeof url === 'string' && url.startsWith('blob:') ? [url] : []; }, [url]);\n"+source.slice(end);
 else if(!source.slice(start,end).includes("url.startsWith('blob:')"))throw Error('R12 media helper diverged');
 const hidden='saasBusiness ? null : /*#__PURE__*/React.createElement("div", {\n    // Единственный вход в чат смены:';
 if(source.split(hidden).length>2)throw Error('R12 ambiguous staff menu entry');
 source=source.replace(hidden,'/*#__PURE__*/React.createElement("div", {\n    // Canonical R12 team owner verifies the active User/tenant.');
 const staff='React.createElement("a", {href:"?community_moderation=1"}, "Обсуждения на сайте")';
 if(!source.includes('href:"?team=main"')){if(source.split(staff).length!==2)throw Error('R12 known staff links required');source=source.replace(staff,'React.createElement(React.Fragment, null, React.createElement("a", {href:"?team=main"}, "Команда"), '+staff+')');}
 return source;
}
function transform(source,repo){
 const ts=require(path.join(repo,'maya-saas-backend/node_modules/typescript'));
 if(source.includes('function mayaTeamTransport('))throw Error('R12 already applied');
 const ranges=[];
 for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  if(!m[1].trim()||/application\/ld\+json/.test(m[0].slice(0,m[0].indexOf('>'))))continue;
  const code=m[1],offset=m.index+m[0].indexOf('>')+1,sf=ts.createSourceFile('pwa.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='ATeamChat')ranges.push({start:offset+n.getStart(sf),end:offset+n.end,code:code.slice(n.getStart(sf),n.end)});ts.forEachChild(n,walk);}walk(sf);
 }
 if(ranges.length!==1)throw Error('R12 exact existing component required');const target=ranges[0];
 const begin=target.code.indexOf('const MessageBubble ='),end=target.code.indexOf('const onlineIds =',begin);
 const tail=target.code.match(/const BUBBLE_TAIL_PATH = ('[^']+');/);
 if(begin<0||end<0||!tail)throw Error('R12 unchanged bubble reference missing');
 const bubble=target.code.slice(begin,end).trim().replace(/^const MessageBubble =/,'MessageBubble =');
 let snippet=fs.readFileSync(path.join(repo,'maya-saas-backend/deploy/platform/beget-edge/rc/r12-team-communications.js'),'utf8');
 snippet=snippet.replace(/var BUBBLE_TAIL_PATH='[^']+';/,'var BUBBLE_TAIL_PATH='+tail[1]+';').replace('var MessageBubble;', 'var '+bubble);
 if(snippet.includes('R12_BUBBLE_REFERENCE'))snippet=snippet.replace('// R12_BUBBLE_REFERENCE is replaced with the unchanged existing bubble helper.','// Bubble geometry and colors reused from the current certified PWA.');
 source=finalize(source.slice(0,target.start)+snippet+source.slice(target.end));
 for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim()&&!/application\/ld\+json/.test(m[0].slice(0,m[0].indexOf('>'))))new Function(m[1]);
 return source;
}
module.exports={transform,finalize};
