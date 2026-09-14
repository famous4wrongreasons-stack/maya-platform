const fs=require('fs'),path=require('path');
function transform(source,repo){
  if(source.includes('function AMayaNativeFeedback('))throw Error('R08 already applied');
  const point=source.indexOf('function AMayaCashDeclaration(');if(point<0||source.indexOf('function AMayaCashDeclaration(',point+1)>=0)throw Error('R08 current React anchor required');
  const snippet=fs.readFileSync(path.join(repo,'maya-saas-backend/deploy/platform/beget-edge/rc/r08-native-feedback.js'),'utf8');source=source.slice(0,point)+snippet+'\n'+source.slice(point);
  const staff='React.createElement(AMayaReportDownloads, {t:t})';if(source.split(staff).length!==2)throw Error('R08 manager anchor required');source=source.replace(staff,'React.createElement(React.Fragment, null, React.createElement("a", {href:"?native_feedback=management"}, "Отзывы о визитах"), '+staff+')');
  const client="function AClientCabinet(";if(source.split(client).length!==2)throw Error("R08 Client cabinet anchor required");source=source.replace(client,'function AClientCabinet(props){return React.createElement(React.Fragment, null, React.createElement("a", {href:"?native_feedback=client"}, "Мои отзывы"), React.createElement(AMayaR08ClientCabinet, props));} function AMayaR08ClientCabinet(');
  for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim()&&!/application\/ld\+json/.test(m[0].slice(0,m[0].indexOf('>'))))new Function(m[1]);return source;
}
module.exports={transform};
