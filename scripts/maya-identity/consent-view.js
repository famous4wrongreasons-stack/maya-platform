  if (!show) return null;
  function choice(on, setValue, title, detail) {
    return e('label',{style:{display:'flex',gap:14,alignItems:'flex-start',padding:'20px 0',borderTop:'1px solid #e8ecf1',cursor:busy?'default':'pointer'}},
      e('input',{type:'checkbox',checked:on,disabled:busy,onChange:function(ev){setValue(ev.target.checked);setErr('');},style:{width:22,height:22,margin:'2px 0 0',flex:'0 0 22px',accentColor:'#0069f5'}}),
      e('span',null,e('span',{style:{display:'block',fontWeight:600,fontSize:16,color:'#172336',lineHeight:1.4}},title),e('span',{style:{display:'block',marginTop:5,fontSize:13.5,lineHeight:1.55,color:'#526176'}},detail)));
  }
  return e('div',{role:'dialog','aria-modal':'true','aria-labelledby':'maya-consent-title','data-maya-consent':'canonical-v2',style:{position:'fixed',inset:0,zIndex:4000,background:'rgba(239,244,249,.94)',backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',display:'flex',alignItems:'center',justifyContent:'center',overflowY:'auto',padding:'calc(env(safe-area-inset-top,0px) + 24px) 20px calc(env(safe-area-inset-bottom,0px) + 24px)',boxSizing:'border-box',fontFamily:FONT_BODY}},
    e('form',{onSubmit:function(ev){ev.preventDefault();if(!busy)submit();},style:{width:'100%',maxWidth:420,margin:'auto',background:'#fff',borderRadius:28,padding:'28px 24px',boxSizing:'border-box',boxShadow:'0 12px 42px rgba(28,63,101,.07)'}},
      e(MayaMark,{size:84}),
      e('h1',{id:'maya-consent-title',style:{fontFamily:FONT_DISPLAY,fontSize:24,fontWeight:600,lineHeight:1.25,color:'#172336',margin:'20px 0 10px'}},'Ваш выбор'),
      e('p',{style:{color:'#526176',fontSize:14,lineHeight:1.6,margin:'0 0 22px'}},'Подтвердите обработку данных для записи и кабинета. Сообщения о предложениях — отдельный выбор.'),
      choice(pdn,setPdn,'Обработка данных','Согласен на обработку данных для записи и связи со мной.'),
      choice(mkt,setMkt,'Маркетинговые сообщения','Хочу получать акции и предложения. Необязательно: можно продолжить без подписки и изменить выбор позже.'),
      err?e('p',{role:'alert',style:{fontSize:13.5,lineHeight:1.5,color:'#a12c2c',margin:'0 0 14px'}},err):null,
      e('button',{type:'submit',disabled:busy||!pdn,style:{width:'100%',minHeight:52,border:0,borderRadius:14,fontFamily:FONT_BODY,fontWeight:600,fontSize:16,background:busy||!pdn?'#e7edf5':'#0069f5',color:busy||!pdn?'#53647c':'#fff',cursor:busy||!pdn?'default':'pointer',display:'flex',gap:12,alignItems:'center',justifyContent:'center'}},busy?e(MayaLoadingLogo,{size:26}):null,busy?'Сохраняем выбор…':'Продолжить')));
}
