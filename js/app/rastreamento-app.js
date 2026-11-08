/* Localização do PWA: o navegador pode suspender a coleta ao sair do app. */
(function () {
 'use strict';
 let empresa, usuario, watch = null, consulta = null, geracao = 0, enviando = false, ultimo = 0, painel;
 const sb = () => window.supabaseClient;
 const android = () => Boolean(window.AcervoAndroid?.postMessage);
 let tokenPendente=null, nativoAtivo=false, registrando=false;
 const enviarAndroid = dados => window.AcervoAndroid.postMessage(JSON.stringify(dados));
 const chave = () => `rastreamento:${empresa}:${usuario}`;
 function mensagem(texto) { painel?.querySelector('[role="status"]') && (painel.querySelector('[role="status"]').textContent = texto); }
 function erroEnvio(erro) {
  if (navigator.onLine === false || /failed to fetch|networkerror|load failed/i.test(erro?.message || '')) return 'Sem conexão com o servidor. O envio será tentado novamente.';
  if (['PGRST202','PGRST205','42P01','42883'].includes(erro?.code)) return 'O rastreamento ainda não está configurado no servidor. Avise o administrador.';
  if (['PGRST301','PGRST302','PGRST303','42501'].includes(erro?.code) || /jwt|acesso não autorizado|sessão necessária/i.test(erro?.message || '')) return 'Não foi possível validar seu acesso. Saia e entre novamente no app.';
  if (['23514','23502','22P02'].includes(erro?.code)) return 'O celular enviou uma posição inválida. Aguardando uma nova leitura do GPS.';
  return 'O servidor não conseguiu salvar a posição. O envio será tentado novamente.';
 }
 // Nov/2026: a localização fica em Configurações do app (#apLocal), numa linha simples com um botão liga/desliga.
 // Nas telas dos módulos não há painel na tela: a coleta continua, sem nada por cima do conteúdo.
 function ligada(){ return android() ? nativoAtivo : localStorage.getItem(chave())==='1'; }
 function pintar(){
  if(!painel)return;
  const host=document.getElementById('apLocal'); if(!host||painel!==host)return;
  const on=ligada(), status=painel.querySelector('[role="status"]')?.textContent||'';
  const texto=on?'Ligada. Sua posição é compartilhada com a Logística.':android()?'Compartilhe sua posição com a Logística, mesmo com a tela apagada.':'Compartilhe sua posição com a Logística enquanto o app estiver aberto.';
  painel.innerHTML='<div class="ap-cfg-linha"><span class="ap-cfg-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg></span><div class="ap-cfg-texto"><b>Localização</b><p>'+texto+'</p></div><button type="button" class="ap-switch" role="switch" aria-checked="'+on+'" aria-label="Localização" data-local="'+(on?'parar':'ativar')+'"><span></span></button></div>'+
   (!android()&&/android/i.test(navigator.userAgent||'')?'<a class="ap-cfg-link" href="https://easyloc-zeta.vercel.app/instalar.html">Instalar o aplicativo para Android (funciona com a tela apagada)</a>':'')+'<small class="ap-cfg-msg" role="status"></small>';
  painel.querySelector('[role="status"]').textContent=status;
  painel.querySelector('[data-local]').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{if(b.dataset.local==='ativar')await ativar();else await parar();}finally{pintar();}};
 }
 function montar() {
  if (painel) return;
  painel = document.getElementById('apLocal') || document.createElement('div');
  pintar();
 }
 function limpar() { geracao++; clearInterval(consulta); consulta=null; if (watch !== null) navigator.geolocation.clearWatch(watch); watch=null; ultimo=0; }
 async function ativar() {
  if(android()){await ativarAndroid();return;}
  if (!navigator.geolocation || !window.isSecureContext) { mensagem('Localização indisponível. Use HTTPS e um navegador compatível.'); return; }
  limpar(); const atual=geracao;
  localStorage.setItem(chave(),'1'); mensagem('Aguardando permissão e sinal de localização...');
  const transmitir=async (pos) => {
   if (atual !== geracao || enviando || Date.now()-ultimo<15000) return;
   enviando=true;
   try {
    const {error}=await sb().rpc('rastreamento_enviar',{p_empresa:empresa,p_latitude:pos.coords.latitude,p_longitude:pos.coords.longitude,p_precisao:pos.coords.accuracy});
    if (atual !== geracao) return;
    if(error) throw error;
    ultimo=Date.now(); mensagem('Posição enviada às '+new Date().toLocaleTimeString('pt-BR')+'.');
   } catch (erro) { if(atual===geracao) mensagem(erroEnvio(erro)); }
   finally { enviando=false; }
  };
  const falha=(erro)=>{ if(atual!==geracao)return; mensagem(erro.code===1?'Permissão de localização negada. Libere nas configurações do celular.':'Não foi possível obter a posição. Aguardando novo sinal.'); if(erro.code===1){localStorage.removeItem(chave());limpar();pintar();mensagem('Permissão de localização negada. Libere nas configurações do celular.');} };
  const opcoes={enableHighAccuracy:true,maximumAge:10000,timeout:30000};
  watch=navigator.geolocation.watchPosition(transmitir,falha,opcoes);
  consulta=setInterval(()=>{if(atual===geracao)navigator.geolocation.getCurrentPosition(transmitir,falha,opcoes);},30000);
 }
 async function ativarAndroid(){
  if(registrando)return;
  if(nativoAtivo){enviarAndroid({action:'status'});return;}
  registrando=true;
  try{
   limpar();const atual=geracao;mensagem('Preparando compartilhamento no Android…');
   const bytes=crypto.getRandomValues(new Uint8Array(32));
   const token=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
   const key='rastreamento:android:dispositivo:'+usuario;
   const dispositivo=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,dispositivo);
   const {error}=await sb().rpc('rastreamento_dispositivo_registrar',{p_empresa:empresa,p_dispositivo:dispositivo,p_token:token});
   if(error)throw error;
   if(atual!==geracao){await sb().rpc('rastreamento_dispositivo_encerrar',{p_token:token});return;}
   tokenPendente=token;mensagem('Confirme o compartilhamento e as permissões na janela do Android.');
   enviarAndroid({action:'start',token});
  }catch(erro){mensagem(erroEnvio(erro));}
  finally{registrando=false;}
 }
 window.addEventListener('acervo:android',async event=>{
  if(!android()||!painel)return;
  const {type,message}=event.detail||{};
  if(type==='started'){nativoAtivo=true;tokenPendente=null;localStorage.setItem(chave(),'1');pintar();mensagem(message);}
  else if(type==='stopped'){nativoAtivo=false;localStorage.removeItem(chave());pintar();mensagem('Compartilhamento pausado.');}
  else if(type==='error'){
   const token=tokenPendente;tokenPendente=null;nativoAtivo=false;localStorage.removeItem(chave());pintar();mensagem(message);
   if(token)try{await sb().rpc('rastreamento_dispositivo_encerrar',{p_token:token});}catch(_){}
  }
 });
 async function parar() {
  if(android()){enviarAndroid({action:'stop'});nativoAtivo=false;}
  limpar(); localStorage.removeItem(chave()); mensagem('Coleta pausada. Removendo última posição...');
  // Aguarda eventual envio iniciado antes da pausa, evitando recriar a posição após a remoção.
  while(enviando) await new Promise(resolve=>setTimeout(resolve,100));
  let error;
  try { ({error}=await sb().rpc('rastreamento_parar',{p_empresa:empresa})); } catch(e) { error=e; }
  mensagem(error?'Coleta pausada; não foi possível remover a última posição. Tente novamente.':'Compartilhamento pausado e última posição removida.');
 }
 async function iniciar(id) {
  const {data}=await sb().auth.getSession(); if(!data.session)return;
  const novoUsuario=data.session.user.id;
  if(empresa===id && usuario===novoUsuario)return;
  limpar(); empresa=id; usuario=novoUsuario; montar();
  
  if(android())enviarAndroid({action:'status'});
  else if(localStorage.getItem(chave())==='1') ativar();
 }
 window.AppRastreador={iniciar};
 window.addEventListener('storage',event=>{if(empresa&&usuario&&event.key===chave()&&event.newValue!=='1'){limpar();mensagem('Compartilhamento pausado em outra tela.');}});
 sb()?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){if(android()){enviarAndroid({action:'stop'});enviarAndroid({action:'push:disable'});}limpar();if(empresa&&usuario)localStorage.removeItem(chave());painel=null;empresa=null;usuario=null;}});
 window.addEventListener('pagehide',limpar);
 window.addEventListener('pageshow',()=>{if(android()){if(empresa)enviarAndroid({action:'status'});return;}if(empresa&&usuario&&localStorage.getItem(chave())==='1'&&watch===null)ativar();});
 if(!/\/app\.html$/.test(location.pathname)) {
  const id=sessionStorage.getItem('empresa_id'); if(id)iniciar(id);
 }
})();
