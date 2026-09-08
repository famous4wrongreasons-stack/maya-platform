// Bounded report-download replacement for all six already inventoried PWA aliases.
const fs=require('fs'),path=require('path');
function transform(source,repo) {
 const snippet=fs.readFileSync(path.join(repo,'maya-saas-backend/deploy/platform/beget-edge/rc/r05-report-downloads.js'),'utf8');
 const old='ghostBtn("Скачать отчёт в PDF", "PDF за период придёт вам в Telegram-бот.")';
 if(source.split(old).length!==2 || source.includes('function AMayaReportDownloads(')) throw Error('R05 exact PDF control baseline required');
 const ts=require(path.join(repo,'maya-saas-backend/node_modules/typescript'));
 let insert=null,owned=0;
 for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  const sf=ts.createSourceFile('r05.js',m[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  function walk(n) {
   if(ts.isFunctionDeclaration(n) && n.name?.text==='AStaffDashboard' && n.getText(sf).includes(old)) {
    owned++;insert=m.index+m[0].indexOf('>')+1+n.getStart(sf);
   }
   ts.forEachChild(n,walk);
  }
  walk(sf);
 }
 if(owned!==1 || insert===null) throw Error('R05 report control owner ambiguous');
 source=source.slice(0,insert)+snippet+'\n'+source.slice(insert);
 source=source.replace(old,'React.createElement(AMayaReportDownloads, {t:t})');
 for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if(m[1].trim() && !/type=['"]application\/ld\+json/.test(m[0].slice(0,m[0].indexOf('>')))) new Function(m[1]);
 }
 return source;
}
module.exports={transform};
