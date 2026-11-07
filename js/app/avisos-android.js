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
  const state=!configured?'As notificações Android aguardam a configuração do Firebase.':enabled?'Receba suas escalas e avisos neste aplicativo, mesmo com a tela fechada.':'Ative os avisos para receber suas escalas neste aplicativo.';
  host().innerHTML='<div class="ap-avisos-texto"><b>Notificações do Chiavari</b><p>'+state+'</p><div class="ap-avisos-acoes">'+(configured?(enabled?'<button type="button" class="ap-avisos-btn" data-native-push="test">Enviar teste</button><button type="button" class="ap-avisos-link" data-native-push="disable">Desligar</button>':'<button type="button" class="ap-avisos-btn" data-native-push="enable">Ativar avisos</button>'):'')+'</div><small role="status"></small></div>';
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
