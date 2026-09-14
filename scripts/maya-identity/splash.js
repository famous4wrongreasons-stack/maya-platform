function MayaSplash(props) {
  var e=React.createElement;
  React.useEffect(function(){
    var before=window.__meActiveRootBg;
    window.__meActiveRootBg='#ffffff';
    if(window.__meApplyRootBg)window.__meApplyRootBg();
    var SB=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.StatusBar;
    if(SB&&SB.setStyle)SB.setStyle({style:'LIGHT'});
    return function(){window.__meActiveRootBg=before;if(window.__meApplyRootBg)window.__meApplyRootBg();};
  },[]);
  return e('div',{id:'maya-splash',onClick:props.onSkip,'aria-label':'Maya — запуск',style:{position:'fixed',inset:0,zIndex:2147483000,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',opacity:props.leaving?0:1,transition:'opacity .22s ease'}},
    e(MayaMarkAnimated,{size:220,mode:'once'}));
}
