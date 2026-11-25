(async function(){
 'use strict';
 const $=id=>document.getElementById(id);
 try{
  const response=await fetch('downloads/chiavari-android.json',{cache:'no-store'});if(!response.ok)throw Error();
  const version=await response.json();$('estado').textContent=version.message||'Aplicativo Chiavari para Android.';
  // downloadReady: o botão aparece já (nov/2026, câmera ao vivo nativa); ready+notificationsReady é a migração definitiva
  if(!version.downloadReady&&(!version.ready||!version.notificationsReady))return;
  const url=new URL(version.apkUrl,location.href);if(url.origin!==location.origin||!url.pathname.endsWith('.apk'))throw Error();
  $('versao').textContent='Chiavari · versão '+version.versionName;if(version.tamanho)$('tamanho').textContent='Android 8 ou superior · '+version.tamanho+'.';$('baixar').href=url.href;$('baixar').hidden=false;$('passos').hidden=false;
 }catch(_){$('estado').textContent='Não foi possível verificar a versão agora. Atualize esta página para tentar novamente.';}
})();
