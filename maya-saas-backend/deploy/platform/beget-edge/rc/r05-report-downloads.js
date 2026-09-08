// R05: authenticated, read-only download of an admitted own report. No period/content regeneration.
function AMayaReportDownloads(props) {
  var e = React.createElement;
  var t = props.t || {};
  var rowsState = React.useState(null), rows = rowsState[0], setRows = rowsState[1];
  var busyState = React.useState(false), busy = busyState[0], setBusy = busyState[1];
  var errorState = React.useState(''), error = errorState[0], setError = errorState[1];
  function request(path) {
    if (typeof window.__meSaasAuthedFetch !== 'function') return Promise.reject(new Error('session'));
    return window.__meSaasAuthedFetch(path, {method:'GET'});
  }
  async function list() {
    setBusy(true);setError('');
    try {
      var result = await request('/owner-reports');
      if (!result || !Array.isArray(result.reports)) throw new Error('unavailable');
      setRows(result.reports);
    } catch (_) {setError('Не удалось открыть сохранённые отчёты. Проверьте вход в Maya.');}
    finally {setBusy(false);}
  }
  async function download(id) {
    setBusy(true);setError('');
    try {
      var result = await request(id === null ? '/owner-reports/admin-help' : '/owner-reports/' + encodeURIComponent(id) + '/download');
      if (!result || result.content_type !== 'application/pdf' || typeof result.data_base64 !== 'string' ||
          !/^maya-[A-Za-z0-9-]+\.pdf$/.test(result.filename)) throw new Error('unavailable');
      var raw = atob(result.data_base64);
      if (raw.slice(0,5) !== '%PDF-') throw new Error('unavailable');
      var bytes = new Uint8Array(raw.length);
      for(var i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      var link = document.createElement('a');link.href=url;link.download=result.filename;
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(function(){URL.revokeObjectURL(url);},1000);
    } catch (_) {setError('Скачать этот отчёт сейчас нельзя: нет доступа либо срок хранения истёк.');}
    finally {setBusy(false);}
  }
  React.useEffect(function(){
    if(new URLSearchParams(window.location.search).get('download')==='admin-help') download(null);
  },[]);
  var button = {font:'inherit',color:t.ink || 'inherit',border:'1px solid '+(t.line || 'currentColor'),
    borderRadius:12,padding:'10px 14px',background:'transparent',cursor:'pointer'};
  return e('div',{style:{marginTop:12}},
    e('button',{type:'button',disabled:busy,onClick:list,style:button},busy?'Подождите…':'Сохранённые отчёты'),
    e('button',{type:'button',disabled:busy,onClick:function(){download(null);},style:Object.assign({},button,{marginLeft:8})},'Справочник PDF'),
    error?e('p',{role:'status'},error):null,
    rows && rows.length===0?e('p',null,'Сохранённых отчётов пока нет.'):null,
    rows?e('ul',null,rows.map(function(row){return e('li',{key:row.runId,style:{marginTop:8}},
      e('button',{type:'button',disabled:busy,onClick:function(){download(row.runId);},style:button},row.periodLocalDate+' · '+row.title+' · PDF'));})):null);
}
