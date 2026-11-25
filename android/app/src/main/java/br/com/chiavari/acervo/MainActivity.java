package br.com.chiavari.acervo;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Collections;
import org.json.JSONObject;

public final class MainActivity extends Activity {
 private static final String ORIGIN="https://easyloc-zeta.vercel.app";
 private WebView web;
 private NativePush push;
 private String pendingToken;
 private AlertDialog consent;
 private GeolocationPermissions.Callback geoCallback;
 private String geoOrigin;
 private ValueCallback<Uri[]> fileCallback;
 private PermissionRequest cameraRequest;
 private boolean permissionResultReady;
 private boolean visible;
 // Câmera ao vivo nativa (CameraStreamService): pedido guardado enquanto o Android pede as permissões
 private JSONObject cameraPedido;
 private boolean cameraPermissaoPronta,cameraPausadaFoto;
 @Override public void onCreate(Bundle state){
  super.onCreate(state);web=new WebView(this);setContentView(web);
  push=new NativePush(this,web);
  if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->back());
  getWindow().getDecorView().setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  web.setDownloadListener((url,userAgent,disposition,mimetype,size)->{try{Uri u=Uri.parse(url);if("https".equals(u.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}});
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
    Uri u=req.getUrl();if(ORIGIN.equals(u.getScheme()+"://"+u.getAuthority()))return false;
    if(req.isForMainFrame()&&("https".equals(u.getScheme())||"mailto".equals(u.getScheme())||"tel".equals(u.getScheme())))try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}
    return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onPermissionRequest(PermissionRequest request){
    Uri u=request.getOrigin();boolean video=java.util.Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
    if(!visible||!ORIGIN.equals(u.getScheme()+"://"+u.getAuthority())||!video){request.deny();return;}
    // a câmera é do serviço de transmissão: duas partes do app nunca abrem a câmera ao mesmo tempo
    if(CameraStreamService.running){request.deny();sendCamera("ocupada");return;}
    if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED){request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});return;}
    if(cameraRequest!=null)cameraRequest.deny();cameraRequest=request;requestPermissions(new String[]{Manifest.permission.CAMERA},12);
   }
   @Override public void onPermissionRequestCanceled(PermissionRequest request){if(cameraRequest==request)cameraRequest=null;}
   @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){
    Uri u=Uri.parse(origin);
    if(!visible||!ORIGIN.equals(u.getScheme()+"://"+u.getAuthority())){callback.invoke(origin,false,false);return;}
    if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED){callback.invoke(origin,true,false);return;}
    if(geoCallback!=null)geoCallback.invoke(geoOrigin,false,false);
    geoCallback=callback;geoOrigin=origin;requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},8);
   }
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
    if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
    // foto durante a transmissão: pausa controlada (o app de câmera do Android precisa da câmera) e retoma ao voltar
    boolean imagem=false;for(String a:params.getAcceptTypes())if(a==null||a.isEmpty()||a.startsWith("image")||a.startsWith("video"))imagem=true;
    if(CameraStreamService.running&&imagem){cameraPausadaFoto=true;startService(new Intent(MainActivity.this,CameraStreamService.class).setAction(CameraStreamService.PAUSE));}
    try{startActivityForResult(params.createIntent(),9);return true;}catch(Exception e){fileCallback=null;retomarCameraFoto();return false;}
   }
  });
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
   new AlertDialog.Builder(this).setMessage("Atualize o Android System WebView e abra o app novamente.").setPositiveButton("Fechar",(d,w)->finish()).show();return;
  }
  WebViewCompat.addWebMessageListener(web,"AcervoAndroid",Collections.singleton(ORIGIN),(view,message,source,isMainFrame,reply)->{
   if(!isMainFrame||!ORIGIN.equals(source.getScheme()+"://"+source.getAuthority()))return;
   try{
    JSONObject data=new JSONObject(message.getData());String action=data.optString("action");
    if("app:info".equals(action)){JSONObject info=new JSONObject().put("versionCode",BuildConfig.VERSION_CODE).put("versionName",BuildConfig.VERSION_NAME);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('acervo:app',{detail:"+info+"}))",null);return;}
    if(push.handle(data))return;
    if(action.startsWith("camera:")){camera(action,data);return;}
    if("status".equals(action)){sendStatus();return;}
    if("stop".equals(action)){pendingToken=null;if(consent!=null)consent.dismiss();startService(new Intent(this,TrackingService.class).setAction(TrackingService.STOP));send("stopped","Compartilhamento pausado.");return;}
    if(!"start".equals(action)||!visible)return;
    String token=data.getString("token");if(!token.matches("[A-Za-z0-9_-]{43}"))return;
    pendingToken=token;
    consent=new AlertDialog.Builder(this).setTitle("Compartilhar localização com a Logística?").setMessage("O Chiavari enviará sua localização enquanto o rastreamento estiver ativo, inclusive ao sair do app ou apagar a tela. Uma notificação permanecerá visível. Você pode pausar pelo app ou pela notificação.")
     .setPositiveButton("Ativar",(d,w)->permissions()).setNegativeButton("Cancelar",(d,w)->{pendingToken=null;send("error","Compartilhamento cancelado.");}).setOnCancelListener(d->{pendingToken=null;send("error","Compartilhamento cancelado.");}).show();
   }catch(Exception e){send("error","Não foi possível iniciar. Tente novamente.");}
  });
  CameraStreamService.ouvinte=()->runOnUiThread(()->sendCamera(null));
  web.loadUrl(launchUrl(getIntent()));
 }
 private String launchUrl(Intent intent){
  try{java.net.URI url=new java.net.URI(ORIGIN+"/").resolve(intent.getStringExtra("url")==null?"app.html":intent.getStringExtra("url"));if(ORIGIN.equals(url.getScheme()+"://"+url.getRawAuthority()))return url.toString();}catch(Exception ignored){}
  return ORIGIN+"/app.html";
 }
 @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);web.loadUrl(launchUrl(intent));}
 private void permissions(){
  java.util.ArrayList<String> required=new java.util.ArrayList<>();
  if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){required.add(Manifest.permission.ACCESS_FINE_LOCATION);required.add(Manifest.permission.ACCESS_COARSE_LOCATION);}
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)required.add(Manifest.permission.POST_NOTIFICATIONS);
  if(required.isEmpty())startTracking();else requestPermissions(required.toArray(new String[0]),7);
 }
 @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){
  super.onRequestPermissionsResult(request,permissions,grants);if(request==7){if(visible)startTracking();else permissionResultReady=true;}
  if(request==11)push.enable();
  if(request==13){if(visible)iniciarCamera();else cameraPermissaoPronta=true;}
  if(request==12&&cameraRequest!=null){if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)cameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else cameraRequest.deny();cameraRequest=null;}
  if(request==8&&geoCallback!=null){boolean ok=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;geoCallback.invoke(geoOrigin,ok,false);geoCallback=null;}
 }
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==9){retomarCameraFoto();if(fileCallback!=null){fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileCallback=null;}}}
 private void retomarCameraFoto(){if(cameraPausadaFoto){cameraPausadaFoto=false;startService(new Intent(this,CameraStreamService.class).setAction(CameraStreamService.RESUME));}}
 // ------------------------------------------------------------ câmera ao vivo nativa
 private void camera(String action,JSONObject data) throws Exception {
  if("camera:status".equals(action)){sendCamera(null);return;}
  if("camera:ciente".equals(action)){getSharedPreferences("camera",0).edit().putBoolean("ativo",false).commit();sendCamera(null);return;}
  if("camera:ver".equals(action)){if(CameraStreamService.running)startActivity(new Intent(this,CameraPreviewActivity.class));return;}
  if("camera:stop".equals(action)){if(CameraStreamService.running)startService(new Intent(this,CameraStreamService.class).setAction(CameraStreamService.STOP));else getSharedPreferences("camera",0).edit().putBoolean("ativo",false).commit();sendCamera(null);return;}
  if(!"camera:start".equals(action)||!visible)return; // só com o app na frente: nunca liga a câmera escondido
  if(CameraStreamService.running){sendCamera(null);return;}
  String token=data.getString("token");if(!token.matches("[A-Za-z0-9_-]{43}"))return;
  cameraPedido=data;
  new AlertDialog.Builder(this).setTitle("Transmitir a câmera para a Logística?")
   .setMessage("A câmera continuará transmitindo mesmo com a tela apagada, bloqueada ou enquanto você usa outras telas. Uma notificação ficará visível e você pode encerrar a qualquer momento pelo app ou pela notificação.")
   .setPositiveButton("Transmitir",(d,w)->permissoesCamera()).setNegativeButton("Cancelar",(d,w)->{cameraPedido=null;sendCamera("cancelada");})
   .setOnCancelListener(d->{cameraPedido=null;sendCamera("cancelada");}).show();
 }
 private void permissoesCamera(){
  java.util.ArrayList<String> req=new java.util.ArrayList<>();
  if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)req.add(Manifest.permission.CAMERA);
  if(cameraPedido!=null&&cameraPedido.optBoolean("som")&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)req.add(Manifest.permission.RECORD_AUDIO);
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)req.add(Manifest.permission.POST_NOTIFICATIONS);
  if(req.isEmpty())iniciarCamera();else requestPermissions(req.toArray(new String[0]),13);
 }
 private void iniciarCamera(){
  JSONObject p=cameraPedido;cameraPedido=null;
  if(p==null||!visible)return;
  if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){sendCamera("sem_permissao");return;}
  try{
   SecureStore.save(this,"camera",p.getString("token"));
   JSONObject cfg=p.optJSONObject("config");
   startForegroundService(new Intent(this,CameraStreamService.class).setAction(CameraStreamService.START)
    .putExtra("titulo",p.optString("titulo","Câmera ao vivo")).putExtra("som",p.optBoolean("som")).putExtra("config",cfg==null?"{}":cfg.toString()));
  }catch(Exception e){SecureStore.clear(this,"camera");sendCamera("erro");}
 }
 /** Estado real do serviço para o site (barra da transmissão e tela da câmera). */
 private void sendCamera(String aviso){
  if(web==null)return;
  try{
   boolean interrompida=!CameraStreamService.running&&getSharedPreferences("camera",0).getBoolean("ativo",false);
   JSONObject d=new JSONObject().put("nativo",true).put("ativo",CameraStreamService.running).put("estado",CameraStreamService.running?CameraStreamService.estado:"parada")
    .put("rotulo",CameraStreamService.rotuloEstado()).put("inicio",CameraStreamService.running?CameraStreamService.inicio:0).put("assistindo",CameraStreamService.assistindo)
    .put("detalhe",CameraStreamService.detalhe).put("titulo",CameraStreamService.titulo).put("interrompida",interrompida).put("aviso",aviso==null?JSONObject.NULL:aviso);
   web.evaluateJavascript("window.dispatchEvent(new CustomEvent('acervo:camera',{detail:"+d+"}))",null);
  }catch(Exception ignored){}
 }
 private void startTracking(){
  boolean location=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
  boolean notifications=Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;
  if(!visible||pendingToken==null||!location||!notifications){pendingToken=null;send("error","Permita localização e notificações nas configurações do Android para ativar.");return;}
  try{
   SecureStore.save(this,pendingToken);getSharedPreferences("rastreamento",0).edit().putBoolean("ativo",true).commit();
   startForegroundService(new Intent(this,TrackingService.class));pendingToken=null;send("started","Rastreamento Android ativo, inclusive ao sair do app. Consulte a notificação para conferir o envio.");
  }catch(Exception e){getSharedPreferences("rastreamento",0).edit().putBoolean("ativo",false).commit();send("error","Não foi possível iniciar o serviço do Android.");}
 }
 private void sendStatus(){send(TrackingService.running&&getSharedPreferences("rastreamento",0).getBoolean("ativo",false)?"started":"stopped","Consulte a notificação do Acervo para acompanhar o envio em segundo plano.");}
 private void send(String type,String text){
  if(web==null||!ORIGIN.equals(Uri.parse(web.getUrl()==null?"":web.getUrl()).getScheme()+"://"+Uri.parse(web.getUrl()==null?"":web.getUrl()).getAuthority()))return;
  try{JSONObject detail=new JSONObject().put("type",type).put("message",text);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('acervo:android',{detail:"+detail+"}))",null);}catch(Exception ignored){}
 }
 @Override public void onResume(){super.onResume();visible=true;if(web!=null)web.onResume();if(permissionResultReady){permissionResultReady=false;startTracking();}if(cameraPermissaoPronta){cameraPermissaoPronta=false;iniciarCamera();}sendCamera(null);}
 @Override public void onPause(){visible=false;if(web!=null)web.onPause();super.onPause();}
 private void back(){if(web.canGoBack())web.goBack();else moveTaskToBack(true);}
 @Override public void onBackPressed(){back();}
 @Override public void onDestroy(){CameraStreamService.ouvinte=null;if(cameraRequest!=null)cameraRequest.deny();if(geoCallback!=null)geoCallback.invoke(geoOrigin,false,false);if(fileCallback!=null)fileCallback.onReceiveValue(null);if(web!=null)web.destroy();super.onDestroy();}
}
