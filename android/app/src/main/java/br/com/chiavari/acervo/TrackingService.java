package br.com.chiavari.acervo;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.*;
import com.google.android.gms.location.*;
import org.json.JSONObject;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public final class TrackingService extends Service {
 static volatile boolean running;
 static final String STOP="br.com.chiavari.acervo.PARAR";
 private static final String CHANNEL="rastreamento";
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private final AtomicBoolean sending=new AtomicBoolean();
 private FusedLocationProviderClient locations;
 private LocationCallback callback;
 private volatile boolean stopped;
 private String token;
 private long lastSent;
 @Override public void onCreate(){super.onCreate();running=true;locations=LocationServices.getFusedLocationProviderClient(this);getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Localização da equipe",NotificationManager.IMPORTANCE_LOW));}
 private Notification notification(String text){
  PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,TrackingService.class).setAction(STOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  return new Notification.Builder(this,CHANNEL).setSmallIcon(br.com.chiavari.acervo.R.drawable.ic_location).setContentTitle("Acervo · localização compartilhada").setContentText(text).setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"Pausar",stop).build()).build();
 }
 private void status(String text){getSystemService(NotificationManager.class).notify(7,notification(text));}
 @android.annotation.SuppressLint("MissingPermission") // hasLocation() valida antes de solicitar atualizações.
 @Override public int onStartCommand(Intent intent,int flags,int id){
  if(intent!=null&&STOP.equals(intent.getAction())){stopTracking();return START_NOT_STICKY;}
  try{
   token=SecureStore.read(this);
   if(token==null||!hasLocation()){stopSelf();return START_NOT_STICKY;}
   if(Build.VERSION.SDK_INT>=29)startForeground(7,notification("Aguardando localização do celular…"),ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
   else startForeground(7,notification("Aguardando localização do celular…"));
   if(callback!=null)return START_STICKY;
   callback=new LocationCallback(){@Override public void onLocationResult(LocationResult result){Location l=result.getLastLocation();if(l!=null)send(l);}};
   LocationRequest request=new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,30000).setMinUpdateIntervalMillis(15000).setMaxUpdateDelayMillis(60000).build();
   locations.requestLocationUpdates(request,callback,Looper.getMainLooper()).addOnFailureListener(e->status("Não foi possível iniciar o GPS. Abra o app."));
   return START_STICKY;
  }catch(Exception e){stopSelf();return START_NOT_STICKY;}
 }
 private boolean hasLocation(){return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
 private void send(Location l){
  if(stopped||SystemClock.elapsedRealtime()-lastSent<15000||SystemClock.elapsedRealtimeNanos()-l.getElapsedRealtimeNanos()>120000000000L||!sending.compareAndSet(false,true))return;
  final String current=token;
  worker.execute(()->{
   try{
    if(stopped)return;
    int code=TrackingApi.call("rastreamento_dispositivo_enviar",new JSONObject().put("p_token",current).put("p_latitude",l.getLatitude()).put("p_longitude",l.getLongitude()).put("p_precisao",l.getAccuracy()));
    if(stopped)return;
    if(code>=200&&code<300){lastSent=SystemClock.elapsedRealtime();status("Posição enviada às "+new java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(new java.util.Date()));}
    else if(code==401||code==403){status("Autorização encerrada. Abra o app para ativar novamente.");stopSelf();}
    else status("Falha ao enviar. Tentaremos na próxima leitura do GPS.");
   }catch(Exception e){if(!stopped)status("Sem conexão com o servidor. Aguardando nova leitura.");}
   finally{sending.set(false);}
  });
 }
 private void stopTracking(){
  getSharedPreferences("rastreamento",0).edit().putBoolean("ativo",false).commit();
  stopped=true;if(callback!=null)locations.removeLocationUpdates(callback);
  final String value;try{value=SecureStore.read(this);}catch(Exception e){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return;}
  worker.execute(()->{try{if(value!=null){int code=TrackingApi.call("rastreamento_dispositivo_encerrar",new JSONObject().put("p_token",value));if(code>=200&&code<300&&value.equals(SecureStore.read(this)))SecureStore.clear(this);}}catch(Exception ignored){}});
  stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
 }
 @Override public void onDestroy(){running=false;stopped=true;if(callback!=null)locations.removeLocationUpdates(callback);worker.shutdown();super.onDestroy();}
 @Override public IBinder onBind(Intent intent){return null;}
}
