const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'), web=path.join(root,'сайт и приложение');
const identity=require(path.join(web,'assets/maya-identity.js'));
const sharp=require(path.join(root,'maya-saas-backend/node_modules/sharp'));
const raw=identity.markup('maya-canonical');
const mark=raw.replace('aria-hidden="true"','role="img" aria-label="Maya"');
const icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="#fff"/>'+raw.replace('<svg ','<svg x="120" y="280" width="760" height="440" ')+'</svg>';
(async()=>{
 const receipts=[];
 function record(p){receipts.push({path:path.relative(root,p),sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')});}
 for(const name of ['maya-mark.svg','maya-mark-mono.svg','maya-mark-light.svg','maya-mark-dark.svg']) {const p=path.join(web,'assets',name);fs.writeFileSync(p,mark+'\n');record(p);}
 fs.writeFileSync(path.join(web,'assets/maya-icon.svg'),icon+'\n');record(path.join(web,'assets/maya-icon.svg'));
 function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
 for(const p of files(web)){
  const rel=path.relative(web,p),n=path.basename(p);
  if(!/\.png$/.test(n)||!(/^(icon-|apple-touch-icon|favicon-|maya-mark-|mayaos-login-bot-avatar)/.test(n)||rel==='pwa-assets/logo-source.png'))continue;
  const size=await sharp(p).metadata();
  await sharp(Buffer.from(icon)).resize(size.width,size.height).png().toBuffer().then(b=>fs.writeFileSync(p,b));record(p);
 }
 // Generated inline source cannot drift from the canonical renderer.
 const p=path.join(web,'app.html');let html=fs.readFileSync(p,'utf8');
 html=html.replace(/<script id="maya-identity-source">[\s\S]*?<\/script>/,'<script id="maya-identity-source">\n'+fs.readFileSync(path.join(web,'assets/maya-identity.js'),'utf8')+'\n</script>');const tile=icon.replace('<svg ', '<svg style="display:block;width:100%;height:100%;border-radius:24%" ');
 html=html.replace(/window\.__ME_MAYA_HTML=[\s\S]*?<\/script>/,'window.__ME_MAYA_HTML='+JSON.stringify(tile)+';</script>');fs.writeFileSync(p,html);
 fs.writeFileSync(path.join(root,'docs/product/maya-identity/generated-assets.json'),JSON.stringify({source:'сайт и приложение/assets/maya-identity.js',version:identity.version,artifacts:receipts},null,2)+'\n');
 console.log('Generated canonical asset variants:',receipts.length);
})();
