// Shared render adapters. Geometry/motion comes only from MayaIdentity.
var mayaIdentityInstance = 0;
function MayaMark({size=22,tile=false,tileBg,style}) {
  var id=React.useRef('maya-static-'+(++mayaIdentityInstance));
  return React.createElement('span', {'data-maya-mark':'ribbon-v1', 'aria-hidden':'true',
    style:Object.assign({display:'inline-flex',width:size,height:size,flex:'none',alignItems:'center',background:tile?(tileBg||'#fff'):undefined,borderRadius:tile?'24%':undefined},style||{}),
    dangerouslySetInnerHTML:{__html:window.MayaIdentity.markup(id.current).replace('<svg ', '<svg style="display:block;width:100%;height:100%" ')}});
}
function MayaMarkAnimated({size=64,mode='loop',state,tile=false,tileBg,style}) {
  var host=React.useRef(null),player=React.useRef(null);
  var actual=state||(mode==='static'?'idle':mode==='once'||mode==='loop'?'launch':'thinking');
  React.useEffect(function(){
    player.current=window.MayaIdentity.mount(host.current,{state:actual,level:function(){return window.__mayaAudioLevel||0;}});
    return function(){player.current.destroy();player.current=null;};
  },[]);
  React.useEffect(function(){if(player.current)player.current.setState(actual);},[actual]);
  return React.createElement('span',{ref:host,'data-maya-motion':actual,'aria-hidden':'true',style:Object.assign({display:'inline-flex',width:size,height:size,flex:'none',background:tile?(tileBg||'#fff'):undefined,borderRadius:tile?'24%':undefined},style||{})});
}
function MayaVolumeMark({size=18,style}) {return React.createElement(MayaMark,{size:size,style:style});}
