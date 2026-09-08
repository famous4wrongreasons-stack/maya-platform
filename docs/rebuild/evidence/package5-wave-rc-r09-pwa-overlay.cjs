const fs=require('node:fs'),path=require('node:path');
function transform(source,repo){
  const point='function AMayaNativeFeedback(';if(source.includes('function AMayaCommunityModeration(')||source.split(point).length!==2)throw Error('R09 exact existing PWA baseline required');
  source=source.replace(point,fs.readFileSync(path.join(repo,'maya-saas-backend/deploy/platform/beget-edge/rc/r09-community-moderation.js'),'utf8')+'\n'+point);
  const staff='React.createElement("a", {href:"?native_feedback=management"}, "Отзывы о визитах")';if(source.split(staff).length!==2)throw Error('R09 staff link anchor required');source=source.replace(staff,'React.createElement(React.Fragment, null, React.createElement("a", {href:"?community_moderation=1"}, "Обсуждения на сайте"), '+staff+')');
  for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim()&&!/application\/ld\+json/.test(m[0].slice(0,m[0].indexOf('>'))))new Function(m[1]);return source;
}
module.exports={transform};
