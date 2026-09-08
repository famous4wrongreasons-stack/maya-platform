const fs=require('fs'),path=require('path');
function transform(source,repo) {
 if(source.includes('function AMayaGovernedSettings('))throw Error('R11 overlay already applied');
 const snippet=fs.readFileSync(path.join(repo,'maya-saas-backend/deploy/platform/beget-edge/rc/r11-governed-settings.js'),'utf8');
 const point=source.indexOf('function AMayaReportDownloads(');
 if(point<0 || source.indexOf('function AMayaReportDownloads(',point+1)>=0)throw Error('R11 exact existing React scope required');
 const replacement='React.createElement(AMayaReportDownloads, {t:t})';
 if(source.split(replacement).length!==2)throw Error('R11 dashboard link anchor required');
 source=source.slice(0,point)+snippet+'\n'+source.slice(point);
 source=source.replace(replacement,'React.createElement(React.Fragment, null, React.createElement("a", {href:"?governed_settings=business_rules"}, "Настройки Maya"), '+replacement+')');
 for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim()&&!/application\/ld\+json/.test(m[0].slice(0,m[0].indexOf('>'))))new Function(m[1]);
 return source;
}
module.exports={transform};
