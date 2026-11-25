package br.com.chiavari.acervo;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationManager;
import android.net.*;
import android.os.*;
import com.google.android.gms.location.*;
import org.json.JSONObject;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Localização da equipe em segundo plano (primeiro plano tipo location).
 * 25/11/2026 — "sempre ligado": batimento a cada 60 s com o estado real (mesmo sem GPS), leitura forçada quando o GPS
 * fica quieto, nova tentativa quando a rede volta, autorização que se renova no servidor e volta sozinha depois de
 * reiniciar o celular (BootReceiver) ou ao abrir o app.
 */
public final class TrackingService extends Service {
 static volatile boolean running;
 static volatile long ultimoEnvio;       // System.currentTimeMillis() do último envio aceito
 static volatile String detalheAtual = "";
 static final String STOP="br.com.chiavari.acervo.PARAR";
 private static final String CHANNEL="rastreamento";
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private final ScheduledExecutorService relogio=Executors.newSingleThreadScheduledExecutor();
 private final AtomicBoolean sending=new AtomicBoolean();
 private FusedLocationProviderClient locations;
 private LocationCallback callback;
 private volatile boolean stopped;
 private volatile String token;
 private volatile long lastSent, ultimaLeitura;
 private volatile float ultimaPrecisao=-1;
 private volatile String estado="iniciando";
 private ScheduledFuture<?> batimento;
 private ConnectivityManager.NetworkCallback redeCb;
 private PowerManager.WakeLock wake;

