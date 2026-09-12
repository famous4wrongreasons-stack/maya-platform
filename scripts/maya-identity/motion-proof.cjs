// Local synthetic SVG/RAF proof, never a production browser/session.
module.exports=async function(page,out){
 await page.goto('http://127.0.0.1:8879');
 await page.setViewportSize({width:1200,height:820});
 const result=await page.evaluate(()=>{
  const frames=new Map();let next=0,time=0;
  window.requestAnimationFrame=f=>{frames.set(++next,f);return next;};
  window.cancelAnimationFrame=id=>frames.delete(id);
  function advance(until){while(time<until){time+=16;const todo=[...frames.values()];frames.clear();todo.forEach(f=>f(time));}}
  document.body.innerHTML='<div id="stage"></div>';
  const host=document.getElementById('stage'),player=MayaIdentity.mount(host,{state:'thinking'}),shots=[];
  for(const t of [16,64,144,256,480,1440]){advance(t);shots.push(host.innerHTML.replaceAll(host.querySelector('linearGradient').id.slice(0,-1),'proof'+t));}
  const curve=host.querySelector('[data-maya-ribbon=base]').getAttribute('d');
  if(curve.includes('L')||curve.includes('NaN')||curve.includes('Infinity'))throw Error('Invalid smooth contour');
  if(Number(host.querySelector('[data-tail]').getAttribute('stop-opacity'))!==0)throw Error('Unfaded end');
  player.setState('done');advance(3100);
  if(frames.size||host.querySelector('[data-maya-ribbon=base]').getAttribute('d')!==MayaIdentity.markPath)throw Error('Return did not settle');
  player.setState('launch');advance(6300);if(frames.size)throw Error('Launch did not settle');
  player.setState('recording');advance(6500);player.destroy();if(frames.size)throw Error('Unmount leaked RAF');
  document.body.innerHTML='<main style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:24px">'+shots.map((s,i)=>'<section style="width:360px;height:300px;text-align:center">'+s.replace('height: 100%','height: 260px')+'<p>'+['Логотип','Активация','Переход','Раскрытие','Волна','Слушает'][i]+'</p></section>').join('')+'</main>';
  document.querySelectorAll('svg').forEach(el=>{el.style.width='360px';el.style.height='260px';});
  return{smoothCubicContour:'PASS',transparentEnds:'PASS',exactReturn:'PASS',finiteLaunch:'PASS',unmountCleanup:'PASS'};
 });
 await page.screenshot({path:out});return result;
};
