const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),native=path.resolve(process.argv[2]||'');
if(!process.argv[2]||native==='/Users/stanislavmosin/Desktop/maya-ios')throw Error('isolated native directory required');
const sharp=require(path.join(root,'maya-saas-backend/node_modules/sharp'));
const svg=fs.readFileSync(path.join(root,'сайт и приложение/assets/maya-icon.svg'));
const raw=require(path.join(root,'сайт и приложение/assets/maya-identity.js')).markup('maya-native-splash');
(async()=>{
 const icon=path.join(native,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');await sharp(svg).resize(1024,1024).png().toFile(icon);
 const launch='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="#fff"/>'+raw.replace('<svg ','<svg x="1045" y="1181" width="642" height="370" ')+'</svg>';
 const dir=path.join(native,'ios/App/App/Assets.xcassets/Splash.imageset');
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.png')))await sharp(Buffer.from(launch)).png().toFile(path.join(dir,name));
 const storyboard=path.join(native,'ios/App/App/Base.lproj/LaunchScreen.storyboard');let text=fs.readFileSync(storyboard,'utf8');text=text.replace(/<color key="backgroundColor"[^>]*\/>/g,'<color key="backgroundColor" red="1" green="1" blue="1" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>');fs.writeFileSync(storyboard,text);
 const android=path.join(native,'android/app/src/main/res');
 function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
 const foreground='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">'+raw.replace('<svg ','<svg x="210" y="330" width="580" height="340" ')+'</svg>';
 for(const p of files(android).filter(p=>/\/(ic_launcher(?:_round|_foreground)?|splash)\.png$/.test(p))){
  const m=await sharp(p).metadata(),isSplash=path.basename(p)==='splash.png';
  const source=isSplash?'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+m.width+' '+m.height+'"><rect width="100%" height="100%" fill="#fff"/>'+raw.replace('<svg ','<svg x="'+(m.width*.35)+'" y="'+(m.height*.41)+'" width="'+(m.width*.3)+'" height="'+(m.height*.18)+'" ')+'</svg>':p.includes('_foreground')?foreground:svg;
  await sharp(Buffer.from(source)).resize(m.width,m.height).png().toBuffer().then(b=>fs.writeFileSync(p,b));
 }
 const color=path.join(android,'values/ic_launcher_background.xml');fs.writeFileSync(color,'<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#FFFFFF</color></resources>\n');
 console.log('iOS/Android icon and launch assets regenerated from canonical vector; tenant alternate icon preserved');
})();