 @Override public void onCreate(){
  super.onCreate();running=true;locations=LocationServices.getFusedLocationProviderClient(this);
  getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Localização da equipe",NotificationManager.IMPORTANCE_LOW));
 }
 private Notification notification(String text){
  PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,TrackingService.class).setAction(STOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  return new Notification.Builder(this,CHANNEL).setSmallIcon(br.com.chiavari.acervo.R.drawable.ic_notification).setContentTitle("Chiavari · localização compartilhada").setContentText(text).setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"Pausar",stop).build()).build();
 }
 private void status(String text){detalheAtual=text;try{getSystemService(NotificationManager.class).notify(7,notification(text));}catch(Exception ignored){}}

 @android.annotation.SuppressLint("MissingPermission") // hasLocation() valida antes de solicitar atualizações.
 @Override public int onStartCommand(Intent intent,int flags,int id){
  if(intent!=null&&STOP.equals(intent.getAction())){stopTracking();return START_NOT_STICKY;}
  try{
   token=SecureStore.read(this);
   if(token==null||!hasLocation()){desistir(token==null?"sem_autorizacao":"sem_permissao");return START_NOT_STICKY;}
   if(Build.VERSION.SDK_INT>=29)startForeground(7,notification("Aguardando localização do celular…"),ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
   else startForeground(7,notification("Aguardando localização do celular…"));
   stopped=false;
   if(callback!=null){ping();return START_STICKY;}
   callback=new LocationCallback(){@Override public void onLocationResult(LocationResult result){Location l=result.getLastLocation();if(l!=null)send(l,false);}};
   LocationRequest request=new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,30000).setMinUpdateIntervalMillis(15000).setMaxUpdateDelayMillis(60000).setWaitForAccurateLocation(false).build();
   locations.requestLocationUpdates(request,callback,Looper.getMainLooper()).addOnFailureListener(e->{estado="erro_gps";status("Não foi possível iniciar o GPS. Abra o app.");});
   batimento=relogio.scheduleWithFixedDelay(this::batida,20,60,TimeUnit.SECONDS);
   vigiarRede();
   return START_STICKY;
  }catch(Exception e){
   // sem poder ficar em primeiro plano (ex.: Android reiniciou o serviço em segundo plano): avisa e espera o app abrir
   estado="interrompido";detalheAtual="O Android interrompeu a localização. Abra o app para retomar.";
   try{getSystemService(NotificationManager.class).notify(8,new Notification.Builder(this,CHANNEL).setSmallIcon(br.com.chiavari.acervo.R.drawable.ic_notification)
    .setContentTitle("Localização pausada pelo Android").setContentText("Toque para abrir o app e retomar.").setAutoCancel(true)
    .setContentIntent(PendingIntent.getActivity(this,2,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT)).build());}catch(Exception ignored){}
   stopSelf();return START_NOT_STICKY;
  }
 }
 private void desistir(String motivo){estado=motivo;stopSelf();}
 private boolean hasLocation(){return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;}

 // a cada 60 s: se o GPS ficou quieto, pede uma leitura na hora; sempre conta o estado ao servidor
 @android.annotation.SuppressLint("MissingPermission")
 private void batida(){
  if(stopped)return;
  try{
   long agora=SystemClock.elapsedRealtime();
   if(lastSent==0||agora-lastSent>90000){
    if(!gpsLigado()){estado="gps_desligado";status("A localização do celular está desligada. Ligue em Configurações.");}
    else{
     estado=lastSent==0?"aguardando_gps":"sem_leitura";
     locations.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY,null).addOnSuccessListener(l->{if(l!=null)send(l,true);else
      locations.getLastLocation().addOnSuccessListener(u->{if(u!=null)send(u,true);});});
    }
   }
  }catch(Exception ignored){}
  ping();
 }
 private boolean gpsLigado(){try{LocationManager lm=getSystemService(LocationManager.class);return lm!=null&&(Build.VERSION.SDK_INT>=28?lm.isLocationEnabled():lm.isProviderEnabled(LocationManager.GPS_PROVIDER)||lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));}catch(Exception e){return true;}}

 private void ping(){
  final String t=token;if(t==null||stopped)return;
  worker.execute(()->{
   try{
    JSONObject tel=new JSONObject();
    try{Intent b=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));if(b!=null){int lv=b.getIntExtra(BatteryManager.EXTRA_LEVEL,-1),sc=b.getIntExtra(BatteryManager.EXTRA_SCALE,100);tel.put("bateria",lv*100/Math.max(1,sc));
     int pl=b.getIntExtra(BatteryManager.EXTRA_PLUGGED,0);tel.put("carregando",pl!=0);}}catch(Exception ignored){}
    tel.put("gps_ligado",gpsLigado());
    tel.put("permissao_precisa",checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED);
    tel.put("permissao_sempre",Build.VERSION.SDK_INT<29||checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED);
    PowerManager pm=getSystemService(PowerManager.class);
    tel.put("sem_economia_bateria",pm!=null&&pm.isIgnoringBatteryOptimizations(getPackageName()));
    tel.put("tela_ligada",pm!=null&&pm.isInteractive());
    tel.put("ultimo_envio_s",ultimoEnvio==0?-1:(System.currentTimeMillis()-ultimoEnvio)/1000);
    tel.put("ultima_leitura_s",ultimaLeitura==0?-1:(SystemClock.elapsedRealtime()-ultimaLeitura)/1000);
    tel.put("precisao",ultimaPrecisao);
    tel.put("app",BuildConfig.VERSION_NAME).put("android",Build.VERSION.RELEASE).put("aparelho",Build.MANUFACTURER+" "+Build.MODEL);
    int code=TrackingApi.call("rastreamento_dispositivo_ping",new JSONObject().put("p_token",t).put("p_estado",estado).put("p_detalhe",detalheAtual).put("p_telemetria",tel));
    if(code==401||code==403)autorizacaoEncerrada();
   }catch(Exception ignored){}
  });
 }
 private void autorizacaoEncerrada(){
  if(stopped)return;
  estado="sem_autorizacao";status("Autorização encerrada. Abra o app para ativar novamente.");
  getSharedPreferences("rastreamento",0).edit().putBoolean("ativo",false).commit();
  stopped=true;stopSelf();
 }
 private void send(Location l,boolean forcada){
  ultimaLeitura=SystemClock.elapsedRealtime();ultimaPrecisao=l.getAccuracy();
  long idadeMs=(SystemClock.elapsedRealtimeNanos()-l.getElapsedRealtimeNanos())/1000000L;
  if(stopped||(!forcada&&SystemClock.elapsedRealtime()-lastSent<15000)||idadeMs>(forcada?600000L:120000L)||!sending.compareAndSet(false,true))return;
  final String current=token;
  worker.execute(()->{
   PowerManager.WakeLock w=null;
   try{
    if(stopped)return;
    try{w=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"chiavari:envio");w.acquire(20000);}catch(Exception ignored){}
    int code=TrackingApi.call("rastreamento_dispositivo_enviar",new JSONObject().put("p_token",current).put("p_latitude",l.getLatitude()).put("p_longitude",l.getLongitude()).put("p_precisao",l.getAccuracy()));
    if(stopped)return;
    if(code>=200&&code<300){lastSent=SystemClock.elapsedRealtime();ultimoEnvio=System.currentTimeMillis();estado="enviando";
     status("Posição enviada às "+new java.text.SimpleDateFormat("HH:mm",java.util.Locale.getDefault()).format(new java.util.Date()));}
    else if(code==401||code==403)autorizacaoEncerrada();
    else{estado="erro_servidor";status("Falha ao enviar ("+code+"). Tentando de novo em 1 minuto.");}
   }catch(Exception e){if(!stopped){estado="sem_internet";status("Sem conexão com o servidor. Tentando de novo em 1 minuto.");}}
   finally{sending.set(false);if(w!=null&&w.isHeld())try{w.release();}catch(Exception ignored){}}
  });
 }
 // a internet voltou: tenta na hora, sem esperar o próximo minuto
 private void vigiarRede(){
  if(redeCb!=null)return;
  try{
   ConnectivityManager cm=getSystemService(ConnectivityManager.class);
   redeCb=new ConnectivityManager.NetworkCallback(){@Override public void onAvailable(Network n){if(!stopped&&("sem_internet".equals(estado)||"erro_servidor".equals(estado)))relogio.schedule(TrackingService.this::batida,2,TimeUnit.SECONDS);}};
   cm.registerDefaultNetworkCallback(redeCb);
  }catch(Exception ignored){redeCb=null;}
 }
 private void stopTracking(){
  getSharedPreferences("rastreamento",0).edit().putBoolean("ativo",false).commit();
  stopped=true;estado="pausado";if(callback!=null)locations.removeLocationUpdates(callback);
  final String value;try{value=SecureStore.read(this);}catch(Exception e){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return;}
  worker.execute(()->{try{if(value!=null){int code=TrackingApi.call("rastreamento_dispositivo_encerrar",new JSONObject().put("p_token",value));if(code>=200&&code<300&&value.equals(SecureStore.read(this)))SecureStore.clear(this);}}catch(Exception ignored){}});
  stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
 }
 @Override public void onTaskRemoved(Intent rootIntent){super.onTaskRemoved(rootIntent);/* deslizar o app para fora não para o rastreamento (stopWithTask=false) */}
 @Override public void onDestroy(){
  running=false;stopped=true;
  if(callback!=null)locations.removeLocationUpdates(callback);
  if(batimento!=null)batimento.cancel(false);
  try{if(redeCb!=null)getSystemService(ConnectivityManager.class).unregisterNetworkCallback(redeCb);}catch(Exception ignored){}
  relogio.shutdownNow();worker.shutdown();super.onDestroy();
 }
 @Override public IBinder onBind(Intent intent){return null;}
}
