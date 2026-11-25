/* App Android: avisa no topo, bem visível, quando há versão nova do aplicativo para baixar.
   A migração definitiva (mandar todo Android para a instalação) só liga com ready + notificationsReady. */
(async function(){
 'use strict';
 if(!/android/i.test(navigator.userAgent||'')||window.top!==window)return;
 // O catálogo público dos clientes não é o aplicativo interno da equipe.
 if(/\/Catalogo\/catalogo-app\.html$/i.test(location.pathname)&&new URLSearchParams(location.search).get('app')!=='1')return;
 const script=document.currentScript?.src;if(!script)return;
 const base=new URL('../../',script);
 try{
  const response=await fetch(new URL('downloads/chiavari-android.json',base),{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)return;
  const version=await response.json();
  if(!window.AcervoAndroid?.postMessage){
   if(version.ready&&version.notificationsReady){document.querySelectorAll('link[rel="manifest"]').forEach(el=>el.remove());location.replace(new URL('instalar.html',base));}
   return;
  }
  if(!version.downloadReady&&!version.ready)return;
  window.addEventListener('acervo:app',event=>{
   const atual=Number(event.detail?.versionCode)||0;
   if(atual>=Number(version.versionCode)||document.getElementById('chiavariAtualizar'))return;
   if(sessionStorage.getItem('atualizar_depois')===String(version.versionCode)&&!/\/app\.html$/.test(location.pathname))return;
   const css=document.createElement('style');
   css.textContent='#chiavariAtualizar{position:fixed;left:10px;right:10px;top:calc(env(safe-area-inset-top,0px) + 54px);z-index:3000;display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border-radius:16px;background:#c4302b;color:#fff;font:600 14px/1.3 Manrope,system-ui,sans-serif;box-shadow:0 10px 28px rgba(196,48,43,.35);animation:chAtualizar 2.4s ease-in-out infinite}'
    +'#chiavariAtualizar b{display:block;font-size:15px;font-weight:800}#chiavariAtualizar small{display:block;opacity:.9;font-weight:500;font-size:12.5px}'
    +'#chiavariAtualizar a{flex:none;margin-left:auto;padding:10px 14px;border-radius:12px;background:#fff;color:#c4302b;font-weight:800;text-decoration:none}'
    +'#chiavariAtualizar button{flex:none;border:0;background:transparent;color:#fff;opacity:.8;font:600 12px system-ui;padding:6px}'
    +'#chiavariAtualizar .ic{flex:none;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center;font-size:18px}'
    +'@keyframes chAtualizar{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px);box-shadow:0 14px 32px rgba(196,48,43,.45)}}'
    +'@media (prefers-reduced-motion:reduce){#chiavariAtualizar{animation:none}}';
   document.head.append(css);
   const box=document.createElement('div');box.id='chiavariAtualizar';box.setAttribute('role','alert');
   box.innerHTML='<span class="ic" aria-hidden="true">⬇</span><span><b>Atualize o aplicativo</b><small>Versão '+(version.versionName||'nova')+' disponível</small></span><a>Atualizar</a><button type="button">Depois</button>';
   box.querySelector('a').href=new URL('instalar.html',base);
   box.querySelector('button').onclick=()=>{sessionStorage.setItem('atualizar_depois',String(version.versionCode));box.remove();};
   document.body.append(box);
  },{once:true});
  window.AcervoAndroid.postMessage(JSON.stringify({action:'app:info'}));
 }catch(_){/* O app atual continua acessível se a consulta de versão falhar. */}
})();
