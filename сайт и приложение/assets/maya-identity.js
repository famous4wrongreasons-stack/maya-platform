/* MAYA identity v1. Canonical vector source, traced from owner may.png.
 * Generated SVG/PNG/inline copies must be regenerated, never independently edited.
 * Motion poses are read from the unchanged owner storyboard. No microphone access.
 * Business logos are independent; the only loaded resource is the local reference. */
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
  function markup(id) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="220 408 820 474" fill="none" aria-hidden="true" data-maya-identity="ribbon-v1"><defs>' +
      '<linearGradient id="'+id+'a" x1="400" y1="485" x2="784" y2="851" gradientUnits="userSpaceOnUse"><stop stop-color="#0055ff"/><stop offset=".5" stop-color="#08a9fc"/><stop offset="1" stop-color="#32c5f4"/></linearGradient>' +
      '<linearGradient id="'+id+'b" x1="0" y1="580" x2="0" y2="875" gradientUnits="userSpaceOnUse"><stop stop-color="#0532ed"/><stop offset=".58" stop-color="#007dff"/><stop offset="1" stop-color="#22baf5"/></linearGradient></defs>' +
      '<path data-maya-ribbon="base" d="'+markPath+'" fill="url(#'+id+'a)"/>' +
      '<path data-maya-ribbon="fold" d="'+fold+'" fill="url(#'+id+'b)"/></svg>';
  }

  // Exact owner pixels, not a reconstructed curve or a generated color palette.
  // Crop coordinates refer to the unmodified 1672x941 owner storyboard PNG.
  var poses=[
    {name:'logo',x:52,y:96,w:210,h:138},
    {name:'activation',x:308,y:105,w:206,h:125},
    {name:'transition',x:550,y:110,w:218,h:120},
    {name:'listening-symbol',x:805,y:92,w:285,h:140},
    {name:'return',x:1135,y:110,w:215,h:120},
    {name:'ready',x:1405,y:96,w:200,h:138},
    {name:'wave',x:0,y:300,w:1672,h:286}
  ];
  var referenceUrl='./maya-motion-reference.png?v=b57b0494',loaded;
  function loadReference(){
    if(loaded)return loaded;
    loaded=new Promise(function(resolve,reject){var source=new Image();
      source.onload=function(){
        if(source.naturalWidth!==1672||source.naturalHeight!==941){reject(new Error('Maya reference dimensions changed'));return;}
        var frames=poses.map(function(p){
          var c=document.createElement('canvas');c.width=p.w;c.height=p.h;
          var ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,p.x,p.y,p.w,p.h,0,0,p.w,p.h);
          var pixels=ctx.getImageData(0,0,p.w,p.h),d=pixels.data;
          // Remove only the white matte. Re-compositing over white recovers
          // each original channel within one 8-bit level, including the halo.
          for(var i=0;i<d.length;i+=4){var matte=Math.min(d[i],d[i+1],d[i+2]),alpha=255-matte;
            for(var j=0;j<3;j++)d[i+j]=alpha?Math.round((d[i+j]-matte)*255/alpha):0;
            d[i+3]=alpha;
          }
          ctx.putImageData(pixels,0,0);
          return c;
        });resolve(frames);
      };
      source.onerror=function(){reject(new Error('Maya reference unavailable'));};source.src=referenceUrl;
    });return loaded;
  }
  function paint(ctx,frames,index,width,height,opacity){
    var p=poses[index],scale=Math.min(width/p.w,height/p.h);
    ctx.globalAlpha=opacity;ctx.drawImage(frames[index],(width-p.w*scale)/2,(height-p.h*scale)/2,p.w*scale,p.h*scale);ctx.globalAlpha=1;
  }
  // The PNG provides key poses, not an editable motion timeline. Transition
  // between its exact source images without deforming/redrawing their geometry.
  // Additive premultiplied blending avoids a grey/dim intermediate silhouette.
  function paintTransition(ctx,frames,a,b,width,height,mix){
    ctx.save();ctx.globalCompositeOperation='lighter';
    paint(ctx,frames,a,width,height,1-mix);paint(ctx,frames,b,width,height,mix);
    ctx.restore();
  }
  function mount(host,options){
    options=options||{};
    var state=options.state||'idle',media=window.matchMedia('(prefers-reduced-motion: reduce)');
    var frames,canvas,ctx,raf=0,start=0,disposed=false,from=0,to=0,sequence=[],phase=0,breath=null,voiceRaf=0,voiceTime=0,level=0;
    host.innerHTML=markup('maya-reference-fallback');
    function stop(){if(raf)cancelAnimationFrame(raf);raf=0;if(voiceRaf)cancelAnimationFrame(voiceRaf);voiceRaf=0;
      if(breath)breath.cancel();breath=null;if(canvas)canvas.style.opacity='1';}
    function active(){return state==='thinking'||state==='recording'||state==='responding';}
    function ambient(){
      if(!active()||media.matches||document.hidden||disposed)return;
      // Keep the exact reference silhouette. Existing audio level changes only
      // opacity; this renderer never invents an equalizer or opens a microphone.
      if(state==='recording'&&typeof options.level==='function'){
        function sample(now){voiceRaf=0;if(disposed||!active()||media.matches||document.hidden)return;
          if(now-voiceTime>=33){voiceTime=now;var input=Number(options.level());input=Number.isFinite(input)?Math.max(0,Math.min(1,input)):0;level+=(input-level)*.2;canvas.style.opacity=String(.8+level*.2);}
          voiceRaf=requestAnimationFrame(sample);
        }voiceRaf=requestAnimationFrame(sample);
      }else if(canvas.animate)breath=canvas.animate([{opacity:.82},{opacity:1},{opacity:.82}],{duration:2400,iterations:Infinity,easing:'ease-in-out'});
    }
    function draw(a,b,mix){if(!ctx)return;
      var bounds=host.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,3),w=Math.max(1,Math.round(bounds.width*dpr)),h=Math.max(1,Math.round(bounds.height*dpr));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      ctx.clearRect(0,0,w,h);if(mix>0&&mix<1)paintTransition(ctx,frames,a,b,w,h,mix);else paint(ctx,frames,mix?b:a,w,h,1);
      canvas.dataset.mayaPose=mix?poses[a].name+' → '+poses[b].name:poses[a].name;
    }
    function still(index){from=to=index;draw(index,index,0);}
    function tick(now){raf=0;if(disposed||!frames)return;
      if(media.matches||document.hidden){still(0);return;}
      if(!start)start=now;
      var elapsed=now-start,hold=phase===0?140:180,blend=240;
      if(elapsed<hold){draw(from,from,0);}
      else {var t=Math.min(1,(elapsed-hold)/blend),ease=t*t*(3-2*t);draw(from,to,ease);
        if(t===1){from=to;phase++;start=now;if(phase>=sequence.length){still(from);ambient();return;}to=sequence[phase];}
      }
      raf=requestAnimationFrame(tick);
    }
    function wake(){stop();start=0;phase=0;if(!frames)return;
      if(media.matches||document.hidden){still(0);return;}
      if(state==='idle'){still(0);return;}
      if(state==='launch'){from=0;sequence=[1,2,3,4,5];}
      else if(state==='done'||state==='cancelled'){sequence=[4,5];}
      else {var bounds=host.getBoundingClientRect(),target=bounds.width>bounds.height*2?6:(state==='responding'?3:2);
        sequence=from===target?[]:(from===0||from===5?[1,2].concat(target===2?[]:target===6?[3,6]:[3]):[target]);
      }
      if(!sequence.length){still(from);ambient();return;}to=sequence[0];raf=requestAnimationFrame(tick);
    }
    function setState(value){if(state===value)return;state=value;wake();}
    var resize=new ResizeObserver(function(){if(frames&&!raf)draw(from,from,0);});resize.observe(host);
    document.addEventListener('visibilitychange',wake);media.addEventListener('change',wake);
    loadReference().then(function(result){if(disposed)return;frames=result;canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100%;height:100%';canvas.setAttribute('aria-hidden','true');host.replaceChildren(canvas);ctx=canvas.getContext('2d');wake();}).catch(function(){/* Retain existing static mark on asset load failure. */});
    return {setState:setState,destroy:function(){disposed=true;stop();resize.disconnect();document.removeEventListener('visibilitychange',wake);media.removeEventListener('change',wake);host.innerHTML='';}};
  }
  root.MayaIdentity={version:'ribbon-v1',motionVersion:'owner-reference-v3',markPath:markPath,foldPath:fold,markup:markup,mount:mount,poses:poses,loadReference:loadReference,paint:paint,paintTransition:paintTransition,referenceUrl:referenceUrl};
  if(typeof module!=='undefined')module.exports=root.MayaIdentity;
})(typeof window==='undefined'?globalThis:window);
