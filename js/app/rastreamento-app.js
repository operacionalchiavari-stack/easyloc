/* Localização do PWA: o navegador pode suspender a coleta ao sair do app. */
(function () {
 'use strict';
 let empresa, usuario, watch = null, consulta = null, geracao = 0, enviando = false, ultimo = 0, painel;
 const sb = () => window.supabaseClient;
 const chave = () => `rastreamento:${empresa}:${usuario}`;
 function mensagem(texto) { painel?.querySelector('[role="status"]') && (painel.querySelector('[role="status"]').textContent = texto); }
 function erroEnvio(erro) {
  if (navigator.onLine === false || /failed to fetch|networkerror|load failed/i.test(erro?.message || '')) return 'Sem conexão com o servidor. O envio será tentado novamente.';
  if (['PGRST202','PGRST205','42P01','42883'].includes(erro?.code)) return 'O rastreamento ainda não está configurado no servidor. Avise o administrador.';
  if (['PGRST301','PGRST302','PGRST303','42501'].includes(erro?.code) || /jwt|acesso não autorizado|sessão necessária/i.test(erro?.message || '')) return 'Não foi possível validar seu acesso. Saia e entre novamente no app.';
  if (['23514','23502','22P02'].includes(erro?.code)) return 'O celular enviou uma posição inválida. Aguardando uma nova leitura do GPS.';
  return 'O servidor não conseguiu salvar a posição. O envio será tentado novamente.';
 }
 function montar() {
  if (painel) return;
  painel = document.createElement('section');
  painel.setAttribute('aria-label','Compartilhamento de localização');
  painel.style.cssText='position:fixed;bottom:12px;right:12px;z-index:1000;max-width:310px;padding:12px;border:1px solid #dce2e8;border-radius:12px;background:white;color:#263442;box-shadow:0 4px 18px #0002;font:13px system-ui';
  painel.innerHTML='<details><summary>Localização para a Logística</summary><p>Ao ativar, sua última posição será compartilhada com a Logística da empresa. Neste app, a coleta pode parar ao fechar ou trocar de aplicativo.</p><button type="button" data-ativar>Compartilhar localização</button> <button type="button" data-parar>Pausar e remover posição</button><p role="status" style="margin-bottom:0"></p></details>';
  (document.getElementById('apInicio') || document.body).append(painel);
  painel.querySelector('[data-ativar]').onclick = ativar;
  painel.querySelector('[data-parar]').onclick = parar;
 }
 function limpar() { geracao++; clearInterval(consulta); consulta=null; if (watch !== null) navigator.geolocation.clearWatch(watch); watch=null; ultimo=0; }
 async function ativar() {
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
  const falha=(erro)=>{ if(atual!==geracao)return; mensagem(erro.code===1?'Permissão de localização negada. Libere nas configurações do celular.':'Não foi possível obter a posição. Aguardando novo sinal.'); if(erro.code===1){localStorage.removeItem(chave());limpar();} };
  const opcoes={enableHighAccuracy:true,maximumAge:10000,timeout:30000};
  watch=navigator.geolocation.watchPosition(transmitir,falha,opcoes);
  consulta=setInterval(()=>{if(atual===geracao)navigator.geolocation.getCurrentPosition(transmitir,falha,opcoes);},30000);
 }
 async function parar() {
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
  mensagem('Compartilhamento desativado.');
  if(localStorage.getItem(chave())==='1') ativar();
 }
 window.AppRastreador={iniciar};
 window.addEventListener('storage',event=>{if(empresa&&usuario&&event.key===chave()&&event.newValue!=='1'){limpar();mensagem('Compartilhamento pausado em outra tela.');}});
 sb()?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){limpar();if(empresa&&usuario)localStorage.removeItem(chave());painel?.remove();painel=null;empresa=null;usuario=null;}});
 window.addEventListener('pagehide',limpar);
 window.addEventListener('pageshow',()=>{if(empresa&&usuario&&localStorage.getItem(chave())==='1'&&watch===null)ativar();});
 if(!/\/app\.html$/.test(location.pathname)) {
  const id=sessionStorage.getItem('empresa_id'); if(id)iniciar(id);
 }
})();
