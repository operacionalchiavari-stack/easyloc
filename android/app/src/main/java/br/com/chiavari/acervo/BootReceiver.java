package br.com.chiavari.acervo;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;

/** Depois de reiniciar o celular (ou de atualizar o app), volta a compartilhar a localização se ela estava ligada. */
public final class BootReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context c,Intent intent){
  String a=intent==null?null:intent.getAction();
  if(!Intent.ACTION_BOOT_COMPLETED.equals(a)&&!Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)&&!"android.intent.action.QUICKBOOT_POWERON".equals(a))return;
  try{
   if(!c.getSharedPreferences("rastreamento",0).getBoolean("ativo",false))return;
   if(SecureStore.read(c)==null)return;
   boolean local=c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||c.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
   if(!local)return;
   c.startForegroundService(new Intent(c,TrackingService.class));
  }catch(Exception ignored){/* o Android pode recusar em segundo plano: volta quando o app for aberto */}
 }
}
