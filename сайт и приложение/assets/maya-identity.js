/* MAYA identity v1. Canonical vector source, traced from owner may.png.
 * Generated SVG/PNG/inline copies must be regenerated, never independently edited.
 * Business logos are independent. No audio or network access in this renderer. */
(function (root) {
  'use strict';
  var mark = [
    [240,790], [238,769,249,747,262,724], [302,652,363,534,406,475],
    [445,422,503,415,541,443], [586,472,600,556,631,674],
    [691,576,751,484,821,475], [900,463,945,520,941,606],
    [939,694,946,721,984,743], [1026,765,1028,799,997,827],
    [960,865,904,870,864,846], [809,814,804,747,807,651],
    [783,682,767,715,748,746], [709,812,665,863,610,853],
    [545,844,521,783,499,716], [489,684,480,653,473,636],
    [444,689,419,747,393,801], [369,854,325,873,284,850],
    [252,834,239,814,240,790]
  ];
  var fold = 'M240 790C286 700 425 574 501 582C565 571 604 638 639 709C668 770 716 773 750 740C793 654 866 567 941 598C939 693 946 721 984 743C1026 765 1028 799 997 827C960 865 904 870 864 846C809 814 804 747 807 651C783 682 767 715 748 746C709 812 665 863 610 853C545 844 521 783 499 716C489 684 480 653 473 636C444 689 419 747 393 801C369 854 325 873 284 850C252 834 239 814 240 790Z';
  function path(points) { return 'M' + points[0].join(' ') + points.slice(1).map(function(p){return 'C'+p.join(' ');}).join('') + 'Z'; }
  var markPath = path(mark);
  // Split each original cubic exactly in half: the logo is unchanged. Morph
  // corresponding control points, never arc-length polygons (which kink/twist).
  function mid(a,b){return [(a[0]+b[0])/2,(a[1]+b[1])/2];}
  function split(points){var out=[points[0]],p=points[0];points.slice(1).forEach(function(c){
    var a=[c[0],c[1]],b=[c[2],c[3]],q=[c[4],c[5]],pa=mid(p,a),ab=mid(a,b),bq=mid(b,q),u=mid(pa,ab),v=mid(ab,bq),m=mid(u,v);
    out.push(pa.concat(u,m),m.concat(v,bq,q).slice(2));p=q;
  });return out;}
  var morphMark=split(mark);
  // Two analytic smooth boundaries, with a continuous folded highlight. The
  // envelope becomes a fine horizontal ribbon at either end, then fades to zero.
  function edge(t,side,phase,amplitude){
    var envelope=Math.pow(Math.sin(Math.PI*t),2.8);
    var pulse=Math.cos(10*Math.PI*(t-.5)+Math.sin(phase)*.13);
    var sway=Math.sin(4*Math.PI*t+phase)*amplitude*envelope;
    var y=646+envelope*(side==='upper'?-(65+63*pulse):(37-35*pulse))+sway;
    if(side==='fold')y=edge(t,'upper',phase,amplitude)*.43+edge(t,'lower',phase,amplitude)*.57;
    return y;
  }
  function curve(side,reverse,phase,amplitude){var segs=[],n=17;
    for(var i=0;i<n;i++){
      var t=reverse?1-i/n:i/n,u=reverse?1-(i+1)/n:(i+1)/n,d=u-t,h=.00001;
      var f=function(v){return edge(Math.max(0,Math.min(1,v)),side,phase,amplitude);};
      var slope=function(v){return (f(v+h)-f(v-h))/(2*h);};
      segs.push([240+778*(t+d/3),f(t)+slope(t)*d/3,240+778*(u-d/3),f(u)-slope(u)*d/3,240+778*u,f(u)]);
    }return segs;
  }
  function wavePoints(phase,amplitude,folded){
    var points=[[240,646]].concat(curve(folded?'fold':'upper',false,phase,amplitude),curve('lower',true,phase,amplitude));
    // Keep rounded cap tangents throughout the morph. The final fine caps are
    // transparent; intermediate states must not form pointed wedges either.
    points[1][0]=240;points[1][1]=645.99;
    points[17][2]=1018;points[17][3]=645.99;
    points[18][0]=1018;points[18][1]=646.01;
    points[34][2]=240;points[34][3]=646.01;
    return points;
  }
  function smooth(value){var t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);}
  var wavePath=path(wavePoints(0,0,false));
  function frame(amount,phase,amplitude){
    var wave=wavePoints(phase,amplitude,false);
    return {base:path(morphMark.map(function(p,i){return p.map(function(v,j){return +(v+(wave[i][j]-v)*amount).toFixed(3);});})),fold:path(wavePoints(phase,amplitude,true))};
  }
  var serial = 0;
  function markup(id, animated) {
    if(!animated){
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="220 408 820 474" fill="none" aria-hidden="true" data-maya-identity="ribbon-v1"><defs>' +
      '<linearGradient id="'+id+'a" x1="400" y1="485" x2="784" y2="851" gradientUnits="userSpaceOnUse"><stop stop-color="#0055ff"/><stop offset=".5" stop-color="#08a9fc"/><stop offset="1" stop-color="#32c5f4"/></linearGradient>' +
      '<linearGradient id="'+id+'b" x1="0" y1="580" x2="0" y2="875" gradientUnits="userSpaceOnUse"><stop stop-color="#0532ed"/><stop offset=".58" stop-color="#007dff"/><stop offset="1" stop-color="#22baf5"/></linearGradient></defs>' +
      '<path data-maya-ribbon="base" d="'+markPath+'" fill="url(#'+id+'a)"/>' +
      '<path data-maya-ribbon="fold" d="'+fold+'" fill="url(#'+id+'b)"/></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="220 408 820 474" fill="none" aria-hidden="true" data-maya-identity="ribbon-v1"><defs>' +
      '<linearGradient id="'+id+'a" x1="400" y1="485" x2="784" y2="851" gradientUnits="userSpaceOnUse"><stop stop-color="#0055ff"/><stop offset=".5" stop-color="#08a9fc"/><stop offset="1" stop-color="#32c5f4"/></linearGradient>' +
      '<linearGradient id="'+id+'b" x1="0" y1="580" x2="0" y2="875" gradientUnits="userSpaceOnUse"><stop stop-color="#0532ed"/><stop offset=".58" stop-color="#007dff"/><stop offset="1" stop-color="#22baf5"/></linearGradient>' +
      '<linearGradient id="'+id+'w" x1="0" y1="580" x2="0" y2="724" gradientUnits="userSpaceOnUse"><stop stop-color="#0637f8"/><stop offset=".6" stop-color="#008fff"/><stop offset="1" stop-color="#37cef3"/></linearGradient>' +
      '<linearGradient id="'+id+'fade" x1="240" x2="1018" gradientUnits="userSpaceOnUse"><stop data-tail="1" stop-color="white"/><stop offset=".14" data-tail=".8" stop-color="white"/><stop offset=".33" stop-color="white"/><stop offset=".67" stop-color="white"/><stop offset=".86" data-tail=".8" stop-color="white"/><stop offset="1" data-tail="1" stop-color="white"/></linearGradient>' +
      '<mask id="'+id+'mask" maskUnits="userSpaceOnUse" x="200" y="390" width="860" height="510"><rect x="200" y="390" width="860" height="510" fill="url(#'+id+'fade)"/></mask>' +
      '<clipPath id="'+id+'clip"><path data-maya-ribbon="clip" d="'+markPath+'"/></clipPath>' +
      '<filter id="'+id+'soft" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="13"/></filter></defs>' +
      '<g mask="url(#'+id+'mask)"><path data-maya-ribbon="glow" d="'+wavePath+'" fill="#24bafa" filter="url(#'+id+'soft)" opacity="0"/>' +
      '<path data-maya-ribbon="base" d="'+markPath+'" fill="url(#'+id+'a)"/>' +
      '<g clip-path="url(#'+id+'clip)"><path data-maya-ribbon="fold" d="'+fold+'" fill="url(#'+id+'b)"/>' +
      '<path data-maya-ribbon="wave-fold" d="'+wavePath+'" fill="url(#'+id+'w)" opacity="0"/></g></g></svg>';
  }
  function mount(host, options) {
    options=options||{}; host.innerHTML=markup('maya'+(++serial),true);
    var svg=host.querySelector('svg'); svg.style.cssText='display:block;width:100%;height:100%;overflow:visible';
    var node=function(name){return svg.querySelector('[data-maya-ribbon="'+name+'"]');};
    var base=node('base'),shade=node('fold'),waveFold=node('wave-fold'),clip=node('clip'),glow=node('glow'),tails=svg.querySelectorAll('[data-tail]');
    var media=window.matchMedia('(prefers-reduced-motion: reduce)'), state=options.state||'idle';
    var raf=0,last=0,start=0,amount=0,disposed=false;
    function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}
    function fade(value){tails.forEach(function(t){t.setAttribute('stop-opacity',String(1-value*Number(t.getAttribute('data-tail'))));});}
    function staticMark(){base.setAttribute('d',markPath);clip.setAttribute('d',markPath);shade.style.opacity='1';waveFold.style.opacity='0';glow.style.opacity='0';fade(0);}
    function tick(now){raf=0;if(disposed)return;
      if(media.matches||document.hidden){staticMark();return;}
      if(!start)start=now; var dt=Math.min(64,now-(last||now)); last=now;
      var active=state!=='idle'&&state!=='done'&&state!=='cancelled';
      var target=active?1:0;
      if(state==='launch') {var elapsed=now-start;target=elapsed<180?0:elapsed<1250?1:0;}
      amount+=(target-amount)*(1-Math.exp(-dt/210));
      if(!target&&amount<.005){amount=0;staticMark();if((state==='launch'&&now-start>=1250)||!active)return;}
      else {var level=typeof options.level==='function'?Math.max(0,Math.min(1,options.level()||0)):0;
        var f=frame(amount,now/1600,state==='recording'?level*22:state==='responding'?9:3);
        base.setAttribute('d',f.base);clip.setAttribute('d',f.base);waveFold.setAttribute('d',f.fold);
        glow.setAttribute('d',f.base);glow.style.opacity=String(amount*.16);
        shade.style.opacity=String(1-smooth(amount/.6));waveFold.style.opacity=String(smooth((amount-.45)/.55));fade(smooth(amount/.8));}
      raf=requestAnimationFrame(tick);
    }
    function wake(){stop();last=0;if(media.matches||document.hidden){staticMark();return;}if(state==='idle'&&amount===0){staticMark();return;}raf=requestAnimationFrame(tick);}
    function setState(value){if(state===value)return;state=value;start=0;wake();}
    document.addEventListener('visibilitychange',wake);media.addEventListener('change',wake);wake();
    return {setState:setState,destroy:function(){disposed=true;stop();document.removeEventListener('visibilitychange',wake);media.removeEventListener('change',wake);host.innerHTML='';}};
  }
  root.MayaIdentity={version:'ribbon-v1',motionVersion:'smooth-feather-v2',markPath:markPath,foldPath:fold,wavePath:wavePath,frame:frame,markup:markup,mount:mount};
  if(typeof module!=='undefined')module.exports=root.MayaIdentity;
})(typeof window==='undefined'?globalThis:window);
