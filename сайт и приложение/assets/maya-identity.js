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
  // Same topology as the mark. The ribbon opens into a connected listening wave.
  var wave = [
    [240,646], [282,646,309,646,342,640], [382,634,404,601,430,608],
    [455,615,457,646,482,638], [510,631,531,571,558,576],
    [587,582,591,657,619,664], [638,669,668,548,692,528],
    [729,496,740,613,759,638], [778,663,798,580,825,578],
    [851,576,870,640,894,635], [922,628,936,607,958,620],
    [980,634,996,646,1018,646], [982,648,968,650,943,653],
    [920,658,904,685,875,675], [840,661,834,639,815,650],
    [782,671,776,711,744,711], [702,711,698,593,674,613],
    [640,641,632,715,596,709]
  ];
  // Close the lower wave with a smooth return; paths are resampled by arc length
  // once so every state has identical, deterministic interpolation topology.
  var waveTail = ' C555 702 545 641 513 650 C480 659 477 676 447 665 C404 649 371 646 240 646Z';
  var fold = 'M240 790C286 700 425 574 501 582C565 571 604 638 639 709C668 770 716 773 750 740C793 654 866 567 941 598C939 693 946 721 984 743C1026 765 1028 799 997 827C960 865 904 870 864 846C809 814 804 747 807 651C783 682 767 715 748 746C709 812 665 863 610 853C545 844 521 783 499 716C489 684 480 653 473 636C444 689 419 747 393 801C369 854 325 873 284 850C252 834 239 814 240 790Z';
  function path(points) { return 'M' + points[0].join(' ') + points.slice(1).map(function(p){return 'C'+p.join(' ');}).join('') + 'Z'; }
  var markPath = path(mark);
  var wavePath = path(wave).slice(0,-1) + waveTail;
  var serial = 0;
  function markup(id, tile) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="220 408 820 474" fill="none" aria-hidden="true" data-maya-identity="ribbon-v1"><defs>' +
      '<linearGradient id="'+id+'a" x1="400" y1="485" x2="784" y2="851" gradientUnits="userSpaceOnUse"><stop stop-color="#0055ff"/><stop offset=".5" stop-color="#08a9fc"/><stop offset="1" stop-color="#32c5f4"/></linearGradient>' +
      '<linearGradient id="'+id+'b" x1="0" y1="580" x2="0" y2="875" gradientUnits="userSpaceOnUse"><stop stop-color="#0532ed"/><stop offset=".58" stop-color="#007dff"/><stop offset="1" stop-color="#22baf5"/></linearGradient></defs>' +
      '<path data-maya-ribbon="base" d="'+markPath+'" fill="url(#'+id+'a)"/>' +
      '<path data-maya-ribbon="fold" d="'+fold+'" fill="url(#'+id+'b)"/></svg>';
  }
  // Sampling uses the browser's native SVG geometry, only at first mount.
  var samples;
  function sample(d, count) {
    var p = document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d',d);
    var len=p.getTotalLength(), result=[];
    for(var i=0;i<count;i++){var v=p.getPointAtLength(len*i/count); result.push([v.x,v.y]);}
    return result;
  }
  function getSamples() { return samples || (samples={mark:sample(markPath,192),wave:sample(wavePath,192)}); }
  function interpolate(amount, phase, amplitude) {
    var s=getSamples();
    return s.mark.map(function(p,i){var w=s.wave[i], x=p[0]+(w[0]-p[0])*amount;
      var envelope=Math.sin(Math.PI*Math.max(0,Math.min(1,(x-240)/778)));
      var y=p[1]+(w[1]-p[1])*amount + amount*envelope*Math.sin((x-240)/83+phase)*amplitude;
      return (i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2);
    }).join('')+'Z';
  }
  function mount(host, options) {
    options=options||{}; host.innerHTML=markup('maya'+(++serial));
    var svg=host.querySelector('svg'); svg.style.cssText='display:block;width:100%;height:100%;overflow:visible';
    var base=svg.querySelector('[data-maya-ribbon=base]'), shade=svg.querySelector('[data-maya-ribbon=fold]');
    var media=window.matchMedia('(prefers-reduced-motion: reduce)'), state=options.state||'idle';
    var raf=0,last=0,start=0,amount=0,disposed=false;
    function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}
    function staticMark(){base.setAttribute('d',markPath);shade.setAttribute('d',fold);shade.style.opacity='1';}
    function tick(now){raf=0;if(disposed)return;
      if(media.matches||document.hidden){staticMark();return;}
      if(!start)start=now; var dt=Math.min(64,now-(last||now)); last=now;
      var active=state!=='idle'&&state!=='done'&&state!=='cancelled';
      var target=active?1:0;
      if(state==='launch') {var elapsed=now-start;target=elapsed<250?0:elapsed<1250?1:0;}
      amount+=(target-amount)*Math.min(1,dt/220);
      if(!target&&amount<.005){amount=0;staticMark();if((state==='launch'&&now-start>=1250)||!active)return;}
      else {var level=typeof options.level==='function'?Math.max(0,Math.min(1,options.level()||0)):0;
        base.setAttribute('d',interpolate(amount,now/900,state==='recording'?level*42:state==='responding'?12:6));
        shade.style.opacity=String(1-amount);}
      raf=requestAnimationFrame(tick);
    }
    function wake(){stop();last=0;if(media.matches||document.hidden){staticMark();return;}if(state==='idle'&&amount===0){staticMark();return;}raf=requestAnimationFrame(tick);}
    function setState(value){if(state===value)return;state=value;start=0;wake();}
    document.addEventListener('visibilitychange',wake);media.addEventListener('change',wake);wake();
    return {setState:setState,destroy:function(){disposed=true;stop();document.removeEventListener('visibilitychange',wake);media.removeEventListener('change',wake);host.innerHTML='';}};
  }
  root.MayaIdentity={version:'ribbon-v1',markPath:markPath,foldPath:fold,wavePath:wavePath,markup:markup,mount:mount};
  if(typeof module!=='undefined')module.exports=root.MayaIdentity;
})(typeof window==='undefined'?globalThis:window);
