(function(){
 'use strict';
 const native=()=>Boolean(window.AcervoAndroid?.postMessage);
 const send=data=>window.AcervoAndroid.postMessage(JSON.stringify(data));
 let empresa=null,busy=false,enabled=false,configured=false,timer,epoch=0;
 const host=()=>document.getElementById('apAvisos');
 function message(text){const el=host()?.querySelector('[role="status"]');if(el)el.textContent=text;}
 function paint(){
  if(!host())return;
  host().hidden=false;
  const texto=!configured?'As notificações aguardam a configuração do Firebase.':enabled?'Ligadas. Você recebe suas escalas mesmo com a tela fechada.':'Receba suas escalas neste aplicativo, mesmo com a tela fechada.';
  host().innerHTML='<div class="ap-cfg-linha"><span class="ap-cfg-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg></span><div class="ap-cfg-texto"><b>Notificações</b><p>'+texto+'</p></div>'+(configured?'<button type="button" class="ap-switch" role="switch" aria-checked="'+enabled+'" aria-label="Notificações" data-native-push="'+(enabled?'disable':'enable')+'"><span></span></button>':'')+'</div>'+(configured&&enabled?'<button type="button" class="ap-cfg-link" data-native-push="test">Enviar notificação de teste</button>':'')+'<small class="ap-cfg-msg" role="status"></small>';
 }
 async function bind(detail){
  if(busy||!empresa)return;busy=true;const current=epoch;
  let binding;
  try{
   const {data}=await window.supabaseClient.auth.getSession();if(!data.session)throw Error('Entre novamente no app.');
   binding=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
   const {error}=await window.supabaseClient.rpc('app_android_push_registrar',{p_empresa:empresa,p_dispositivo:detail.device,p_token:detail.token,p_binding:binding});
   if(error)throw Error('Não foi possível registrar os avisos no servidor. Tente novamente.');
   if(current!==epoch){await window.supabaseClient.rpc('app_android_push_encerrar',{p_binding:binding});return;}
   send({action:'push:bind',binding,token:detail.token,usuario:data.session.user.id,empresa});
  }catch(e){message(e.message||'Não foi possível ativar os avisos.');}
  finally{busy=false;}
 }
 window.addEventListener('acervo:push',event=>{
  if(!native()||!empresa)return;clearTimeout(timer);
  const d=event.detail||{};
  if(d.type==='status'){configured=Boolean(d.configured);enabled=Boolean(d.enabled);paint();message(d.message||'');}
  else if(d.type==='token')bind(d);
  else if(d.type==='error')message(d.message||'Não foi possível ativar os avisos.');
 });
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-native-push]');if(!button||busy)return;
  if(button.dataset.nativePush==='enable')send({action:'push:enable'});
  else if(button.dataset.nativePush==='disable'){epoch++;send({action:'push:disable'});}
  else{
   button.disabled=true;
   try{
    const {data,error}=await window.supabaseClient.functions.invoke('app-push',{body:{acao:'teste',empresa_id:empresa}});
    if(error||data?.erro)throw Error(data?.erro||'Não foi possível enviar o teste. Verifique se os avisos estão ativados.');
    message('Teste enviado ao Android. Confira a notificação no celular.');
   }catch(e){message(e.message);}finally{button.disabled=false;}
  }
 });
 window.AppAvisosAndroid={iniciar(id){empresa=id;epoch++;paint();message('Verificando notificações Android…');send({action:'push:status'});timer=setTimeout(()=>message('Atualize o aplicativo para usar as notificações Android.'),8000);}};
 window.supabaseClient?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){epoch++;empresa=null;enabled=false;clearTimeout(timer);if(native())send({action:'push:disable'});}});
})();
