/* Browser-only, synthetic proof. No production identities, audio or requests. */
window.runMayaReferenceProof = async function () {
  const api = window.MayaIdentity, frames = await api.loadReference(), checks = [];
  const assert = (ok, name) => { if (!ok) throw Error(name); checks.push(name); };
  const img = new Image(); img.src = api.referenceUrl; await img.decode();
  for (let index = 0; index < api.poses.length; index++) {
    const p = api.poses[index], a = document.createElement('canvas'), b = document.createElement('canvas');
    a.width = b.width = p.w; a.height = b.height = p.h;
    const ac = a.getContext('2d'), bc = b.getContext('2d');
    ac.drawImage(img,p.x,p.y,p.w,p.h,0,0,p.w,p.h);
    bc.fillStyle = 'white'; bc.fillRect(0,0,p.w,p.h); api.paint(bc,frames,index,p.w,p.h,1);
    const x = ac.getImageData(0,0,p.w,p.h).data, y = bc.getImageData(0,0,p.w,p.h).data;
    let max = 0; for(let i=0;i<x.length;i++) max=Math.max(max,Math.abs(x[i]-y[i]));
    assert(max <= 1, 'Source pixels preserved: '+p.name+' (max '+max+'/255)');
  }
  const originals = {raf:window.requestAnimationFrame,caf:window.cancelAnimationFrame,media:window.matchMedia,hidden:Object.getOwnPropertyDescriptor(document,'hidden')};
  const callbacks=new Map(),mediaListeners=new Set();let next=0,time=0,reduced=false,hidden=false,player;
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-2000px;width:340px;height:76px';document.body.appendChild(host);
  try {
    window.requestAnimationFrame=f=>{callbacks.set(++next,f);return next;};
    window.cancelAnimationFrame=id=>callbacks.delete(id);
    window.matchMedia=()=>({get matches(){return reduced;},addEventListener(_,f){mediaListeners.add(f);},removeEventListener(_,f){mediaListeners.delete(f);}});
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    function advance(ms){const end=time+ms;while(time<end){time+=16;const todo=[...callbacks.values()];callbacks.clear();todo.forEach(f=>f(time));}}
    const pose=()=>host.querySelector('canvas').dataset.mayaPose;
    player=api.mount(host,{state:'launch',level:()=>1});await Promise.resolve();advance(2600);
    assert(pose()==='ready'&&callbacks.size===0,'Launch completes through reference poses');
    player.setState('recording');advance(2100);
    assert(pose()==='wave','Wide recording uses exact reference wave');
    assert(callbacks.size===1&&Number(host.querySelector('canvas').style.opacity)>.9,'Existing audio amplitude drives opacity, no new microphone');
    player.setState('done');advance(1100);
    assert(pose()==='ready'&&callbacks.size===0,'Completion returns and stops its frame loop');
    host.style.width='48px';host.style.height='48px';player.setState('thinking');advance(2100);
    assert(pose()==='transition','Compact thinking uses supplied compact pose');
    player.setState('responding');advance(800);assert(pose()==='listening-symbol','Response uses supplied expanded pose');
    reduced=true;mediaListeners.forEach(f=>f());advance(200);
    assert(pose()==='logo'&&callbacks.size===0&&host.querySelector('canvas').getAnimations().length===0,'Reduced motion is static and stops animation');
    reduced=false;mediaListeners.forEach(f=>f());advance(200);hidden=true;document.dispatchEvent(new Event('visibilitychange'));advance(200);
    assert(pose()==='logo'&&callbacks.size===0,'Hidden document releases animation');
    hidden=false;document.dispatchEvent(new Event('visibilitychange'));advance(200);player.destroy();player=null;
    assert(callbacks.size===0&&mediaListeners.size===0&&host.children.length===0,'Unmount removes frames, animations and listeners');
  } finally {
    if(player)player.destroy();host.remove();window.requestAnimationFrame=originals.raf;window.cancelAnimationFrame=originals.caf;window.matchMedia=originals.media;
    if(originals.hidden)Object.defineProperty(document,'hidden',originals.hidden);else delete document.hidden;
  }
  return checks;
};
